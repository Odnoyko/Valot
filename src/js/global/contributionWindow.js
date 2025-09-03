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
import Gtk from 'gi://Gtk?version=4.0';
import Adw from 'gi://Adw?version=1';

export class ContributionWindow extends Adw.ApplicationWindow {
    static {
        GObject.registerClass({
            GTypeName: 'ContributionWindow',
        }, this);
    }

    constructor(parent_window, timeData) {
        super({
            title: 'Contribution Graph',
            transient_for: parent_window,
            modal: true,
            default_width: 800,
            default_height: 600,
            resizable: true
        });

        this.timeData = timeData || [];
        this._buildUI();
    }

    _buildUI() {
        const headerBar = new Adw.HeaderBar({
            title_widget: new Adw.WindowTitle({
                title: 'Contribution Graph',
                subtitle: 'Your weekly time tracking activity'
            })
        });

        const toolbarView = new Adw.ToolbarView();
        toolbarView.add_top_bar(headerBar);

        const scrolledWindow = new Gtk.ScrolledWindow({
            hscrollbar_policy: Gtk.PolicyType.AUTOMATIC,
            vscrollbar_policy: Gtk.PolicyType.AUTOMATIC
        });

        const mainBox = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 24,
            margin_top: 24,
            margin_bottom: 24,
            margin_start: 24,
            margin_end: 24
        });

        const titleLabel = new Gtk.Label({
            label: 'Contribution Graph',
            css_classes: ['title-1'],
            halign: Gtk.Align.CENTER
        });

        const contributionGrid = this._createContributionGrid();
        const legend = this._createLegend();
        const statsBox = this._createStatsBox();

        mainBox.append(titleLabel);
        mainBox.append(contributionGrid);
        mainBox.append(legend);
        mainBox.append(statsBox);

        scrolledWindow.set_child(mainBox);
        toolbarView.set_content(scrolledWindow);
        this.set_content(toolbarView);
    }

    _createContributionGrid() {
        const gridBox = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 12,
            halign: Gtk.Align.CENTER
        });

        const monthLabels = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 2,
            margin_start: 20
        });

        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

        for (let i = 0; i < 12; i++) {
            const monthLabel = new Gtk.Label({
                label: months[i],
                css_classes: ['caption'],
                width_request: 60
            });
            monthLabels.append(monthLabel);
        }

        const gridContainer = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 2
        });

        const dayLabels = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 2
        });

        const days = ['Mon', 'Wed', 'Fri'];
        for (let i = 0; i < 7; i++) {
            const dayLabel = new Gtk.Label({
                label: i % 2 === 1 ? days[Math.floor(i/2)] : '',
                css_classes: ['caption'],
                height_request: 12,
                width_request: 20
            });
            dayLabels.append(dayLabel);
        }

        const grid = new Gtk.Grid({
            row_spacing: 2,
            column_spacing: 2
        });

        this._populateGrid(grid);

        gridContainer.append(dayLabels);
        gridContainer.append(grid);

        gridBox.append(monthLabels);
        gridBox.append(gridContainer);

        return gridBox;
    }

    _populateGrid(grid) {
        const today = new Date();
        const startDate = new Date(today);
        startDate.setDate(today.getDate() - 364);

        for (let week = 0; week < 52; week++) {
            for (let day = 0; day < 7; day++) {
                const currentDate = new Date(startDate);
                currentDate.setDate(startDate.getDate() + (week * 7) + day);

                if (currentDate > today) break;

                const timeForDay = this._getTimeForDate(currentDate);
                const intensity = this._getIntensityLevel(timeForDay);

                const square = new Gtk.Button({
                    width_request: 12,
                    height_request: 12,
                    css_classes: [`contribution-${intensity}`],
                    tooltip_text: `${currentDate.toDateString()}: ${this._formatDuration(timeForDay)}`
                });

                grid.attach(square, week, day, 1, 1);
            }
        }
    }

    _getTimeForDate(date) {
        if (!this.timeData || this.timeData.length === 0) {
            return Math.random() * 8 * 3600;
        }

        const dateStr = date.toISOString().split('T')[0];
        const dayData = this.timeData.find(d => d.date === dateStr);
        return dayData ? dayData.seconds : 0;
    }

    _getIntensityLevel(seconds) {
        if (seconds === 0) return '0';
        if (seconds < 1800) return '1';
        if (seconds < 3600) return '2';
        if (seconds < 7200) return '3';
        return '4';
    }

    _createLegend() {
        const legendBox = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 8,
            halign: Gtk.Align.CENTER
        });

        const lessLabel = new Gtk.Label({
            label: 'Less',
            css_classes: ['caption']
        });

        legendBox.append(lessLabel);

        for (let i = 0; i <= 4; i++) {
            const square = new Gtk.Box({
                width_request: 12,
                height_request: 12,
                css_classes: [`contribution-${i}`]
            });
            legendBox.append(square);
        }

        const moreLabel = new Gtk.Label({
            label: 'More',
            css_classes: ['caption']
        });

        legendBox.append(moreLabel);

        return legendBox;
    }

    _createStatsBox() {
        const statsBox = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 24,
            homogeneous: true,
            halign: Gtk.Align.CENTER
        });

        const totalStats = this._calculateStats();

        const totalTimeGroup = new Adw.PreferencesGroup({
            title: 'Total Time This Year'
        });

        const totalTimeRow = new Adw.ActionRow({
            title: 'Hours Tracked',
            subtitle: this._formatDuration(totalStats.totalTime),
        });

        const timeIcon = new Gtk.Image({
            icon_name: 'clock-symbolic',
            css_classes: ['accent']
        });
        totalTimeRow.add_prefix(timeIcon);

        totalTimeGroup.add(totalTimeRow);

        const streakGroup = new Adw.PreferencesGroup({
            title: 'Streak Information'
        });

        const currentStreakRow = new Adw.ActionRow({
            title: 'Current Streak',
            subtitle: `${totalStats.currentStreak} days`
        });

        const streakIcon = new Gtk.Image({
            icon_name: 'emblem-ok-symbolic',
            css_classes: ['success']
        });
        currentStreakRow.add_prefix(streakIcon);

        const longestStreakRow = new Adw.ActionRow({
            title: 'Longest Streak',
            subtitle: `${totalStats.longestStreak} days`
        });

        const longestIcon = new Gtk.Image({
            icon_name: 'trophy-symbolic',
            css_classes: ['warning']
        });
        longestStreakRow.add_prefix(longestIcon);

        streakGroup.add(currentStreakRow);
        streakGroup.add(longestStreakRow);

        statsBox.append(totalTimeGroup);
        statsBox.append(streakGroup);

        return statsBox;
    }

    _calculateStats() {
        if (!this.timeData || this.timeData.length === 0) {
            return {
                totalTime: Math.random() * 1000 * 3600,
                currentStreak: Math.floor(Math.random() * 30),
                longestStreak: Math.floor(Math.random() * 60)
            };
        }

        let totalTime = 0;
        let currentStreak = 0;
        let longestStreak = 0;
        let tempStreak = 0;

        const today = new Date();
        const sortedData = this.timeData.sort((a, b) => new Date(b.date) - new Date(a.date));

        for (const data of sortedData) {
            totalTime += data.seconds;

            if (data.seconds > 0) {
                tempStreak++;
                longestStreak = Math.max(longestStreak, tempStreak);
            } else {
                tempStreak = 0;
            }
        }

        let checkDate = new Date(today);
        for (let i = 0; i < 30; i++) {
            const dateStr = checkDate.toISOString().split('T')[0];
            const dayData = this.timeData.find(d => d.date === dateStr);

            if (dayData && dayData.seconds > 0) {
                currentStreak++;
            } else {
                break;
            }

            checkDate.setDate(checkDate.getDate() - 1);
        }

        return { totalTime, currentStreak, longestStreak };
    }

    _formatDuration(seconds) {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        return `${hours}h ${minutes}m`;
    }
}
