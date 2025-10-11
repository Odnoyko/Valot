/**
 * Header Tracking Widget - connects to Core TimeTrackingService
 * Displays in page headers for time tracking
 *
 * UI ONLY - NO STATE STORAGE
 * All state is in Core, UI reads via CoreBridge
 */

import Gtk from 'gi://Gtk?version=4.0';
import GLib from 'gi://GLib';

export class HeaderTrackingWidget {
    constructor(config = {}) {
        this.parentWindow = config.parentWindow;
        this.coreBridge = config.coreBridge;

        // UI update timer (NOT state!)
        this.updateTimerId = null;

        this._buildWidget();
        this._connectToCore();
        this._updateUIFromCore();
    }

    _buildWidget() {
        // Main tracking container
        this.widget = new Gtk.Box({
            spacing: 8,
            hexpand: true,
        });

        // Task selector button (will show task name when selected)
        this.taskButton = new Gtk.Button({
            label: _('Select task...'),
            hexpand: true,
        });
        this.taskButton.connect('clicked', () => this._selectTask());
        this.widget.append(this.taskButton);

        // Project button
        this.projectBtn = new Gtk.Button({
            icon_name: 'folder-symbolic',
            tooltip_text: _('Select project'),
        });
        this.projectBtn.connect('clicked', () => this._selectProject());
        this.widget.append(this.projectBtn);

        // Client button
        this.clientBtn = new Gtk.Button({
            icon_name: 'contact-new-symbolic',
            tooltip_text: _('Select client'),
        });
        this.clientBtn.connect('clicked', () => this._selectClient());
        this.widget.append(this.clientBtn);

        // Time label
        this.timeLabel = new Gtk.Label({
            label: '00:00:00',
        });
        this.widget.append(this.timeLabel);

        // Track button (start/stop)
        this.trackBtn = new Gtk.Button({
            icon_name: 'media-playback-start-symbolic',
            tooltip_text: _('Start tracking'),
            css_classes: ['suggested-action', 'circular'],
        });
        this.trackBtn.connect('clicked', () => this._toggleTracking());
        this.widget.append(this.trackBtn);

        // Compact tracker button
        const compactBtn = new Gtk.Button({
            icon_name: 'view-reveal-symbolic',
            tooltip_text: _('Open compact tracker'),
        });
        compactBtn.connect('clicked', () => this._openCompactTracker());
        this.widget.append(compactBtn);
    }

    _connectToCore() {
        if (!this.coreBridge) {
            console.error('❌ CoreBridge not available - tracking widget cannot work');
            this.widget.set_sensitive(false);
            return;
        }

        // Subscribe to Core events for synchronization
        this.coreBridge.onUIEvent('tracking-started', (data) => {
            this._onTrackingStarted(data);
        });

        this.coreBridge.onUIEvent('tracking-stopped', (data) => {
            this._onTrackingStopped(data);
        });

        this.coreBridge.onUIEvent('tracking-updated', (data) => {
            this._onTrackingUpdated(data);
        });

        console.log('✅ HeaderTrackingWidget connected to Core');
    }

    /**
     * Read state from Core and update UI
     */
    _updateUIFromCore() {
        if (!this.coreBridge) return;

        try {
            const state = this.coreBridge.getTrackingState();

            if (state.isTracking) {
                // Update UI to tracking mode
                this.taskButton.set_label(state.currentTaskName || _('Tracking...'));
                this.taskButton.set_sensitive(false);
                this.projectBtn.set_sensitive(false);
                this.clientBtn.set_sensitive(false);

                this.trackBtn.set_icon_name('media-playback-stop-symbolic');
                this.trackBtn.set_tooltip_text(_('Stop tracking'));
                this.trackBtn.remove_css_class('suggested-action');
                this.trackBtn.add_css_class('destructive-action');

                // Update time display
                this.timeLabel.set_label(this._formatDuration(state.elapsedSeconds));

                // Start UI update timer
                this._startUIUpdateTimer();
            } else {
                // Update UI to idle mode
                this.taskButton.set_label(_('Select task...'));
                this.taskButton.set_sensitive(true);
                this.projectBtn.set_sensitive(true);
                this.clientBtn.set_sensitive(true);

                this.trackBtn.set_icon_name('media-playback-start-symbolic');
                this.trackBtn.set_tooltip_text(_('Start tracking'));
                this.trackBtn.remove_css_class('destructive-action');
                this.trackBtn.add_css_class('suggested-action');

                this.timeLabel.set_label('00:00:00');

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
        console.log('📡 Tracking started event received:', data);
        this._updateUIFromCore();
    }

    /**
     * Core event: tracking stopped (from ANY widget/window)
     */
    _onTrackingStopped(data) {
        console.log('📡 Tracking stopped event received:', data);
        this._updateUIFromCore();
    }

    /**
     * Core event: tracking timer updated
     */
    _onTrackingUpdated(data) {
        // Update time display (Core increments elapsedSeconds every second)
        const state = this.coreBridge.getTrackingState();
        this.timeLabel.set_label(this._formatDuration(state.elapsedSeconds));
    }

    /**
     * User clicked start/stop button
     */
    async _toggleTracking() {
        if (!this.coreBridge) return;

        try {
            const state = this.coreBridge.getTrackingState();

            if (state.isTracking) {
                // Stop tracking
                await this.coreBridge.stopTracking();
                console.log('⏹️ Tracking stopped via UI');
            } else {
                // Start tracking - need task ID
                // For now, show task selector
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
            await this.coreBridge.startTracking(taskId, projectId, clientId);
            console.log(`▶️ Started tracking task ${taskId}`);
        } catch (error) {
            console.error('Error starting tracking:', error);
            this._showError(error.message);
        }
    }

    /**
     * UI update timer - refreshes display from Core state
     * (Core updates elapsedSeconds internally, we just read it)
     */
    _startUIUpdateTimer() {
        if (this.updateTimerId) return;

        this.updateTimerId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1000, () => {
            const state = this.coreBridge.getTrackingState();
            if (state.isTracking) {
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
        // When task selected, call: this._startTracking(taskId, projectId, clientId)
        console.log('TODO: Open task selector dialog');

        // TEMPORARY: For testing, start tracking task 1
        if (this.coreBridge) {
            const state = this.coreBridge.getTrackingState();
            if (!state.isTracking) {
                // Get first task from database for testing
                this.coreBridge.getAllTasks().then(tasks => {
                    if (tasks.length > 0) {
                        this._startTracking(tasks[0].id, null, null);
                    } else {
                        this._showError('No tasks available. Create a task first.');
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

    _openCompactTracker() {
        // TODO: Open compact tracker window
        if (this.parentWindow) {
            console.log('TODO: Open compact tracker window');
        }
    }

    _showError(message) {
        console.error('Tracking error:', message);
        // TODO: Show toast notification
    }

    getWidget() {
        return this.widget;
    }

    cleanup() {
        this._stopUIUpdateTimer();
        // CoreBridge events are cleaned up by CoreBridge itself
    }
}
