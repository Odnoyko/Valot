/* MIT License
 *
 * Copyright (c) 2025 Unknown
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 *
 * SPDX-License-Identifier: MIT
 */

import GObject from 'gi://GObject';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk?version=4.0';
import Adw from 'gi://Adw?version=1';
import Gdk from 'gi://Gdk?version=4.0';

import { setupDatabase } from 'resource:///com/odnoyko/valot/js/func/global/dbinitialisation.js';
import { ValotWindow } from 'resource:///com/odnoyko/valot/js/mainwindow.js';
import { CarouselDialog } from 'resource:///com/odnoyko/valot/js/interface/components/CarouselDialog.js';
import { PreferencesDialog } from 'resource:///com/odnoyko/valot/js/interface/components/PreferencesDialog.js';
import { CompactTrackerWindow } from 'resource:///com/odnoyko/valot/js/compacttracker.js';

pkg.initGettext();
pkg.initFormat();

// Global accent color manager
const AccentColorManager = {
    _customAccentProvider: null,
    
    applyAccentMode(mode, colorString) {
        const display = Gdk.Display.get_default();
        
        // Remove existing custom accent provider if it exists
        if (this._customAccentProvider) {
            Gtk.StyleContext.remove_provider_for_display(display, this._customAccentProvider);
            this._customAccentProvider = null;
        }
        
        if (mode === 0) {
            // Standard mode - custom CSS removed, system uses defaults
            return;
        } else if (mode === 1 && colorString) {
            // Custom mode - apply custom accent color
            const rgba = new Gdk.RGBA();
            if (!rgba.parse(colorString)) return;
            
            // Create CSS for custom accent color
            this._customAccentProvider = new Gtk.CssProvider();
            const css = `
                @define-color accent_color ${colorString};
                @define-color accent_bg_color ${colorString};
                @define-color accent_fg_color white;
            `;
            
            try {
                this._customAccentProvider.load_from_data(css, -1);
                
                // Apply the CSS provider
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

function loadCss() {
    const provider = new Gtk.CssProvider();
    provider.load_from_resource('/com/odnoyko/valot/style/main.css');

    Gtk.StyleContext.add_provider_for_display(
        Gdk.Display.get_default(),
        provider,
        Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION
    );
}

export const ValotApplication = GObject.registerClass(
    class ValotApplication extends Adw.Application {
        constructor() {
            super({
                application_id: 'com.odnoyko.valot',
                flags: Gio.ApplicationFlags.HANDLES_COMMAND_LINE | Gio.ApplicationFlags.REPLACE,
                resource_base_path: '/com/odnoyko/valot'
            });

            // Initialize database connection property
            this.database_connection = null;
            
            // Track compact tracker mode
            this.compactMode = false;
            this.compactWindow = null;

            // Setup actions
            this._setupActions();
            
            // Add command line options
            this.add_main_option('compact', 'c'.charCodeAt(0), 
                0, 0, 
                'Launch in compact tracker mode', null);
        }

        _setupActions() {
            const quit_action = new Gio.SimpleAction({name: 'quit'});
            quit_action.connect('activate', action => {
                this.quit();
            });
            this.add_action(quit_action);
            this.set_accels_for_action('app.quit', ['<primary>q']);

            const show_preferences_action = new Gio.SimpleAction({name: 'about'});
            show_preferences_action.connect('activate', action => {
                PreferencesDialog.show(this.active_window);
            });
            this.add_action(show_preferences_action);
        }

        vfunc_command_line(command_line) {
            const options = command_line.get_options_dict();
            
            // Check if compact mode is requested
            if (options.contains('compact')) {
                this.compactMode = true;
            }
            
            this.activate();
            return 0;
        }

        _initializeDatabase() {
            try {
                this.database_connection = setupDatabase();
                // Database successfully connected
                return true;
            } catch (error) {
                print(`Fehler bei der Datenbankverbindung: ${error.message}`);

                // Show error dialog to user
                const dialog = new Adw.AlertDialog({
                    heading: 'Database Error',
                    body: `Failed to initialize database: ${error.message}`
                });

                if (this.active_window) {
                    dialog.present(this.active_window);
                }

                return false;
            }
        }

        vfunc_activate() {
            // Load CSS first
            loadCss();
            
            // Apply saved theme
            this._applySavedTheme();

            // Initialize database
            if (!this._initializeDatabase()) {
            }

            if (this.compactMode) {
                // Enforce single instance: Close any existing main windows
                this._closeAllMainWindows();

                // Create main window in background but keep it hidden
                const mainWindow = new ValotWindow(this);
                this.add_window(mainWindow);
                // Don't present it, keep hidden
                
                // Ensure data is loaded for compact tracker
                setTimeout(() => {
                    if (mainWindow._loadProjects) mainWindow._loadProjects();
                    if (mainWindow._loadClients) mainWindow._loadClients();
                }, 100);
                
                // Launch compact tracker with reference to main window
                this._launchCompactTracker(mainWindow);
                
                // Set compact tracker reference in main window for updates (after compact window is created)
                setTimeout(() => {
                    if (this.compactWindow) {
                        mainWindow.compactTrackerWindow = this.compactWindow;
                    }
                }, 200);
            } else {
                // Enforce single instance: Close any existing windows first
                this._closeAllWindows();

                // Launch full application
                const mainWindow = new ValotWindow(this);
                this.add_window(mainWindow);
                mainWindow.present();
                
                // Show welcome carousel if needed
                CarouselDialog.showIfNeeded(mainWindow);
            }
        }

        /**
         * Close all existing windows (for single instance enforcement)
         */
        _closeAllWindows() {
            // Close existing compact tracker window
            if (this.compactWindow) {
                this.compactWindow.close();
                this.compactWindow = null;
            }

            // Close all main windows
            this._closeAllMainWindows();
        }

        /**
         * Close all main windows (for single instance enforcement)
         */
        _closeAllMainWindows() {
            // Get all windows and close ValotWindow instances
            const windows = this.get_windows();
            windows.forEach(window => {
                if (window.constructor.name === 'ValotWindow') {
                    // Clean up compact tracker reference if it exists
                    if (window.compactTrackerWindow) {
                        window.compactTrackerWindow = null;
                    }
                    window.close();
                }
            });
        }

        _launchCompactTracker(mainWindow = null) {
            // Close existing compact tracker window first (single instance)
            if (this.compactWindow) {
                this.compactWindow.close();
                this.compactWindow = null;
            }

            // Create compact tracker with reference to main window
            this.compactWindow = new CompactTrackerWindow(this, mainWindow);

            // Make it always on top and persistent (with fallback for different environments)
            try {
                if (typeof this.compactWindow.set_keep_above === 'function') {
                    this.compactWindow.set_keep_above(true);
                }
                if (typeof this.compactWindow.stick === 'function') {
                    this.compactWindow.stick();
                }
            } catch (error) {
            }

            // Set window properties for always-on-top behavior
            try {
                if (typeof this.compactWindow.set_type_hint === 'function') {
                    this.compactWindow.set_type_hint(Gdk.WindowTypeHint.UTILITY);
                }
            } catch (error) {
            }

            // Handle close event - minimize instead of closing
            this.compactWindow.connect('close-request', () => {
                this.compactWindow.set_visible(false);
                return true; // Prevent actual close
            });

            this.compactWindow.present();
        }

        openMainApplication() {
            // Method to open main app from compact tracker
            this.compactMode = false;
            
            let {active_window} = this;
            if (!active_window) {
                active_window = new ValotWindow(this);
                this.add_window(active_window);
            }
            
            // Ensure window is visible and presented properly
            active_window.set_visible(true);
            active_window.present();
            active_window.unminimize(); // Force unminimize if it was minimized
            
            // Don't show welcome carousel when coming from compact mode
            // It should only show when opening app normally
        }

        vfunc_shutdown() {
            // Clean up database connection when app shuts down
            if (this.database_connection) {
                try {
                    // Close database connection if your database wrapper supports it
                    // this.database_connection.close();
                    print("Datenbankverbindung geschlossen");
                } catch (error) {
                    print(`Error closing database: ${error.message}`);
                }
            }

            super.vfunc_shutdown();
        }

        _applySavedTheme() {
            try {
                const settings = new Gio.Settings({ schema: 'com.odnoyko.valot' });
                
                // Apply theme
                const savedTheme = settings.get_int('theme-preference');
                const styleManager = Adw.StyleManager.get_default();
                
                switch (savedTheme) {
                    case 0: // Auto
                        styleManager.color_scheme = Adw.ColorScheme.DEFAULT;
                        break;
                    case 1: // Light
                        styleManager.color_scheme = Adw.ColorScheme.FORCE_LIGHT;
                        break;
                    case 2: // Dark
                        styleManager.color_scheme = Adw.ColorScheme.FORCE_DARK;
                        break;
                }
                
                // Apply accent color only if in custom mode
                const savedMode = settings.get_int('accent-mode');
                const savedColor = settings.get_string('accent-color');
                if (savedMode === 1) {
                    AccentColorManager.applyAccentMode(savedMode, savedColor);
                }
            } catch (error) {
                // If settings fail, just use default
            }
        }

    }
);

export { AccentColorManager };

export function main(argv) {
    const application = new ValotApplication();
    return application.runAsync(argv);
}
