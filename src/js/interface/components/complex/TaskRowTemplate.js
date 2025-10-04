import Gtk from 'gi://Gtk';
import Gdk from 'gi://Gdk';
import Adw from 'gi://Adw';
import { InputValidator } from 'resource:///com/odnoyko/valot/js/func/global/inputValidation.js';
import { trackingStateManager } from 'resource:///com/odnoyko/valot/js/func/global/trackingStateManager.js';
import { GlobalTracking } from 'resource:///com/odnoyko/valot/js/func/global/globalTracking.js';
import { WidgetFactory } from 'resource:///com/odnoyko/valot/js/interface/components/widgetFactory.js';

/**
 * Template component for individual task rows
 */
export class TaskRowTemplate {
    constructor(task, timeUtils, allProjects, parentWindow, enableSelection = true) {
        this.task = task;
        this.timeUtils = timeUtils;
        this.allProjects = allProjects;
        this.parentWindow = parentWindow;
        this.enableSelection = enableSelection;
        this.widget = this._createTaskWidget();
    }

    _createTaskWidget() {
        // Calculate cost
        const cost = (this.task.duration / 3600) * (this.task.client_rate || 0);
        const currency = this.task.client_currency || 'EUR';
        const currencySymbol = WidgetFactory.getCurrencySymbol(currency);
        const costText = cost > 0 ? ` • ${currencySymbol}${cost.toFixed(2)}` : '';

        // Find project color
        const projectsArray = this.parentWindow.allProjects || this.allProjects || [];
        const project = projectsArray.find(p => p.id === this.task.project_id);
        
        // Create subtitle with colored dot
        const projectName = this.task.project || this.task.project_name || 'Unbekanntes Projekt';
        const clientName = this.task.client || this.task.client_name || 'Standard-Kunde';
        const dotColor = this.task.project_color || (project ? project.color : '#9a9996');

        // Create task group key for tracking
        const taskBaseName = this.task.name.match(/^(.+?)\s*(?:\(\d+\))?$/);
        const baseName = taskBaseName ? taskBaseName[1].trim() : this.task.name;
        this.taskGroupKey = `${baseName}::${projectName}::${clientName}`;

        const isCurrentlyTracking = trackingStateManager.isTaskTracking(this.taskGroupKey);
        const subtitle = isCurrentlyTracking
            ? `<span foreground="${dotColor}">●</span> ${projectName} • ${clientName} • <b>Zurzeit Tracking</b> • ${this.timeUtils.formatDate(this.task.start)}`
            : `<span foreground="${dotColor}">●</span> ${projectName} • ${clientName} • ${this.timeUtils.formatDate(this.task.start)}`;

        // Create main row
        const row = new Adw.ActionRow({
            title: InputValidator.escapeForGTKMarkup(this.task.name),
            subtitle: subtitle,
            use_markup: true,
            css_classes: ['bright-subtitle']
        });

        // Apply tracking state styling
        this._applyTrackingState(row);

        // Apply selection styling
        this._applySelectionState(row);

        // Create and add suffix box
        const suffixBox = this._createSuffixBox(cost);
        row.add_suffix(suffixBox);

        // Add gestures for interaction
        this._addGestures(row);

        return row;
    }

    _applyTrackingState(row) {
        const isCurrentlyTracking = trackingStateManager.isTaskTracking(this.taskGroupKey);

        if (isCurrentlyTracking) {
            row.add_css_class('tracking-active');
        }
    }

    _applySelectionState(row) {
        if (this.parentWindow.selectedTasks && this.parentWindow.selectedTasks.has(this.task.id)) {
            row.add_css_class('selected-task');
        }
    }

    _createSuffixBox(cost) {
        let timeText = '';
        let moneyText = '';

        // Check tracking state
        const isCurrentlyTracking = trackingStateManager.isTaskTracking(this.taskGroupKey);

        // Prepare time text (without money info)
        if (isCurrentlyTracking) {
            // Show live time with dot indicator for active tracking
            timeText = '● Tracked';
        } else if (this.task.duration > 0) {
            timeText = this.timeUtils.formatDuration(this.task.duration);
        }

        // Prepare separate money text
        if (cost > 0) {
            const currency = this.task.client_currency || 'EUR';
            const currencySymbol = WidgetFactory.getCurrencySymbol(currency);
            moneyText = `${currencySymbol}${cost.toFixed(2)}`;
        }

        const { suffixBox, timeLabel, moneyLabel } = WidgetFactory.createTaskSuffixBox({
            timeText: timeText,
            moneyText: moneyText,
            showEditButton: true,
            showTrackButton: true,
            showCostTracking: this.parentWindow.showCostTracking !== false, // Default to true unless explicitly disabled
            onEditClick: () => this.parentWindow._editTask(this.task.id),
            onTrackClick: async () => await GlobalTracking.handleTaskTracking(this.task, this.parentWindow)
        });

        // Store references for real-time updates
        this.timeLabel = timeLabel;
        this.moneyLabel = moneyLabel;

        // Register money label with client info for real-time earnings calculation
        if (this.moneyLabel && this.task.client_rate > 0) {
            const clientInfo = {
                rate: this.task.client_rate || 0,
                currency: this.task.client_currency || 'EUR'
            };
            trackingStateManager.registerMoneyLabel(this.moneyLabel, this.taskGroupKey, clientInfo);
        }

        // Register time and money labels and buttons with tracking state manager
        this._registerWithTrackingManager(suffixBox);

        return suffixBox;
    }

