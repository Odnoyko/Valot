import Gtk from 'gi://Gtk';
import Gdk from 'gi://Gdk';
import Adw from 'gi://Adw';
import { WidgetFactory } from 'resource:///com/odnoyko/valot/ui/utils/widgetFactory.js';

/**
 * Template component for task stacks (grouped tasks)
 * Adapted to Core architecture - UI UNCHANGED
 */
export class TaskStackTemplate {
    constructor(group, parentWindow) {
        this.group = group;
        this.parentWindow = parentWindow;
        this.coreBridge = parentWindow.coreBridge;
        this.widget = this._createStackWidget();
    }

    _escapeMarkup(text) {
        if (!text) return '';
        return String(text)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;');
    }

    _formatDuration(seconds) {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;
        return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }

    _formatDate(dateStr) {
        if (!dateStr) return '';
        const date = new Date(dateStr);
        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const year = date.getFullYear();
        return `${day}.${month}.${year}`;
    }

    _createStackWidget() {
        // Check if any task in this stack is currently being tracked
        // Must match unique combination of task + project + client
        const trackingState = this.coreBridge ? this.coreBridge.getTrackingState() : { isTracking: false };
        const isCurrentlyTracking = trackingState.isTracking &&
            this.group.tasks.some(t =>
                t.task_id === trackingState.currentTaskId &&
                t.project_id === trackingState.currentProjectId &&
                t.client_id === trackingState.currentClientId
            );

        // Get project color from latest task
        const groupProjectName = this.group.latestTask.project_name || 'No Project';
        const groupClientName = this.group.latestTask.client_name || 'No Client';
        const groupDotColor = this.group.latestTask.project_color || '#9a9996';

        // Create group subtitle with colored dot (SAME UI)
        const groupSubtitle = isCurrentlyTracking
            ? `<span foreground="${groupDotColor}">●</span> ${groupProjectName} • ${groupClientName} • <b>Currently Tracking</b>`
            : `<span foreground="${groupDotColor}">●</span> ${groupProjectName} • ${groupClientName}`;

        // Create main expander row (SAME UI)
        const groupRow = new Adw.ExpanderRow({
            title: `${this._escapeMarkup(this.group.baseName)} (${this.group.tasks.length} entries)`,
            subtitle: groupSubtitle,
            use_markup: true
        });

        // Apply tracking state styling (SAME UI)
        if (isCurrentlyTracking) {
            groupRow.add_css_class('tracking-active');
        }

        // Add group suffix box with time and track button
        const groupSuffixBox = this._createGroupSuffixBox();
        groupRow.add_suffix(groupSuffixBox);

        // Add individual tasks as rows within the expander
        this._addTaskRows(groupRow);

        return groupRow;
    }

