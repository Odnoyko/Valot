/* MIT License
 *
 * Copyright (c) 2025 Vitaly Odnoyko
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

import Adw from 'gi://Adw?version=1';
import Gtk from 'gi://Gtk?version=4.0';
import { Config } from 'resource:///com/odnoyko/valot/config.js';

export function showAboutDialog(parentWindow) {
    console.log('Opening about dialog...');

    const aboutDialog = new Adw.AboutDialog({
        application_name: Config.PACKAGE_NAME,
        application_icon: Config.APPLICATION_ID,
        developer_name: Config.DEVELOPER,
        version: Config.VERSION,
        designers: [
            Config.DEVELOPER
        ],
        copyright: `© 2025 ${Config.DEVELOPER}`,
        license_type: Gtk.License.GPL_3_0,
        website: Config.WEBSITE,
        comments: 'A simple and elegant time tracking application for productivity and project management.',
    });

    aboutDialog.present(parentWindow);
}
