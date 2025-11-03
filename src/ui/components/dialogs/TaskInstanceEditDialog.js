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

// Single reusable dialog instance
let REUSABLE_DIALOG = null;

export class TaskInstanceEditDialog {
    constructor(taskInstance, parent, coreBridge) {
        // Store references
        this.parent = parent;
        this.coreBridge = coreBridge;

        // Signal handler IDs for cleanup
        this._handlerIds = [];

        // Track if dialog is initialized
        this._isInitialized = false;

        // Initialize default dates (will be updated in setTaskInstance)
        this.startDate = new Date();
        this.endDate = new Date();
        this.selectedProjectId = 1;
        this.selectedClientId = 1;

        // Create UI template (one time, reused)
        this._createDialog();

        // Fill with data if provided
        if (taskInstance) {
            this._initPromise = this.setTaskInstance(taskInstance);
        } else {
            this._initPromise = Promise.resolve();
        }
    }

    /**
     * Static factory: reuse single dialog instance, just refill with new data
     * Keeps only 1 dialog in RAM, always reusable
     */
    static async show(taskInstance, parent, coreBridge) {
        // Reuse existing dialog if available
        if (REUSABLE_DIALOG && REUSABLE_DIALOG._isInitialized) {
            // Just refill with new data and show
            await REUSABLE_DIALOG._updateData(taskInstance, parent, coreBridge);
            REUSABLE_DIALOG._isInUse = true;
            await REUSABLE_DIALOG.present(parent.parentWindow || parent);
            return REUSABLE_DIALOG;
        }

        // Create new dialog (only once, then always reuse)
        REUSABLE_DIALOG = new TaskInstanceEditDialog(taskInstance, parent, coreBridge);
        await REUSABLE_DIALOG._initPromise;
        REUSABLE_DIALOG._isInUse = true;
        await REUSABLE_DIALOG.present(parent.parentWindow || parent);
        return REUSABLE_DIALOG;
    }

    /**
     * Static method to close all open instances
     * Note: AdwAlertDialog closes automatically after response, so we just mark as not in use
     */
    static closeAll() {
        if (!REUSABLE_DIALOG || !REUSABLE_DIALOG.dialog) return;
        
        // Check if dialog is destroyed
        if (REUSABLE_DIALOG.dialog.is_destroyed?.()) {
            REUSABLE_DIALOG._isInUse = false;
            return;
        }
        
        // Mark as not in use - AdwAlertDialog will close automatically
        // Don't call close() manually as it causes "Trying to close AdwAlertDialog that's not presented" error
        // The dialog closes automatically after any response (save/cancel)
        REUSABLE_DIALOG._isInUse = false;
    }

    /**
     * Set task instance data (Core logic - fills UI with data)
     * This is the data filling method, separate from UI creation
     */
    async setTaskInstance(taskInstance) {
        // Cleanup old handlers before updating
        this._cleanupHandlers();

        // Store task instance
        this.taskInstance = taskInstance;

        // Update selected values
        this.selectedProjectId = taskInstance.project_id || 1;
        this.selectedClientId = taskInstance.client_id || 1;

        // Get time entries for this instance
        const timeEntries = await this.coreBridge.getTimeEntriesByInstance(taskInstance.id);

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

        // Fill UI with data
        this._fillUI();

        this._isInitialized = true;
    }

    /**
     * Update dialog data for reuse (Core logic)
     * Reuses all UI elements, only updates data
     */
    async _updateData(taskInstance, parent, coreBridge) {
        // Update references
        this.parent = parent;
        this.coreBridge = coreBridge;

        // Fill with new data (uses setTaskInstance which handles cleanup)
        await this.setTaskInstance(taskInstance);

        // Recreate dialog only if it was destroyed by GTK
        // All UI widgets are preserved and reused
        if (!this.dialog || this.dialog.is_destroyed?.()) {
            this._createDialog();
        } else {
            // Dialog still exists - just update data
            this._fillUI();
        }
    }

    /**
     * Fill UI widgets with current data (called after setTaskInstance)
     */
    _fillUI() {
        if (!this.dialog || !this.taskInstance) return;

        // Update dialog heading
        this.dialog.heading = _('Edit Task ');

        // Update duration label
        if (this.durationLabel) {
            this.durationLabel.set_label(TimeUtils.formatDuration(this.taskInstance.total_time || 0));
        }

        // Update task name entry
        if (this.nameEntry) {
            this.nameEntry.set_text(this.taskInstance.task_name || '');
        }

        // Update dropdowns (reuse existing, only update selection)
        this._updateDropdowns();

        // Update date/time labels
        this._updateDateTimeButtonLabels();
    }

