import Gtk from 'gi://Gtk';
import { Button } from '../primitive/Button.js';
import { Entry } from '../primitive/Entry.js';
import { Label } from '../primitive/Label.js';
// TODO: Restore when migrated
// import { InputValidator } from '../../../func/global/inputValidation.js';
// import { trackingStateManager } from '../../../func/global/trackingStateManager.js';
import { ValidationUtils } from 'resource:///com/odnoyko/valot/ui/utils/CoreImports.js';

/**
 * Complex component for time tracking with task entry, project/client selection, and timer
 */
export class TrackingWidget {
    constructor(config = {}) {
        const defaultConfig = {
            taskPlaceholder: 'Task name',
            showTimeDisplay: true,
            showProjectButton: true,
            showClientButton: true,
            onTaskChanged: null,
            onProjectClick: null,
            onClientClick: null,
            onTrackClick: null,
            selectedProject: null,
            selectedClient: null,
            currentTime: '00:00:00',
            isTracking: false,
            page: 'default',
            // Manager references
            projectManager: null,
            clientManager: null,
            taskManager: null,
            parentWindow: null
        };

        this.config = { ...defaultConfig, ...config };
        this.widget = this._createWidget();
        this._createChildren();
        this._layoutChildren();
        this._connectEvents();
        this._setupTimeTracking();
        this.isInitialized = true;
    }

