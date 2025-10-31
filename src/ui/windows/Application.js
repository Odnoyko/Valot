/**
 * Valot Application - New Architecture
 * Initializes Core API and launches UI
 */

import GObject from 'gi://GObject';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk?version=4.0';
import Adw from 'gi://Adw?version=1';
import Gdk from 'gi://Gdk?version=4.0';

// Import Core
import { CoreAPI } from 'resource:///com/odnoyko/valot/core/api/CoreAPI.js';

// Import SVG recolor utility
import { forceUpdateAllSVGs } from 'resource:///com/odnoyko/valot/ui/utils/svgRecolor.js';

// Import bridges
import { CoreBridge } from 'resource:///com/odnoyko/valot/ui/bridges/CoreBridge.js';

// Import UI components
import { ValotMainWindow } from 'resource:///com/odnoyko/valot/ui/windows/MainWindow.js';
import { CompactTrackerWindow } from 'resource:///com/odnoyko/valot/ui/windows/CompactTrackerWindow.js';
import { Config } from 'resource:///com/odnoyko/valot/config.js';

import { PreferencesDialog } from 'resource:///com/odnoyko/valot/ui/components/dialogs/PreferencesDialog.js';
import { CarouselDialog } from 'resource:///com/odnoyko/valot/ui/components/dialogs/CarouselDialog.js';
import { DatabaseMigrationDialog } from 'resource:///com/odnoyko/valot/ui/components/dialogs/DatabaseMigrationDialog.js';

// Note: i18n is already initialized in com.odnoyko.valot.in, no need to re-init here

/**
 * Accent Color Manager (legacy)
 */
const AccentColorManager = {
    _customAccentProvider: null,

    applyAccentMode(mode, colorString) {
        const display = Gdk.Display.get_default();

        if (this._customAccentProvider) {
            Gtk.StyleContext.remove_provider_for_display(display, this._customAccentProvider);
            this._customAccentProvider = null;
        }

        if (mode === 0) {
            // Force update SVGs when switching to system accent
            GLib.timeout_add(GLib.PRIORITY_DEFAULT, 100, () => {
                forceUpdateAllSVGs();
                return GLib.SOURCE_REMOVE;
            });
            return;
        } else if (mode === 1 && colorString) {
            const rgba = new Gdk.RGBA();
            if (!rgba.parse(colorString)) return;

            this._customAccentProvider = new Gtk.CssProvider();
            const css = `
                @define-color accent_color ${colorString};
                @define-color accent_bg_color ${colorString};
                @define-color accent_fg_color white;
            `;

            try {
                this._customAccentProvider.load_from_data(css, -1);
                Gtk.StyleContext.add_provider_for_display(
                    display,
                    this._customAccentProvider,
                    Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION + 1
                );

                // Force update all SVG illustrations after accent color change
                GLib.timeout_add(GLib.PRIORITY_DEFAULT, 100, () => {
                    forceUpdateAllSVGs();
                    return GLib.SOURCE_REMOVE;
                });
            } catch (error) {
                this._customAccentProvider = null;
            }
        }
    }
};

/**
 * Load CSS
 */
function loadCss() {
    const provider = new Gtk.CssProvider();
    provider.load_from_resource('/com/odnoyko/valot/ui/styles/main.css');

    Gtk.StyleContext.add_provider_for_display(
        Gdk.Display.get_default(),
        provider,
        Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION
    );
}

/**
 * Valot Application
 */
