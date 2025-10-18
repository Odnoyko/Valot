/**
 * Advanced Tracking Widget
 * Full-featured tracking widget with live editing, project/client selection
 * Used in page headers across the app
 *
 * Features:
 * - Task name entry with live editing during tracking
 * - Project dropdown
 * - Client dropdown
 * - Time display
 * - Track button (start/stop)
 * - Auto-save while typing (debounced)
 * - Enter key to start/stop tracking
 */

import Gtk from 'gi://Gtk?version=4.0';
import Gdk from 'gi://Gdk?version=4.0';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import { ProjectDropdown } from 'resource:///com/odnoyko/valot/ui/utils/projectDropdown.js';
import { ClientDropdown } from 'resource:///com/odnoyko/valot/ui/utils/clientDropdown.js';

export class AdvancedTrackingWidget {
    constructor(coreBridge, parentWindow) {
        this.coreBridge = coreBridge;
        this.parentWindow = parentWindow;

        // Current selections
        this.currentProjectId = 1;
        this.currentClientId = 1;

        // UI update timer
        this.trackingUITimer = null;
        this.taskNameDebounceTimer = null;
        this._blockTaskNameUpdate = false;

        // Pomodoro configuration
        this.pomodoroDuration = 1200; // Default 20 minutes in seconds
        this.pomodoroActivated = false; // Flag to prevent click after long press
        this.pendingPomodoroMode = false; // Flag for pending pomodoro start
        this.pomodoroConfigMonitor = null; // File monitor for config changes

        // Build widget
        this.widget = this._createWidget();
        this._connectToCore();
        this._updateUIFromCore();
        this._loadPomodoroConfig();
    }

