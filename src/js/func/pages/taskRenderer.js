import Gtk from 'gi://Gtk';
import Gdk from 'gi://Gdk';
import Adw from 'gi://Adw';
import { trackingStateManager } from 'resource:///com/odnoyko/valot/js/func/global/trackingStateManager.js';
import { InputValidator } from 'resource:///com/odnoyko/valot/js/func/global/inputValidation.js';
import { executeNonSelectCommand } from 'resource:///com/odnoyko/valot/js/func/global/dbinitialisation.js';
import { WidgetFactory } from 'resource:///com/odnoyko/valot/js/interface/components/widgetFactory.js';
import { Button } from 'resource:///com/odnoyko/valot/js/interface/components/primitive/Button.js';
import { getCurrencySymbol } from 'resource:///com/odnoyko/valot/js/data/currencies.js';

// Import template components
import { TaskRowTemplate } from 'resource:///com/odnoyko/valot/js/interface/components/complex/TaskRowTemplate.js';
import { TaskStackTemplate } from 'resource:///com/odnoyko/valot/js/interface/components/complex/TaskStackTemplate.js';

// Task rendering functionality
export class TaskRenderer {
    constructor(timeUtils, allProjects, parentWindow) {
        this.timeUtils = timeUtils;
        this.allProjects = allProjects;
        this.parentWindow = parentWindow;

        // Track template instances for cleanup
        this.taskTemplates = new Map(); // Maps task/stack IDs to template instances
        this.activeTaskWidgets = new Map(); // Maps task name to { row, timeLabel, task } - kept for backward compatibility
    }

    renderSingleTask(task) {
        // Clean up existing template if any
        this._cleanupTemplate(`task_${task.id}`);

        // Determine if task is currently active/tracking
        const taskBaseName = task.name.match(/^(.+?)\s*(?:\(\d+\))?$/);
        const baseName = taskBaseName ? taskBaseName[1].trim() : task.name;
        const projectName = task.project || task.project_name || 'Unbekanntes Projekt';
        const clientName = task.client || task.client_name || 'Standard-Kunde';
        const taskGroupKey = `${baseName}::${projectName}::${clientName}`;
        const isCurrentlyTracking = trackingStateManager.isTaskTracking(taskGroupKey);

        // Always use TaskRowTemplate - it will adapt based on tracking state
        const templateInstance = new TaskRowTemplate(task, this.timeUtils, this.allProjects, this.parentWindow);
        // Using TaskRowTemplate

        // Store template instance for cleanup
        this.taskTemplates.set(`task_${task.id}`, templateInstance);

        return templateInstance.getWidget();
    }

    renderTaskGroup(group) {
        // Clean up existing template if any
        this._cleanupTemplate(`stack_${group.groupKey}`);

        // Determine if stack is currently active/tracking
        const isCurrentlyTracking = trackingStateManager.isStackTracking(group.groupKey);

        // Always use TaskStackTemplate - it will adapt based on tracking state
        const templateInstance = new TaskStackTemplate(group, this.timeUtils, this.allProjects, this.parentWindow);
        // Using TaskStackTemplate

        // Store template instance for cleanup
        this.taskTemplates.set(`stack_${group.groupKey}`, templateInstance);

        return templateInstance.getWidget();
    }