    /**
     * Update dropdowns with current selection (reuse existing, don't recreate)
     */
    _updateDropdowns() {
        // Find inlineRow in dialog
        const form = this.dialog?.get_extra_child();
        if (!form) return;
        
        const inlineRow = form.get_first_child()?.get_next_sibling()?.get_next_sibling();
        if (!inlineRow) return;

        // Always reuse dropdowns - never recreate
        if (this.projectDropdown) {
            // Update selection without recreating (widget stays the same)
            this.projectDropdown.setCurrentProject(this.selectedProjectId);
        } else {
            // Create dropdown only once (first time ever)
            this.projectDropdown = new ProjectDropdown(
                this.coreBridge,
                this.selectedProjectId,
                (selectedProject) => {
                    this.selectedProjectId = selectedProject.id;
                }
            );
            // Add to row only if not already there
            const widget = this.projectDropdown.getWidget();
            if (widget && !widget.get_parent()) {
                inlineRow.append(widget);
            }
        }

        // Always reuse client dropdown - never recreate
        if (this.clientDropdown) {
            // Update selection without recreating (widget stays the same)
            this.clientDropdown.setSelectedClient(this.selectedClientId);
        } else {
            // Create dropdown only once (first time ever)
            this.clientDropdown = new ClientDropdown(
                this.coreBridge,
                this.selectedClientId,
                (selectedClient) => {
                    this.selectedClientId = selectedClient.id;
                }
            );
            // Add to row only if not already there
            const widget = this.clientDropdown.getWidget();
            if (widget && !widget.get_parent()) {
                inlineRow.append(widget);
            }
        }
    }

    /**
     * Cleanup handlers (called before updating data)
     * Disconnects all stored signal handler IDs
     */
    _cleanupHandlers() {
        // Disconnect all signal handlers
        this._handlerIds.forEach(handlerId => {
            try {
                if (this.dialog && typeof this.dialog.disconnect === 'function') {
                    this.dialog.disconnect(handlerId);
                }
            } catch (e) {
                // Handler may already be disconnected or dialog destroyed
            }
        });
        this._handlerIds = [];
    }


    _createDialog() {
        // Create new dialog (GTK destroys it on close, so we recreate)
        this.dialog = new Adw.AlertDialog({
            heading: _('Edit Task '),
        });

        // Reuse existing widgets if available (not destroyed)
        // Only create new widgets if they don't exist or were destroyed
        let form = this._form;
        if (!form || form.is_destroyed?.()) {
            form = new Gtk.Box({
                orientation: Gtk.Orientation.VERTICAL,
                width_request: 350,
            });
            this._form = form;
        }

        // Subtitle with task name (static label, create once)
        if (!this._subtitleLabel || this._subtitleLabel.is_destroyed?.()) {
            this._subtitleLabel = new Gtk.Label({
                label: _('Duration'),
                css_classes: ['subtitle'],
                halign: Gtk.Align.CENTER,
            });
        }

        // Duration counter (reuse if exists)
        if (!this.durationLabel || this.durationLabel.is_destroyed?.()) {
            this.durationLabel = new Gtk.Label({
                label: TimeUtils.formatDuration(0),
                halign: Gtk.Align.CENTER,
                css_classes: ['duration_counter'],
            });
        }

        // Inline row: name + project + client (reuse if exists)
        let inlineRow = this._inlineRow;
        if (!inlineRow || inlineRow.is_destroyed?.()) {
            inlineRow = new Gtk.Box({
                orientation: Gtk.Orientation.HORIZONTAL,
                spacing: 10,
                margin_bottom: 15,
            });
            this._inlineRow = inlineRow;
        }

        // Task name entry (reuse if exists)
        if (!this.nameEntry || this.nameEntry.is_destroyed?.()) {
            this.nameEntry = new Gtk.Entry({
                text: '',
                placeholder_text: _('Task name....'),
                hexpand: true,
            });
            // Add to row only if not already there
            if (!this.nameEntry.get_parent()) {
                inlineRow.append(this.nameEntry);
            }
        }

        // Build date/time structure (reuse if exists)
        let dateTimeContainer = this._dateTimeContainer;
        if (!dateTimeContainer || dateTimeContainer.is_destroyed?.()) {
            dateTimeContainer = this._buildDateTimeContainer();
            this._dateTimeContainer = dateTimeContainer;
        }

        // Build form structure only if form is empty (first time)
        if (!form.get_first_child()) {
            form.append(this._subtitleLabel);
            form.append(this.durationLabel);
            form.append(inlineRow);
            form.append(dateTimeContainer);
        }

        this.dialog.set_extra_child(form);
        this.dialog.add_response('cancel', _('Cancel'));
        this.dialog.add_response('save', _('Save Changes'));
        this.dialog.set_response_appearance('save', Adw.ResponseAppearance.SUGGESTED);

        // Store handler ID for cleanup (only if not already connected)
        if (this._handlerIds.length === 0) {
            this._handlerIds.push(
                this.dialog.connect('response', async (dialog, response) => {
                    if (response === 'save') {
                        await this._saveChanges();
                    }
                    // Mark as not in use (dialog will be destroyed by GTK automatically)
                    this._isInUse = false;
                    // Note: dialog is destroyed by GTK, but UI widgets may be preserved
                    // Check if widgets still exist on next open
                    // Clear only data references, keep UI widgets for reuse
                    this._clearReferences();
                })
            );
        }
    }

