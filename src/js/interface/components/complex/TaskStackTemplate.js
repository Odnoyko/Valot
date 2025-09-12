import Gtk from 'gi://Gtk';
import Gdk from 'gi://Gdk';
import Adw from 'gi://Adw';
import { InputValidator } from 'resource:///com/odnoyko/valot/js/func/global/inputValidation.js';
import { trackingStateManager } from 'resource:///com/odnoyko/valot/js/func/global/trackingStateManager.js';
import { GlobalTracking } from 'resource:///com/odnoyko/valot/js/func/global/globalTracking.js';
import { WidgetFactory } from 'resource:///com/odnoyko/valot/js/interface/components/widgetFactory.js';

/**
 * Template component for task stacks (grouped tasks)
 * Shows an expandable row with task group summary and individual tasks
 */
export class TaskStackTemplate {
    constructor(group, timeUtils, allProjects, parentWindow) {
        this.group = group;
        this.timeUtils = timeUtils;
        this.allProjects = allProjects;
        this.parentWindow = parentWindow;
        this.widget = this._createStackWidget();
    }

    _createStackWidget() {
        // Check if this stack is currently being tracked
        const isCurrentlyTracking = trackingStateManager.isStackTracking(this.group.groupKey);

        // Find project color
        const projectsArray = this.parentWindow.allProjects || this.allProjects || [];
        const project = projectsArray.find(p => p.id === this.group.latestTask.project_id);

        // Create group subtitle with colored dot
        const groupProjectName = this.group.latestTask.project || this.group.latestTask.project_name || 'Unbekanntes Projekt';
        const groupClientName = this.group.latestTask.client || this.group.latestTask.client_name || 'Standard-Kunde';
        const groupDotColor = this.group.latestTask.project_color || (project ? project.color : '#9a9996');

        const groupSubtitle = isCurrentlyTracking
            ? `<span color="${groupDotColor}">●</span> ${groupProjectName} • ${groupClientName} • <b>Zurzeit Tracking</b>`
            : `<span color="${groupDotColor}">●</span> ${groupProjectName} • ${groupClientName}`;

        // Create main expander row
        const groupRow = new Adw.ExpanderRow({
            title: `${InputValidator.escapeForGTKMarkup(this.group.baseName)} (${this.group.tasks.length} Sitzungen)`,
            subtitle: groupSubtitle,
            use_markup: true
        });

        // Apply tracking state styling
        this._applyTrackingState(groupRow);

        // Apply selection styling
        this._applySelectionState(groupRow);

        // Add group suffix box with time and track button
        const groupSuffixBox = this._createGroupSuffixBox();
        groupRow.add_suffix(groupSuffixBox);

        // Add individual tasks as rows within the expander
        this._addTaskRows(groupRow);

        // Add stack selection functionality
        this._addStackGestures(groupRow);

        return groupRow;
    }

    _applyTrackingState(groupRow) {
        const isCurrentlyTracking = trackingStateManager.isStackTracking(this.group.groupKey);

        if (isCurrentlyTracking) {
            groupRow.add_css_class('tracking-active');
        }
    }

    _applySelectionState(groupRow) {
        if (this.parentWindow.selectedStacks && this.parentWindow.selectedStacks.has(this.group.groupKey)) {
            groupRow.add_css_class('selected-task');
        }

        // Store stack row mapping for selection management
        if (this.parentWindow.stackRowMap) {
            this.parentWindow.stackRowMap.set(groupRow, this.group.groupKey);
        }
    }

    _createGroupSuffixBox() {
        let timeText = '';
        let moneyText = '';
        
        // Check tracking state
        const isCurrentlyTracking = trackingStateManager.isStackTracking(this.group.groupKey);
        
        // Prepare time text (without money info)
        if (isCurrentlyTracking) {
  	    timeText = `● Tracked`;

        } else if (this.group.totalDuration > 0) {
            timeText = this.timeUtils.formatDuration(this.group.totalDuration);
        }

        // Prepare separate money text
        if (this.group.totalCost > 0) {
            const currency = this.group.latestTask.currency || 'EUR';
            const currencySymbol = WidgetFactory.getCurrencySymbol(currency);
            moneyText = `${currencySymbol}${this.group.totalCost.toFixed(2)}`;
        }

        const { suffixBox, timeLabel, moneyLabel } = WidgetFactory.createTaskSuffixBox({
            timeText: timeText,
            moneyText: moneyText,
            showEditButton: false,
            showTrackButton: true,
            showCostTracking: this.parentWindow.showCostTracking !== false, // Default to true unless explicitly disabled
            onTrackClick: async () => await GlobalTracking.handleTaskTracking(this.group.latestTask, this.parentWindow)
        });

        // Store references for real-time updates
        this.timeLabel = timeLabel;
        this.moneyLabel = moneyLabel;

        // Register money label with client info for real-time earnings calculation
        if (this.moneyLabel && this.group.latestTask.client_rate > 0) {
            const clientInfo = {
                rate: this.group.latestTask.client_rate || 0,
                currency: this.group.latestTask.currency || 'EUR'
            };
            trackingStateManager.registerMoneyLabel(this.moneyLabel, this.group.groupKey, clientInfo);
        }

        // Register time labels and buttons with tracking state manager
        this._registerWithTrackingManager(suffixBox);

        return suffixBox;
    }