    _createSuffixBox(task, cost) {
        let timeText = '';

        // Create group key for this task (needed to check tracking state)
        const taskBaseName = task.name.match(/^(.+?)\s*(?:\(\d+\))?$/);
        const baseName = taskBaseName ? taskBaseName[1].trim() : task.name;
        const projectName = task.project || task.project_name || 'Default';
        const clientName = task.client || task.client_name || 'Default Client';
        const taskGroupKey = `${baseName}::${projectName}::${clientName}`;

        // Check if currently tracking OR active in database
        const isCurrentlyTracking = trackingStateManager.isTaskTracking(taskGroupKey);

        // Prepare time text
        if (isCurrentlyTracking) {
            // For active/tracking tasks, show initial format that will be updated in real-time
            timeText = '🔥';
        } else if (task.duration > 0) {
            // For completed tasks, show final duration
            timeText = this.timeUtils.formatDuration(task.duration);
            if (cost > 0) {
                const currency = task.client_currency || 'EUR';
                const currencySymbol = getCurrencySymbol(currency);
                timeText += ` • ${currencySymbol}${cost.toFixed(2)}`;
            }
        }

        const { suffixBox } = WidgetFactory.createTaskSuffixBox({
            timeText: timeText,
            showEditButton: true,
            showTrackButton: true,
            onEditClick: () => this.parentWindow._editTask(task.id),
            onTrackClick: () => this._handleTaskTrackClick(task, taskGroupKey)
        });

        // Handle time label registration for active/inactive tasks
        const timeLabels = this._findTimeLabelsInSuffixBox(suffixBox);
        timeLabels.forEach(timeLabel => {
            // Check both database active state AND current tracking state
            const isCurrentlyTracking = trackingStateManager.isTaskTracking(taskGroupKey);

            if (isCurrentlyTracking) {
                // Time label already set to '00:00:00' in WidgetFactory, just add styling
                timeLabel.set_css_classes(['caption']);

                // Track active task widget for real-time updates
                this.activeTaskWidgets.set(task.name, {
                    timeLabel: timeLabel,
                    task: task,
                    taskGroupKey: taskGroupKey
                });

                // If this task is currently being tracked (not just in DB), show current total time
                if (trackingStateManager.isTaskTracking(taskGroupKey)) {
                    const currentTracking = trackingStateManager.getCurrentTracking();
                    if (currentTracking && currentTracking.name === task.name) {
                        // Get database time and add current elapsed time for total
                        trackingStateManager.getTotalTaskTime(task.name, task.project_id, task.client_id).then(dbTime => {
                            const elapsedTime = trackingStateManager.currentElapsedTime || 0;
                            const totalTime = dbTime + elapsedTime;
                            const totalTimeStr = this._formatElapsedTime(totalTime);
			    //start Tracking label
                            timeLabel.set_markup(`<span color="@accent_bg_color">●</span> ${totalTimeStr}`);
                        }).catch(error => {
                            //(`Error getting database time for "${task.name}":`, error);
                            // Fallback to showing just current elapsed time
                            const elapsedTime = trackingStateManager.currentElapsedTime || 0;
                            const timeStr = this._formatElapsedTime(elapsedTime);
                            timeLabel.set_markup(`199<span color="${dotColor}">●</span> ${timeStr}`);
                        });
                    }
                }

            }
            // Note: TimeLabel registration is handled by TaskRowTemplate, no need to register here again
        });

        // Find and register track buttons created by WidgetFactory
        const trackButtons = this._findTrackButtonsInSuffixBox(suffixBox);
        trackButtons.forEach(trackBtn => {
            // Register this button with the tracking state manager
            trackingStateManager.registerStackButton(trackBtn, taskGroupKey);

            // Apply icon styling if this task is currently being tracked
            const isCurrentlyTaskTracking = trackingStateManager.isTaskTracking(taskGroupKey);
            if (isCurrentlyTaskTracking) {
                trackBtn.set_icon_name('media-playback-stop-symbolic');
                trackBtn.set_tooltip_text('Stop tracking');
            }
        });

        return suffixBox;
    }

    _handleTaskTrackClick(task, taskGroupKey) {
        const isCurrentlyThisTaskTracking = trackingStateManager.isTaskTracking(taskGroupKey);

        if (isCurrentlyThisTaskTracking) {
            this.parentWindow._stopCurrentTracking();
        } else {
            this.parentWindow._startTrackingFromTask(task);
        }
    }

    _findTimeLabelsInSuffixBox(suffixBox) {
        const timeLabels = [];
        this._findWidgetsOfType(suffixBox, Gtk.Label, timeLabels);
        return timeLabels.filter(label => {
            const classes = label.get_css_classes();
            return classes.includes('caption') || classes.includes('time-display');
        });
    }

    _findTrackButtonsInSuffixBox(suffixBox) {
        const trackButtons = [];
        this._findWidgetsOfType(suffixBox, Gtk.Button, trackButtons);
        return trackButtons.filter(button => {
            const child = button.get_first_child();
            return child && child.get_icon_name &&
                   (child.get_icon_name().includes('playback') || child.get_icon_name().includes('stop'));
        });
    }

    _findWidgetsOfType(container, widgetType, results) {
        let child = container.get_first_child();
        while (child) {
            if (child instanceof widgetType) {
                results.push(child);
            }
            if (child.get_first_child) {
                this._findWidgetsOfType(child, widgetType, results);
            }
            child = child.get_next_sibling();
        }
    }

