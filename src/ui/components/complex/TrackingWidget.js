/**
 * TrackingWidget - Universal tracking component
 *
 * UI ONLY - NO STATE STORAGE
 * All state is in Core, UI reads via CoreBridge
 * Synchronized with all other tracking widgets
 */

import Gtk from 'gi://Gtk';
import GLib from 'gi://GLib';

export class TrackingWidget {
    constructor(config = {}) {
        const defaultConfig = {
            coreBridge: null,
            parentWindow: null,
            showProjectButton: true,
            showClientButton: true,
            showTimeDisplay: true,
            taskPlaceholder: _('Task name'),
        };

        this.config = { ...defaultConfig, ...config };

        // UI tick subscription token
        this.updateTimerToken = 0;

        // Build widget
        this.widget = this._createWidget();
        this._createChildren();
        this._layoutChildren();
        this._connectToCore();
        this._updateUIFromCore();
    }

    _createWidget() {
        return new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 8,
            hexpand: true,
        });
    }

    _createChildren() {
        // Task selector button (will show task name when tracking)
        this.taskButton = new Gtk.Button({
            label: this.config.taskPlaceholder,
            hexpand: true,
        });
        this.taskButton.connect('clicked', () => this._selectTask());

        // Project button
        if (this.config.showProjectButton) {
            this.projectButton = new Gtk.Button({
                icon_name: 'folder-symbolic',
                tooltip_text: _('Select Project'),
                css_classes: ['flat'],
                width_request: 36,
                height_request: 36,
            });
            this.projectButton.connect('clicked', () => this._selectProject());
        }

        // Client button
        if (this.config.showClientButton) {
            this.clientButton = new Gtk.Button({
                icon_name: 'contact-new-symbolic',
                tooltip_text: _('Select Client'),
                css_classes: ['flat'],
                width_request: 36,
                height_request: 36,
            });
            this.clientButton.connect('clicked', () => this._selectClient());
        }

        // Time display
        if (this.config.showTimeDisplay) {
            this.timeLabel = new Gtk.Label({
                label: '00:00:00',
            });
        }

        // Track button
        this.trackButton = new Gtk.Button({
            icon_name: 'media-playback-start-symbolic',
            tooltip_text: _('Start tracking'),
            css_classes: ['circular'],
            width_request: 40,
            height_request: 40,
        });
        this.trackButton.connect('clicked', () => this._toggleTracking());
    }

    _layoutChildren() {
        this.widget.append(this.taskButton);

        if (this.config.showProjectButton && this.projectButton) {
            this.widget.append(this.projectButton);
        }

        if (this.config.showClientButton && this.clientButton) {
            this.widget.append(this.clientButton);
        }

        if (this.config.showTimeDisplay && this.timeLabel) {
            this.widget.append(this.timeLabel);
        }

        this.widget.append(this.trackButton);
    }

    _connectToCore() {
        if (!this.config.coreBridge) {
            console.error('❌ CoreBridge not available - tracking widget cannot work');
            this.widget.set_sensitive(false);
            return;
        }

        // Store event handlers for cleanup
        this._coreEventHandlers = {
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

        // Subscribe to Core events for synchronization
        Object.keys(this._coreEventHandlers).forEach(event => {
            this.config.coreBridge.onUIEvent(event, this._coreEventHandlers[event]);
        });

    }

    /**
     * Read state from Core and update UI
     */
    _updateUIFromCore() {
        if (!this.config.coreBridge) return;

        try {
            const state = this.config.coreBridge.getTrackingState();

            if (state.isTracking) {
                // Update UI to tracking mode
                this.taskButton.set_label(state.currentTaskName || _('Tracking...'));
                this.taskButton.set_sensitive(false);

                if (this.projectButton) {
                    this.projectButton.set_sensitive(false);
                }
                if (this.clientButton) {
                    this.clientButton.set_sensitive(false);
                }

                this.trackButton.set_icon_name('media-playback-stop-symbolic');
                this.trackButton.set_tooltip_text(_('Stop tracking'));
                this.trackButton.add_css_class('destructive-action');
                this.trackButton.remove_css_class('suggested-action');

                // Update time display
                if (this.timeLabel) {
                    this.timeLabel.set_label(this._formatDuration(state.elapsedSeconds));
                }

                // Start UI tick updates
                this._startUIUpdateTimer();
            } else {
                // Update UI to idle mode
                this.taskButton.set_label(this.config.taskPlaceholder);
                this.taskButton.set_sensitive(true);

                if (this.projectButton) {
                    this.projectButton.set_sensitive(true);
                }
                if (this.clientButton) {
                    this.clientButton.set_sensitive(true);
                }

                this.trackButton.set_icon_name('media-playback-start-symbolic');
                this.trackButton.set_tooltip_text(_('Start tracking'));
                this.trackButton.remove_css_class('destructive-action');
                this.trackButton.add_css_class('suggested-action');

                if (this.timeLabel) {
                    this.timeLabel.set_label('00:00:00');
                }

                // Stop UI tick updates
                this._stopUIUpdateTimer();
            }
        } catch (error) {
            console.error('Error updating UI from Core:', error);
        }
    }

    /**
     * Core event: tracking started (from ANY widget/window)
     */
    _onTrackingStarted(data) {
        this._updateUIFromCore();
    }

    /**
     * Core event: tracking stopped (from ANY widget/window)
     */
    _onTrackingStopped(data) {
        this._updateUIFromCore();
    }

    /**
     * Core event: tracking timer updated
     */
    _onTrackingUpdated(data) {
        // Update time display (Core increments elapsedSeconds every second)
        const state = this.config.coreBridge.getTrackingState();
        if (this.timeLabel) {
            this.timeLabel.set_label(this._formatDuration(state.elapsedSeconds));
        }
    }

    /**
     * User clicked start/stop button
     */
    async _toggleTracking() {
        if (!this.config.coreBridge) return;

        try {
            const state = this.config.coreBridge.getTrackingState();

            if (state.isTracking) {
                // Stop tracking
                await this.config.coreBridge.stopTracking();
            } else {
                // Start tracking - need task ID
                this._selectTask();
            }
        } catch (error) {
            console.error('Error toggling tracking:', error);
            this._showError(error.message);
        }
    }

    /**
     * Start tracking with specific task
     */
    async _startTracking(taskId, projectId = null, clientId = null) {
        try {
            await this.config.coreBridge.startTracking(taskId, projectId, clientId);
        } catch (error) {
            console.error('Error starting tracking:', error);
            this._showError(error.message);
        }
    }

    /**
     * UI update timer - refreshes display from Core state
     */
    _startUIUpdateTimer() {
        if (this.updateTimerToken) return;
        if (!this.config.coreBridge) return;
        this.updateTimerToken = this.config.coreBridge.subscribeTick(() => {
            const state = this.config.coreBridge.getTrackingState();
            if (state.isTracking && this.timeLabel) {
                this.timeLabel.set_label(this._formatDuration(state.elapsedSeconds));
            } else {
                this._stopUIUpdateTimer();
            }
        });
    }

    _stopUIUpdateTimer() {
        if (this.updateTimerToken && this.config.coreBridge) {
            this.config.coreBridge.unsubscribeTick(this.updateTimerToken);
            this.updateTimerToken = 0;
        }
    }

    _formatDuration(seconds) {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;

        return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }

    async _selectTask() {
        if (!this.config.coreBridge) return;

        const state = this.config.coreBridge.getTrackingState();
        if (state.isTracking) return; // Already tracking

        try {
            // Dynamically import dialog
            const { QuickTaskSelector } = await import('resource:///com/odnoyko/valot/ui/components/dialogs/QuickTaskSelector.js');

            // Show task selector
            const selector = new QuickTaskSelector(
                this.config.coreBridge,
                async (taskName, projectId, clientId) => {
                    // Find or create task
                    const task = await this.config.coreBridge.findOrCreateTask(taskName);
                    // Start tracking
                    await this._startTracking(task.id, projectId, clientId);
                }
            );

            selector.present(this.config.parentWindow);
        } catch (error) {
            console.error('Error opening task selector:', error);
            this._showError(error.message);
        }
    }

    _selectProject() {
        // TODO: Open project selector dialog
    }

    _selectClient() {
        // TODO: Open client selector dialog
    }

    _showError(message) {
        console.error('Tracking error:', message);
        // TODO: Show toast notification
    }

    /**
     * Get the main container widget
     */
    getWidget() {
        return this.widget;
    }

    /**
     * Cleanup
     */
    cleanup() {
        // Unsubscribe from CoreBridge events
        if (this.config.coreBridge && this._coreEventHandlers) {
            Object.keys(this._coreEventHandlers).forEach(event => {
                this.config.coreBridge.offUIEvent(event, this._coreEventHandlers[event]);
            });
            this._coreEventHandlers = {};
        }

        this._stopUIUpdateTimer();
    }

    /**
     * Static factory methods for different configurations
     */
    static createSimple(config = {}) {
        return new TrackingWidget({
            showProjectButton: false,
            showClientButton: false,
            ...config,
        });
    }

    static createFull(config = {}) {
        return new TrackingWidget({
            showProjectButton: true,
            showClientButton: true,
            showTimeDisplay: true,
            ...config,
        });
    }
}
