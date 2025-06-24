/* window.js
 *
 * Copyright 2025 Unknown
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 */
import { showAllData } from './test.js';

showAllData();

import GObject from 'gi://GObject';
import Gtk from 'gi://Gtk';
import Adw from 'gi://Adw';
//import { timeTrack } from './global/timetracking.js';

export const ValotWindow = GObject.registerClass({
    GTypeName: 'ValotWindow',
    Template: 'resource:///com/odnoyko/valot/ui/window.ui',
    InternalChildren: ['track_button','task_name','actual_time'],
}, class ValotWindow extends Adw.ApplicationWindow {
    constructor(application) {
        super({ application });
        //timeTrack(this._track_button , this._task_name, this._actual_time);
    }
});

