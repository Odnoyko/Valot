import Gtk from 'gi://Gtk';
import Adw from 'gi://Adw';
import GObject from 'gi://GObject';
import { trackingStateManager } from 'resource:///com/odnoyko/valot/js/func/global/trackingStateManager.js';
import { InputValidator } from 'resource:///com/odnoyko/valot/js/func/global/inputValidation.js';
import { GlobalTracking } from 'resource:///com/odnoyko/valot/js/func/global/globalTracking.js';
import { SelectorFactory } from 'resource:///com/odnoyko/valot/js/interface/components/selectorFactory.js';
import { WidgetFactory } from 'resource:///com/odnoyko/valot/js/interface/components/widgetFactory.js';
import { ClientDropdown } from 'resource:///com/odnoyko/valot/js/interface/components/clientDropdown.js';
import { getProjectIconColor } from 'resource:///com/odnoyko/valot/js/func/global/colorUtils.js';

export const CompactTrackerWindow = GObject.registerClass({
    GTypeName: 'CompactTrackerWindow'
}, class CompactTrackerWindow extends Adw.Window {
    constructor(application, mainWindow) {
        super({
            application: application,
            title: 'Compact Tracker',
            default_width: 500,
            default_height: 50,
            height_request: 50,
            resizable: false,
            decorated: true
        });
        this.mainWindow = mainWindow;
        this.shiftMode = false; // Track if opened with shift key
        this._createWidgets();
        this._setupSignals();
        this._updateFromMainWindow();

    }

    setShiftMode(shiftMode) {
        this.shiftMode = shiftMode;
    }

    _createWidgets() {
        // Create WindowHandle for dragging
        const windowHandle = new Gtk.WindowHandle();

        // Main container
        const mainBox = new Gtk.Box({
            spacing: 4,
            margin_top: 2,
            margin_bottom: 2,
            margin_start: 4,
            margin_end: 4,
            valign: Gtk.Align.CENTER
        });

        // Close/Open button
        this._close_open_btn = new Gtk.Button({
            icon_name: 'go-previous-symbolic',
            css_classes: ['flat'],
            tooltip_text: 'Close compact tracker and open main window',
            width_request: 20,
            height_request: 20
        });

        // Tracking container
        const trackingBox = new Gtk.Box({
            spacing: 4,
            hexpand: true,
            margin_end: 4,
            halign: Gtk.Align.FILL,
            valign: Gtk.Align.CENTER
        });

        // Create widgets
        this._task_input = new Gtk.Entry({
            placeholder_text: 'Task name',
            width_request: 160,
            hexpand: true,
            halign: Gtk.Align.FILL,
            height_request: 24
        });

        this._project_button = new Gtk.Button({
            icon_name: 'folder-symbolic',
            css_classes: ['flat'],
            tooltip_text: 'Project',
            width_request: 20,
            height_request: 20
        });

        // Create client dropdown for compact tracker
        this._client_dropdown = new ClientDropdown(
            this.mainWindow?.allClients || [],
            this.mainWindow?.currentClientId || 1,
            (selectedClient) => {
                if (this.mainWindow) {
                    this.mainWindow.currentClientId = selectedClient.id;
                    this.mainWindow._updateClientButtonsDisplay(selectedClient.name);
                }
            }
        );

        // Get the dropdown widget
        this._client_button = this._client_dropdown.getWidget();
        this._client_button.set_tooltip_text('Select client');

        this._time_display = new Gtk.Label({
            label: '00:00:00',
            css_classes: ['title-4'],
            margin_start: 4,
            margin_end: 4
        });

        this._track_button = new Gtk.Button({
            icon_name: 'media-playback-start-symbolic',
            css_classes: ['suggested-action', 'circular'],
            tooltip_text: 'Start tracking',
            width_request: 24,
            height_request: 24
        });

        // Assemble widgets
        trackingBox.append(this._task_input);
        trackingBox.append(this._project_button);
        trackingBox.append(this._client_button);
        trackingBox.append(this._time_display);
        trackingBox.append(this._track_button);

        mainBox.append(this._close_open_btn);
        mainBox.append(trackingBox);

        windowHandle.set_child(mainBox);
        this.set_content(windowHandle);
    }

    _setupSignals() {
        // Connect close/open button
        this._close_open_btn.connect('clicked', () => {
            if (this.shiftMode) {
                // In shift mode: just hide compact tracker, keep main window visible
                this.set_visible(false);
            } else {
                // Normal mode: show main window and hide compact tracker
                if (this.application && typeof this.application.openMainApplication === 'function') {
                    this.application.openMainApplication();
                }
                if (this.mainWindow) {
                    this.mainWindow.present();
                    this.mainWindow.set_visible(true);
                }
                this.set_visible(false);
            }
        });

        // Handle window close request - close application instead of hiding
        this.connect('close-request', () => {
            // If this is the only window or main app is not visible, quit the application
            if (!this.mainWindow || !this.mainWindow.is_visible()) {
                this.application.quit();
                return false; // Allow window destruction
            } else {
                // If main window is visible, just hide compact tracker
                this.set_visible(false);
                return true; // Prevent destruction, just hide
            }
        });

        // Register track button with tracking state manager
        trackingStateManager.registerTrackingButton(this._track_button, null, this._task_input);

        // Register time display for updates
        trackingStateManager.registerTimeLabel(this._time_display);

        // Add tracking click handler
        this._track_button.connect('clicked', () => {
            GlobalTracking.handleTrackingClick({
                input: this._task_input,
                taskGroupKey: null,
                parentWindow: this.mainWindow,
                sourceComponent: this
            });
        });

        // Task input validation
        this._task_input.connect('changed', () => {
            const text = this._task_input.get_text().trim();
            if (text.length > 0) {
                const validation = InputValidator.validateTaskName(text);
                if (!validation.isValid) {
                    InputValidator.showValidationTooltip(this._task_input, validation.error, true);
                } else {
                    InputValidator.showValidationTooltip(this._task_input, null, false);
                }
            } else {
                InputValidator.showValidationTooltip(this._task_input, null, false);
            }
        });

        // Add Enter key support
        this._task_input.connect('activate', () => {
            this._track_button.emit('clicked');
        });

        // Project button click - use same method as main window
        this._project_button.connect('clicked', () => {
            if (this.mainWindow && this.mainWindow._showProjectSelector) {
                this.mainWindow._showProjectSelector(this._project_button);
            }
        });

        // Client dropdown is handled automatically by the ClientDropdown class
    }


    _updateFromMainWindow() {
        // Update from main window state if available
        if (this.mainWindow) {
            // Update task name if there's current tracking
            const currentTracking = trackingStateManager.getCurrentTracking();
            if (currentTracking) {
                this._task_input.set_text(currentTracking.name);
            }

            // Update track button icon based on current tracking state
            this._updateTrackingButtonState();

            // Update project button - always update to get latest project selection
            this._updateProjectButton();

            // Update client dropdown
            if (this._client_dropdown && this.mainWindow?.allClients) {
                this._client_dropdown.updateClients(this.mainWindow.allClients, this.mainWindow.currentClientId);
            }
        }
    }

    /**
     * Update the tracking button icon based on current tracking state
     */
    _updateTrackingButtonState() {
        if (!this._track_button) {
            return;
        }

        const currentTracking = trackingStateManager.getCurrentTracking();
        if (currentTracking) {
            // Something is currently being tracked - show stop icon
            this._track_button.set_icon_name('media-playback-stop-symbolic');
            this._track_button.set_tooltip_text('Stop tracking');
        } else {
            // Nothing is being tracked - show start icon
            this._track_button.set_icon_name('media-playback-start-symbolic');
            this._track_button.set_tooltip_text('Start tracking');
        }
    }

    _updateProjectButton() {
        
        if (!this.mainWindow || !this.mainWindow.allProjects) {
            return;
        }
        
        const currentProject = this.mainWindow.allProjects.find(p => p.id === this.mainWindow.currentProjectId);
        if (currentProject) {
            // Update tooltip
            this._project_button.set_tooltip_text(`Project: ${currentProject.name}`);
            
            // Create icon widget (handle both emoji and system icons) - same as HeaderTrackingWidget
            let iconWidget;
            if (currentProject.icon && currentProject.icon.startsWith('emoji:')) {
                const emoji = currentProject.icon.substring(6);
                iconWidget = new Gtk.Label({
                    label: emoji,
                    css_classes: ['emoji-icon'],
                    halign: Gtk.Align.CENTER,
                    valign: Gtk.Align.CENTER
                });
            } else {
                iconWidget = new Gtk.Image({
                    icon_name: currentProject.icon || 'folder-symbolic',
                    pixel_size: 12 // Smaller for compact tracker
                });
            }
            
            // Apply background color and icon color - same logic as HeaderTrackingWidget
            const iconColor = getProjectIconColor(currentProject);
            const provider = new Gtk.CssProvider();
            provider.load_from_string(
                `button { 
                    background-color: ${currentProject.color}; 
                    border-radius: 6px; 
                    color: ${iconColor}; 
                }
                button:hover {
                    filter: brightness(1.1);
                }
                .emoji-icon {
                    font-size: 10px;
                }`
            );
            this._project_button.get_style_context().add_provider(provider, Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION);
            
            // Set the icon widget as child
            this._project_button.set_child(iconWidget);
            
        } else {
            // Reset to default
            this._project_button.set_tooltip_text('Project');
            const defaultIcon = new Gtk.Image({
                icon_name: 'folder-symbolic',
                pixel_size: 12
            });
            this._project_button.set_child(defaultIcon);
            
            // Remove custom styling
            const provider = new Gtk.CssProvider();
            provider.load_from_string('button { background-color: transparent; }');
            this._project_button.get_style_context().add_provider(provider, Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION);
        }
    }

    // Client button update is handled by ClientDropdown component

    _getCurrencySymbol(currency) {
        return WidgetFactory.getCurrencySymbol(currency);
    }

    _showEnhancedProjectSelector() {
        // Get projects from the projects page component
        const projectsPage = this.mainWindow?.pageComponents?.projects;
        if (!projectsPage || !projectsPage.projects) {
            console.error('No projects available for selection');
            return;
        }

        const dialog = SelectorFactory.createProjectSelector(
            projectsPage.projects,
            this.mainWindow.currentProjectId || 1,
            (project) => {
                this.mainWindow.currentProjectId = project.id;
                this._updateProjectButton();
                if (this.mainWindow._updateProjectButtonsDisplay) {
                    this.mainWindow._updateProjectButtonsDisplay(project.name);
                }
            }
        );

        dialog.present(this);
    }

    _showEnhancedClientSelector() {
        // Get clients from the clients page component
        const clientsPage = this.mainWindow?.pageComponents?.clients;
        if (!clientsPage || !clientsPage.clients) {
            console.error('No clients available for selection');
            return;
        }

        const dialog = SelectorFactory.createClientSelector(
            clientsPage.clients,
            this.mainWindow.currentClientId || 1,
            (client) => {
                this.mainWindow.currentClientId = client.id;
                this._updateClientButton();
                if (this.mainWindow._updateClientButtonsDisplay) {
                    this.mainWindow._updateClientButtonsDisplay(client.name);
                }
            }
        );

        dialog.present(this);
    }


    _formatDuration(seconds) {
        if (this.mainWindow && typeof this.mainWindow._formatDuration === 'function') {
            return this.mainWindow._formatDuration(seconds);
        }
        // Fallback formatting
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;
        return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }

    /**
     * Synchronize with main window state - called by main window when state changes
     */
    syncWithMainWindow() {
        this._updateFromMainWindow();
    }

    /**
     * Update task input silently to avoid triggering sync loops
     */
    setTaskTextSilent(text) {
        // Temporarily disconnect any change handlers to avoid loops
        this._task_input.set_text(text);
    }

    /**
     * Get current task text
     */
    getTaskText() {
        return this._task_input.get_text();
    }

});