    /**
     * Build date/time container with buttons (reuse buttons if available)
     */
    _buildDateTimeContainer() {
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

        // Reuse or create start time button
        if (!this.startTimeButton || this.startTimeButton.is_destroyed?.()) {
            const startTimeButtonBox = new Gtk.Box({
                orientation: Gtk.Orientation.HORIZONTAL,
                spacing: 6,
            });

            const startTimeIcon = new Gtk.Image({
                icon_name: 'preferences-system-time-symbolic',
                pixel_size: 12,
            });

            this.startTimeLabel = new Gtk.Label({
                label: this.startDate.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }),
            });

            startTimeButtonBox.append(startTimeIcon);
            startTimeButtonBox.append(this.startTimeLabel);

            this.startTimeButton = new Gtk.Button({
                child: startTimeButtonBox,
                css_classes: ['flat'],
            });

            this.startTimeButton.connect('clicked', () => {
                this._showTimePicker(this.startDate, (hours, minutes) => {
                    const currentDuration = this.endDate.getTime() - this.startDate.getTime();
                    this.startDate.setHours(hours);
                    this.startDate.setMinutes(minutes);
                    this.startDate.setSeconds(0);
                    this.endDate = new Date(this.startDate.getTime() + currentDuration);
                    this._onDateTimeChanged();
                    this._updateDateTimeButtonLabels();
                }, 'start');
            });

