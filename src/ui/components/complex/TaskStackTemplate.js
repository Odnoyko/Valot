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
        // Get project color from latest task
        const groupProjectName = this.group.latestTask.project_name || 'No Project';
        const groupClientName = this.group.latestTask.client_name || 'No Client';
        const groupDotColor = this.group.latestTask.project_color || '#9a9996';

        // Create group subtitle with colored dot (same for all)
        const groupSubtitle = `<span foreground="${groupDotColor}">●</span> ${groupProjectName} • ${groupClientName}`;

        // Create main expander row (same for all)
        const groupRow = new Adw.ExpanderRow({
            title: `${this._escapeMarkup(this.group.baseName)} (${this.group.tasks.length} entries)`,
            subtitle: groupSubtitle,
            use_markup: true
        });

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

        // Prepare time text (same for all)
        if (this.group.totalDuration > 0) {
            timeText = this._formatDuration(this.group.totalDuration);
        }

        // Prepare money text (WidgetFactory shows money BEFORE time automatically)
        if (this.group.totalCost > 0) {
            const currency = this.group.latestTask.client_currency || 'EUR';
            const currencySymbol = WidgetFactory.getCurrencySymbol(currency);
            moneyText = `${currencySymbol}${this.group.totalCost.toFixed(2)}`;
        }

        // Use dim-label for all tasks
        const timeCssClasses = ['caption', 'dim-label'];

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
                    }
                }
            }
        });

        // Store label and button references for real-time updates
        this.timeLabel = timeLabel;
        this.moneyLabel = moneyLabel;
        this.trackButton = trackButton;

        // Set track button icon (always show start, tracking state handled elsewhere)
        if (trackButton) {
            trackButton.set_icon_name('media-playback-start-symbolic');
            trackButton.set_tooltip_text(_('Start tracking'));
        }

        return suffixBox;
    }

    _addTaskRows(groupRow) {
        // Store child rows for later updates
        this.childRows = [];

        // Add individual task rows to the stack
        this.group.tasks.forEach(task => {
            // Format date for subtitle (same for all tasks)
            const dateText = this._formatDate(task.last_used_at);

            const taskRow = new Adw.ActionRow({
                title: this._escapeMarkup(task.task_name),
                subtitle: dateText,
                use_markup: true
            });

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
            // Always show time label, even if 0 (will be updated when time is added)
            const cost = (task.total_time / 3600) * (task.client_rate || 0);
            const currency = task.client_currency || 'EUR';
            const currencySymbol = WidgetFactory.getCurrencySymbol(currency);

            let labelText = this._formatDuration(task.total_time || 0);

            // If has cost, show: $0.01 • 00:00:01
            if (cost > 0) {
                labelText = `${currencySymbol}${cost.toFixed(2)} • ${this._formatDuration(task.total_time || 0)}`;
            }

            const taskTimeLabel = new Gtk.Label({
                label: labelText,
                css_classes: ['caption', 'dim-label'],
                halign: Gtk.Align.END
            });
            
            // Store reference to label for later updates
            taskRow.taskTimeLabel = taskTimeLabel;
            taskRow.taskInstanceId = task.id;

            taskSuffixBox.append(taskTimeLabel);

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

        // Recreate subtitle with new color (same for all)
        const groupProjectName = this.group.latestTask.project_name || 'No Project';
        const groupClientName = this.group.latestTask.client_name || 'No Client';

        const groupSubtitle = `<span foreground="${newColor}">●</span> ${groupProjectName} • ${groupClientName}`;

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

    /**
     * Update tracking state (icon and subtitle)
     * Called when tracking starts/stops or when task/project/client names change
     */
    updateTrackingState() {
        if (!this.coreBridge || !this.trackButton) return;

        const trackingState = this.coreBridge.getTrackingState();
        const isTrackingThisStack = trackingState.isTracking &&
            this.group.tasks.some(t =>
                t.task_id === trackingState.currentTaskId &&
                t.project_id === trackingState.currentProjectId &&
                t.client_id === trackingState.currentClientId
            );

        // Update button icon
        if (isTrackingThisStack) {
            this.trackButton.set_icon_name('media-playback-stop-symbolic');
            this.trackButton.set_tooltip_text(_('Stop tracking'));
        } else {
            this.trackButton.set_icon_name('media-playback-start-symbolic');
            this.trackButton.set_tooltip_text(_('Start tracking'));
        }
        
        // CRITICAL: Update title (task name) and subtitle with current project/client names
        if (this.widget && this.group.latestTask) {
            // Update title (task name) if changed
            const taskName = this._escapeMarkup(this.group.latestTask.task_name);
            this.widget.set_title(`${taskName} (${this.group.tasks.length} entries)`);
            
            // Update subtitle with current project/client names
            const groupProjectName = this.group.latestTask.project_name || 'No Project';
            const groupClientName = this.group.latestTask.client_name || 'No Client';
            const dotColor = this.group.latestTask.project_color || '#9a9996';
            
            const groupSubtitle = `<span foreground="${dotColor}">●</span> ${groupProjectName} • ${groupClientName}`;
            this.widget.set_subtitle(groupSubtitle);
            
            // Also update all child task rows titles and subtitles
            if (this.childRows && this.childRows.length > 0) {
                this.group.tasks.forEach((task, index) => {
                    const taskRow = this.childRows[index];
                    if (taskRow) {
                        // Update title (task name)
                        const taskName = this._escapeMarkup(task.task_name);
                        taskRow.set_title(taskName);
                        
                        // Update subtitle
                        const taskProjectName = task.project_name || 'No Project';
                        const taskClientName = task.client_name || 'No Client';
                        const dateText = this._formatDate(task.last_used_at);
                        const taskSubtitle = `<span foreground="${dotColor}">●</span> ${taskProjectName} • ${taskClientName} • ${dateText}`;
                        taskRow.set_subtitle(taskSubtitle);
                    }
                });
            }
        }
    }

    /**
     * Update time for stack group (recalculates from all tasks)
     * OPTIMIZED: Updates time label without recreating widget
     */
    updateTime(ignoreParam) {
        if (!this.timeLabel) return;
        
        // OPTIMIZED: Always recalculate group totalDuration and totalCost from all tasks (ignore parameter)
        this.group.totalDuration = this.group.tasks.reduce((sum, t) => sum + (t.total_time || 0), 0);
        this.group.totalCost = this.group.tasks.reduce((sum, t) => {
            const taskCost = ((t.total_time || 0) / 3600) * (t.client_rate || 0);
            return sum + taskCost;
        }, 0);
        
        // Check tracking state (same as single task)
        const trackingState = this.coreBridge ? this.coreBridge.getTrackingState() : { isTracking: false };
        const isTrackingThisStack = trackingState.isTracking &&
            this.group.tasks.some(t =>
                t.task_id === trackingState.currentTaskId &&
                t.project_id === trackingState.currentProjectId &&
                t.client_id === trackingState.currentClientId
            );
        
        // Prepare time text (same as single task)
        let timeText = '';
        if (isTrackingThisStack) {
            timeText = '● ' + this._formatDuration(this.group.totalDuration);
            // Remove dim-label to show green color
            if (this.timeLabel.has_css_class('dim-label')) {
                this.timeLabel.remove_css_class('dim-label');
            }
        } else if (this.group.totalDuration > 0) {
            timeText = this._formatDuration(this.group.totalDuration);
            // Add dim-label if not tracking
            if (!this.timeLabel.has_css_class('dim-label')) {
                this.timeLabel.add_css_class('dim-label');
            }
        } else {
            timeText = this._formatDuration(0);
        }
        
        this.timeLabel.set_text(timeText);
        
        // CRITICAL: Update money label (currency) based on new totalCost
        if (this.moneyLabel) {
            if (this.group.totalCost > 0) {
                // Use currency from latest task (all tasks in stack should have same currency)
                const currency = this.group.latestTask.client_currency || 'EUR';
                const currencySymbol = WidgetFactory.getCurrencySymbol(currency);
                const moneyText = `${currencySymbol}${this.group.totalCost.toFixed(2)}`;
                this.moneyLabel.set_text(moneyText);
                
                // Update CSS classes based on tracking state
                if (isTrackingThisStack) {
                    // Remove dim-label to show normal color when tracking
                    if (this.moneyLabel.has_css_class('dim-label')) {
                        this.moneyLabel.remove_css_class('dim-label');
                    }
                } else {
                    // Add dim-label if not tracking
                    if (!this.moneyLabel.has_css_class('dim-label')) {
                        this.moneyLabel.add_css_class('dim-label');
                    }
                }
            } else {
                // No cost - clear money label
                this.moneyLabel.set_text('');
            }
        }
    }

    /**
     * Update time for individual task in stack
     * OPTIMIZED: Updates time labels in childRows without recreating widgets
     */
    updateTaskTime(taskInstanceId, newTotalTime) {
        if (!this.childRows || this.childRows.length === 0) return;

        // Find task in group to get task reference
        const task = this.group.tasks.find(t => t.id === taskInstanceId);
        if (!task) return;

        // CRITICAL: Validate newTotalTime
        if (newTotalTime === undefined || newTotalTime === null || isNaN(newTotalTime)) {
            newTotalTime = 0;
        }
        
        // Ensure newTotalTime is a number
        newTotalTime = Number(newTotalTime);

        // Update task object
        task.total_time = newTotalTime;

        // Update group time (same as single task updateTime)
        this.updateTime(newTotalTime);

        // Find corresponding childRow and update its time label
        const taskIndex = this.group.tasks.findIndex(t => t.id === taskInstanceId);
        if (taskIndex >= 0 && taskIndex < this.childRows.length) {
            const taskRow = this.childRows[taskIndex];
            
        // CRITICAL: Check tracking state to remove green dot after stop
        const trackingState = this.coreBridge ? this.coreBridge.getTrackingState() : { isTracking: false };
        const isCurrentlyTracking = trackingState.isTracking &&
            trackingState.currentTaskId === task.task_id &&
            trackingState.currentProjectId === task.project_id &&
            trackingState.currentClientId === task.client_id;
        
            
            // OPTIMIZED: Use stored reference to time label (faster than traversing DOM)
            if (taskRow.taskTimeLabel) {
                const cost = (newTotalTime / 3600) * (task.client_rate || 0);
                const currency = task.client_currency || 'EUR';
                const currencySymbol = WidgetFactory.getCurrencySymbol(currency);

                let labelText = this._formatDuration(newTotalTime);

                // If has cost, show: $0.01 • 00:00:01
                if (cost > 0) {
                    labelText = `${currencySymbol}${cost.toFixed(2)} • ${this._formatDuration(newTotalTime)}`;
                }

                taskRow.taskTimeLabel.set_text(labelText);
                
                // CRITICAL: Update CSS classes based on tracking state (remove green dot after stop)
                if (isCurrentlyTracking) {
                    // Remove dim-label to show green color
                    if (taskRow.taskTimeLabel.has_css_class('dim-label')) {
                        taskRow.taskTimeLabel.remove_css_class('dim-label');
                    }
                } else {
                    // Add dim-label if not tracking (removes green dot)
                    if (!taskRow.taskTimeLabel.has_css_class('dim-label')) {
                        taskRow.taskTimeLabel.add_css_class('dim-label');
                    }
                }
            } else {
                // Fallback: Find suffix box and time label
                const suffixBox = taskRow.get_suffix();
                if (suffixBox) {
                    // Find time label in suffix box
                    let timeLabel = suffixBox.get_first_child();
                    while (timeLabel) {
                        if (timeLabel instanceof Gtk.Label && timeLabel.get_css_classes().includes('dim-label')) {
                            // Store reference for future updates
                            taskRow.taskTimeLabel = timeLabel;
                            
                            // Update time label text
                            const cost = (newTotalTime / 3600) * (task.client_rate || 0);
                            const currency = task.client_currency || 'EUR';
                            const currencySymbol = WidgetFactory.getCurrencySymbol(currency);

                            let labelText = this._formatDuration(newTotalTime);

                            // If has cost, show: $0.01 • 00:00:01
                            if (cost > 0) {
                                labelText = `${currencySymbol}${cost.toFixed(2)} • ${this._formatDuration(newTotalTime)}`;
                            }

                            timeLabel.set_text(labelText);
                            
                            // CRITICAL: Update CSS classes based on tracking state (remove green dot after stop)
                            if (isCurrentlyTracking) {
                                // Remove dim-label to show green color
                                if (timeLabel.has_css_class('dim-label')) {
                                    timeLabel.remove_css_class('dim-label');
                                }
                            } else {
                                // Add dim-label if not tracking (removes green dot)
                                if (!timeLabel.has_css_class('dim-label')) {
                                    timeLabel.add_css_class('dim-label');
                                }
                            }
                            break;
                        }
                        timeLabel = timeLabel.get_next_sibling();
                    }
                }
            }
        }
    }

    /**
     * Cleanup: destroy widget and clear references to free RAM
     */
    destroy() {
        if (this.widget) {
            try {
                if (typeof this.widget.destroy === 'function') {
                    this.widget.destroy();
                }
            } catch (e) {
                // Widget may already be destroyed
            }
            this.widget = null;
        }
        
        // Destroy child rows
        if (this.childRows) {
            this.childRows.forEach(row => {
                try {
                    if (row && typeof row.destroy === 'function') {
                        row.destroy();
                    }
                } catch (e) {
                    // Row may already be destroyed
                }
            });
            this.childRows = [];
        }
        
        this.group = null;
        this.parentWindow = null;
        this.coreBridge = null;
    }
}
