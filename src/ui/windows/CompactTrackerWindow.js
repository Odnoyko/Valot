/**
 * Compact Tracker Window - minimal always-on-top tracker
 * Adapted to new Core architecture
 */

import GObject from 'gi://GObject';
import Adw from 'gi://Adw?version=1';
import Gtk from 'gi://Gtk?version=4.0';
import Gdk from 'gi://Gdk';
import GLib from 'gi://GLib';
import { ProjectDropdown } from 'resource:///com/odnoyko/valot/ui/utils/projectDropdown.js';
import { ClientDropdown } from 'resource:///com/odnoyko/valot/ui/utils/clientDropdown.js';

export const CompactTrackerWindow = GObject.registerClass({
    GTypeName: 'ValotCompactTrackerWindow',
}, class CompactTrackerWindow extends Adw.Window {
    constructor(application, coreBridge) {
        super({
            application,
            title: _('Compact Tracker'),
            default_width: 500,
            default_height: 50,
            resizable: false,
        });

        this.coreBridge = coreBridge;
        this.shiftMode = false; // Track if opened with shift key

        // Current tracking context
        this.currentProjectId = 1;
        this.currentClientId = 1;

        // Build UI
        this._buildUI();

        // Subscribe to Core events
        this._subscribeToCore();

        // Load initial state
        this._updateFromCore();

        console.log('✅ CompactTrackerWindow initialized');
    }

    setShiftMode(shiftMode) {
        this.shiftMode = shiftMode;
    }

    _buildUI() {
        // Create WindowHandle for dragging
        const windowHandle = new Gtk.WindowHandle();

        // Main container
        const mainBox = new Gtk.Box({
            spacing: 4,
            margin_top: 2,
            margin_bottom: 2,
            margin_start: 4,
            margin_end: 4,
            valign: Gtk.Align.CENTER,
        });

        // Close/Open button
        this.closeOpenBtn = new Gtk.Button({
            icon_name: 'go-previous-symbolic',
            css_classes: ['flat'],
            tooltip_text: _('Close compact tracker and open main window'),
            width_request: 20,
            height_request: 20,
        });
        this.closeOpenBtn.connect('clicked', () => this._onCloseOpen());

        // Tracking container
        const trackingBox = new Gtk.Box({
            spacing: 4,
            hexpand: true,
            margin_end: 4,
            halign: Gtk.Align.FILL,
            valign: Gtk.Align.CENTER,
        });

        // Task name input
        this.taskNameEntry = new Gtk.Entry({
            placeholder_text: _('Task name'),
            width_request: 160,
            hexpand: true,
            halign: Gtk.Align.FILL,
            height_request: 24,
        });

        // Auto-update task name while typing (if tracking)
        this.taskNameDebounceTimer = null;
        this._blockTaskNameUpdate = false;

        this.taskNameEntry.connect('changed', () => {
            if (this._blockTaskNameUpdate) return;

            const state = this.coreBridge?.getTrackingState();
            if (!state || !state.isTracking) return;

            // Clear previous timer
            if (this.taskNameDebounceTimer) {
                GLib.Source.remove(this.taskNameDebounceTimer);
            }

            // Set new timer - update after 250ms of no typing
            this.taskNameDebounceTimer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 250, () => {
                this.taskNameDebounceTimer = null;
                this._updateTaskNameFromInput();
                return false;
            });
        });

        // Enter key - start/stop tracking
        this.taskNameEntry.connect('activate', () => {
            this._toggleTracking();
        });

        // Project dropdown
        this._setupProjectDropdown();

        // Client dropdown
        this._setupClientDropdown();

        // Time display
        this.timeLabel = new Gtk.Label({
            label: '00:00:00',
            css_classes: ['title-4'],
            margin_start: 4,
            margin_end: 4,
        });

        // Track button
        this.trackButton = new Gtk.Button({
            icon_name: 'media-playback-start-symbolic',
            css_classes: ['suggested-action', 'circular'],
            tooltip_text: _('Start tracking'),
            width_request: 24,
            height_request: 24,
        });
        this.trackButton.connect('clicked', () => this._toggleTracking());

        // Assemble widgets
        trackingBox.append(this.taskNameEntry);
        trackingBox.append(this.projectDropdown.getWidget());
        trackingBox.append(this.clientDropdown.getWidget());
        trackingBox.append(this.timeLabel);
        trackingBox.append(this.trackButton);

        mainBox.append(this.closeOpenBtn);
        mainBox.append(trackingBox);

        windowHandle.set_child(mainBox);
        this.set_content(windowHandle);
    }

    _setupProjectDropdown() {
        this.projectDropdown = new ProjectDropdown(
            this.coreBridge,
            this.currentProjectId,
            async (selectedProject) => {
                this.currentProjectId = selectedProject.id;

                const state = this.coreBridge.getTrackingState();
                if (state.isTracking) {
                    await this.coreBridge.updateCurrentProjectClient(
                        this.currentProjectId === 1 ? null : this.currentProjectId,
                        this.currentClientId === 1 ? null : this.currentClientId
                    );
                }
            }
        );
    }

    _setupClientDropdown() {
        this.clientDropdown = new ClientDropdown(
            this.coreBridge,
            this.currentClientId,
            async (selectedClient) => {
                this.currentClientId = selectedClient.id;

                const state = this.coreBridge.getTrackingState();
                if (state.isTracking) {
                    await this.coreBridge.updateCurrentProjectClient(
                        this.currentProjectId === 1 ? null : this.currentProjectId,
                        this.currentClientId === 1 ? null : this.currentClientId
                    );
                }
            }
        );
    }

    _subscribeToCore() {
        if (!this.coreBridge) return;

        this.coreBridge.onUIEvent('tracking-started', () => {
            this._updateFromCore();
        });

        this.coreBridge.onUIEvent('tracking-stopped', () => {
            this._updateFromCore();
        });

        this.coreBridge.onUIEvent('tracking-updated', () => {
            const state = this.coreBridge.getTrackingState();
            this.timeLabel.set_label(this._formatDuration(state.elapsedSeconds));
        });
    }

    _updateFromCore() {
        if (!this.coreBridge) return;

        const state = this.coreBridge.getTrackingState();

        if (state.isTracking) {
            // Tracking active
            this._blockTaskNameUpdate = true;
            this.taskNameEntry.set_text(state.currentTaskName || '');
            this._blockTaskNameUpdate = false;

            this.taskNameEntry.set_sensitive(true);

            // Update dropdowns
            if (state.currentProjectId && this.projectDropdown) {
                this.currentProjectId = state.currentProjectId;
                this.projectDropdown.setCurrentProject(state.currentProjectId);
            }
            if (state.currentClientId && this.clientDropdown) {
                this.currentClientId = state.currentClientId;
                this.clientDropdown.setSelectedClient(state.currentClientId);
            }

            // Update button
            this.trackButton.set_icon_name('media-playback-stop-symbolic');
            this.trackButton.set_tooltip_text(_('Stop tracking'));

            this.timeLabel.set_label(this._formatDuration(state.elapsedSeconds));
        } else {
            // Tracking idle
            this.taskNameEntry.set_sensitive(true);

            // Reset to default
            this.currentProjectId = 1;
            this.currentClientId = 1;
            if (this.projectDropdown) {
                this.projectDropdown.setCurrentProject(1);
            }
            if (this.clientDropdown) {
                this.clientDropdown.setSelectedClient(1);
            }

            // Update button
            this.trackButton.set_icon_name('media-playback-start-symbolic');
            this.trackButton.set_tooltip_text(_('Start tracking'));

            this.timeLabel.set_label('00:00:00');
        }
    }

    async _toggleTracking() {
        if (!this.coreBridge) return;

        const state = this.coreBridge.getTrackingState();

        if (state.isTracking) {
            // Stop tracking
            try {
                // Update icon immediately
                this.trackButton.set_icon_name('media-playback-start-symbolic');
                this.trackButton.set_tooltip_text(_('Start tracking'));

                await this.coreBridge.stopTracking();
            } catch (error) {
                console.error('Error stopping tracking:', error);
            }
        } else {
            // Start tracking
            try {
                const taskName = this.taskNameEntry.get_text().trim();
                let task;

                if (taskName === '' || taskName.length === 0) {
                    task = await this.coreBridge.createAutoIndexedTask();
                } else {
                    task = await this.coreBridge.findOrCreateTask(taskName);
                }

                // Update icon immediately
                this.trackButton.set_icon_name('media-playback-stop-symbolic');
                this.trackButton.set_tooltip_text(_('Stop tracking'));

                await this.coreBridge.startTracking(
                    task.id,
                    this.currentProjectId === 1 ? null : this.currentProjectId,
                    this.currentClientId === 1 ? null : this.currentClientId
                );
            } catch (error) {
                console.error('Error starting tracking:', error);
            }
        }
    }

    async _updateTaskNameFromInput() {
        if (!this.coreBridge) return;

        const state = this.coreBridge.getTrackingState();
        if (!state.isTracking) return;

        const newName = this.taskNameEntry.get_text().trim();

        if (newName && newName !== state.currentTaskName) {
            try {
                this._blockTaskNameUpdate = true;
                await this.coreBridge.updateCurrentTaskName(newName);
                this._blockTaskNameUpdate = false;
            } catch (error) {
                console.error('❌ Error updating task name:', error);
                this._blockTaskNameUpdate = false;
            }
        }
    }

    _formatDuration(seconds) {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;
        return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }

    _onCloseOpen() {
        if (this.shiftMode) {
            // In shift mode: just hide compact tracker
            this.set_visible(false);
        } else {
            // Normal mode: open main window and hide compact tracker
            if (this.application && typeof this.application.openMainApplication === 'function') {
                this.application.openMainApplication();
            }
            this.set_visible(false);
        }
    }
});