    _registerWithTrackingManager(suffixBox) {
        // Find and register time labels
        const timeLabels = this._findTimeLabelsInSuffixBox(suffixBox);
        timeLabels.forEach(timeLabel => {
            const isCurrentlyTracking = trackingStateManager.isStackTracking(this.group.groupKey);

            // Always register stack time label for updates (do this once)
            trackingStateManager.registerStackTimeLabel(timeLabel, this.group.groupKey);

            if (isCurrentlyTracking) {
                timeLabel.set_css_classes(['caption']);
                // Don't manually update time - let trackingStateManager handle all real-time updates
            }
        });

        // Find and register track buttons
        const trackButtons = this._findTrackButtonsInSuffixBox(suffixBox);
        trackButtons.forEach(trackBtn => {
            trackingStateManager.registerStackButton(trackBtn, this.group.groupKey);

            const isCurrentlyStackTracking = trackingStateManager.isStackTracking(this.group.groupKey);
            if (isCurrentlyStackTracking) {
                trackBtn.set_icon_name('media-playback-stop-symbolic');
                trackBtn.set_tooltip_text('Stop current session');
            } else {
                trackBtn.set_icon_name('media-playback-start-symbolic');
                trackBtn.set_tooltip_text('Start new session in stack');
            }
        });
    }

    _findTimeLabelsInSuffixBox(suffixBox) {
        const timeLabels = [];
        this._findWidgetsOfType(suffixBox, Gtk.Label, timeLabels);
        return timeLabels.filter(label => {
            const classes = label.get_css_classes();
            return classes.includes('caption') || classes.includes('time-display');
        });
    }

    _addTaskRows(groupRow) {
        this.group.tasks.forEach(task => {
            const taskRow = this._renderIndividualTaskInGroup(task);
            groupRow.add_row(taskRow);
        });
    }

