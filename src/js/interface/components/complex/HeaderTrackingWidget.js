import Gtk from 'gi://Gtk';
import { trackingStateManager } from '../../../func/global/trackingStateManager.js';
import { InputValidator } from '../../../func/global/inputValidation.js';
import { GlobalTracking } from '../../../func/global/globalTracking.js';
import { Button } from '../primitive/Button.js';
import { getProjectIconColor } from '../../../func/global/colorUtils.js';
import { ClientDropdown } from '../clientDropdown.js';

/**
 * Unified header tracking widget that can be shared across all pages
 */
export class HeaderTrackingWidget {
    constructor(parentWindow, isMaster = false) {
        this.parentWindow = parentWindow;
        this.isMaster = isMaster;
        this.widget = this._createWidget();
        this._setupTracking();
    }

    _createWidget() {
        // Create main tracking container
        const trackingBox = new Gtk.Box({
            spacing: 8,
            hexpand: true,
            hexpand_set: true
        });

        // Task name entry
        this.taskEntry = new Gtk.Entry({
            placeholder_text: 'Task name',
            hexpand: true,
            hexpand_set: true
        });

        // Project button - same implementation as ProjectsPage
        this.projectButton = new Gtk.Button({
            width_request: 36,
            height_request: 36,
            halign: Gtk.Align.CENTER,
            valign: Gtk.Align.CENTER,
            css_classes: ['flat', 'header-tracking-project-button'],
            tooltip_text: 'Project'
        });

        // Create default icon
        this.projectIcon = new Gtk.Image({
            icon_name: 'folder-symbolic',
            pixel_size: 16
        });
        this.projectButton.set_child(this.projectIcon);

        // Connect click handler
        this.projectButton.connect('clicked', () => {
            if (this.parentWindow && this.parentWindow._showProjectSelector) {
                this.parentWindow._showProjectSelector(this.projectButton);
            }
        });

        // Client dropdown
        this.clientDropdown = new ClientDropdown(
            this.parentWindow?.allClients || [],
            this.parentWindow?.currentClientId || 1,
            (selectedClient) => {
                if (this.parentWindow) {
                    this.parentWindow.currentClientId = selectedClient.id;
                    if (this.parentWindow._updateClientButtonsDisplay) {
                        this.parentWindow._updateClientButtonsDisplay(selectedClient.name);
                    }
                }
            }
        );
        
        this.clientButton = this.clientDropdown.getWidget();

        // Time display
        this.timeLabel = new Gtk.Label({
            label: '00:00:00',
            css_classes: ['title-4'],
            margin_start: 8
        });

        // Track button
        this.trackButton = new Gtk.Button({
            icon_name: 'media-playback-start-symbolic',
            css_classes: ['suggested-action', 'circular'],
            tooltip_text: 'Start tracking'
        });

        // Assemble widgets
        trackingBox.append(this.taskEntry);
        trackingBox.append(this.projectButton); // Regular Gtk.Button
        trackingBox.append(this.clientButton);
        trackingBox.append(this.timeLabel);
        trackingBox.append(this.trackButton);

        return trackingBox;
    }

    _setupTracking() {
        // All widgets register directly with tracking state manager (no master/non-master)
        // Setting up HeaderTrackingWidget
        trackingStateManager.registerTrackingButton(this.trackButton, null, this.taskEntry);
        trackingStateManager.registerTimeLabel(this.timeLabel);
        
        // Direct tracking control - no delegation
        this.trackButton.connect('clicked', () => {
            this._handleDirectTracking();
        });

        // Project button click handler already set in constructor
        // Client dropdown is handled automatically by the ClientDropdown class

        // Add Enter key support for the task entry
        this.taskEntry.connect('activate', () => {
            this.trackButton.emit('clicked');
        });

        // Connect input change events for synchronization
        this.taskEntrySignalId = this.taskEntry.connect('changed', () => {
            const currentText = this.taskEntry.get_text().trim();
            if (this.parentWindow && this.parentWindow._syncAllInputsFromCurrentWidget) {
                this.parentWindow._syncAllInputsFromCurrentWidget(currentText, this);
            }
            
            // Validate input
            if (currentText.length > 0) {
                const validation = InputValidator.validateTaskName(currentText);
                if (!validation.isValid) {
                    InputValidator.showValidationTooltip(this.taskEntry, validation.error, true);
                } else {
                    InputValidator.showValidationTooltip(this.taskEntry, null, false);
                }
            } else {
                InputValidator.showValidationTooltip(this.taskEntry, null, false);
            }
        });
    }

    /**
     * Handle direct tracking from header widget
     */
    _handleDirectTracking() {
        
        GlobalTracking.handleTrackingClick({
            input: this.taskEntry,
            taskGroupKey: null,
            parentWindow: this.parentWindow,
            sourceComponent: this
        });
    }