export const ValotApplication = GObject.registerClass(
    class ValotApplication extends Adw.Application {
        constructor() {
            super({
                application_id: Config.APPLICATION_ID,
                flags: Gio.ApplicationFlags.HANDLES_COMMAND_LINE,
                resource_base_path: '/com/odnoyko/valot'
            });

            // Core API and bridges
            this.coreAPI = null;
            this.coreBridge = null;
            this.databaseBridge = null;

            // Windows
            this.compactMode = false;
            this.compactWindow = null;
            this.mainWindow = null;

            // Add command line option
            this.add_main_option('compact', 'c'.charCodeAt(0),
                0, 0,
                'Launch in compact tracker mode', null);
        }

        vfunc_startup() {
            super.vfunc_startup();

            // Setup actions AFTER D-Bus registration
            this._setupActions();
        }

        /**
         * Setup application actions
         */
        _setupActions() {
            const quit_action = new Gio.SimpleAction({name: 'quit'});
            quit_action.connect('activate', () => {
                this.quit();
            });
            this.add_action(quit_action);
            this.set_accels_for_action('app.quit', ['<primary>q']);

            const about_action = new Gio.SimpleAction({name: 'about'});
            about_action.connect('activate', () => {
                // TODO: Show preferences dialog
            });
            this.add_action(about_action);
        }

        /**
         * Handle command line
         */
        vfunc_command_line(command_line) {
            const options = command_line.get_options_dict();

            if (options.contains('compact')) {
                this.compactMode = true;
            }

            this.activate();
            return 0;
        }

        /**
         * Initialize Core API
         */
        async _initializeCore(parentWindow = null) {
            try {
                const GLib = (await import('gi://GLib')).default;
                const Gio = (await import('gi://Gio')).default;
                const { GdaDatabaseBridge } = await import('resource:///com/odnoyko/valot/data/providers/gdaDBBridge/GdaDatabaseBridge.js');

                // Paths
                const oldSchemaDbPath = GLib.build_filenamev([GLib.get_user_data_dir(), 'valot', 'valot.db.db']);
                const currentDbPath = GLib.build_filenamev([GLib.get_user_data_dir(), 'valot', 'valot.db']);
                const backupDbPath = GLib.build_filenamev([GLib.get_user_data_dir(), 'valot', 'valot-backup.db']);

                const oldSchemaDbFile = Gio.File.new_for_path(oldSchemaDbPath);
                const currentDbFile = Gio.File.new_for_path(currentDbPath);
                const backupDbFile = Gio.File.new_for_path(backupDbPath);

                let migrationNeeded = false;
                let backupSourcePath = null;
                let backupCreatedPath = null;
                let isOldSchema = false;

                // Scenario 1: valot.db.db exists (old schema from 0.8.x or 0.9.x)
                if (oldSchemaDbFile.query_exists(null)) {
                    // Check schema BEFORE creating backup
                    const { DatabaseMigration } = await import('resource:///com/odnoyko/valot/data/providers/gdaDBBridge/DatabaseMigration.js');
                    const Gda = (await import('gi://Gda?version=6.0')).default;

                    // Open database to check schema
                    const tempDb = new GdaDatabaseBridge();
                    const tempConnString = `DB_DIR=${GLib.path_get_dirname(oldSchemaDbPath)};DB_NAME=${GLib.path_get_basename(oldSchemaDbPath).replace('.db', '')}`;

                    try {
                        tempDb.connection = Gda.Connection.open_from_string('SQLite', tempConnString, null, Gda.ConnectionOptions.NONE);
                        tempDb.isConnected_ = true;

                        // Detect schema
                        const migration = new DatabaseMigration(tempDb, null);
                        isOldSchema = await migration.detectSchema();

                        await tempDb.close();

                    } catch (error) {
                        console.error('❌ Error detecting schema:', error);
                        isOldSchema = true; // Assume old schema on error
                    }

                    // Only migrate if old schema
                    if (isOldSchema) {
                        migrationNeeded = true;
                        backupSourcePath = oldSchemaDbPath;

                        // Create backup BEFORE showing dialog
                        backupCreatedPath = DatabaseMigration.createBackup(oldSchemaDbPath);
                    } else {
                        // Rename valot.db.db to valot.db (it's already migrated)
                        oldSchemaDbFile.move(currentDbFile, Gio.FileCopyFlags.OVERWRITE, null, null);
                        migrationNeeded = false;
                    }
                }
                // Scenario 2: valot.db exists but no valot.db.db - check version
                else if (currentDbFile.query_exists(null)) {
                    // Open database to check version
                    const tempDb = new GdaDatabaseBridge();
                    const Gda = (await import('gi://Gda?version=6.0')).default;
                    const tempConnString = `DB_DIR=${GLib.path_get_dirname(currentDbPath)};DB_NAME=${GLib.path_get_basename(currentDbPath)}`;

                    try {
                        tempDb.connection = Gda.Connection.open_from_string('SQLite', tempConnString, null, Gda.ConnectionOptions.NONE);
                        tempDb.isConnected_ = true;

                        const version = await tempDb.getSchemaVersion();
                        await tempDb.close();

                        if (version >= 2) {
                            migrationNeeded = false;
                        } else {
                            migrationNeeded = true;
                            backupSourcePath = currentDbPath;

                            // Create backup BEFORE showing dialog
                            const { DatabaseMigration } = await import('resource:///com/odnoyko/valot/data/providers/gdaDBBridge/DatabaseMigration.js');
                            backupCreatedPath = DatabaseMigration.createBackup(currentDbPath);
                        }
                    } catch (error) {
                        console.error('❌ Error checking schema version:', error);
                        migrationNeeded = true;
                        backupSourcePath = currentDbPath;

                        // Create backup BEFORE showing dialog
                        const { DatabaseMigration } = await import('resource:///com/odnoyko/valot/data/providers/gdaDBBridge/DatabaseMigration.js');
                        backupCreatedPath = DatabaseMigration.createBackup(currentDbPath);
                    }
                }

                // If migration is needed, show dialog
                if (migrationNeeded && backupCreatedPath) {
                    await this._runMigration(backupSourcePath, backupCreatedPath, currentDbPath, oldSchemaDbPath, isOldSchema, null);
                }

                // Initialize DataNavigator
                const { DataNavigator } = await import('resource:///com/odnoyko/valot/data/DataNavigator.js');
                this.dataNavigator = new DataNavigator();
                await this.dataNavigator.initialize();

                // Get active provider for Core
                const activeProvider = this.dataNavigator.getActiveProvider();

                // Initialize Core API with active provider
                this.coreAPI = new CoreAPI();
                await this.coreAPI.initialize(activeProvider.getBridge());

                // Create Core Bridge
                this.coreBridge = new CoreBridge(this.coreAPI);

                // Initialize Extension Manager (non-blocking)
                const { ExtensionManager } = await import('resource:///com/odnoyko/valot/extensions/ExtensionManager.js');
                this.extensionManager = new ExtensionManager(this);
                await this.extensionManager.loadBuiltinExtensions();
                this.extensionManager.autoActivateExtensions(); // Don't await - activate in background

                return true;
            } catch (error) {
                console.error('❌ Core initialization failed:', error);

                const dialog = new Adw.AlertDialog({
                    heading: _('Database Error'),
                    body: `${_('Failed to initialize database')}: ${error.message}`
                });

                if (this.active_window || parentWindow) {
                    dialog.present(this.active_window || parentWindow);
                }

                return false;
            }
        }

        /**
         * Run database migration
         * @param {string} originalDbPath - Original database path (valot.db.db or valot.db)
         * @param {string} backupDbPath - Backup database path (created before dialog)
         * @param {string} newDbPath - New database path (valot.db)
         * @param {string} oldSchemaDbPath - Path to valot.db.db (if exists)
         * @param {boolean} isOldSchema - True if old schema detected
         * @param {Gtk.Window} parentWindow - Parent window
         */
        async _runMigration(originalDbPath, backupDbPath, newDbPath, oldSchemaDbPath, isOldSchema, parentWindow) {
            return new Promise((resolve, reject) => {
                const migrationDialog = new DatabaseMigrationDialog(parentWindow, originalDbPath);

                migrationDialog.show(async (choice) => {
                    try {
                        const { DatabaseMigration } = await import('resource:///com/odnoyko/valot/data/providers/gdaDBBridge/DatabaseMigration.js');

                        if (choice === 'backup') {
                            // Backup & Migrate - all logic in DatabaseMigration
                            const success = await DatabaseMigration.performBackupAndMigrate(
                                backupDbPath,
                                newDbPath,
                                oldSchemaDbPath,
                                isOldSchema, // Pass detected schema
                                (step, total, message) => migrationDialog.updateProgress(step, total, message)
                            );

                            if (success) {
                                migrationDialog.showCompletion();
                                resolve();
                            } else {
                                migrationDialog.showError(_('Migration failed - database not created'));
                                reject(new Error('Migration failed'));
                            }

                        } else if (choice === 'delete') {
                            // Delete & Start Fresh - all logic in DatabaseMigration
                            const success = await DatabaseMigration.performDeleteAndStartFresh(
                                originalDbPath,
                                backupDbPath,
                                newDbPath,
                                oldSchemaDbPath,
                                (step, total, message) => migrationDialog.updateProgress(step, total, message)
                            );

                            if (success) {
                                migrationDialog.showCompletion();
                                resolve();
                            } else {
                                migrationDialog.showError(_('Delete operation failed'));
                                reject(new Error('Delete failed'));
                            }
                        }

                    } catch (error) {
                        console.error('Migration error:', error);
                        migrationDialog.showError(error.message);
                        reject(error);
                    }
                });
            });
        }

        /**
         * Apply saved theme
         */
        _applySavedTheme() {
            try {
                const settings = new Gio.Settings({ schema: 'com.odnoyko.valot' });

                // Apply theme
                const savedTheme = settings.get_int('theme-preference');
                const styleManager = Adw.StyleManager.get_default();

                switch (savedTheme) {
                    case 0:
                        styleManager.color_scheme = Adw.ColorScheme.DEFAULT;
                        break;
                    case 1:
                        styleManager.color_scheme = Adw.ColorScheme.FORCE_LIGHT;
                        break;
                    case 2:
                        styleManager.color_scheme = Adw.ColorScheme.FORCE_DARK;
                        break;
                }

                // Apply accent color
                const savedMode = settings.get_int('accent-mode');
                const savedColor = settings.get_string('accent-color');
                if (savedMode === 1) {
                    AccentColorManager.applyAccentMode(savedMode, savedColor);
                }
            } catch (error) {
                console.error('Error applying theme:', error);
            }
        }

        /**
         * Activate application
         */
        vfunc_activate() {
            // If already activated and Core is initialized, just show the appropriate window
            if (this.coreAPI && this.coreBridge) {
                if (this.compactMode) {
                    this._launchCompactTracker();
                } else {
                    this._launchMainWindow();
                }
                return;
            }

            // Hold application to prevent premature shutdown during async init
            this.hold();

            // Load CSS (only on first activation)
            loadCss();

            // Apply theme
            this._applySavedTheme();

            // Initialize Core asynchronously
            this._initializeCore().then(initialized => {
                if (!initialized) {
                    this.release();
                    return;
                }

                if (this.compactMode) {
                    // Launch compact tracker
                    this._launchCompactTracker();
                } else {
                    // Launch main window
                    this._launchMainWindow();
                }

                // Release hold after window is created
                this.release();
            }).catch(error => {
                console.error('Failed to activate application:', error);
                this.release();
            });
        }

        /**
         * Launch main window
         */
        _launchMainWindow() {
            // Close existing windows
            this._closeAllWindows();

            this.mainWindow = new ValotMainWindow(this, this.coreBridge);
            this.add_window(this.mainWindow);
            this.mainWindow.present();

            // Show welcome carousel on first launch
            CarouselDialog.showIfNeeded(this.mainWindow);

        }

        /**
         * Launch compact tracker
         * @param {boolean} shiftMode - If true, keep MainWindow visible
         */
        _launchCompactTracker(shiftMode = false) {
            // Check if compact window exists and is valid
            try {
                if (this.compactWindow && !this.compactWindow.is_destroyed?.()) {
                    // Window exists (visible or hidden) - show it
                    this.compactWindow.setShiftMode(shiftMode);
                    this.compactWindow.set_visible(true);
                    this.compactWindow.present();

                    // Update MainWindow visibility based on shiftMode
                    if (!shiftMode && this.mainWindow) {
                        this.mainWindow.set_visible(false);
                    } else if (shiftMode && this.mainWindow) {
                        this.mainWindow.set_visible(true);
                        this.mainWindow.present();
                    }

                    return;
                }
            } catch (e) {
            }

            // Close/cleanup existing compact tracker if invalid
            if (this.compactWindow) {
                try {
                    this.compactWindow.close();
                } catch (e) {
                    // Already destroyed
                }
                this.compactWindow = null;
            }

            // Create compact tracker
            this.compactWindow = new CompactTrackerWindow(this, this.coreBridge);
            this.compactWindow.setShiftMode(shiftMode);

            // Always on top settings
            try {
                if (typeof this.compactWindow.set_keep_above === 'function') {
                    this.compactWindow.set_keep_above(true);
                }
                if (typeof this.compactWindow.stick === 'function') {
                    this.compactWindow.stick();
                }
            } catch (error) {
            }

            // Handle close - just hide
            this.compactWindow.connect('close-request', () => {
                this.compactWindow.set_visible(false);
                return true; // Prevent destruction
            });

            // Clean up reference if window is destroyed
            this.compactWindow.connect('destroy', () => {
                this.compactWindow = null;
            });

            this.add_window(this.compactWindow);
            this.compactWindow.present();

            // Hide MainWindow if not in shift mode
            if (!shiftMode && this.mainWindow) {
                this.mainWindow.set_visible(false);
            }

        }

        /**
         * Open main application from compact mode
         */
        openMainApplication() {
            this.compactMode = false;

            // Create or restore MainWindow
            if (!this.mainWindow) {
                this.mainWindow = new ValotMainWindow(this, this.coreBridge);
                this.add_window(this.mainWindow);
            }

            this.mainWindow.set_visible(true);
            this.mainWindow.present();
            this.mainWindow.unminimize();
        }

        /**
         * Close all windows
         */
        _closeAllWindows() {
            if (this.compactWindow) {
                this.compactWindow.close();
                this.compactWindow = null;
            }

            const windows = this.get_windows();
            windows.forEach(window => {
                if (window !== this.compactWindow) {
                    window.close();
                }
            });
        }

        /**
         * Shutdown
         */
        vfunc_shutdown() {

            // Chain up to parent first (synchronously required)
            super.vfunc_shutdown();

            // Then do async cleanup
            Promise.all([
                this.databaseBridge ? this.databaseBridge.close() : Promise.resolve(),
                this.coreAPI ? this.coreAPI.shutdown() : Promise.resolve()
            ]).catch(error => {
                console.error('Error during shutdown cleanup:', error);
            });
        }
    }
);

export { AccentColorManager };

/**
 * Main entry point
 */
export function main(argv) {
    const application = new ValotApplication();
    return application.runAsync(argv);
}
