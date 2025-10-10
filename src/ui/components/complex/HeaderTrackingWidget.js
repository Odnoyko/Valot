/**
 * Header Tracking Widget - connects to Core TimeTrackingService
 * Displays in page headers for time tracking
 */

import Gtk from 'gi://Gtk?version=4.0';
import GLib from 'gi://GLib';

export class HeaderTrackingWidget {
    constructor(config = {}) {
        this.parentWindow = config.parentWindow;
        this.coreBridge = config.coreBridge;

        // Tracking state
        this.isTracking = false;
        this.currentTaskId = null;
        this.elapsedSeconds = 0;
        this.selectedProjectId = null;
        this.selectedClientId = null;

        this._buildWidget();
        this._connectToCore();
    }

    _buildWidget() {
        // Main tracking container
        this.widget = new Gtk.Box({
            spacing: 8,
            hexpand: true,
        });

        // Task name entry
        this.taskNameEntry = new Gtk.Entry({
            placeholder_text: _('Task name'),
            hexpand: true,
        });
        this.widget.append(this.taskNameEntry);

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
            console.warn('⚠️ CoreBridge not available - tracking widget will use simplified mode');
            return;
        }

        // TODO: Connect to Core API when it's fully integrated
        // For now, tracking widget is ready but Core integration is pending
        console.log('✅ HeaderTrackingWidget initialized (Core integration pending)');
    }

    async _toggleTracking() {
        // TODO: Implement Core API integration
        console.log('Tracking toggle - Core integration pending');

        const taskName = this.taskNameEntry.get_text().trim();
        if (!taskName && !this.isTracking) {
            console.warn('Task name required');
            return;
        }

        // Temporary UI toggle for demonstration
        if (this.isTracking) {
            this._simulateStop();
        } else {
            this._simulateStart(taskName);
        }
    }

    _simulateStart(taskName) {
        this.isTracking = true;
        this.elapsedSeconds = 0;

        this.taskNameEntry.set_sensitive(false);
        this.projectBtn.set_sensitive(false);
        this.clientBtn.set_sensitive(false);

        this.trackBtn.set_icon_name('media-playback-stop-symbolic');
        this.trackBtn.set_tooltip_text(_('Stop tracking'));
        this.trackBtn.remove_css_class('suggested-action');
        this.trackBtn.add_css_class('destructive-action');

        // Start timer
        this.timerId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1000, () => {
            this.elapsedSeconds++;
            this.timeLabel.set_label(this._formatDuration(this.elapsedSeconds));
            return true;
        });

        console.log(`▶️ Started tracking: ${taskName}`);
    }

    _simulateStop() {
        this.isTracking = false;

        if (this.timerId) {
            GLib.Source.remove(this.timerId);
            this.timerId = null;
        }

        this.taskNameEntry.set_text('');
        this.taskNameEntry.set_sensitive(true);
        this.projectBtn.set_sensitive(true);
        this.clientBtn.set_sensitive(true);

        this.trackBtn.set_icon_name('media-playback-start-symbolic');
        this.trackBtn.set_tooltip_text(_('Start tracking'));
        this.trackBtn.remove_css_class('destructive-action');
        this.trackBtn.add_css_class('suggested-action');

        const duration = this.elapsedSeconds;
        this.timeLabel.set_label('00:00:00');
        this.elapsedSeconds = 0;

        console.log(`⏹️ Stopped tracking: ${this._formatDuration(duration)}`);
    }

    // TODO: These will be used when Core is integrated
    // _onTrackingStarted(data) { }
    // _onTrackingStopped(data) { }
    // _onTrackingUpdated(data) { }

    _formatDuration(seconds) {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;

        return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }

    _selectProject() {
        // TODO: Open project selector dialog
        console.log('Select project - TODO');
    }

    _selectClient() {
        // TODO: Open client selector dialog
        console.log('Select client - TODO');
    }

    _openCompactTracker() {
        // TODO: Open compact tracker window
        console.log('Open compact tracker - TODO');
    }

    getWidget() {
        return this.widget;
    }

    cleanup() {
        // Cleanup event listeners if needed
    }
}