    _createGroupSuffixBox() {
        let timeText = '';
        let moneyText = '';

        // Store references for real-time updates
        this.timeLabel = null;
        this.moneyLabel = null;

        // Check tracking state from Core
        // Must match unique combination of task + project + client
        const trackingState = this.coreBridge ? this.coreBridge.getTrackingState() : { isTracking: false };
        const isCurrentlyTracking = trackingState.isTracking &&
            this.group.tasks.some(t =>
                t.task_id === trackingState.currentTaskId &&
                t.project_id === trackingState.currentProjectId &&
                t.client_id === trackingState.currentClientId
            );

        // Prepare time text (show total time even when tracking)
        if (this.group.totalDuration > 0) {
            timeText = (isCurrentlyTracking ? '● ' : '') + this._formatDuration(this.group.totalDuration);
        }

        // Prepare money text (WidgetFactory shows money BEFORE time automatically)
        if (this.group.totalCost > 0) {
            const currency = this.group.latestTask.client_currency || 'EUR';
            const currencySymbol = WidgetFactory.getCurrencySymbol(currency);
            moneyText = `${currencySymbol}${this.group.totalCost.toFixed(2)}`;
        }

        // Use accent color for time when tracking
        const timeCssClasses = isCurrentlyTracking ? ['caption'] : ['caption', 'dim-label'];

        // Create suffix box (SAME UI)
        const { suffixBox, timeLabel, moneyLabel, trackButton } = WidgetFactory.createTaskSuffixBox({
            timeText: timeText,
            moneyText: moneyText,
            css_classes: timeCssClasses,
            showEditButton: false,
            showTrackButton: true,
            showCostTracking: true, // Always show cost tracking
            onTrackClick: async () => {
                // Handle stack tracking - check if currently tracking any task in stack
                if (this.coreBridge && this.group.latestTask) {
                    try {
                        const trackingState = this.coreBridge.getTrackingState();
                        // Check unique combination of task + project + client
                        const isTrackingThisStack = trackingState.isTracking &&
                            this.group.tasks.some(t =>
                                t.task_id === trackingState.currentTaskId &&
                                t.project_id === trackingState.currentProjectId &&
                                t.client_id === trackingState.currentClientId
                            );

                        if (isTrackingThisStack) {
                            // Stop tracking if any task in this stack is being tracked
                            await this.coreBridge.stopTracking();

                            // Immediately update button icon
                            if (this.trackButton) {
                                this.trackButton.set_icon_name('media-playback-start-symbolic');
                                this.trackButton.set_tooltip_text(_('Start tracking'));
                            }
                        } else {
                            // Start tracking the latest task in stack
                            await this.coreBridge.startTracking(
                                this.group.latestTask.task_id,
                                this.group.latestTask.project_id,
                                this.group.latestTask.client_id
                            );

                            // Immediately update button icon
                            if (this.trackButton) {
                                this.trackButton.set_icon_name('media-playback-stop-symbolic');
                                this.trackButton.set_tooltip_text(_('Stop tracking'));
                            }
                        }
                    } catch (error) {
                        console.error('Error toggling tracking:', error);
                    }
                }
            }
        });

        // Store label and button references for real-time updates
        this.timeLabel = timeLabel;
        this.moneyLabel = moneyLabel;
        this.trackButton = trackButton;

        // Set track button icon based on tracking state
        if (trackButton) {
            if (isCurrentlyTracking) {
                trackButton.set_icon_name('media-playback-stop-symbolic');
                trackButton.set_tooltip_text(_('Stop tracking'));
            } else {
                trackButton.set_icon_name('media-playback-start-symbolic');
                trackButton.set_tooltip_text(_('Start tracking'));
            }
        }

        // Add accent color to money label when tracking
        if (isCurrentlyTracking && moneyLabel) {
            moneyLabel.remove_css_class('dim-label');
        }

        return suffixBox;
    }

