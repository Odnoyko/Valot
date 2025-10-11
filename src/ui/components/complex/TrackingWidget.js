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

        // UI update timer (NOT state!)
        this.updateTimerId = null;

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

        // Subscribe to Core events for synchronization
        this.config.coreBridge.onUIEvent('tracking-started', (data) => {
            this._onTrackingStarted(data);
        });

        this.config.coreBridge.onUIEvent('tracking-stopped', (data) => {
            this._onTrackingStopped(data);
        });

        this.config.coreBridge.onUIEvent('tracking-updated', (data) => {
            this._onTrackingUpdated(data);
        });

        console.log('✅ TrackingWidget connected to Core');
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

                // Start UI update timer
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

                // Stop UI update timer
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
        console.log('📡 TrackingWidget: Tracking started event received');
        this._updateUIFromCore();
    }

    /**
     * Core event: tracking stopped (from ANY widget/window)
     */
    _onTrackingStopped(data) {
        console.log('📡 TrackingWidget: Tracking stopped event received');
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
                console.log('⏹️ Tracking stopped via TrackingWidget');
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
            console.log(`▶️ Started tracking task ${taskId} via TrackingWidget`);
        } catch (error) {
            console.error('Error starting tracking:', error);
            this._showError(error.message);
        }
    }

    /**
     * UI update timer - refreshes display from Core state
     */
    _startUIUpdateTimer() {
        if (this.updateTimerId) return;

        this.updateTimerId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1000, () => {
            const state = this.config.coreBridge.getTrackingState();
            if (state.isTracking && this.timeLabel) {
                this.timeLabel.set_label(this._formatDuration(state.elapsedSeconds));
                return true; // Continue timer
            } else {
                this.updateTimerId = null;
                return false; // Stop timer
            }
        });
    }

    _stopUIUpdateTimer() {
        if (this.updateTimerId) {
            GLib.Source.remove(this.updateTimerId);
            this.updateTimerId = null;
        }
    }

    _formatDuration(seconds) {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;

        return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }

    _selectTask() {
        // TODO: Open task selector dialog
        console.log('TODO: Open task selector dialog');

        // TEMPORARY: For testing, start tracking first available task
        if (this.config.coreBridge) {
            const state = this.config.coreBridge.getTrackingState();
            if (!state.isTracking) {
                // Get first task from database for testing
                this.config.coreBridge.getAllTasks().then(tasks => {
                    if (tasks.length > 0) {
                        this._startTracking(tasks[0].id, null, null);
                    } else {
                        this._showError(_('No tasks available. Create a task first.'));
                    }
                }).catch(err => {
                    console.error('Error getting tasks:', err);
                });
            }
        }
    }

    _selectProject() {
        // TODO: Open project selector dialog
        console.log('TODO: Open project selector dialog');
    }

    _selectClient() {
        // TODO: Open client selector dialog
        console.log('TODO: Open client selector dialog');
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
        this._stopUIUpdateTimer();
        // CoreBridge events are cleaned up by CoreBridge itself
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