    _renderIndividualTaskInGroup(task) {
        const cost = (task.duration / 3600) * (task.client_rate || 0);
        
        // Check tracking state for visual feedback
        const taskBaseName = task.name.match(/^(.+?)\s*(?:\(\d+\))?$/);
        const baseName = taskBaseName ? taskBaseName[1].trim() : task.name;
        const taskGroupKey = `${baseName}::${task.project || task.project_name}::${task.client || task.client_name}`;
        const isCurrentlyTracking = trackingStateManager.isTaskTracking(taskGroupKey);

        const taskRow = new Adw.ActionRow({
            title: InputValidator.escapeForGTKMarkup(task.name),
            subtitle: isCurrentlyTracking
                ? `<b>Zurzeit Tracking</b> • ${this.timeUtils.formatDate(task.start)}`
                : `${this.timeUtils.formatDate(task.start)}`,
            use_markup: true
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
                const currency = task.currency || 'EUR';
                const currencySymbol = WidgetFactory.getCurrencySymbol(currency);
                taskTimeLabel.set_label(`${this.timeUtils.formatDuration(task.duration)} • ${currencySymbol}${cost.toFixed(2)}`);
            }

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
        if (isCurrentlyTracking) {
            taskRow.add_css_class('tracking-active');
        }

        // Create button container for individual task (only edit button)
        const taskButtonBox = new Gtk.Box({
            spacing: 6
        });

        // Edit button only for tasks inside stacks
        const editBtn = new Gtk.Button({
            icon_name: 'document-edit-symbolic',
            css_classes: ['flat'],
            tooltip_text: 'Aufgabe bearbeiten'
        });
        editBtn.connect('clicked', () => this.parentWindow._editTask(task.id));
        taskButtonBox.append(editBtn);

        taskSuffixBox.append(taskButtonBox);
        taskRow.add_suffix(taskSuffixBox);

        // Store task mapping
        if (this.parentWindow.taskRowMap) {
            this.parentWindow.taskRowMap.set(taskRow, task.id);
        }

        // Add right-click gesture for individual tasks within groups
        this._addTaskGestures(taskRow, task);

        return taskRow;
    }

    _addStackGestures(groupRow) {
        const gesture = new Gtk.GestureClick({
            button: 3
        });

        gesture.connect('pressed', (gesture, n_press, x, y) => {
            // Find all tasks that belong to this stack from the main task list
            const stackTasks = this.parentWindow.allTasks.filter(task => {
                const taskBaseName = task.name.match(/^(.+?)\s*(?:\(\d+\))?$/);
                const baseNameToCheck = taskBaseName ? taskBaseName[1].trim() : task.name;
                const taskGroupKey = `${baseNameToCheck}::${task.project || task.project_name}::${task.client || task.client_name}`;
                return taskGroupKey === this.group.groupKey;
            });

            // Ensure this is treated as a stack selection event
            gesture.set_state(Gtk.EventSequenceState.CLAIMED);

            if (this.parentWindow.selectedStacks && this.parentWindow.selectedTasks) {
                if (this.parentWindow.selectedStacks.has(this.group.groupKey)) {
                    // DESELECT stack and all its tasks
                    this.parentWindow.selectedStacks.delete(this.group.groupKey);
                    groupRow.remove_css_class('selected-task');

                    // Remove all tasks from this stack from selectedTasks
                    stackTasks.forEach(task => {
                        this.parentWindow.selectedTasks.delete(task.id);
                    });
                } else {
                    // SELECT stack and all its tasks
                    this.parentWindow.selectedStacks.add(this.group.groupKey);
                    groupRow.add_css_class('selected-task');

                    // Add all tasks from this stack to selectedTasks
                    stackTasks.forEach(task => {
                        this.parentWindow.selectedTasks.add(task.id);
                    });
                }
            }
        });

        groupRow.add_controller(gesture);

        // Ctrl+click for stack selection
        const leftClickGesture = new Gtk.GestureClick({
            button: 1
        });

        leftClickGesture.connect('pressed', (gesture, n_press, x, y) => {
            try {
                const event = gesture.get_current_event();
                if (!event) return false;

                const state = event.get_modifier_state();
                if (state & Gdk.ModifierType.CONTROL_MASK) {
                    // Trigger right-click behavior for stack selection
                    const rightClickEvent = new Gtk.GestureClick({ button: 3 });
                    rightClickEvent.pressed(gesture, n_press, x, y);
                    return true;
                }
                return false;
            } catch (error) {
                console.warn('Fehler beim Abrufen des Modifier-Status:', error.message);
                return false;
            }
        });

        groupRow.add_controller(leftClickGesture);
    }

    _addTaskGestures(taskRow, task) {
        const rightClickGesture = new Gtk.GestureClick({
            button: 3
        });

        rightClickGesture.connect('pressed', (gesture, n_press, x, y) => {
            gesture.set_state(Gtk.EventSequenceState.CLAIMED);
            this._toggleTaskSelection(taskRow, task);
        });

        taskRow.add_controller(rightClickGesture);

        // Ctrl+click for task selection
        const leftClickGesture = new Gtk.GestureClick({
            button: 1
        });

        leftClickGesture.connect('pressed', (gesture, n_press, x, y) => {
            try {
                const event = gesture.get_current_event();
                if (!event) return false;

                const state = event.get_modifier_state();
                if (state & Gdk.ModifierType.CONTROL_MASK) {
                    this._toggleTaskSelection(taskRow, task);
                    return true;
                }
                return false;
            } catch (error) {
                console.warn('Fehler beim Abrufen des Modifier-Status:', error.message);
                return false;
            }
        });

        taskRow.add_controller(leftClickGesture);
    }

    _toggleTaskSelection(taskRow, task) {
        if (this.parentWindow.selectedTasks) {
            if (this.parentWindow.selectedTasks.has(task.id)) {
                this.parentWindow.selectedTasks.delete(task.id);
                taskRow.remove_css_class('selected-task');
            } else {
                this.parentWindow.selectedTasks.add(task.id);
                taskRow.add_css_class('selected-task');
            }
        }
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

    // Public method to get the widget
    getWidget() {
        return this.widget;
    }

    // Public method to update group data
    updateGroup(newGroupData) {
        this.group = { ...this.group, ...newGroupData };
        // Recreate widget with new data
        this.widget = this._createStackWidget();
    }

    _formatElapsedTime(seconds) {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const remainingSeconds = seconds % 60;

        return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
    }

    // Public method to get group info
    getGroupInfo() {
        return {
            groupKey: this.group.groupKey,
            baseName: this.group.baseName,
            taskCount: this.group.tasks.length,
            totalDuration: this.group.totalDuration,
            totalCost: this.group.totalCost,
            hasActive: this.group.hasActive,
            latestTask: this.group.latestTask
        };
    }
}