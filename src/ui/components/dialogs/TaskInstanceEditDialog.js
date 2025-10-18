/**
 * Task Instance Edit Dialog
 * Allows editing task name, project, client, start/end times
 * Adapted to new Core architecture
 */

import Gtk from 'gi://Gtk?version=4.0';
import Adw from 'gi://Adw?version=1';
import GLib from 'gi://GLib';
import { ProjectDropdown } from 'resource:///com/odnoyko/valot/ui/utils/projectDropdown.js';
import { ClientDropdown } from 'resource:///com/odnoyko/valot/ui/utils/clientDropdown.js';

export class TaskInstanceEditDialog {
    constructor(taskInstance, parent, coreBridge) {
        this.taskInstance = taskInstance;
        this.parent = parent; // TasksPage or other page
        this.coreBridge = coreBridge;

        // Selected values
        this.selectedProjectId = taskInstance.project_id || 1;
        this.selectedClientId = taskInstance.client_id || 1;

        // Load time entries and create dialog
        this._initPromise = this._init();
    }

    async _init() {
        // Get time entries for this instance
        const timeEntries = await this.coreBridge.getTimeEntriesByInstance(this.taskInstance.id);

        // Get latest time entry (last one)
        this.latestEntry = timeEntries.length > 0 ? timeEntries[0] : null;

        // Parse timestamps from latest entry or use defaults
        if (this.latestEntry) {
            this.startDate = this._parseTimestamp(this.latestEntry.start_time);
            this.endDate = this._parseTimestamp(this.latestEntry.end_time);
        } else {
            // No entries yet - use current date
            this.startDate = new Date();
            this.endDate = new Date();
        }

        // Store original duration in seconds
        this.originalDuration = Math.floor((this.endDate - this.startDate) / 1000);

        this._createDialog();
    }

    _parseTimestamp(timestamp) {
        if (!timestamp) return new Date();

        // Parse local time from database
        if (timestamp.includes('T')) {
            const localTimeStr = timestamp.replace('T', ' ').substring(0, 19);
            const [datePart, timePart] = localTimeStr.split(' ');
            const [year, month, day] = datePart.split('-').map(Number);
            const [hours, minutes, seconds] = timePart.split(':').map(Number);
            return new Date(year, month - 1, day, hours, minutes, seconds || 0);
        }
        return new Date(timestamp);
    }

    _formatTimestamp(date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        const seconds = String(date.getSeconds()).padStart(2, '0');
        return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
    }

    _formatDuration(seconds) {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;
        return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }

    _createDialog() {
        this.dialog = new Adw.AlertDialog({
            heading: _('Edit Task'),
            body: `"${this.taskInstance.task_name}"`,
        });

        const form = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 12,
            margin_top: 12,
            margin_bottom: 12,
            margin_start: 12,
            margin_end: 12,
            width_request: 600,
        });

        // First row: name + project + client
        const firstRow = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 12,
        });

        // Task name
        this.nameEntry = new Gtk.Entry({
            text: this.taskInstance.task_name || '',
            placeholder_text: _('Task name'),
            hexpand: true,
        });

        // Project dropdown (minimalist button)
        this.projectDropdown = new ProjectDropdown(
            this.coreBridge,
            this.selectedProjectId,
            (selectedProject) => {
                this.selectedProjectId = selectedProject.id;
            }
        );

        // Client dropdown (minimalist button)
        this.clientDropdown = new ClientDropdown(
            this.coreBridge,
            this.selectedClientId,
            (selectedClient) => {
                this.selectedClientId = selectedClient.id;
            }
        );

        firstRow.append(this.nameEntry);
        firstRow.append(this.projectDropdown.getWidget());
        firstRow.append(this.clientDropdown.getWidget());

        // DateTime row
        const datetimeRow = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 12,
        });

        // Start time
        const startBox = this._createDateTimeBox('Start Time:', this.startDate, (newDate) => {
            this.startDate = newDate;
            // Just update, don't move end date
            this._updateDateTimeButtonLabels();
            this._updateDuration();
        });

        // End time
        const endBox = this._createDateTimeBox('End Time:', this.endDate, (newDate) => {
            this.endDate = newDate;

            // Check if end date/time is before start date/time (negative duration)
            if (this.endDate.getTime() < this.startDate.getTime()) {
                // Move start date back to maintain original duration
                this.startDate = new Date(this.endDate.getTime() - this.originalDuration * 1000);
                this._updateDateTimeButtonLabels();
            }

            this._updateDuration();
        });

        // Duration display
        const durationBox = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 4,
        });

        const durationLabel = new Gtk.Label({
            label: _('Duration:'),
            halign: Gtk.Align.START,
            css_classes: ['caption'],
        });

        this.durationLabel = new Gtk.Label({
            label: this._formatDuration(this.taskInstance.total_time || 0),
            css_classes: ['title-3'],
            halign: Gtk.Align.START,
        });

        durationBox.append(durationLabel);
        durationBox.append(this.durationLabel);

        datetimeRow.append(startBox);
        datetimeRow.append(endBox);
        datetimeRow.append(durationBox);

        form.append(firstRow);
        form.append(datetimeRow);

        this.dialog.set_extra_child(form);
        this.dialog.add_response('cancel', _('Cancel'));
        this.dialog.add_response('save', _('Save Changes'));
        this.dialog.set_response_appearance('save', Adw.ResponseAppearance.SUGGESTED);

        this.dialog.connect('response', async (dialog, response) => {
            if (response === 'save') {
                await this._saveChanges();
            }
            dialog.close();
        });
    }

    _createDateTimeBox(labelText, initialDate, onChange) {
        const box = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 4,
        });

        const label = new Gtk.Label({
            label: labelText,
            halign: Gtk.Align.START,
            css_classes: ['caption'],
        });

        const buttonBox = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 8,
        });

        // Time button
        const timeButton = new Gtk.Button({
            label: initialDate.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }),
            css_classes: ['flat'],
            tooltip_text: _('Change time'),
        });

        // Date button
        const dateButton = new Gtk.Button({
            label: initialDate.toLocaleDateString('de-DE'),
            css_classes: ['flat'],
            tooltip_text: _('Change date'),
        });

        // Store button references for updating later
        if (labelText === 'Start Time:') {
            this.startTimeButton = timeButton;
            this.startDateButton = dateButton;
        } else if (labelText === 'End Time:') {
            this.endTimeButton = timeButton;
            this.endDateButton = dateButton;
        }

        // Time button click - show time picker
        timeButton.connect('clicked', () => {
            this._showTimePicker(initialDate, (hours, minutes) => {
                initialDate.setHours(hours);
                initialDate.setMinutes(minutes);
                onChange(initialDate);
                timeButton.set_label(initialDate.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }));
                this._updateDuration();
            });
        });

        // Date button click - show date picker
        dateButton.connect('clicked', () => {
            this._showDatePicker(initialDate, (selectedDate) => {
                // GTK get_month() returns 1-12, but JavaScript needs 0-11
                initialDate.setFullYear(selectedDate.get_year());
                initialDate.setMonth(selectedDate.get_month() - 1);
                initialDate.setDate(selectedDate.get_day_of_month());

                onChange(initialDate);
                dateButton.set_label(initialDate.toLocaleDateString('de-DE'));
                this._updateDuration();
            });
        });

        buttonBox.append(timeButton);
        buttonBox.append(dateButton);

        box.append(label);
        box.append(buttonBox);

        return box;
    }

    _showDateTimePicker(currentDate, onSelected) {
        // First show date picker
        this._showDatePicker(currentDate, (selectedDate) => {
            // Then show time picker
            this._showTimePicker(currentDate, (hours, minutes) => {
                // Combine date and time
                const newDate = new Date(
                    selectedDate.get_year(),
                    selectedDate.get_month(),
                    selectedDate.get_day_of_month(),
                    hours,
                    minutes,
                    0
                );
                onSelected(newDate);
            });
        });
    }

    _showDatePicker(currentDate, onDateSelected) {
        const dateDialog = new Adw.AlertDialog({
            heading: _('Choose date'),
            body: _('Select the date for this task'),
        });

        const content = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 12,
            margin_top: 12,
            margin_bottom: 12,
            margin_start: 12,
            margin_end: 12,
        });

        // GTK Calendar uses months 0-11 when setting, but returns 1-12 when getting
        const calendar = new Gtk.Calendar({
            day: currentDate.getDate(),
            month: currentDate.getMonth(),
            year: currentDate.getFullYear(),
        });

        content.append(calendar);

        dateDialog.set_extra_child(content);
        dateDialog.add_response('cancel', _('Cancel'));
        dateDialog.add_response('ok', _('OK'));
        dateDialog.set_response_appearance('ok', Adw.ResponseAppearance.SUGGESTED);

        dateDialog.connect('response', (dialog, response) => {
            if (response === 'ok') {
                const selectedDate = calendar.get_date();
                onDateSelected(selectedDate);
            }
            dialog.close();
        });

        // Get the actual GTK window from parent page
        const window = this.parent.parentWindow || this.parent;
        dateDialog.present(window);
    }

    _showTimePicker(currentDate, onTimeSelected) {
        const timeDialog = new Adw.AlertDialog({
            heading: _('Choose time'),
            body: _('Select the time for this task'),
        });

        const content = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 12,
            margin_top: 12,
            margin_bottom: 12,
            margin_start: 12,
            margin_end: 12,
            halign: Gtk.Align.CENTER,
        });

        // Store current values
        let hours = currentDate.getHours();
        let minutes = currentDate.getMinutes();

        // Time picker with +/- buttons
        const timeBox = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 16,
            halign: Gtk.Align.CENTER,
        });

        // Hour column
        const hourBox = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 8,
            halign: Gtk.Align.CENTER,
        });

        const hourPlusButton = new Gtk.Button({
            icon_name: 'list-add-symbolic',
            css_classes: ['circular'],
        });

        const hourLabel = new Gtk.Label({
            label: String(hours).padStart(2, '0'),
            css_classes: ['title-1'],
            width_chars: 2,
        });

        const hourMinusButton = new Gtk.Button({
            icon_name: 'list-remove-symbolic',
            css_classes: ['circular'],
        });

        hourPlusButton.connect('clicked', () => {
            hours = (hours + 1) % 24;
            hourLabel.set_label(String(hours).padStart(2, '0'));
        });

        hourMinusButton.connect('clicked', () => {
            hours = (hours - 1 + 24) % 24;
            hourLabel.set_label(String(hours).padStart(2, '0'));
        });

        hourBox.append(hourPlusButton);
        hourBox.append(hourLabel);
        hourBox.append(hourMinusButton);

        // Separator
        const separatorLabel = new Gtk.Label({
            label: ':',
            css_classes: ['title-1'],
            valign: Gtk.Align.CENTER,
        });

        // Minute column
        const minuteBox = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 8,
            halign: Gtk.Align.CENTER,
        });

        const minutePlusButton = new Gtk.Button({
            icon_name: 'list-add-symbolic',
            css_classes: ['circular'],
        });

        const minuteLabel = new Gtk.Label({
            label: String(minutes).padStart(2, '0'),
            css_classes: ['title-1'],
            width_chars: 2,
        });

        const minuteMinusButton = new Gtk.Button({
            icon_name: 'list-remove-symbolic',
            css_classes: ['circular'],
        });

        minutePlusButton.connect('clicked', () => {
            minutes = (minutes + 1) % 60;
            minuteLabel.set_label(String(minutes).padStart(2, '0'));
        });

        minuteMinusButton.connect('clicked', () => {
            minutes = (minutes - 1 + 60) % 60;
            minuteLabel.set_label(String(minutes).padStart(2, '0'));
        });

        minuteBox.append(minutePlusButton);
        minuteBox.append(minuteLabel);
        minuteBox.append(minuteMinusButton);

        timeBox.append(hourBox);
        timeBox.append(separatorLabel);
        timeBox.append(minuteBox);

        content.append(timeBox);

        timeDialog.set_extra_child(content);
        timeDialog.add_response('cancel', _('Cancel'));
        timeDialog.add_response('ok', _('OK'));
        timeDialog.set_response_appearance('ok', Adw.ResponseAppearance.SUGGESTED);

        timeDialog.connect('response', (dialog, response) => {
            if (response === 'ok') {
                onTimeSelected(hours, minutes);
            }
            dialog.close();
        });

        // Get the actual GTK window from parent page
        const window = this.parent.parentWindow || this.parent;
        timeDialog.present(window);
    }

    _updateDuration() {
        const duration = Math.floor((this.endDate - this.startDate) / 1000);
        this.durationLabel.set_label(this._formatDuration(duration));
    }

    _updateDateTimeButtonLabels() {
        // Update start time/date buttons
        if (this.startTimeButton) {
            this.startTimeButton.set_label(
                this.startDate.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
            );
        }
        if (this.startDateButton) {
            this.startDateButton.set_label(this.startDate.toLocaleDateString('de-DE'));
        }

        // Update end time/date buttons
        if (this.endTimeButton) {
            this.endTimeButton.set_label(
                this.endDate.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
            );
        }
        if (this.endDateButton) {
            this.endDateButton.set_label(this.endDate.toLocaleDateString('de-DE'));
        }
    }

    async _saveChanges() {
        try {

            const newName = this.nameEntry.get_text().trim();
            if (!newName) {
                console.error('Task name cannot be empty');
                return;
            }

            // Check if this task is currently being tracked
            const trackingState = this.coreBridge.getTrackingState();
            const isEditingTrackedTask = trackingState.isTracking &&
                this.taskInstance.task_id === trackingState.currentTaskId &&
                this.taskInstance.project_id === trackingState.currentProjectId &&
                this.taskInstance.client_id === trackingState.currentClientId;

            // Update task name if changed
            if (newName !== this.taskInstance.task_name) {
                const task = await this.coreBridge.findOrCreateTask(newName);
                // Update TaskInstance to use new task
                await this.coreBridge.updateTaskInstance(this.taskInstance.id, {
                    task_id: task.id
                });
            }

            // Update project, client, and last_used_at (use ID=1 for default, not null)
            await this.coreBridge.updateTaskInstance(this.taskInstance.id, {
                project_id: this.selectedProjectId,
                client_id: this.selectedClientId,
                last_used_at: this._formatTimestamp(this.endDate),
            });

            // If editing currently tracked task, update tracking state in Core
            if (isEditingTrackedTask) {
                // Update task name in tracking state
                if (newName !== this.taskInstance.task_name) {
                    await this.coreBridge.updateCurrentTaskName(newName);
                }

                // Update project/client in tracking state
                await this.coreBridge.updateCurrentProjectClient(this.selectedProjectId, this.selectedClientId);

                // Emit event to update AdvancedTrackingWidget UI
                this.coreBridge.emitUIEvent('tracking-updated', {
                    taskName: newName,
                    projectId: this.selectedProjectId,
                    clientId: this.selectedClientId,
                });
            }

            // Update time entry timestamps if we have one
            if (this.latestEntry) {
                const duration = Math.floor((this.endDate - this.startDate) / 1000);

                await this.coreBridge.updateTimeEntry(this.latestEntry.id, {
                    start_time: this._formatTimestamp(this.startDate),
                    end_time: this._formatTimestamp(this.endDate),
                    duration: duration,
                });

                // Update TaskInstance total_time
                await this.coreBridge.updateTaskInstanceTotalTime(this.taskInstance.id);
            }

            // Reload tasks in parent page
            if (this.parent && this.parent.loadTasks) {
                await this.parent.loadTasks();
            }

            // Update sidebar weekly time in MainWindow
            if (this.parent && this.parent.parentWindow && this.parent.parentWindow._updateSidebarStats) {
                await this.parent.parentWindow._updateSidebarStats();
            }

            // Update projects page if it's loaded
            if (this.parent && this.parent.parentWindow && this.parent.parentWindow.projectsPageInstance) {
                await this.parent.parentWindow.projectsPageInstance.loadProjects();
            }

            // Update reports page chart if it's loaded
            if (this.parent && this.parent.parentWindow && this.parent.parentWindow.reportsPageInstance) {
                await this.parent.parentWindow.reportsPageInstance.updateChartsOnly();
            }

            // Emit global event for any other listeners (e.g., ReportsPage if opened from elsewhere)
            this.coreBridge.emitUIEvent('task-updated', {
                taskInstanceId: this.taskInstance.id
            });

        } catch (error) {
            console.error('❌ Error saving task changes:', error);
        }
    }

    async present(window) {
        // Wait for dialog to be created if _init is still running
        if (!this.dialog) {
            await this._initPromise;
        }
        // Use provided window or fallback to parentWindow
        const targetWindow = window || this.parentWindow;
        this.dialog.present(targetWindow);
    }
}