    _addTaskRows(groupRow) {
        // Store child rows for later updates
        this.childRows = [];

        // Add individual task rows to the stack
        this.group.tasks.forEach(task => {
            // Check if THIS SPECIFIC task instance is currently being tracked
            // Must match task instance ID, not just task_id
            const trackingState = this.coreBridge ? this.coreBridge.getTrackingState() : { isTracking: false };
            const isCurrentlyTracking = trackingState.isTracking &&
                trackingState.currentTaskInstanceId === task.id;

            // Format date for subtitle
            const dateText = this._formatDate(task.last_used_at);

            const taskRow = new Adw.ActionRow({
                title: this._escapeMarkup(task.task_name),
                subtitle: isCurrentlyTracking
                    ? `<b>Currently Tracking</b> • ${dateText}`
                    : dateText,
                use_markup: true
            });

            // Apply tracking state styling
            if (isCurrentlyTracking) {
                taskRow.add_css_class('tracking-active');
            }

            // Apply selection styling if task is selected
            if (this.parentWindow.selectedTasks && this.parentWindow.selectedTasks.has(task.id)) {
                taskRow.add_css_class('selected-task');
            }

            // Create suffix box with time and edit button
            const taskSuffixBox = new Gtk.Box({
                orientation: Gtk.Orientation.HORIZONTAL,
                spacing: 12,
                halign: Gtk.Align.END
            });

            // Add time display (cost • duration) for individual tasks
            if (!isCurrentlyTracking && task.total_time > 0) {
                const cost = (task.total_time / 3600) * (task.client_rate || 0);
                const currency = task.client_currency || 'EUR';
                const currencySymbol = WidgetFactory.getCurrencySymbol(currency);

                let labelText = this._formatDuration(task.total_time);

                // If has cost, show: $0.01 • 00:00:01
                if (cost > 0) {
                    labelText = `${currencySymbol}${cost.toFixed(2)} • ${this._formatDuration(task.total_time)}`;
                }

                const taskTimeLabel = new Gtk.Label({
                    label: labelText,
                    css_classes: ['caption', 'dim-label'],
                    halign: Gtk.Align.END
                });

                taskSuffixBox.append(taskTimeLabel);
            } else if (isCurrentlyTracking) {
                // Show active indicator for currently tracking task within stack
                const activeLabel = new Gtk.Label({
                    label: `● Tracked`,
                    css_classes: ['caption'],
                    halign: Gtk.Align.END
                });
                taskSuffixBox.append(activeLabel);
            }

            taskRow.add_suffix(taskSuffixBox);

            // Add click gesture to edit task
            const gesture = new Gtk.GestureClick();
            gesture.connect('released', () => {
                if (this.parentWindow._editTaskInstance) {
                    this.parentWindow._editTaskInstance(task.id);
                }
            });
            taskRow.add_controller(gesture);

            // Add right-click selection for individual tasks in stack
            if (this.parentWindow._addTaskSelectionHandlers) {
                this.parentWindow._addTaskSelectionHandlers(taskRow, task);
            }

            // Register task row in taskRowMap for selection tracking
            if (this.parentWindow.taskRowMap) {
                this.parentWindow.taskRowMap.set(task.id, taskRow);
            }

            // Store reference to child row
            this.childRows.push(taskRow);

            groupRow.add_row(taskRow);
        });
    }

    getWidget() {
        return this.widget;
    }

    getTimeLabel() {
        return this.timeLabel;
    }

    getMoneyLabel() {
        return this.moneyLabel;
    }

    getTrackButton() {
        return this.trackButton;
    }

    /**
     * Update project color for this stack
     */
    updateProjectColor(newColor) {
        if (!this.widget || !newColor) return;

        // Update group data
        this.group.tasks.forEach(task => {
            task.project_color = newColor;
        });
        this.group.latestTask.project_color = newColor;

        // Recreate subtitle with new color
        const groupProjectName = this.group.latestTask.project_name || 'No Project';
        const groupClientName = this.group.latestTask.client_name || 'No Client';

        const trackingState = this.coreBridge ? this.coreBridge.getTrackingState() : { isTracking: false };
        const isCurrentlyTracking = trackingState.isTracking &&
            this.group.tasks.some(t =>
                t.task_id === trackingState.currentTaskId &&
                t.project_id === trackingState.currentProjectId &&
                t.client_id === trackingState.currentClientId
            );

        const groupSubtitle = isCurrentlyTracking
            ? `<span foreground="${newColor}">●</span> ${groupProjectName} • ${groupClientName} • <b>Currently Tracking</b>`
            : `<span foreground="${newColor}">●</span> ${groupProjectName} • ${groupClientName}`;

        // Update subtitle in widget
        this.widget.set_subtitle(groupSubtitle);

        // Update all child task rows subtitles
        if (this.childRows && this.childRows.length > 0) {
            this.group.tasks.forEach((task, index) => {
                const taskRow = this.childRows[index];
                if (taskRow) {
                    const taskProjectName = task.project_name || 'No Project';
                    const taskClientName = task.client_name || 'No Client';
                    const dateText = this._formatDate(task.last_used_at);
                    const taskSubtitle = `<span foreground="${newColor}">●</span> ${taskProjectName} • ${taskClientName} • ${dateText}`;
                    taskRow.set_subtitle(taskSubtitle);
                }
            });
        }
    }
}
