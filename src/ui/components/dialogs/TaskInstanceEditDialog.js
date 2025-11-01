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
import { TimeUtils } from 'resource:///com/odnoyko/valot/core/utils/TimeUtils.js';

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

        // Parse timestamps from latest entry or use defaults (use Core TimeUtils)
        if (this.latestEntry) {
            this.startDate = TimeUtils.parseTimestampFromDB(this.latestEntry.start_time);
            // Check if this is the active entry (no end_time = still tracking)
            const trackingState = this.coreBridge.getTrackingState();
            const isActiveEntry = trackingState.isTracking && 
                                 trackingState.currentTimeEntryId === this.latestEntry.id;
            
            if (isActiveEntry && !this.latestEntry.end_time) {
                // Active entry: use current time as end_time for display only (not saved)
                this.endDate = new Date(TimeUtils.getCurrentTimestamp());
            } else {
                // Completed entry: use its end_time or current time if missing
                this.endDate = this.latestEntry.end_time 
                    ? TimeUtils.parseTimestampFromDB(this.latestEntry.end_time)
                    : new Date();
            }
        } else {
            // No entries yet - use current date
            this.startDate = new Date();
            this.endDate = new Date();
        }

        // Store original duration in seconds (use Core TimeUtils)
        this.originalDuration = TimeUtils.calculateDuration(
            this.latestEntry?.start_time || this.startDate,
            this.latestEntry?.end_time || this.endDate
        );

        this._createDialog();
    }

    _createDialog() {
        this.dialog = new Adw.AlertDialog({
            heading: _('Edit Task '),
        });

        const form = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            width_request: 350,
        });

        // Subtitle with task name
        const subtitleLabel = new Gtk.Label({
            label: _('Duration'),
            css_classes: ['subtitle'],
            halign: Gtk.Align.CENTER,
        });

        // Duration counter (use Core TimeUtils for formatting)
        this.durationLabel = new Gtk.Label({
            label: TimeUtils.formatDuration(this.taskInstance.total_time || 0),
            halign: Gtk.Align.CENTER,
            css_classes: ['duration_counter'],
        });

        // Inline row: name + project + client
        const inlineRow = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 10,
            margin_bottom: 15,
        });

        // Task name entry
        this.nameEntry = new Gtk.Entry({
            text: this.taskInstance.task_name || '',
            placeholder_text: _('Task name....'),
            hexpand: true,
        });

        // Project dropdown
        this.projectDropdown = new ProjectDropdown(
            this.coreBridge,
            this.selectedProjectId,
            (selectedProject) => {
                this.selectedProjectId = selectedProject.id;
            }
        );

        // Client dropdown
        this.clientDropdown = new ClientDropdown(
            this.coreBridge,
            this.selectedClientId,
            (selectedClient) => {
                this.selectedClientId = selectedClient.id;
            }
        );

        inlineRow.append(this.nameEntry);
        inlineRow.append(this.projectDropdown.getWidget());
        inlineRow.append(this.clientDropdown.getWidget());

        // DateTime container (horizontal) - contains Start and End
        const dateTimeContainer = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 10,
        });

        // Start column
        const startColumn = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
        });

        const startLabel = new Gtk.Label({
            label: _('Start'),
            halign: Gtk.Align.START,
            margin_start: 10,
            margin_bottom: 4,
        });

        // Container for time/date buttons (horizontal)
        const startButtonsBox = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
        });

        // Time button with icon inside
        const startTimeButtonBox = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 6,
        });

        const startTimeIcon = new Gtk.Image({
            icon_name: 'preferences-system-time-symbolic',
            pixel_size: 12,
        });

        const startTimeLabel = new Gtk.Label({
            label: this.startDate.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }),
        });

        startTimeButtonBox.append(startTimeIcon);
        startTimeButtonBox.append(startTimeLabel);

        this.startTimeButton = new Gtk.Button({
            child: startTimeButtonBox,
            css_classes: ['flat'],
        });

        this.startTimeLabel = startTimeLabel; // Сохраняем ссылку для обновления

        this.startTimeButton.connect('clicked', () => {
            this._showTimePicker(this.startDate, (hours, minutes) => {
                // Calculate current duration
                const currentDuration = this.endDate.getTime() - this.startDate.getTime();

                // Set new start time
                this.startDate.setHours(hours);
                this.startDate.setMinutes(minutes);
                this.startDate.setSeconds(0);

                // Recalculate end time to preserve duration
                this.endDate = new Date(this.startDate.getTime() + currentDuration);

                this._onDateTimeChanged();
                this._updateDateTimeButtonLabels();
            }, 'start');
        });

        // Add scroll controller for start time button (use Core for logic)
        const startTimeScrollController = new Gtk.EventControllerScroll({
            flags: Gtk.EventControllerScrollFlags.VERTICAL,
        });
        startTimeScrollController.connect('scroll', (controller, dx, dy) => {
            const minutesDelta = dy > 0 ? -1 : 1; // Scroll down = decrease, up = increase
            const adjusted = TimeUtils.adjustStartDateTime(this.startDate, this.endDate, minutesDelta, 'minutes');
            this.startDate = adjusted.startDate;
            this.endDate = adjusted.endDate;
            this._onDateTimeChanged();
            return true;
        });
        this.startTimeButton.add_controller(startTimeScrollController);

        // Date button with icon inside
        const startDateButtonBox = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 6,
        });

        const startDateIcon = new Gtk.Image({
            icon_name: 'x-office-calendar-symbolic',
            pixel_size: 12,
        });

        const startDateLabel = new Gtk.Label({
            label: this.startDate.toLocaleDateString('de-DE'),
        });

        startDateButtonBox.append(startDateIcon);
        startDateButtonBox.append(startDateLabel);

        this.startDateButton = new Gtk.Button({
            child: startDateButtonBox,
            css_classes: ['flat'],
        });

        this.startDateLabel = startDateLabel; // Сохраняем ссылку для обновления

        this.startDateButton.connect('clicked', () => {
            this._showDatePicker(this.startDate, (selectedDate) => {
                // Preserve current time when changing date
                const newDate = new Date(
                    selectedDate.get_year(),
                    selectedDate.get_month() - 1,
                    selectedDate.get_day_of_month(),
                    this.startDate.getHours(),
                    this.startDate.getMinutes(),
                    this.startDate.getSeconds()
                );

                // Use Core logic to adjust start date (preserves duration or moves both dates)
                const adjusted = TimeUtils.adjustStartDateTime(
                    this.startDate,
                    this.endDate,
                    Math.floor((newDate.getTime() - this.startDate.getTime()) / (1000 * 60)),
                    'minutes'
                );
                this.startDate = adjusted.startDate;
                this.endDate = adjusted.endDate;
                this._onDateTimeChanged();
                this.startDateLabel.set_label(this.startDate.toLocaleDateString('de-DE'));
            });
        });

        // Add scroll controller for start date button (use Core for logic)
        const startDateScrollController = new Gtk.EventControllerScroll({
            flags: Gtk.EventControllerScrollFlags.VERTICAL,
        });
        startDateScrollController.connect('scroll', (controller, dx, dy) => {
            const daysDelta = dy > 0 ? -1 : 1; // Scroll down = decrease, up = increase
            const adjusted = TimeUtils.adjustStartDateTime(this.startDate, this.endDate, daysDelta, 'days');
            this.startDate = adjusted.startDate;
            this.endDate = adjusted.endDate;
            this._onDateTimeChanged();
            return true;
        });
        this.startDateButton.add_controller(startDateScrollController);

        startButtonsBox.append(this.startTimeButton);
        startButtonsBox.append(this.startDateButton);

        startColumn.append(startLabel);
        startColumn.append(startButtonsBox);

        // End column
        const endColumn = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
        });

        const endLabel = new Gtk.Label({
            label: _('End'),
            halign: Gtk.Align.START,
            margin_start: 10,
            margin_bottom: 4,
        });

        // Container for time/date buttons (horizontal)
        const endButtonsBox = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
        });

        // Time button with icon inside
        const endTimeButtonBox = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 6,
        });

        const endTimeIcon = new Gtk.Image({
            icon_name: 'preferences-system-time-symbolic',
            pixel_size: 12,
        });

        const endTimeLabel = new Gtk.Label({
            label: this.endDate.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }),
        });

        endTimeButtonBox.append(endTimeIcon);
        endTimeButtonBox.append(endTimeLabel);

        this.endTimeButton = new Gtk.Button({
            child: endTimeButtonBox,
            css_classes: ['flat'],
        });

        this.endTimeLabel = endTimeLabel; // Сохраняем ссылку для обновления

        this.endTimeButton.connect('clicked', () => {
            this._showTimePicker(this.endDate, (hours, minutes) => {
                // Create new end date with proposed time
                const proposedEndDate = new Date(this.endDate);
                proposedEndDate.setHours(hours);
                proposedEndDate.setMinutes(minutes);
                proposedEndDate.setSeconds(0);

                // Check if this would create negative duration
                if (proposedEndDate.getTime() >= this.startDate.getTime()) {
                    // Valid: duration is not negative
                    this.endDate = proposedEndDate;
                    this._onDateTimeChanged();
                    this._updateDateTimeButtonLabels();
                }
                // If negative duration: do nothing (ignore the change)
            }, 'end');
        });

        // Add scroll controller for end time button (use Core for logic)
        const endTimeScrollController = new Gtk.EventControllerScroll({
            flags: Gtk.EventControllerScrollFlags.VERTICAL,
        });
        endTimeScrollController.connect('scroll', (controller, dx, dy) => {
            const minutesDelta = dy > 0 ? -1 : 1; // Scroll down = decrease, up = increase
            const newEndDate = TimeUtils.adjustEndDateTime(this.startDate, this.endDate, minutesDelta, 'minutes');
            if (newEndDate !== null) {
                this.endDate = newEndDate;
                this._onDateTimeChanged();
            }
            return true;
        });
        this.endTimeButton.add_controller(endTimeScrollController);

        // Date button with icon inside
        const endDateButtonBox = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 6,
        });

        const endDateIcon = new Gtk.Image({
            icon_name: 'x-office-calendar-symbolic',
            pixel_size: 12,
        });

        const endDateLabel = new Gtk.Label({
            label: this.endDate.toLocaleDateString('de-DE'),
        });

        endDateButtonBox.append(endDateIcon);
        endDateButtonBox.append(endDateLabel);

        this.endDateButton = new Gtk.Button({
            child: endDateButtonBox,
            css_classes: ['flat'],
        });

        this.endDateLabel = endDateLabel; // Сохраняем ссылку для обновления

        this.endDateButton.connect('clicked', () => {
            this._showDatePicker(this.endDate, (selectedDate) => {
                // Preserve current time when changing date
                const newDate = new Date(
                    selectedDate.get_year(),
                    selectedDate.get_month() - 1,
                    selectedDate.get_day_of_month(),
                    this.endDate.getHours(),
                    this.endDate.getMinutes(),
                    this.endDate.getSeconds()
                );

                // Use Core logic to adjust end date (prevents negative duration)
                const minutesDelta = Math.floor((newDate.getTime() - this.endDate.getTime()) / (1000 * 60));
                const adjustedEndDate = TimeUtils.adjustEndDateTime(this.startDate, this.endDate, minutesDelta, 'minutes');

                if (adjustedEndDate !== null) {
                    this.endDate = adjustedEndDate;
                    this._onDateTimeChanged();
                    this.endDateLabel.set_label(this.endDate.toLocaleDateString('de-DE'));
                }
            });
        });

        // Add scroll controller for end date button (use Core for logic)
        const endDateScrollController = new Gtk.EventControllerScroll({
            flags: Gtk.EventControllerScrollFlags.VERTICAL,
        });
        endDateScrollController.connect('scroll', (controller, dx, dy) => {
            const daysDelta = dy > 0 ? -1 : 1; // Scroll down = decrease, up = increase
            const newEndDate = TimeUtils.adjustEndDateTime(this.startDate, this.endDate, daysDelta, 'days');
            if (newEndDate !== null) {
                this.endDate = newEndDate;
                this._onDateTimeChanged();
            }
            return true;
        });
        this.endDateButton.add_controller(endDateScrollController);

        endButtonsBox.append(this.endTimeButton);
        endButtonsBox.append(this.endDateButton);

        endColumn.append(endLabel);
        endColumn.append(endButtonsBox);

        dateTimeContainer.append(startColumn);
        dateTimeContainer.append(endColumn);

        form.append(subtitleLabel);
        form.append(this.durationLabel);
        form.append(inlineRow);
        form.append(dateTimeContainer);

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

    /**
     * Handle date/time changes - use Core for validation
     */
    _onDateTimeChanged() {
        // Use Core TimeUtils to validate dates (prevents negative duration)
        const validated = TimeUtils.validateTaskDates(
            this.startDate,
            this.endDate
        );

        // Update dates with corrected values
        this.startDate = validated.startDate;
        this.endDate = validated.endDate;

        // Update UI labels
        this._updateDateTimeButtonLabels();

        // Update duration display (use Core TimeUtils for formatting)
        this.durationLabel.set_label(TimeUtils.formatDuration(validated.duration));
    }

    /**
     * Update all date/time button labels
     */
    _updateDateTimeButtonLabels() {
        if (this.startTimeLabel) {
            this.startTimeLabel.set_label(
                this.startDate.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
            );
        }
        if (this.startDateLabel) {
            this.startDateLabel.set_label(this.startDate.toLocaleDateString('de-DE'));
        }
        if (this.endTimeLabel) {
            this.endTimeLabel.set_label(
                this.endDate.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
            );
        }
        if (this.endDateLabel) {
            this.endDateLabel.set_label(this.endDate.toLocaleDateString('de-DE'));
        }
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

        // Add scroll controller to calendar for day navigation
        const calendarScrollController = new Gtk.EventControllerScroll({
            flags: Gtk.EventControllerScrollFlags.VERTICAL,
        });
        calendarScrollController.connect('scroll', (controller, dx, dy) => {
            const currentGtkDate = calendar.get_date();
            const currentDay = currentGtkDate.get_day_of_month();
            const currentMonth = currentGtkDate.get_month(); // 1-12
            const currentYear = currentGtkDate.get_year();

            // Convert to JS Date (preserve current time!)
            const jsDate = new Date(currentYear, currentMonth - 1, currentDay,
                currentDate.getHours(), currentDate.getMinutes(), currentDate.getSeconds());

            // Adjust by 1 day
            const daysDelta = dy > 0 ? -1 : 1;
            const newDate = TimeUtils.adjustDateByDays(jsDate, daysDelta);

            // Set new date to calendar (month is 0-11 for setting)
            calendar.select_day(GLib.DateTime.new_local(
                newDate.getFullYear(),
                newDate.getMonth() + 1,
                newDate.getDate(),
                newDate.getHours(), newDate.getMinutes(), newDate.getSeconds()
            ));

            return true;
        });
        calendar.add_controller(calendarScrollController);

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

    _showTimePicker(currentDate, onTimeSelected, type = 'start') {
        const timeDialog = new Adw.AlertDialog({
            heading: _('Choose time'),
            body: TimeUtils.formatDate(currentDate.toISOString()),
        });

        // Helper to update dialog body with current date
        const updateDialogDate = () => {
            const currentDateForType = type === 'start' ? this.startDate : this.endDate;
            timeDialog.body = TimeUtils.formatDate(currentDateForType.toISOString());
        };

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

        // Calculate time limits based on type
        let minHour = 0;
        let minMinute = 0;
        let maxHour = 23;
        let maxMinute = 59;

        // All logic now uses Core TimeUtils.adjustStartDateTime() and adjustEndDateTime()

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

        const hourLabel = new Gtk.Text({
            text: String(hours).padStart(2, '0'),
            css_classes: ['title-1'],
            max_width_chars: 2,
            width_chars: 2,
        });

        const hourMinusButton = new Gtk.Button({
            icon_name: 'list-remove-symbolic',
            css_classes: ['circular'],
        });

        hourPlusButton.connect('clicked', () => {
            // Use Core logic (60 minutes = 1 hour)
            const currentDate = new Date(type === 'start' ? this.startDate : this.endDate);
            currentDate.setHours(hours);
            currentDate.setMinutes(minutes);

            if (type === 'start') {
                const adjusted = TimeUtils.adjustStartDateTime(this.startDate, this.endDate, 60, 'minutes');
                const newDate = adjusted.startDate;
                hours = newDate.getHours();
                this.startDate = newDate;
                this.endDate = adjusted.endDate;
            } else {
                const newEndDate = TimeUtils.adjustEndDateTime(this.startDate, currentDate, 60, 'minutes');
                if (newEndDate !== null) {
                    hours = newEndDate.getHours();
                    this.endDate = newEndDate;
                }
            }

            hourLabel.set_text(String(hours).padStart(2, '0'));
            updateDialogDate();
        });

        hourMinusButton.connect('clicked', () => {
            // Use Core logic (60 minutes = 1 hour)
            const currentDate = new Date(type === 'start' ? this.startDate : this.endDate);
            currentDate.setHours(hours);
            currentDate.setMinutes(minutes);

            if (type === 'start') {
                const adjusted = TimeUtils.adjustStartDateTime(this.startDate, this.endDate, -60, 'minutes');
                const newDate = adjusted.startDate;
                hours = newDate.getHours();
                this.startDate = newDate;
                this.endDate = adjusted.endDate;
            } else {
                const newEndDate = TimeUtils.adjustEndDateTime(this.startDate, currentDate, -60, 'minutes');
                if (newEndDate !== null) {
                    hours = newEndDate.getHours();
                    this.endDate = newEndDate;
                }
            }

            hourLabel.set_text(String(hours).padStart(2, '0'));
            updateDialogDate();
        });

        // Add scroll controller for hour label
        const hourScrollController = new Gtk.EventControllerScroll({
            flags: Gtk.EventControllerScrollFlags.VERTICAL,
        });
        hourScrollController.connect('scroll', (controller, dx, dy) => {
            const currentDate = new Date(type === 'start' ? this.startDate : this.endDate);
            currentDate.setHours(hours);
            currentDate.setMinutes(minutes);

            const delta = dy > 0 ? -60 : 60; // Scroll down = -1 hour, up = +1 hour

            if (type === 'start') {
                const adjusted = TimeUtils.adjustStartDateTime(this.startDate, this.endDate, delta, 'minutes');
                hours = adjusted.startDate.getHours();
                this.startDate = adjusted.startDate;
                this.endDate = adjusted.endDate;
            } else {
                const newEndDate = TimeUtils.adjustEndDateTime(this.startDate, currentDate, delta, 'minutes');
                if (newEndDate !== null) {
                    hours = newEndDate.getHours();
                    this.endDate = newEndDate;
                }
            }

            hourLabel.set_text(String(hours).padStart(2, '0'));
            updateDialogDate();
            return true;
        });
        hourBox.add_controller(hourScrollController);

        // Update hours variable when user edits manually
        hourLabel.connect('changed', () => {
            const value = parseInt(hourLabel.get_text());
            if (!isNaN(value) && value >= 0 && value < 24) {
                hours = value;
            }
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

        const minuteLabel = new Gtk.Text({
            text: String(minutes).padStart(2, '0'),
            css_classes: ['title-1'],
            max_width_chars: 2,
            width_chars: 2,
        });

        const minuteMinusButton = new Gtk.Button({
            icon_name: 'list-remove-symbolic',
            css_classes: ['circular'],
        });

        minutePlusButton.connect('clicked', () => {
            // Use Core logic to adjust time (handles day overflow)
            const currentDate = new Date(type === 'start' ? this.startDate : this.endDate);
            currentDate.setHours(hours);
            currentDate.setMinutes(minutes);

            if (type === 'start') {
                const adjusted = TimeUtils.adjustStartDateTime(this.startDate, this.endDate, 1, 'minutes');
                const newDate = adjusted.startDate;
                hours = newDate.getHours();
                minutes = newDate.getMinutes();
                this.startDate = newDate;
                this.endDate = adjusted.endDate;
            } else {
                const newEndDate = TimeUtils.adjustEndDateTime(this.startDate, currentDate, 1, 'minutes');
                if (newEndDate !== null) {
                    hours = newEndDate.getHours();
                    minutes = newEndDate.getMinutes();
                    this.endDate = newEndDate;
                }
            }

            hourLabel.set_text(String(hours).padStart(2, '0'));
            minuteLabel.set_text(String(minutes).padStart(2, '0'));
            updateDialogDate();
        });

        minuteMinusButton.connect('clicked', () => {
            // Use Core logic to adjust time (handles day overflow)
            const currentDate = new Date(type === 'start' ? this.startDate : this.endDate);
            currentDate.setHours(hours);
            currentDate.setMinutes(minutes);

            if (type === 'start') {
                const adjusted = TimeUtils.adjustStartDateTime(this.startDate, this.endDate, -1, 'minutes');
                const newDate = adjusted.startDate;
                hours = newDate.getHours();
                minutes = newDate.getMinutes();
                this.startDate = newDate;
                this.endDate = adjusted.endDate;
            } else {
                const newEndDate = TimeUtils.adjustEndDateTime(this.startDate, currentDate, -1, 'minutes');
                if (newEndDate !== null) {
                    hours = newEndDate.getHours();
                    minutes = newEndDate.getMinutes();
                    this.endDate = newEndDate;
                }
            }

            hourLabel.set_text(String(hours).padStart(2, '0'));
            minuteLabel.set_text(String(minutes).padStart(2, '0'));
            updateDialogDate();
        });

        // Add scroll controller for minute label
        const minuteScrollController = new Gtk.EventControllerScroll({
            flags: Gtk.EventControllerScrollFlags.VERTICAL,
        });
        minuteScrollController.connect('scroll', (controller, dx, dy) => {
            const currentDate = new Date(type === 'start' ? this.startDate : this.endDate);
            currentDate.setHours(hours);
            currentDate.setMinutes(minutes);

            const delta = dy > 0 ? -1 : 1; // Scroll down = -1 minute, up = +1 minute

            if (type === 'start') {
                const adjusted = TimeUtils.adjustStartDateTime(this.startDate, this.endDate, delta, 'minutes');
                hours = adjusted.startDate.getHours();
                minutes = adjusted.startDate.getMinutes();
                this.startDate = adjusted.startDate;
                this.endDate = adjusted.endDate;
            } else {
                const newEndDate = TimeUtils.adjustEndDateTime(this.startDate, currentDate, delta, 'minutes');
                if (newEndDate !== null) {
                    hours = newEndDate.getHours();
                    minutes = newEndDate.getMinutes();
                    this.endDate = newEndDate;
                }
            }

            hourLabel.set_text(String(hours).padStart(2, '0'));
            minuteLabel.set_text(String(minutes).padStart(2, '0'));
            updateDialogDate();
            return true;
        });
        minuteBox.add_controller(minuteScrollController);

        // Update minutes variable when user edits manually
        minuteLabel.connect('changed', () => {
            const value = parseInt(minuteLabel.get_text());
            if (!isNaN(value) && value >= 0 && value < 60) {
                minutes = value;
            }
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
                // Get final values from text fields
                const finalHours = parseInt(hourLabel.get_text()) || 0;
                const finalMinutes = parseInt(minuteLabel.get_text()) || 0;

                // Validate and clamp values
                const validHours = Math.max(0, Math.min(23, finalHours));
                const validMinutes = Math.max(0, Math.min(59, finalMinutes));

                onTimeSelected(validHours, validMinutes);
            }
            dialog.close();
        });

        // Get the actual GTK window from parent page
        const window = this.parent.parentWindow || this.parent;
        timeDialog.present(window);
    }

    async _saveChanges() {
        try {

            const newName = this.nameEntry.get_text().trim();
            if (!newName) {
                console.error('Task name cannot be empty');
                return;
            }

            // Use Core method that automatically handles tracking synchronization
            // Core will check if this instance is tracked and apply changes globally if needed
            const updateData = {
                project_id: this.selectedProjectId,
                client_id: this.selectedClientId,
                last_used_at: TimeUtils.formatTimestampForDB(this.endDate),
            };

            // Update task name if changed
            if (newName !== this.taskInstance.task_name) {
                const task = await this.coreBridge.findOrCreateTask(newName);
                updateData.task_id = task.id;
            }

            // Core handles all logic: checks if tracked, updates TaskInstance + state + emits events
            await this.coreBridge.updateTaskInstanceWithTrackingSync(
                this.taskInstance.id,
                updateData,
                newName !== this.taskInstance.task_name ? newName : null
            );

            // Update time entry timestamps if we have one (use Core TimeUtils)
            if (this.latestEntry) {
                const trackingState = this.coreBridge.getTrackingState();
                const isActiveEntry = trackingState.isTracking && 
                                     trackingState.currentTimeEntryId === this.latestEntry.id;
                
                if (isActiveEntry) {
                    // Active entry: only update start_time, NEVER set end_time (keeps it active)
                    // elapsedSeconds will be recalculated automatically in updateTimeEntry()
                    await this.coreBridge.updateTimeEntry(this.latestEntry.id, {
                        start_time: TimeUtils.formatTimestampForDB(this.startDate),
                        // Do NOT set end_time or duration - entry stays active
                    });
                    // Don't update total_time - active entry is excluded from it
                } else {
                    // Completed entry: update all fields including end_time
                    const duration = TimeUtils.calculateDuration(
                        this.startDate,
                        this.endDate
                    );
                    
                    await this.coreBridge.updateTimeEntry(this.latestEntry.id, {
                        start_time: TimeUtils.formatTimestampForDB(this.startDate),
                        end_time: TimeUtils.formatTimestampForDB(this.endDate),
                        duration: duration,
                    });
                    
                    // Update TaskInstance total_time (will exclude active entries)
                    await this.coreBridge.updateTaskInstanceTotalTime(this.taskInstance.id);
                }
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

    /**
     * Cleanup: destroy dialog and cleanup dropdowns
     */
    cleanup() {
        if (this.projectDropdown && typeof this.projectDropdown.destroy === 'function') {
            this.projectDropdown.destroy();
            this.projectDropdown = null;
        }
        if (this.clientDropdown && typeof this.clientDropdown.destroy === 'function') {
            this.clientDropdown.destroy();
            this.clientDropdown = null;
        }
        if (this.dialog) {
            this.dialog.close();
            this.dialog = null;
        }
    }
}
