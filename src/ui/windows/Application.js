/**
 * Valot Application - New Architecture
 * Initializes Core API and launches UI
 */

import GObject from 'gi://GObject';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk?version=4.0';
import Adw from 'gi://Adw?version=1';
import Gdk from 'gi://Gdk?version=4.0';

// Import bridges
import { GdaDatabaseBridge } from 'resource:///com/odnoyko/valot/ui/bridges/GdaDatabaseBridge.js';
import { CoreBridge } from 'resource:///com/odnoyko/valot/ui/bridges/CoreBridge.js';

// Import UI components
import { ValotMainWindow } from 'resource:///com/odnoyko/valot/ui/windows/MainWindow.js';
import { ValotCompactTracker } from 'resource:///com/odnoyko/valot/ui/windows/CompactTracker.js';
import { Config } from 'resource:///com/odnoyko/valot/config.js';

import { PreferencesDialog } from 'resource:///com/odnoyko/valot/ui/components/dialogs/PreferencesDialog.js';
// TODO: Restore CarouselDialog when migrated
// import { CarouselDialog } from 'resource:///com/odnoyko/valot/ui/dialogs/CarouselDialog.js';

// Init i18n
pkg.initGettext();
pkg.initFormat();

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
                flags: Gio.ApplicationFlags.HANDLES_COMMAND_LINE | Gio.ApplicationFlags.REPLACE,
                resource_base_path: '/com/odnoyko/valot'
            });

            // Core API and bridges
            this.coreAPI = null;
            this.coreBridge = null;
            this.databaseBridge = null;

            // Windows
            this.compactMode = false;
            this.compactWindow = null;

            // Setup
            this._setupActions();

            // Command line options
            this.add_main_option('compact', 'c'.charCodeAt(0),
                0, 0,
                'Launch in compact tracker mode', null);
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
                console.log('Preferences dialog - TODO');
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
        async _initializeCore() {
            try {
                console.log('🚀 Initializing Core API...');

                // Create database bridge
                this.databaseBridge = new GdaDatabaseBridge();
                await this.databaseBridge.initialize();

                console.log('✅ Database initialized');

                // TODO: Initialize Core API with TypeScript compiled code
                // For now, we'll use the database bridge directly
                // this.coreAPI = new CoreAPI();
                // await this.coreAPI.initialize(this.databaseBridge);

                // Create Core Bridge (simplified for now)
                // this.coreBridge = new CoreBridge(this.coreAPI);

                // Temporary: Create a mock core bridge
                this.coreBridge = {
                    database: this.databaseBridge,
                    onUIEvent: () => {},
                    getTrackingState: () => ({ isTracking: false }),
                    _notifyUI: () => {},
                };

                console.log('✅ Core API initialized');

                return true;
            } catch (error) {
                console.error('❌ Core initialization failed:', error);

                const dialog = new Adw.AlertDialog({
                    heading: _('Database Error'),
                    body: `${_('Failed to initialize database')}: ${error.message}`
                });

                if (this.active_window) {
                    dialog.present(this.active_window);
                }

                return false;
            }
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
            // Hold application to prevent premature shutdown during async init
            this.hold();

            // Load CSS
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

            const mainWindow = new ValotMainWindow(this, this.coreBridge);
            this.add_window(mainWindow);
            mainWindow.present();

            // TODO: Show welcome carousel if needed
            // CarouselDialog.showIfNeeded(mainWindow);

            console.log('✅ Main window launched');
        }

        /**
         * Launch compact tracker
         */
        _launchCompactTracker() {
            // Close existing compact tracker
            if (this.compactWindow) {
                this.compactWindow.close();
                this.compactWindow = null;
            }

            // Create compact tracker
            this.compactWindow = new ValotCompactTracker(this, this.coreBridge, null);

            // Always on top settings
            try {
                if (typeof this.compactWindow.set_keep_above === 'function') {
                    this.compactWindow.set_keep_above(true);
                }
                if (typeof this.compactWindow.stick === 'function') {
                    this.compactWindow.stick();
                }
            } catch (error) {
                console.warn('Could not set window properties:', error);
            }

            // Handle close - minimize instead
            this.compactWindow.connect('close-request', () => {
                this.compactWindow.set_visible(false);
                return true;
            });

            this.compactWindow.present();

            console.log('✅ Compact tracker launched');
        }

        /**
         * Open main application from compact mode
         */
        openMainApplication() {
            this.compactMode = false;

            let { active_window } = this;
            if (!active_window || active_window === this.compactWindow) {
                active_window = new ValotMainWindow(this, this.coreBridge);
                this.add_window(active_window);
            }

            active_window.set_visible(true);
            active_window.present();
            active_window.unminimize();
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
            console.log('🛑 Shutting down...');

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
