/**
 * Compact Tracker Window - Programmatic GTK4
 * Floating window for quick time tracking
 */

import GObject from 'gi://GObject';
import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import Gdk from 'gi://Gdk';

export const ValotCompactTracker = GObject.registerClass({
    GTypeName: 'ValotCompactTracker',
}, class ValotCompactTracker extends Adw.Window {
    constructor(application, coreBridge, mainWindow = null) {
        super({
            application,
            title: _('Compact Tracker'),
            default_width: 500,
            default_height: 60,
            resizable: false,
        });

        this.coreBridge = coreBridge;
        this.mainWindow = mainWindow;

        // Build UI
        this._buildUI();

        // Setup event handlers
        this._setupEventHandlers();

        // Load initial state
        this._loadState();
    }

    /**
     * Build UI programmatically
     */
    _buildUI() {
        // Main box
        const mainBox = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 8,
            margin_top: 8,
            margin_bottom: 8,
            margin_start: 8,
            margin_end: 8,
        });

        // Open main window button
        const openBtn = new Gtk.Button({
            icon_name: 'go-previous-symbolic',
            tooltip_text: _('Open main window'),
            css_classes: ['flat'],
        });
        openBtn.connect('clicked', () => this._openMainWindow());
        mainBox.append(openBtn);

        // Task name label
        this.taskLabel = new Gtk.Label({
            label: _('No task selected'),
            hexpand: true,
            xalign: 0,
        });
        mainBox.append(this.taskLabel);

        // Time label
        this.timeLabel = new Gtk.Label({
            label: '00:00:00',
            css_classes: ['title-2'],
        });
        mainBox.append(this.timeLabel);

        // Track button
        this.trackButton = new Gtk.Button({
            icon_name: 'media-playback-start-symbolic',
            tooltip_text: _('Start tracking'),
            css_classes: ['suggested-action', 'circular'],
        });
        this.trackButton.connect('clicked', () => this._toggleTracking());
        mainBox.append(this.trackButton);

        // Window handle for dragging
        const windowHandle = new Gtk.WindowHandle();
        windowHandle.set_child(mainBox);

        // Set content
        this.set_content(windowHandle);
    }

    /**
     * Setup event handlers
     */
    _setupEventHandlers() {
        // Store event handlers for cleanup
        this._eventHandlers = {
            'tracking-started': (data) => {
                this._onTrackingStarted(data);
            },
            'tracking-stopped': (data) => {
                this._onTrackingStopped(data);
            },
            'tracking-updated': (data) => {
                this._onTrackingUpdated(data);
            }
        };

        // Subscribe to tracking events
        Object.keys(this._eventHandlers).forEach(event => {
            this.coreBridge.onUIEvent(event, this._eventHandlers[event]);
        });

        // Handle close - minimize instead
        this.connect('close-request', () => {
            this.set_visible(false);
            return true; // Prevent actual close
        });
        
        // Cleanup when window is hidden (save resources)
        this.connect('hide', () => {
            this.cleanup();
        });
        
        // Resubscribe when window is shown again
        this.connect('show', () => {
            this._resubscribe();
        });

        // Cleanup when window is destroyed
        this.connect('destroy', () => {
            this.cleanup();
        });
    }

    /**
     * Cleanup: unsubscribe from events
     */
    cleanup() {
        if (this.coreBridge && this._eventHandlers) {
            Object.keys(this._eventHandlers).forEach(event => {
                this.coreBridge.offUIEvent(event, this._eventHandlers[event]);
            });
            this._eventHandlers = {};
        }
    }
    
    /**
     * Resubscribe to events when window is shown again
     */
    _resubscribe() {
        // Recreate event handlers if they were cleaned up
        if (!this._eventHandlers || Object.keys(this._eventHandlers).length === 0) {
            this._eventHandlers = {
                'tracking-started': (data) => {
                    this._onTrackingStarted(data);
                },
                'tracking-stopped': (data) => {
                    this._onTrackingStopped(data);
                },
                'tracking-updated': (data) => {
                    this._onTrackingUpdated(data);
                }
            };
            
            // Subscribe to tracking events
            Object.keys(this._eventHandlers).forEach(event => {
                this.coreBridge.onUIEvent(event, this._eventHandlers[event]);
            });
        }
        
        // Load current state
        this._loadState();
    }

    /**
     * Load initial state
     */
    _loadState() {
        const state = this.coreBridge.getTrackingState();
        if (state.isTracking) {
            this._updateUI(state);
        }
    }

    /**
     * Toggle tracking
     */
    async _toggleTracking() {
        try {
            const state = this.coreBridge.getTrackingState();

            if (state.isTracking) {
                // Stop tracking
                await this.coreBridge.stopTracking();
            } else {
                // Show task selection dialog
                await this._selectTask();
            }
        } catch (error) {
            console.error('Error toggling tracking:', error);
            this._showError(error.message);
        }
    }

    async _selectTask() {
        if (!this.coreBridge) return;

        const state = this.coreBridge.getTrackingState();
        if (state.isTracking) return; // Already tracking

        try {
            // Dynamically import dialog
            const { QuickTaskSelector } = await import('resource:///com/odnoyko/valot/ui/components/dialogs/QuickTaskSelector.js');

            // Show task selector
            const selector = new QuickTaskSelector(
                this.coreBridge,
                async (taskName, projectId, clientId) => {
                    // Find or create task
                    const task = await this.coreBridge.findOrCreateTask(taskName);
                    // Start tracking
                    await this.coreBridge.startTracking(task.id, projectId, clientId);
                }
            );

            selector.present(this);
        } catch (error) {
            console.error('Error opening task selector:', error);
            this._showError(error.message);
        }
    }

    /**
     * Open main window
     */
    _openMainWindow() {
        if (this.mainWindow) {
            this.mainWindow.set_visible(true);
            this.mainWindow.present();
        } else {
            // Create main window if not exists
            this.application.openMainApplication();
        }
    }

    /**
     * Event: Tracking started
     */
    _onTrackingStarted(data) {
        this._updateUI({
            isTracking: true,
            currentTaskName: data.taskName,
            elapsedSeconds: 0,
        });
    }

    /**
     * Event: Tracking stopped
     */
    _onTrackingStopped(data) {
        this._updateUI({
            isTracking: false,
            currentTaskName: null,
            elapsedSeconds: 0,
        });
    }

    /**
     * Event: Tracking updated
     */
    /**
     * Event: Tracking updated
     */
    _onTrackingUpdated(data) {
        // tracking-updated fires every second from Core timer
        // Core timer calculates elapsedSeconds (currentTime - startTime), we just show it
        // No calculation in UI, no RAM storage - just display Core timer result
        
        // Update time display directly from Core timer data (already calculated, just show it)
        if (data && data.elapsedSeconds !== undefined && this._updateTime) {
            this._updateTime(data.elapsedSeconds);
        }
    }

    /**
     * Update UI based on state
     */
    _updateUI(state) {
        if (state.isTracking) {
            this.taskLabel.set_label(state.currentTaskName || _('Tracking...'));
            this.trackButton.set_icon_name('media-playback-stop-symbolic');
            this.trackButton.set_tooltip_text(_('Stop tracking'));
            this.trackButton.remove_css_class('suggested-action');
            this.trackButton.add_css_class('destructive-action');
        } else {
            this.taskLabel.set_label(_('No task selected'));
            this.trackButton.set_icon_name('media-playback-start-symbolic');
            this.trackButton.set_tooltip_text(_('Start tracking'));
            this.trackButton.remove_css_class('destructive-action');
            this.trackButton.add_css_class('suggested-action');
        }

        if (state.elapsedSeconds !== undefined) {
            this._updateTime(state.elapsedSeconds);
        }
    }

    /**
     * Update time display
     */
    _updateTime(seconds) {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;

        const timeStr = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        this.timeLabel.set_label(timeStr);
    }

    /**
     * Show error message
     */
    _showError(message) {
        const dialog = new Adw.AlertDialog({
            heading: _('Error'),
            body: message,
        });
        dialog.add_response('ok', _('OK'));
        dialog.present(this);
    }
});