    /**
     * Handle tracking button clicks from non-master widgets
     */
    _handleNonMasterTracking() {
        const currentTracking = trackingStateManager.getCurrentTracking();
        
        if (currentTracking) {
            // Stop current tracking - delegate to master widget
            if (this.parentWindow && this.parentWindow.masterTrackingWidget) {
                const masterWidgets = this.parentWindow.masterTrackingWidget.getRawWidgets();
                if (masterWidgets.trackButton) {
                    masterWidgets.trackButton.emit('clicked');
                }
            }
        } else {
            // Start new tracking - validate input and delegate to master widget
            const taskName = this.taskEntry.get_text().trim();
            if (taskName.length === 0) {
                return;
            }
            
            const validation = InputValidator.validateTaskName(taskName);
            if (!validation || !validation.valid) {
                if (validation?.error) {
                    InputValidator.showValidationTooltip(this.taskEntry, validation.error, true);
                }
                return;
            }
            
            // Set the task name in master widget and start tracking
            if (this.parentWindow && this.parentWindow.masterTrackingWidget) {
                const masterWidgets = this.parentWindow.masterTrackingWidget.getRawWidgets();
                if (masterWidgets.taskEntry && masterWidgets.trackButton) {
                    masterWidgets.taskEntry.set_text(validation.sanitized);
                    masterWidgets.trackButton.emit('clicked');
                }
            } else {
            }
        }
    }

    /**
     * Get the main widget for embedding in headers
     */
    getWidget() {
        return this.widget;
    }

    /**
     * Get raw widgets for direct access if needed
     */
    getRawWidgets() {
        return {
            taskEntry: this.taskEntry,
            projectButton: this.projectButton,
            clientButton: this.clientButton,
            timeLabel: this.timeLabel,
            trackButton: this.trackButton
        };
    }

    /**
     * Update project button display - same approach as ProjectsPage
     */
    updateProjectDisplay(project) {
        if (project) {
            // Update tooltip
            this.projectButton.set_tooltip_text(`Project: ${project.name}`);
            
            // Create icon widget (handle both emoji and system icons)
            let iconWidget;
            if (project.icon && project.icon.startsWith('emoji:')) {
                const emoji = project.icon.substring(6);
                iconWidget = new Gtk.Label({
                    label: emoji,
                    css_classes: ['emoji-icon'],
                    halign: Gtk.Align.CENTER,
                    valign: Gtk.Align.CENTER
                });
            } else {
                iconWidget = new Gtk.Image({
                    icon_name: project.icon || 'folder-symbolic',
                    pixel_size: 16
                });
            }
            
            // Apply background color and icon color
            const iconColor = getProjectIconColor(project);
            const provider = new Gtk.CssProvider();
            provider.load_from_string(
                `button { 
                    background-color: ${project.color}; 
                    border-radius: 9px; 
                    color: ${iconColor}; 
                }
                button:hover {
                    filter: brightness(1.1);
                }
                .emoji-icon {
                    font-size: 14px;
                }`
            );
            this.projectButton.get_style_context().add_provider(provider, Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION);
            
            // Set the icon widget as child
            this.projectButton.set_child(iconWidget);
            
        } else {
            // Reset to default
            this.projectButton.set_tooltip_text('Project');
            this.projectIcon = new Gtk.Image({
                icon_name: 'folder-symbolic',
                pixel_size: 16
            });
            this.projectButton.set_child(this.projectIcon);
            
            // Remove custom styling
            const provider = new Gtk.CssProvider();
            provider.load_from_string('button { background-color: transparent; }');
            this.projectButton.get_style_context().add_provider(provider, Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION);
        }
    }

    /**
     * Update client dropdown with new clients - use quiet update to prevent loops
     */
    updateClientDisplay(client) {
        if (this.clientDropdown && this.parentWindow?.allClients) {
            this.clientDropdown.updateClientsQuietly(this.parentWindow.allClients, this.parentWindow.currentClientId);
        }
    }

    /**
     * Set task text without triggering sync (to avoid infinite loops)
     */
    setTaskTextSilent(text) {
        // Temporarily disconnect the changed signal
        if (this.taskEntrySignalId) {
            this.taskEntry.disconnect(this.taskEntrySignalId);
        }
        
        this.taskEntry.set_text(text);
        
        // Reconnect the signal
        if (this.taskEntrySignalId) {
            this.taskEntrySignalId = this.taskEntry.connect('changed', () => {
                // Same logic as in _setupTracking
                const currentText = this.taskEntry.get_text().trim();
                if (this.parentWindow && this.parentWindow._syncAllInputsFromCurrentWidget) {
                    this.parentWindow._syncAllInputsFromCurrentWidget(currentText, this);
                }
                
                // Validate input
                if (currentText.length > 0) {
                    const validation = InputValidator.validateTaskName(currentText);
                    if (!validation.isValid) {
                        InputValidator.showValidationTooltip(this.taskEntry, validation.error, true);
                    } else {
                        InputValidator.showValidationTooltip(this.taskEntry, null, false);
                    }
                } else {
                    InputValidator.showValidationTooltip(this.taskEntry, null, false);
                }
            });
        }
    }

    /**
     * Get current task text
     */
    getTaskText() {
        return this.taskEntry.get_text();
    }
}