    _createGroupSuffixBox(group, costText) {
        const groupSuffixBox = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 12,
            halign: Gtk.Align.END
        });

        // Add group total time
        const groupTimeLabel = new Gtk.Label({
            label: `${this.timeUtils.formatDuration(group.totalDuration)}${costText}`,
            css_classes: ['caption', 'dim-label'],
            halign: Gtk.Align.END
        });

        // Register the group time label with tracking state manager
        trackingStateManager.registerStackTimeLabel(groupTimeLabel, group.groupKey);

        groupSuffixBox.append(groupTimeLabel);

        // Add group-level tracking button using WidgetFactory for consistent styling
        const { suffixBox: trackButtonBox } = WidgetFactory.createTaskSuffixBox({
            timeText: '', // No time text for the track button
            showEditButton: false, // No edit button
            showTrackButton: true, // Only track button
            onTrackClick: () => {
                // Check current state dynamically when clicked
                const isCurrentlyStackTracking = trackingStateManager.isStackTracking(group.groupKey);
                if (isCurrentlyStackTracking) {
                    // Stop the current tracking
                    this.parentWindow._stopCurrentTracking();
                } else {
                    // Start new session with latest task
                    this.parentWindow._startTrackingFromTask(group.latestTask);
                }
            }
        });

        // Find and register the track button created by WidgetFactory
        const trackButtons = this._findTrackButtonsInSuffixBox(trackButtonBox);
        trackButtons.forEach(groupTrackBtn => {
            // Register this button with the tracking state manager as a stack button
            trackingStateManager.registerStackButton(groupTrackBtn, group.groupKey);

            // Apply icon styling if this group/stack is currently being tracked
            const isCurrentlyStackTracking = trackingStateManager.isStackTracking(group.groupKey);
            if (isCurrentlyStackTracking) {
                groupTrackBtn.set_icon_name('media-playback-stop-symbolic');
                groupTrackBtn.set_tooltip_text('Stop tracking');
            }
        });

        groupSuffixBox.append(trackButtonBox);

        return groupSuffixBox;
    }

    _renderIndividualTaskInGroup(task) {
        const cost = (task.duration / 3600) * (task.client_rate || 0);
        const currency = task.client_currency || 'EUR';
        const currencySymbol = getCurrencySymbol(currency);
        const costText = cost > 0 ? ` • ${currencySymbol}${cost.toFixed(2)}` : '';

        const taskRow = new Adw.ActionRow({
            title: InputValidator.escapeForGTKMarkup(task.name),
            subtitle: task.isActive
                ? `Currently tracking • ${this.timeUtils.formatDate(task.start)}`
                : `${this.timeUtils.formatDate(task.start)}`
        });

        // Add time display for individual task in group
        const taskSuffixBox = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 12,
            halign: Gtk.Align.END
        });

        // Add time display (duration or cost) for individual tasks
        if (!task.isActive && task.duration > 0) {
            const taskTimeLabel = new Gtk.Label({
                label: this.timeUtils.formatDuration(task.duration),
                css_classes: ['caption', 'dim-label'],
                halign: Gtk.Align.END
            });

            if (cost > 0) {
                const currency = task.client_currency || 'EUR';
                const currencySymbol = getCurrencySymbol(currency);
                taskTimeLabel.set_label(`${this.timeUtils.formatDuration(task.duration)} • ${currencySymbol}${cost.toFixed(2)}`);
            }

            taskSuffixBox.append(taskTimeLabel);
        }

        // Check both database state and current tracking state for visual feedback
        const taskBaseName = task.name.match(/^(.+?)\s*(?:\(\d+\))?$/);
        const baseName = taskBaseName ? taskBaseName[1].trim() : task.name;
        const taskGroupKey = `${baseName}::${task.project || task.project_name}::${task.client || task.client_name}`;
        const isCurrentlyTracking = trackingStateManager.isTaskTracking(taskGroupKey);

        if (isCurrentlyTracking) {
            taskRow.add_css_class('tracking-active');
        }

        // Create button container for individual task (only edit button, no tracking button in stacks)
        const taskButtonBox = new Gtk.Box({
            spacing: 6
        });

        // Edit button only for tasks inside stacks
        const editBtn = new Gtk.Button({
            icon_name: 'document-edit-symbolic',
            css_classes: ['flat'],
            tooltip_text: 'Edit Task'
        });
        editBtn.connect('clicked', () => this.parentWindow._editTask(task.id));
        taskButtonBox.append(editBtn);

        taskSuffixBox.append(taskButtonBox);
        taskRow.add_suffix(taskSuffixBox);

        if (this.parentWindow.taskRowMap) {
            this.parentWindow.taskRowMap.set(taskRow, task.id);
        }

        // Add right-click gesture for individual tasks within groups
        this._addRightClickGesture(taskRow, task);

        return taskRow;
    }

    _createTaskButtonBox(task) {
        const taskButtonBox = new Gtk.Box({
            spacing: 6
        });

        // Edit button
        const editBtn = new Gtk.Button({
            icon_name: 'document-edit-symbolic',
            css_classes: ['flat'],
            tooltip_text: 'Edit Task'
        });
        editBtn.connect('clicked', () => this.parentWindow._editTask(task.id));
        taskButtonBox.append(editBtn);

        // Tracking button using standard Gtk.Button
        const trackBtn = new Gtk.Button({
            icon_name: 'media-playback-start-symbolic', // Will be updated by state manager
            css_classes: ['flat'],
            tooltip_text: 'Start Tracking', // Will be updated by state manager
            width_request: 32,
            height_request: 32
        });

        // Create group key for this individual task (same logic as stacks)
        const taskBaseName = task.name.match(/^(.+?)\s*(?:\(\d+\))?$/);
        const baseName = taskBaseName ? taskBaseName[1].trim() : task.name;
        const taskGroupKey = `${baseName}::${task.project}::${task.client}`;

        // Register this button with the tracking state manager as a stack button using group key
        trackingStateManager.registerStackButton(trackBtn, taskGroupKey);

        // Apply icon styling if this task is currently being tracked
        const isCurrentlyTaskTracking = trackingStateManager.isTaskTracking(taskGroupKey);
        if (isCurrentlyTaskTracking) {
            trackBtn.set_icon_name('media-playback-stop-symbolic');
            trackBtn.set_tooltip_text('Stop tracking');
        }

        trackBtn.connect('clicked', () => {
            // Check current state dynamically when clicked
            const isCurrentlyThisTaskTracking = trackingStateManager.isTaskTracking(taskGroupKey);
            if (isCurrentlyThisTaskTracking) {
                this.parentWindow._stopCurrentTracking();
            } else {
                this.parentWindow._startTrackingFromTask(task);
            }
        });

        // Apply gray color to the icon (our Button component) - removed dim-label class
        // trackBtn.addClass('dim-label');

        taskButtonBox.append(trackBtn);

        return taskButtonBox;
    }

    _addRightClickGesture(row, task) {
        const gesture = new Gtk.GestureClick({
            button: 3
        });

        gesture.connect('pressed', (gesture, n_press, x, y) => {
            // Stop event propagation to prevent parent stack selection
            gesture.set_state(Gtk.EventSequenceState.CLAIMED);

            this._toggleTaskSelection(row, task);
        });

        row.add_controller(gesture);

        // Also add left-click selection with Ctrl key
        const leftClickGesture = new Gtk.GestureClick({
            button: 1 // Left click
        });

        leftClickGesture.connect('pressed', (gesture, n_press, x, y) => {
            try {
                const event = gesture.get_current_event();
                if (!event) return false;

                const state = event.get_modifier_state();
                // Check if Ctrl key is held down
                if (state & Gdk.ModifierType.CONTROL_MASK) {
                    this._toggleTaskSelection(row, task);
                    return true; // Event handled
                }
                return false; // Let other handlers process the event
            } catch (error) {
                return false;
            }
        });

        row.add_controller(leftClickGesture);
    }

    _toggleTaskSelection(row, task) {
        // Use the selectedTasks set from the renderer (could be main page or reports page)
        const selectedTasks = this.selectedTasks || this.parentWindow.selectedTasks;
        
        if (selectedTasks) {
            if (selectedTasks.has(task.id)) {
                selectedTasks.delete(task.id);
                row.remove_css_class('selected-task');
            } else {
                selectedTasks.add(task.id);
                row.add_css_class('selected-task');
            }
            
            // Call selection changed callback if available
            if (this.onSelectionChanged) {
                this.onSelectionChanged();
            }
        }
    }

    _addStackRightClickGesture(row, group) {
        const gesture = new Gtk.GestureClick({
            button: 3
        });

        gesture.connect('pressed', (gesture, n_press, x, y) => {

            // Find all tasks that belong to this stack from the main task list
            // This ensures we get all tasks even if the stack was never expanded
            // Tasks must match name, project, and client to belong to the same stack
            const stackTasks = this.parentWindow.allTasks.filter(task => {
                const taskBaseName = task.name.match(/^(.+?)\s*(?:\(\d+\))?$/);
                const baseNameToCheck = taskBaseName ? taskBaseName[1].trim() : task.name;
                const taskGroupKey = `${baseNameToCheck}::${task.project || task.project_name}::${task.client || task.client_name}`;
                return taskGroupKey === group.groupKey;
            });


            // Ensure this is treated as a stack selection event
            gesture.set_state(Gtk.EventSequenceState.CLAIMED);

            // Use the selected sets from the renderer (could be main page or reports page)
            const selectedStacks = this.selectedStacks || this.parentWindow.selectedStacks;
            const selectedTasks = this.selectedTasks || this.parentWindow.selectedTasks;
            
            if (selectedStacks && selectedTasks) {
                if (selectedStacks.has(group.groupKey)) {
                    // DESELECT stack and all its tasks
                    selectedStacks.delete(group.groupKey);
                    row.remove_css_class('selected-task');

                    // Remove all tasks from this stack from selectedTasks using allTasks lookup
                    stackTasks.forEach(task => {
                        selectedTasks.delete(task.id);
                    });

                } else {
                    // SELECT stack and all its tasks
                    selectedStacks.add(group.groupKey);
                    row.add_css_class('selected-task');

                    // Add all tasks from this stack to selectedTasks using allTasks lookup
                    stackTasks.forEach(task => {
                        selectedTasks.add(task.id);
                    });

                }
                
                // Call selection changed callback if available
                if (this.onSelectionChanged) {
                    this.onSelectionChanged();
                }
            }
        });

        row.add_controller(gesture);
    }

    // Update task name in database
    _updateTaskName(taskId, newName) {
        if (!this.parentWindow.dbConnection) {
            //('No database connection to update task name');
            return;
        }

        try {
            const safeName = InputValidator.sanitizeForSQL(newName);
            const sql = `UPDATE Task SET name = '${safeName}' WHERE id = ${taskId}`;

            executeNonSelectCommand(this.parentWindow.dbConnection, sql);

            // Refresh the task list to show updated name
            if (typeof this.parentWindow._loadTasks === 'function') {
                this.parentWindow._loadTasks();
            }

        } catch (error) {
            //('Error updating task name:', error);
        }
    }

    /**
     * Update the duration display of an active task in real-time
     * @param {string} taskName - Name of the task to update
     * @param {string} formattedTime - Formatted time string (HH:MM:SS)
     */
    updateActiveTaskDuration(taskName, formattedTime) {
        const widget = this.activeTaskWidgets.get(taskName);
        if (widget && widget.timeLabel) {
            try {
                widget.timeLabel.set_label(formattedTime);
            } catch (error) {
                //(`❌ Error updating duration for task "${taskName}":`, error);
                // Remove invalid widget from tracking
                this.activeTaskWidgets.delete(taskName);
            }
        }
    }

    /**
     * Clear tracking for a specific task (called when task becomes inactive)
     * @param {string} taskName - Name of the task to stop tracking
     */
    clearActiveTaskTracking(taskName) {
        if (this.activeTaskWidgets.has(taskName)) {
            this.activeTaskWidgets.delete(taskName);
        }
    }

    /**
     * Clear all active task tracking (called when task list is refreshed)
     */
    clearAllActiveTaskTracking() {
        const count = this.activeTaskWidgets.size;
        this.activeTaskWidgets.clear();
        if (count > 0) {
        }
        
        // Also clear all template instances
        this.clearAllTemplates();
    }

    /**
     * Clean up specific template instance
     * @private
     */
    _cleanupTemplate(templateId) {
        const template = this.taskTemplates.get(templateId);
        if (template && typeof template.destroy === 'function') {
            template.destroy();
        }
        this.taskTemplates.delete(templateId);
    }

    /**
     * Clear all template instances
     */
    clearAllTemplates() {
        // Cleaning template instances
        
        // Destroy all template instances
        this.taskTemplates.forEach((template, templateId) => {
            if (template && typeof template.destroy === 'function') {
                template.destroy();
            }
        });
        
        this.taskTemplates.clear();
    }

    /**
     * Format elapsed time in HH:MM:SS format
     * @private
     */
    _formatElapsedTime(seconds) {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const remainingSeconds = seconds % 60;

        return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
    }
}