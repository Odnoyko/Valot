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

import { setupDatabase } from 'resource:///com/odnoyko/valot/js/dbinitialisation.js';
import { ValotWindow } from 'resource:///com/odnoyko/valot/js/window.js';

pkg.initGettext();
pkg.initFormat();

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
                flags: Gio.ApplicationFlags.DEFAULT_FLAGS,
                resource_base_path: '/com/odnoyko/valot'
            });

            // Initialize database connection property
            this.database_connection = null;

            // Setup actions
            this._setupActions();
        }

        _setupActions() {
            const quit_action = new Gio.SimpleAction({name: 'quit'});
            quit_action.connect('activate', action => {
                this.quit();
            });
            this.add_action(quit_action);
            this.set_accels_for_action('app.quit', ['<primary>q']);

            const show_about_action = new Gio.SimpleAction({name: 'about'});
            show_about_action.connect('activate', action => {
                const aboutParams = {
                    application_name: 'valot',
                    application_icon: 'com.odnoyko.valot',
                    developer_name: 'Odnoyko',
                    version: '0.1.2',
                    developers: [
                        'Odnoyko'
                    ],
                    // Translators: Replace "translator-credits" with your name/username, and optionally an email or URL.
                    translator_credits: _("translator-credits"),
                    copyright: '© 2025 Odnoyko'
                };
                const aboutDialog = new Adw.AboutDialog(aboutParams);
                aboutDialog.present(this.active_window);
            });
            this.add_action(show_about_action);
        }

        _initializeDatabase() {
            try {
                this.database_connection = setupDatabase();
                print("База данных подключена успешно");
                return true;
            } catch (error) {
                print(`Ошибка подключения к базе данных: ${error.message}`);

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

            // Initialize database
            if (!this._initializeDatabase()) {
                // If database initialization fails, you might want to:
                // 1. Show an error and quit
                // 2. Continue with limited functionality
                // 3. Retry initialization

                // For now, we'll continue but log the error
                console.error("Application starting without database connection");
            }

            let {active_window} = this;

            if (!active_window) {
                active_window = new ValotWindow(this);
            }

            active_window.present();
        }

        vfunc_shutdown() {
            // Clean up database connection when app shuts down
            if (this.database_connection) {
                try {
                    // Close database connection if your database wrapper supports it
                    // this.database_connection.close();
                    print("Database connection closed");
                } catch (error) {
                    print(`Error closing database: ${error.message}`);
                }
            }

            super.vfunc_shutdown();
        }
    }
);

export function main(argv) {
    const application = new ValotApplication();
    return application.runAsync(argv);
}
