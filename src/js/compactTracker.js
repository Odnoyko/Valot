import Gtk from 'gi://Gtk';
import Adw from 'gi://Adw';
import GObject from 'gi://GObject';
import { trackingStateManager } from 'resource:///com/odnoyko/valot/js/global/trackingStateManager.js';
import { InputValidator } from 'resource:///com/odnoyko/valot/js/global/inputValidation.js';

export const CompactTrackerWindow = GObject.registerClass({
    GTypeName: 'CompactTrackerWindow',
    Template: 'resource:///com/odnoyko/valot/ui/compact-tracker.ui',
    InternalChildren: [
        'task_input',
        'time_display',
        'track_button',
        'project_button',
        'client_button'
    ],
}, class CompactTrackerWindow extends Adw.Window {
    constructor(application, mainWindow) {
        super({
            application: application,
            title: 'Compact Tracker',
            width_request: 350,
            height_request: 100,
            resizable: false
        });

        this.mainWindow = mainWindow;
        this._setupWindow();
        this._setupTracking();
        this._connectSignals();
        this._updateFromMainWindow();
    }

    _setupWindow() {
        // Basic window setup only
        console.log('Compact tracker window setup complete');
    }

    _setupTracking() {
        // Create main container
        const mainBox = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 8,
            margin_top: 12,
            margin_bottom: 12,
            margin_start: 12,
            margin_end: 12
        });

        // Top row with task input and track button
        const topRow = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 8,
            hexpand: true
        });

        // Task input
        this._task_input = new Gtk.Entry({
            placeholder_text: 'Enter task name...',
            hexpand: true
        });

        // Track button
        this._track_button = new Gtk.Button({
            icon_name: 'media-playback-start-symbolic',
            css_classes: ['suggested-action']
        });

        // Time display
        this._time_display = new Gtk.Label({
            label: '00:00:00',
            css_classes: ['title-2', 'monospace'],
            halign: Gtk.Align.CENTER
        });

        topRow.append(this._task_input);
        topRow.append(this._track_button);

        // Bottom row with context buttons and main app button
        const bottomRow = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 8,
            halign: Gtk.Align.CENTER
        });

        // Project button
        this._project_button = new Gtk.Button({
            label: 'Default',
            css_classes: ['flat']
        });

        // Client button  
        this._client_button = new Gtk.Button({
            label: 'Default Client',
            css_classes: ['flat']
        });

        // Open main app button
        this._open_main_button = new Gtk.Button({
            icon_name: 'view-restore-symbolic',
            css_classes: ['flat'],
            tooltip_text: 'Open main application'
        });

        bottomRow.append(this._project_button);
        bottomRow.append(new Gtk.Separator({ orientation: Gtk.Orientation.VERTICAL }));
        bottomRow.append(this._client_button);
        bottomRow.append(new Gtk.Separator({ orientation: Gtk.Orientation.VERTICAL }));
        bottomRow.append(this._open_main_button);

        mainBox.append(topRow);
        mainBox.append(this._time_display);
        mainBox.append(bottomRow);

        this.set_content(mainBox);
    }

    _connectSignals() {
        // Register track button with tracking state manager
        trackingStateManager.registerTrackingButton(this._track_button, null, this._task_input);

        // Track button click
        this._track_button.connect('clicked', () => {
            this._handleTrackButtonClick();
        });

        // Enter key in task input
        this._task_input.connect('activate', () => {
            this._track_button.emit('clicked');
        });

        // Real-time validation
        this._task_input.connect('changed', () => {
            const text = this._task_input.get_text().trim();
            if (text.length > 0) {
                const validation = InputValidator.validateTaskName(text);
                if (!validation.valid) {
                    InputValidator.showValidationTooltip(this._task_input, validation.error, true);
                } else {
                    InputValidator.showValidationTooltip(this._task_input, null, false);
                }
            } else {
                InputValidator.showValidationTooltip(this._task_input, null, false);
            }
        });

        // Context buttons
        this._project_button.connect('clicked', () => {
            this._showProjectSelector();
        });

        this._client_button.connect('clicked', () => {
            this._showClientSelector();
        });

        // Open main application button
        this._open_main_button.connect('clicked', () => {
            if (this.application && typeof this.application.openMainApplication === 'function') {
                this.application.openMainApplication();
            }
        });

        // Register time display for updates
        trackingStateManager.registerTimeLabel(this._time_display);

        // Subscribe to tracking state changes
        trackingStateManager.subscribe((event, taskInfo) => {
            if (event === 'start' && taskInfo) {
                this._task_input.set_text(taskInfo.name);
            }
        });

        console.log('Compact tracker signals connected');
    }

    _updateFromMainWindow() {
        if (!this.mainWindow) return;

        // Update project button
        try {
            const currentProject = this.mainWindow.getCurrentProject();
            if (currentProject) {
                this._project_button.set_label(currentProject.name);
            }
        } catch (error) {
            console.warn('Could not get current project:', error);
        }

        // Update client button
        try {
            const currentClient = this.mainWindow.getCurrentClient();
            if (currentClient) {
                this._client_button.set_label(currentClient.name);
            }
        } catch (error) {
            console.warn('Could not get current client:', error);
        }

        // Update task input if something is currently tracking
        const currentTracking = trackingStateManager.getCurrentTracking();
        if (currentTracking) {
            this._task_input.set_text(currentTracking.name);
        }
    }

    _handleTrackButtonClick() {
        const currentTracking = trackingStateManager.getCurrentTracking();
        
        if (currentTracking) {
            // Stop current tracking
            if (this.mainWindow && typeof this.mainWindow._stopCurrentTracking === 'function') {
                this.mainWindow._stopCurrentTracking();
            } else {
                trackingStateManager.stopTracking();
            }
        } else {
            // Start tracking
            const taskName = this._task_input.get_text().trim();
            if (taskName.length === 0) return;

            // Validate task name
            const validation = InputValidator.validateTaskName(taskName);
            if (!validation.valid) {
                InputValidator.showValidationTooltip(this._task_input, validation.error, true);
                return;
            }

            // Use main window's tracking functionality if available
            if (this.mainWindow && typeof this.mainWindow._startTrackingFromCompact === 'function') {
                this.mainWindow._startTrackingFromCompact(validation.sanitized);
            } else {
                // Fallback: trigger main window's track button
                console.log('Starting tracking from compact tracker:', validation.sanitized);
                this._task_input.set_text(validation.sanitized);
                
                // Simulate main window tracking
                if (this.mainWindow && this.mainWindow._track_button) {
                    // Set the main window's task input
                    if (this.mainWindow._task_name) {
                        this.mainWindow._task_name.set_text(validation.sanitized);
                    }
                    // Trigger the main track button
                    this.mainWindow._track_button.emit('clicked');
                }
            }
        }
    }

    _showProjectSelector() {
        if (!this.mainWindow) return;

        const dialog = new Adw.AlertDialog({
            heading: 'Select Project',
            body: 'Choose a project for tracking'
        });

        const scrolled = new Gtk.ScrolledWindow({
            max_content_height: 300,
            propagate_natural_height: true
        });

        const listBox = new Gtk.ListBox({
            css_classes: ['boxed-list']
        });

        // Add projects to list
        if (this.mainWindow.allProjects) {
            this.mainWindow.allProjects.forEach(project => {
                const row = new Adw.ActionRow({
                    title: project.name,
                    activatable: true
                });

                // Add project icon/color indicator
                const colorBox = new Gtk.Box({
                    width_request: 16,
                    height_request: 16,
                    css_classes: ['project-color-indicator']
                });
                colorBox.get_style_context().add_provider(
                    new Gtk.CssProvider(),
                    Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION
                );
                
                row.add_prefix(colorBox);
                listBox.append(row);

                row.connect('activated', () => {
                    // Update main window project context
                    this.mainWindow.currentProjectId = project.id;
                    this._project_button.set_label(project.name);
                    this.mainWindow._updateProjectButtonsDisplay(project.name);
                    dialog.close();
                });
            });
        }

        scrolled.set_child(listBox);
        dialog.set_extra_child(scrolled);
        dialog.add_response('cancel', 'Cancel');

        dialog.present(this);
    }

    _showClientSelector() {
        if (!this.mainWindow) return;

        const dialog = new Adw.AlertDialog({
            heading: 'Select Client',
            body: 'Choose a client for tracking'
        });

        const scrolled = new Gtk.ScrolledWindow({
            max_content_height: 300,
            propagate_natural_height: true
        });

        const listBox = new Gtk.ListBox({
            css_classes: ['boxed-list']
        });

        // Add clients to list
        if (this.mainWindow.allClients) {
            this.mainWindow.allClients.forEach(client => {
                const row = new Adw.ActionRow({
                    title: client.name,
                    subtitle: client.email || `€${client.rate}/hour`,
                    activatable: true
                });

                listBox.append(row);

                row.connect('activated', () => {
                    // Update main window client context
                    this.mainWindow.currentClientId = client.id;
                    this._client_button.set_label(client.name);
                    this.mainWindow._updateClientButtonsDisplay(client.name);
                    dialog.close();
                });
            });
        }

        scrolled.set_child(listBox);
        dialog.set_extra_child(scrolled);
        dialog.add_response('cancel', 'Cancel');

        dialog.present(this);
    }

    // Method to be called when main window context changes
    updateContext() {
        this._updateFromMainWindow();
    }
});