    _registerWithTrackingManager(suffixBox) {
        // Find and register time labels
        const timeLabels = this._findTimeLabelsInSuffixBox(suffixBox);
        timeLabels.forEach(timeLabel => {
            const isCurrentlyTracking = trackingStateManager.isTaskTracking(this.taskGroupKey);

            // Always register time label for updates (do this once)
            trackingStateManager.registerTimeLabel(timeLabel, this.taskGroupKey);

            if (isCurrentlyTracking) {
                timeLabel.set_css_classes(['caption']);
                // Don't manually update time - let trackingStateManager handle all real-time updates
            }
        });

        // Find and register track buttons
        const trackButtons = this._findTrackButtonsInSuffixBox(suffixBox);
        trackButtons.forEach(trackBtn => {
            trackingStateManager.registerStackButton(trackBtn, this.taskGroupKey);

            const isCurrentlyTaskTracking = trackingStateManager.isTaskTracking(this.taskGroupKey);
            if (isCurrentlyTaskTracking) {
                trackBtn.set_icon_name('media-playback-pause-symbolic');
                trackBtn.set_tooltip_text('Tracking pausieren');
            } else {
                trackBtn.set_icon_name('media-playback-start-symbolic');
                trackBtn.set_tooltip_text('Tracking starten');
            }
        });
    }

    _handleTaskTrackClick() {
        const isCurrentlyThisTaskTracking = trackingStateManager.isTaskTracking(this.taskGroupKey);

        if (isCurrentlyThisTaskTracking) {
            this.parentWindow._stopCurrentTracking();
        } else {
            this.parentWindow._startTrackingFromTask(this.task);
        }
    }

    _addGestures(row) {
        // Only add selection gestures if enabled
        if (this.enableSelection) {
            // Right-click gesture for task selection
            const rightClickGesture = new Gtk.GestureClick({
                button: 3
            });

            rightClickGesture.connect('pressed', (gesture, n_press, x, y) => {
                gesture.set_state(Gtk.EventSequenceState.CLAIMED);
                this._toggleTaskSelection(row);
            });

            row.add_controller(rightClickGesture);

            // Ctrl+click gesture for task selection
            const leftClickGesture = new Gtk.GestureClick({
                button: 1
            });

            leftClickGesture.connect('pressed', (gesture, n_press, x, y) => {
                try {
                    const event = gesture.get_current_event();
                    if (!event) return false;

                    const state = event.get_modifier_state();
                    if (state & Gdk.ModifierType.CONTROL_MASK) {
                        this._toggleTaskSelection(row);
                        return true;
                    }
                    return false;
                } catch (error) {
                    return false;
                }
            });

            row.add_controller(leftClickGesture);

            // Store mapping for task management
            if (this.parentWindow.taskRowMap) {
                this.parentWindow.taskRowMap.set(row, this.task.id);
            }
        }
    }

    _toggleTaskSelection(row) {
        if (this.parentWindow.selectedTasks) {
            if (this.parentWindow.selectedTasks.has(this.task.id)) {
                this.parentWindow.selectedTasks.delete(this.task.id);
                row.remove_css_class('selected-task');
            } else {
                this.parentWindow.selectedTasks.add(this.task.id);
                row.add_css_class('selected-task');
            }

            // Check if this task belongs to a stack and update stack selection
            this._updateStackSelectionState();

            // Notify parent window that selection changed
            if (this.parentWindow._updateSelectionUI) {
                this.parentWindow._updateSelectionUI();
            }
        }
    }

    _updateStackSelectionState() {
        if (!this.parentWindow.selectedStacks || !this.parentWindow.allTasks) return;

        // Find the stack this task belongs to
        const taskBaseName = this.task.name.match(/^(.+?)\s*(?:\(\d+\))?$/);
        const baseName = taskBaseName ? taskBaseName[1].trim() : this.task.name;
        const projectName = this.task.project || this.task.project_name || 'Unbekanntes Projekt';
        const clientName = this.task.client || this.task.client_name || 'Standard-Kunde';
        const stackKey = `${baseName}::${projectName}::${clientName}`;

        // Find all tasks in this stack
        const stackTasks = this.parentWindow.allTasks.filter(task => {
            const taskBaseName = task.name.match(/^(.+?)\s*(?:\(\d+\))?$/);
            const baseNameToCheck = taskBaseName ? taskBaseName[1].trim() : task.name;
            const taskGroupKey = `${baseNameToCheck}::${task.project || task.project_name}::${task.client || task.client_name}`;
            return taskGroupKey === stackKey;
        });

        // Only consider it a stack if there are multiple tasks
        if (stackTasks.length > 1) {
            // Check if ALL tasks in the stack are selected
            const allTasksSelected = stackTasks.every(task => this.parentWindow.selectedTasks.has(task.id));

            if (allTasksSelected) {
                // Add stack to selectedStacks
                this.parentWindow.selectedStacks.add(stackKey);

                // Find and highlight the stack row
                if (this.parentWindow.stackRowMap) {
                    for (let [row, key] of this.parentWindow.stackRowMap.entries()) {
                        if (key === stackKey) {
                            row.add_css_class('selected-task');
                            break;
                        }
                    }
                }
            } else {
                // Remove stack from selectedStacks
                this.parentWindow.selectedStacks.delete(stackKey);

                // Find and un-highlight the stack row
                if (this.parentWindow.stackRowMap) {
                    for (let [row, key] of this.parentWindow.stackRowMap.entries()) {
                        if (key === stackKey) {
                            row.remove_css_class('selected-task');
                            break;
                        }
                    }
                }
            }
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

    _formatElapsedTime(seconds) {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const remainingSeconds = seconds % 60;

        return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
    }

    // Public method to get the widget
    getWidget() {
        return this.widget;
    }

    // Public method to update task data
    updateTask(newTaskData) {
        this.task = { ...this.task, ...newTaskData };
        // Recreate widget with new data
        this.widget = this._createTaskWidget();
    }
}