            // Add scroll controller for start time button
            const startTimeScrollController = new Gtk.EventControllerScroll({
                flags: Gtk.EventControllerScrollFlags.VERTICAL,
            });
            startTimeScrollController.connect('scroll', (controller, dx, dy) => {
                const minutesDelta = dy > 0 ? -1 : 1;
                const adjusted = TimeUtils.adjustStartDateTime(this.startDate, this.endDate, minutesDelta, 'minutes');
                this.startDate = adjusted.startDate;
                this.endDate = adjusted.endDate;
                this._onDateTimeChanged();
                return true;
            });
            this.startTimeButton.add_controller(startTimeScrollController);
        } else {
            // Button exists - just update label
            if (this.startTimeLabel) {
                this.startTimeLabel.set_label(this.startDate.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }));
            }
        }

        // Reuse or create start date button
        if (!this.startDateButton || this.startDateButton.is_destroyed?.()) {
            const startDateButtonBox = new Gtk.Box({
                orientation: Gtk.Orientation.HORIZONTAL,
                spacing: 6,
            });

            const startDateIcon = new Gtk.Image({
                icon_name: 'x-office-calendar-symbolic',
                pixel_size: 12,
            });

            this.startDateLabel = new Gtk.Label({
                label: this.startDate.toLocaleDateString('de-DE'),
            });

            startDateButtonBox.append(startDateIcon);
            startDateButtonBox.append(this.startDateLabel);

            this.startDateButton = new Gtk.Button({
                child: startDateButtonBox,
                css_classes: ['flat'],
            });

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
        } else {
            // Button exists - just update label
            if (this.startDateLabel) {
                this.startDateLabel.set_label(this.startDate.toLocaleDateString('de-DE'));
            }
        }

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

        // Reuse or create end time button
        if (!this.endTimeButton || this.endTimeButton.is_destroyed?.()) {
            const endTimeButtonBox = new Gtk.Box({
                orientation: Gtk.Orientation.HORIZONTAL,
                spacing: 6,
            });

            const endTimeIcon = new Gtk.Image({
                icon_name: 'preferences-system-time-symbolic',
                pixel_size: 12,
            });

            this.endTimeLabel = new Gtk.Label({
                label: this.endDate.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }),
            });

            endTimeButtonBox.append(endTimeIcon);
            endTimeButtonBox.append(this.endTimeLabel);

            this.endTimeButton = new Gtk.Button({
                child: endTimeButtonBox,
                css_classes: ['flat'],
            });

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

            // Add scroll controller for end time button
            const endTimeScrollController = new Gtk.EventControllerScroll({
                flags: Gtk.EventControllerScrollFlags.VERTICAL,
            });
            endTimeScrollController.connect('scroll', (controller, dx, dy) => {
                const minutesDelta = dy > 0 ? -1 : 1;
                const newEndDate = TimeUtils.adjustEndDateTime(this.startDate, this.endDate, minutesDelta, 'minutes');
                if (newEndDate !== null) {
                    this.endDate = newEndDate;
                    this._onDateTimeChanged();
                }
                return true;
            });
            this.endTimeButton.add_controller(endTimeScrollController);
        } else {
            // Button exists - just update label
            if (this.endTimeLabel) {
                this.endTimeLabel.set_label(this.endDate.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }));
            }
        }

        // Reuse or create end date button
        if (!this.endDateButton || this.endDateButton.is_destroyed?.()) {
            const endDateButtonBox = new Gtk.Box({
                orientation: Gtk.Orientation.HORIZONTAL,
                spacing: 6,
            });

            const endDateIcon = new Gtk.Image({
                icon_name: 'x-office-calendar-symbolic',
                pixel_size: 12,
            });

            this.endDateLabel = new Gtk.Label({
                label: this.endDate.toLocaleDateString('de-DE'),
            });

            endDateButtonBox.append(endDateIcon);
            endDateButtonBox.append(this.endDateLabel);

            this.endDateButton = new Gtk.Button({
                child: endDateButtonBox,
                css_classes: ['flat'],
            });

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

            // Add scroll controller for end date button
            const endDateScrollController = new Gtk.EventControllerScroll({
                flags: Gtk.EventControllerScrollFlags.VERTICAL,
            });
            endDateScrollController.connect('scroll', (controller, dx, dy) => {
                const daysDelta = dy > 0 ? -1 : 1;
                const newEndDate = TimeUtils.adjustEndDateTime(this.startDate, this.endDate, daysDelta, 'days');
                if (newEndDate !== null) {
                    this.endDate = newEndDate;
                    this._onDateTimeChanged();
                }
                return true;
            });
            this.endDateButton.add_controller(endDateScrollController);
        } else {
            // Button exists - just update label
            if (this.endDateLabel) {
                this.endDateLabel.set_label(this.endDate.toLocaleDateString('de-DE'));
            }
        }

        // Add buttons to box (only if not already there)
        if (!this.endTimeButton.get_parent()) {
            endButtonsBox.append(this.endTimeButton);
        }
        if (!this.endDateButton.get_parent()) {
            endButtonsBox.append(this.endDateButton);
        }

        endColumn.append(endLabel);
        endColumn.append(endButtonsBox);

        dateTimeContainer.append(startColumn);
        dateTimeContainer.append(endColumn);

        return dateTimeContainer;
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
            // Note: AdwAlertDialog closes automatically after response, no need to call close()
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
            // Note: AdwAlertDialog closes automatically after response, no need to call close()
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
     * Clear references (for reuse)
     * Keep UI widgets and dropdowns - they will be reused
     * Only clear data references
     */
    _clearReferences() {
        // DON'T destroy dropdowns - they will be reused
        // Just update their selection will be done in _updateDropdowns()
        
        // Clear only data references (not UI widgets - they are reused)
        this.taskInstance = null;
        this.latestEntry = null;
        this.startDate = null;
        this.endDate = null;
        this.originalDuration = null;
        // Keep: parent, coreBridge, nameEntry, durationLabel, buttons, dropdowns (for reuse)
    }

    /**
     * Full cleanup: destroy dropdowns and clear all references
     * Used when removing from pool or final cleanup
     */
    cleanup() {
        // Cleanup dropdowns
        if (this.projectDropdown) {
            try {
                if (typeof this.projectDropdown.destroy === 'function') {
                    this.projectDropdown.destroy();
                }
            } catch (e) {
                // Already destroyed
            }
            this.projectDropdown = null;
        }
        
        if (this.clientDropdown) {
            try {
                if (typeof this.clientDropdown.destroy === 'function') {
                    this.clientDropdown.destroy();
                }
            } catch (e) {
                // Already destroyed
            }
            this.clientDropdown = null;
        }
        
        // Clear all references
        this.taskInstance = null;
        this.parent = null;
        this.coreBridge = null;
        this.latestEntry = null;
        this.nameEntry = null;
        this.durationLabel = null;
        this.startTimeButton = null;
        this.startTimeLabel = null;
        this.startDateButton = null;
        this.startDateLabel = null;
        this.endTimeButton = null;
        this.endTimeLabel = null;
        this.endDateButton = null;
        this.endDateLabel = null;
        this.startDate = null;
        this.endDate = null;
        this.originalDuration = null;
        
        // Reset state
        this._isInUse = false;
        this._isInitialized = false;
        
        // Note: this.dialog (Adw.AlertDialog) will be destroyed by GTK automatically
        // after close(), so we don't need to explicitly destroy it in normal cleanup
        this.dialog = null;
    }
}