    _createWidget() {
        const container = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 8,
            hexpand: true
        });

        return container;
    }

    _createChildren() {
        // Task name entry
        this.taskEntry = new Entry({
            placeholderText: this.config.taskPlaceholder,
            hexpand: true,
            validator: InputValidator.validateTaskName,
            realTimeValidation: true,
            onChanged: (text) => {
                if (this.config.onTaskChanged) {
                    this.config.onTaskChanged(text, this);
                }
            }
        });

        // Project button
        if (this.config.showProjectButton) {
            this.projectButton = new Button({
                iconName: 'folder-symbolic',
                cssClasses: ['flat', 'tracking-widget-project-button'],
                tooltipText: _('Select Project'),
                widthRequest: 36,
                heightRequest: 36,
                onClick: () => {
                    if (this.config.onProjectClick) {
                        this.config.onProjectClick(this);
                    }
                }
            });
        }

        // Client button
        if (this.config.showClientButton) {
            this.clientButton = new Button({
                iconName: 'contact-new-symbolic',
                cssClasses: ['flat'],
                tooltipText: _('Select Client'),
                widthRequest: 36,
                heightRequest: 36,
                onClick: () => {
                    if (this.config.onClientClick) {
                        this.config.onClientClick(this);
                    }
                }
            });
        }

        // Time display
        if (this.config.showTimeDisplay) {
            this.timeLabel = Label.createTimeLabel(this.config.currentTime);
        }

        // Track button
        this.trackButton = new Button({
            iconName: this.config.isTracking ? 'media-playback-stop-symbolic' : 'media-playback-start-symbolic',
            cssClasses: ['circular'],
            tooltipText: this.config.isTracking ? _('Stop tracking') : _('Start tracking'),
            widthRequest: 40,
            heightRequest: 40,
            onClick: () => {
                if (this.config.onTrackClick) {
                    this.config.onTrackClick(this);
                }
            }
        });
    }

    _layoutChildren() {
        this.widget.append(this.taskEntry.widget);

        if (this.config.showProjectButton) {
            this.widget.append(this.projectButton.widget);
        }

        if (this.config.showClientButton) {
            this.widget.append(this.clientButton.widget);
        }

        if (this.config.showTimeDisplay) {
            this.widget.append(this.timeLabel.widget);
        }

        this.widget.append(this.trackButton.widget);
    }

    _connectEvents() {
        // Events are handled directly through component callbacks
    }

    /**
     * Setup time tracking integration using the existing timeTrack function
     */
    _setupTimeTracking() {
        // Use the same logic as task track buttons - much simpler!
        this.trackButton.widget.connect('clicked', () => {

            const taskName = this.taskEntry.getText().trim();
            if (!taskName) {
                return;
            }

            // Create group key like task buttons do
            const taskBaseName = taskName.match(/^(.+?)\s*(?:\(\d+\))?$/);
            const baseName = taskBaseName ? taskBaseName[1].trim() : taskName;
            const projectName = this.config.parentWindow?.getCurrentProjectName?.() || 'Default';
            const clientName = this.config.parentWindow?.getCurrentClient?.()?.name || 'Default Client';
            const taskGroupKey = `${baseName}::${projectName}::${clientName}`;


            // Use same logic as task buttons
            const isCurrentlyThisTaskTracking = trackingStateManager.isTaskTracking(taskGroupKey);

            if (isCurrentlyThisTaskTracking) {
                this.config.parentWindow?._stopCurrentTracking?.();
            } else {
                // Create a task object like the existing tasks
                const taskObj = {
                    name: taskName,
                    project: projectName,
                    client: clientName,
                    project_id: this.config.parentWindow?.currentProjectId || 1,
                    client_id: this.config.parentWindow?.currentClientId || 1
                };
                this.config.parentWindow?._startTrackingFromTask?.(taskObj);
            }
        });

        // Register button with tracking state manager like task buttons do
        if (this.config.parentWindow?.trackingStateManager) {
            this.config.parentWindow.trackingStateManager.registerTrackingButton(this.trackButton, null, this.taskEntry.widget);
            if (this.timeLabel) {
                this.config.parentWindow.trackingStateManager.registerTimeLabel(this.timeLabel.widget, null);
            }
        }

    }

    /**
     * Get current task text
     */
    getTaskText() {
        return this.taskEntry ? this.taskEntry.getText() : '';
    }

    /**
     * Set task text
     */
    setTaskText(text) {
        if (this.taskEntry) {
            this.taskEntry.setText(text);
        }
    }

    /**
     * Set task text without triggering onChange events (for synchronization)
     */
    setTaskTextSilent(text) {
        if (this.taskEntry) {
            this.taskEntry.setText(text, true); // preserveCursor = true
        }
    }

    /**
     * Get validated task text
     */
    getValidatedTaskText() {
        return this.taskEntry ? this.taskEntry.getValidatedText() : null;
    }

    /**
     * Check if task input is valid
     */
    isTaskValid() {
        return this.taskEntry ? this.taskEntry.isValid() : false;
    }

    /**
     * Set selected project
     */
    setSelectedProject(project) {
        this.config.selectedProject = project;

        if (this.projectButton && project) {
            this.projectButton.setTooltip(_('Project: %s').format(project.name));
            // Could also update button color/icon based on project
        }
    }

    /**
     * Set selected client
     */
    setSelectedClient(client) {
        this.config.selectedClient = client;

        if (this.clientButton && client) {
            this.clientButton.setTooltip(_('Client: %s').format(client.name));
        }
    }

    /**
     * Update time display
     */
    setTime(timeString) {
        this.config.currentTime = timeString;
        if (this.timeLabel) {
            this.timeLabel.setText(timeString);
        }
    }

    /**
     * Set tracking state
     */
    setTracking(isTracking) {
        this.config.isTracking = isTracking;

        if (this.trackButton) {
            this.trackButton.setIcon(
                isTracking ? 'media-playback-stop-symbolic' : 'media-playback-start-symbolic'
            );
            this.trackButton.setTooltip(isTracking ? _('Stop tracking') : _('Start tracking'));
        }

        // State change handled through direct callbacks
    }

    /**
     * Focus the task entry
     */
    focus() {
        if (this.taskEntry) {
            this.taskEntry.focus();
        }
    }

    /**
     * Clear the task entry
     */
    clearTask() {
        if (this.taskEntry) {
            this.taskEntry.clear();
        }
    }

    /**
     * Get current tracking data
     */
    getTrackingData() {
        return {
            task: this.getValidatedTaskText(),
            project: this.config.selectedProject,
            client: this.config.selectedClient,
            isValid: this.isTaskValid() && this.config.selectedProject
        };
    }

    /**
     * Reset widget to initial state
     */
    reset() {
        this.clearTask();
        this.setSelectedProject(null);
        this.setSelectedClient(null);
        this.setTime('00:00:00');
        this.setTracking(false);
    }

    /**
     * Get raw GTK widgets for direct integration
     */
    getRawWidgets() {
        return {
            trackButton: this.trackButton ? this.trackButton.widget : null,
            taskEntry: this.taskEntry ? this.taskEntry.widget : null,
            timeLabel: this.timeLabel ? this.timeLabel.widget : null,
            projectButton: this.projectButton ? this.projectButton.widget : null,
            clientButton: this.clientButton ? this.clientButton.widget : null
        };
    }

    /**
     * Get the main container widget
     */
    getWidget() {
        return this.widget;
    }

    /**
     * Create a static TrackingWidget for simple integration
     */
    static createSimple(config = {}) {
        return new TrackingWidget({
            showProjectButton: false,
            showClientButton: false,
            ...config
        });
    }

    /**
     * Create a TrackingWidget with all features for main pages
     */
    static createFull(config = {}) {
        return new TrackingWidget({
            showProjectButton: true,
            showClientButton: true,
            showTimeDisplay: true,
            ...config
        });
    }
}