/**
 * Header Tracking Widget - connects to Core TimeTrackingService
 * Displays in page headers for time tracking
 *
 * UI ONLY - NO STATE STORAGE
 * All state is in Core, UI reads via CoreBridge
 */

import Gtk from 'gi://Gtk?version=4.0';
import Gdk from 'gi://Gdk?version=4.0';
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
            tooltip_text: _('Open compact tracker (Shift: keep main window)'),
        });

        // Use button-press-event to detect Shift key
        const gesture = new Gtk.GestureClick();
        gesture.connect('pressed', (gesture, n_press, x, y) => {
            const event = gesture.get_current_event();
            const modifiers = event.get_modifier_state();
            const shiftPressed = !!(modifiers & Gdk.ModifierType.SHIFT_MASK);
            this._openCompactTracker(shiftPressed);
        });
        compactBtn.add_controller(gesture);

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
                    await this._startTracking(task.id, projectId, clientId);
                }
            );

            selector.present(this.parentWindow);
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

    _openCompactTracker(shiftMode = false) {
        if (!this.parentWindow || !this.parentWindow.application) {
            console.error('Cannot open compact tracker: no application reference');
            return;
        }

        // Launch compact tracker via Application
        this.parentWindow.application._launchCompactTracker(shiftMode);
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