    _createWidget() {
        const box = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 8,
            hexpand: true,
            hexpand_set: true,
        });

        // Task name entry
        this.taskNameEntry = new Gtk.Entry({
            placeholder_text: _('Task name'),
            hexpand: true,
            hexpand_set: true,
        });

        // Auto-update task name while typing (if tracking)
        this.taskNameEntry.connect('changed', () => {
            // Don't trigger update during programmatic changes
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

        box.append(this.taskNameEntry);

        // Project dropdown
        this._setupProjectDropdown();
        box.append(this.projectDropdown.getWidget());

        // Client dropdown
        this._setupClientDropdown();
        box.append(this.clientDropdown.getWidget());

        // Time label
        this.actualTimeLabel = new Gtk.Label({
            label: '00:00:00',
            css_classes: ['title-4'],
            margin_start: 8,
        });
        box.append(this.actualTimeLabel);

        // Track button
        this.trackButton = new Gtk.Button({
            icon_name: 'media-playback-start-symbolic',
            css_classes: ['suggested-action', 'circular'],
            tooltip_text: _('Start tracking (Long press or P for Pomodoro)'),
        });

        // Long press gesture for Pomodoro mode (must be added before click handler)
        const longPressGesture = new Gtk.GestureLongPress();
        longPressGesture.set_touch_only(false); // Allow mouse long press
        longPressGesture.set_delay_factor(1.5); // 1.5 seconds delay

        // Listen to 'begin' to start animation
        longPressGesture.connect('begin', () => {
            this.trackButton.add_css_class('long-press-active');
        });

        longPressGesture.connect('pressed', (gesture, x, y) => {
            // Prevent normal click from firing
            this.pomodoroActivated = true;

            // Cancel the gesture to prevent it from blocking future presses
            gesture.set_state(Gtk.EventSequenceState.CLAIMED);

            this._toggleTracking(true); // Activate Pomodoro mode

            // Remove animation class after completion
            GLib.timeout_add(GLib.PRIORITY_DEFAULT, 100, () => {
                this.trackButton.remove_css_class('long-press-active');
                return false;
            });

            // Reset flag after a longer delay to ensure stability
            GLib.timeout_add(GLib.PRIORITY_DEFAULT, 500, () => {
                this.pomodoroActivated = false;
                return false;
            });
        });

        // Also listen to 'end' and 'cancel' signals to reset gesture state and remove animation
        longPressGesture.connect('end', (gesture) => {
            gesture.reset();
            this.trackButton.remove_css_class('long-press-active');
        });

        longPressGesture.connect('cancel', () => {
            this.trackButton.remove_css_class('long-press-active');
        });

        this.trackButton.add_controller(longPressGesture);

        // Regular click handler
        this.trackButton.connect('clicked', () => {
            // Prevent normal click if long press was triggered
            if (this.pomodoroActivated) {
                this.pomodoroActivated = false;
                return;
            }
            this._toggleTracking(false);
        });

        box.append(this.trackButton);

        return box;
    }

    _setupProjectDropdown() {
        this.projectDropdown = new ProjectDropdown(
            this.coreBridge,
            this.currentProjectId,
            async (selectedProject) => {
                this.currentProjectId = selectedProject.id;

                // If tracking, update project in real-time
                const state = this.coreBridge?.getTrackingState();
                if (state && state.isTracking) {
                    await this._updateTrackingContext();
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

                // If tracking, update client in real-time
                const state = this.coreBridge?.getTrackingState();
                if (state && state.isTracking) {
                    await this._updateTrackingContext();
                }
            }
        );
    }

    _connectToCore() {
        if (!this.coreBridge) {
            return;
        }

        // Subscribe to Core events
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

    _updateUIFromCore() {
        if (!this.coreBridge) return;

        const state = this.coreBridge.getTrackingState();

        if (state.isTracking) {
            // Tracking active - allow editing!
            const cursorPosition = this.taskNameEntry.get_position();
            const oldText = this.taskNameEntry.get_text();
            const newText = state.currentTaskName || '';

            // Block change handler during programmatic update
            this._blockTaskNameUpdate = true;
            this.taskNameEntry.set_text(newText);
            this.taskNameEntry.set_sensitive(true);
            this._blockTaskNameUpdate = false;

            // Restore cursor position if text didn't change, otherwise move to end
            if (oldText === newText && cursorPosition >= 0) {
                this.taskNameEntry.set_position(cursorPosition);
            } else {
                this.taskNameEntry.set_position(-1); // -1 = end of text
            }

            // Update dropdowns with current tracking context
            if (state.currentProjectId && this.projectDropdown) {
                this.currentProjectId = state.currentProjectId;
                this.projectDropdown.setCurrentProject(state.currentProjectId);
            }
            if (state.currentClientId && this.clientDropdown) {
                this.currentClientId = state.currentClientId;
                this.clientDropdown.setSelectedClient(state.currentClientId);
            }

            // Change icon to stop
            this.trackButton.set_icon_name('media-playback-stop-symbolic');

            // Pomodoro mode UI
            if (state.pomodoroMode) {
                this.trackButton.set_tooltip_text(_('Stop Pomodoro'));
                this.trackButton.remove_css_class('suggested-action');
                this.trackButton.remove_css_class('destructive-action');
                this.trackButton.add_css_class('pomodoro-active');

                // Show countdown time
                const remaining = state.pomodoroRemaining || 0;
                this.actualTimeLabel.set_label('🍅 ' + this._formatDuration(remaining, true));
            } else {
                this.trackButton.set_tooltip_text(_('Stop tracking'));
                this.trackButton.remove_css_class('pomodoro-active');
                if (!this.trackButton.has_css_class('suggested-action')) {
                    this.trackButton.add_css_class('suggested-action');
                }

                this.actualTimeLabel.set_label(this._formatDuration(state.elapsedSeconds));
            }

            // Start UI update timer
            this._startUITimer();
        } else {
            // Tracking idle - KEEP task name in input (don't clear it)
            this.taskNameEntry.set_sensitive(true);

            // Restore last used project/client (or default if never tracked)
            const lastProjectId = this.coreBridge.getLastUsedProjectId() || 1;
            const lastClientId = this.coreBridge.getLastUsedClientId() || 1;

            this.currentProjectId = lastProjectId;
            this.currentClientId = lastClientId;
            if (this.projectDropdown) {
                this.projectDropdown.setCurrentProject(lastProjectId);
            }
            if (this.clientDropdown) {
                this.clientDropdown.setSelectedClient(lastClientId);
            }

            // Change icon to play, keep green
            this.trackButton.set_icon_name('media-playback-start-symbolic');
            this.trackButton.set_tooltip_text(_('Start tracking (Long press or P for Pomodoro)'));
            this.trackButton.remove_css_class('pomodoro-active');
            this.trackButton.remove_css_class('destructive-action');
            if (!this.trackButton.has_css_class('suggested-action')) {
                this.trackButton.add_css_class('suggested-action');
            }

            this.actualTimeLabel.set_label('00:00:00');

            // Stop UI update timer
            this._stopUITimer();
        }
    }

    _onTrackingStarted(data) {
        // Force full UI refresh to synchronize with current state
        this._updateUIFromCore();
    }

    _onTrackingStopped(data) {
        // Force full UI refresh to synchronize with current state
        this._updateUIFromCore();
    }

    _onTrackingUpdated(data) {
        const state = this.coreBridge.getTrackingState();

        // Update time display based on mode
        if (state.pomodoroMode) {
            // Show countdown in Pomodoro mode
            const remaining = state.pomodoroRemaining || 0;
            this.actualTimeLabel.set_label('🍅 ' + this._formatDuration(remaining, true));
        } else {
            // Show elapsed time in normal mode
            this.actualTimeLabel.set_label(this._formatDuration(state.elapsedSeconds));
        }

        // Update task name if changed (e.g., from edit dialog)
        if (state.isTracking && data.taskName) {
            const currentText = this.taskNameEntry.get_text();
            if (currentText !== data.taskName) {
                this._blockTaskNameUpdate = true;
                this.taskNameEntry.set_text(data.taskName);
                this.taskNameEntry.set_position(-1); // Move cursor to end
                this._blockTaskNameUpdate = false;
            }
        }

        // Update project dropdown if changed
        if (data.projectId !== undefined && this.projectDropdown) {
            this.currentProjectId = data.projectId;
            this.projectDropdown.setCurrentProject(data.projectId);
        }

        // Update client dropdown if changed
        if (data.clientId !== undefined && this.clientDropdown) {
            this.currentClientId = data.clientId;
            this.clientDropdown.setSelectedClient(data.clientId);
        }
    }

    async _toggleTracking(pomodoroMode = false) {
        if (!this.coreBridge) return;

        try {
            const state = this.coreBridge.getTrackingState();

            if (state.isTracking) {
                // If Pomodoro requested while already tracking, ignore
                if (pomodoroMode) {
                    return;
                }
                // Stop tracking
                await this.coreBridge.stopTracking();
            } else {
                this.pendingPomodoroMode = pomodoroMode;

                // Start tracking
                let taskName = this.taskNameEntry.get_text().trim();
                let task;

                // Auto-generate task if empty - use Core logic
                if (!taskName) {
                    task = await this.coreBridge.createAutoIndexedTask(
                        this.currentProjectId,
                        this.currentClientId
                    );

                    // Update entry with generated name
                    this._blockTaskNameUpdate = true;
                    this.taskNameEntry.set_text(task.name);
                    this._blockTaskNameUpdate = false;

                } else {
                    // Find or create task by name
                    task = await this.coreBridge.findOrCreateTask(taskName);
                }

                // Start tracking with current project/client selection
                const pomodoroDuration = this.pendingPomodoroMode ? this.pomodoroDuration : 0;

                await this.coreBridge.startTracking(
                    task.id,
                    this.currentProjectId,
                    this.currentClientId,
                    this.pendingPomodoroMode,
                    pomodoroDuration
                );

                // Clear pending flag
                this.pendingPomodoroMode = false;

            }
        } catch (error) {
            console.error('Error toggling tracking:', error);
        }
    }

    async _updateTaskNameFromInput() {
        if (!this.coreBridge) return;

        const state = this.coreBridge.getTrackingState();
        if (!state.isTracking) return;

        const newName = this.taskNameEntry.get_text().trim();
        if (!newName || newName === state.currentTaskName) return;

        try {

            // Update the current tracking session with new name
            await this.coreBridge.updateCurrentTaskName(newName);

        } catch (error) {
            console.error('Error updating task name:', error);
        }
    }

    async _updateTrackingContext() {
        if (!this.coreBridge) return;

        const state = this.coreBridge.getTrackingState();
        if (!state.isTracking) return;

        try {

            // Update project/client for current tracking session
            await this.coreBridge.updateCurrentProjectClient(
                this.currentProjectId,
                this.currentClientId
            );


        } catch (error) {
            console.error('Error updating tracking context:', error);
        }
    }

    _startUITimer() {
        if (this.trackingUITimer) return;

        this.trackingUITimer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1000, () => {
            const state = this.coreBridge?.getTrackingState();
            if (state && state.isTracking) {
                // Update time display based on mode
                if (state.pomodoroMode) {
                    const remaining = state.pomodoroRemaining || 0;
                    this.actualTimeLabel.set_label('🍅 ' + this._formatDuration(remaining, true));
                } else {
                    this.actualTimeLabel.set_label(this._formatDuration(state.elapsedSeconds));
                }
                return true; // Continue
            } else {
                this.trackingUITimer = null;
                return false; // Stop
            }
        });
    }

    _stopUITimer() {
        if (this.trackingUITimer) {
            GLib.Source.remove(this.trackingUITimer);
            this.trackingUITimer = null;
        }
    }

    _formatDuration(seconds, useShortFormat = false) {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;

        // For Pomodoro mode, use short format if duration is less than 1 hour
        if (useShortFormat && hours === 0) {
            return `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
        }

        return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }

    getWidget() {
        return this.widget;
    }

    /**
     * Force refresh UI from Core state
     * Call this when page becomes visible to synchronize
     */
    refresh() {
        this._updateUIFromCore();
    }

    /**
     * Load Pomodoro configuration from file
     */
    async _loadPomodoroConfig() {
        try {
            const configDir = GLib.get_user_config_dir() + '/valot';
            const configPath = configDir + '/pomodoro-config.json';
            const file = Gio.File.new_for_path(configPath);

            if (!file.query_exists(null)) {
                // Use default 20 minutes
                this.pomodoroDuration = 1200;
                this._setupConfigMonitor(file);
                return;
            }

            const [success, contents] = file.load_contents(null);
            if (success) {
                const decoder = new TextDecoder('utf-8');
                const jsonStr = decoder.decode(contents);
                const config = JSON.parse(jsonStr);

                // Convert minutes to seconds
                this.pomodoroDuration = (config.defaultMinutes || 20) * 60;
            }

            // Setup file monitor to watch for changes
            this._setupConfigMonitor(file);
        } catch (error) {
            console.error('Error loading Pomodoro config:', error);
            // Fallback to default
            this.pomodoroDuration = 1200; // 20 minutes
        }
    }

    /**
     * Setup file monitor to watch for config changes
     */
    _setupConfigMonitor(file) {
        if (this.pomodoroConfigMonitor) {
            return; // Already monitoring
        }

        try {
            this.pomodoroConfigMonitor = file.monitor_file(Gio.FileMonitorFlags.NONE, null);
            this.pomodoroConfigMonitor.connect('changed', (monitor, file, otherFile, eventType) => {
                if (eventType === Gio.FileMonitorEvent.CHANGES_DONE_HINT ||
                    eventType === Gio.FileMonitorEvent.CREATED) {
                    this._loadPomodoroConfig();
                }
            });
        } catch (error) {
            console.error('Error setting up config monitor:', error);
        }
    }

    cleanup() {
        this._stopUITimer();
        if (this.taskNameDebounceTimer) {
            GLib.Source.remove(this.taskNameDebounceTimer);
            this.taskNameDebounceTimer = null;
        }
        if (this.pomodoroConfigMonitor) {
            this.pomodoroConfigMonitor.cancel();
            this.pomodoroConfigMonitor = null;
        }
    }
}
