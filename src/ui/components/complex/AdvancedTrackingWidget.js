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
import { Logger } from 'resource:///com/odnoyko/valot/core/utils/Logger.js';

export class AdvancedTrackingWidget {
    constructor(coreBridge, parentWindow) {
        this.coreBridge = coreBridge;
        this.parentWindow = parentWindow;

        // Initialize GSettings for persistence
        this.settings = new Gio.Settings({ schema: 'com.odnoyko.valot' });

        // Current selections - restore from GSettings (Core will validate)
        this.currentProjectId = this.settings.get_int('last-project-id') || 1;
        this.currentClientId = this.settings.get_int('last-client-id') || 1;
        this.taskNameDebounceTimer = null;
        this._blockTaskNameUpdate = false;

        // Pomodoro configuration
        this.pomodoroDuration = 1200; // Default 20 minutes in seconds
        this.pomodoroActivated = false; // Flag to prevent click after long press
        this.pendingPomodoroMode = false; // Flag for pending pomodoro start
        this.pomodoroConfigMonitor = null; // File monitor for config changes
        
        // OPTIMIZED: Cache UI state to prevent unnecessary updates
        this._cachedPomodoroMode = false;
        this._cachedTimeText = '';
        this._cachedIconName = '';
        this._cachedTooltipText = '';
        this._isTracking = false; // Cache tracking state - avoid getTrackingState() calls

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
        // OPTIMIZED: Use cached _isTracking flag - no getTrackingState() call
        this.taskNameEntry.connect('changed', () => {
            // Don't trigger update during programmatic changes
            if (this._blockTaskNameUpdate) return;

            // Use cached flag - avoid object creation
            if (!this._isTracking) return;

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

                // Save to GSettings for persistence
                this.settings.set_int('last-project-id', selectedProject.id);

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

                // Save to GSettings for persistence
                this.settings.set_int('last-client-id', selectedClient.id);

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

        // Subscribe to Core events
        Object.keys(this._coreEventHandlers).forEach(event => {
            this.coreBridge.onUIEvent(event, this._coreEventHandlers[event]);
        });

    }

    _updateUIFromCore() {
        if (!this.coreBridge) return;

        const state = this.coreBridge.getTrackingState();
        
        // Update cached tracking flag
        this._isTracking = state.isTracking || false;

        if (state.isTracking) {
            // Tracking active - allow editing!
            const oldText = this.taskNameEntry.get_text();
            const newText = state.currentTaskName || '';

            // Only update text if entry doesn't have focus (user is not typing)
            // This prevents cursor jumping and text being overwritten while typing
            const hasFocus = this.taskNameEntry.is_focus();

            if (!hasFocus && oldText !== newText) {
                // Block change handler during programmatic update
                this._blockTaskNameUpdate = true;
                this.taskNameEntry.set_text(newText);
                this._blockTaskNameUpdate = false;
                this.taskNameEntry.set_position(-1); // Move cursor to end
            }

            this.taskNameEntry.set_sensitive(true);

            // Update dropdowns with current tracking context
            if (state.currentProjectId && this.projectDropdown) {
                this.currentProjectId = state.currentProjectId;
                this.projectDropdown.setCurrentProject(state.currentProjectId);
            }
            if (state.currentClientId && this.clientDropdown) {
                this.currentClientId = state.currentClientId;
                this.clientDropdown.setSelectedClient(state.currentClientId);
            }
            // OPTIMIZED: Only change icon if needed (avoid GTK icon recoloring)
            if (this.trackButton.get_icon_name() !== 'media-playback-stop-symbolic') {
                this.trackButton.set_icon_name('media-playback-stop-symbolic');
            }

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
                this._cachedPomodoroMode = isPomodoroMode;
            }

            // Subscribe to GlobalTimer for UI updates
            this._subscribeToGlobalTimer();
        } else {
            // Tracking idle - KEEP task name in input (don't clear it)
            this.taskNameEntry.set_sensitive(true);

            // Use values already loaded from GSettings in constructor
            // (this.currentProjectId and this.currentClientId are already set from GSettings)
            if (this.projectDropdown) {
                this.projectDropdown.setCurrentProject(this.currentProjectId);
            }
            if (this.clientDropdown) {
                this.clientDropdown.setSelectedClient(this.currentClientId);
            }

            // OPTIMIZED: Only change icon if needed (avoid GTK icon recoloring)
            if (this.trackButton.get_icon_name() !== 'media-playback-start-symbolic') {
                this.trackButton.set_icon_name('media-playback-start-symbolic');
                this.trackButton.set_tooltip_text(_('Start tracking (Long press or P for Pomodoro)'));
            }
            this.trackButton.remove_css_class('pomodoro-active');
            this.trackButton.remove_css_class('destructive-action');
            if (!this.trackButton.has_css_class('suggested-action')) {
                this.trackButton.add_css_class('suggested-action');
            }

            const timeText = '00:00:00';
            if (this._cachedTimeText !== timeText) {
                this.actualTimeLabel.set_label(timeText);
                this._cachedTimeText = timeText;
            }
        }
    }

    _onTrackingStarted(data) {
        // OPTIMIZED: Clear cached UI state when starting new session
        // This prevents memory leaks when starting new Pomodoro session
        this._cachedPomodoroMode = null; // Force re-check
        this._cachedTimeText = '';
        this._cachedIconName = '';
        this._cachedTooltipText = '';
        
        // Force full UI refresh to synchronize with current state
        this._updateUIFromCore();
    }

    _onTrackingStopped(data) {
        // CRITICAL: Clear tracking flag FIRST to prevent tracking-updated events from updating UI
        this._isTracking = false;
        
        // OPTIMIZED: Clear all cached UI state to free RAM after tracking stops
        this._cachedPomodoroMode = false;
        this._cachedTimeText = '';
        this._cachedIconName = '';
        this._cachedTooltipText = '';
        
        // CRITICAL: Immediately update time label to 00:00:00 and button to start icon
        // Don't wait for _updateUIFromCore() which might use stale cached state
        if (this.actualTimeLabel) {
            const timeText = '00:00:00';
            this.actualTimeLabel.set_label(timeText);
            this._cachedTimeText = timeText;
        }
        
        if (this.trackButton) {
            this.trackButton.set_icon_name('media-playback-start-symbolic');
            this._cachedIconName = 'media-playback-start-symbolic';
            
            const tooltipText = _('Start tracking (Long press or P for Pomodoro)');
            this.trackButton.set_tooltip_text(tooltipText);
            this._cachedTooltipText = tooltipText;
            
            // Update CSS classes
            if (this.trackButton.has_css_class('pomodoro-active')) {
                this.trackButton.remove_css_class('pomodoro-active');
            }
            if (this.trackButton.has_css_class('destructive-action')) {
                this.trackButton.remove_css_class('destructive-action');
            }
            if (!this.trackButton.has_css_class('suggested-action')) {
                this.trackButton.add_css_class('suggested-action');
            }
        }
        
        // Force full UI refresh to synchronize with current state
        this._updateUIFromCore();
    }

    _onTrackingUpdated(data) {
        // tracking-updated fires every second from Core timer
        // Core timer calculates elapsedSeconds (currentTime - startTime), we just show it
        // No calculation in UI, no RAM storage - just display Core timer result
        // OPTIMIZED: Only update label text if it actually changed to prevent unnecessary redraws
        
        // CRITICAL: Don't update if tracking is stopped (prevent updates after stop)
        if (!this._isTracking) {
            return;
        }
        
        if (data && this.actualTimeLabel) {
            let newTimeText = '';
            if (data.pomodoroRemaining !== undefined && data.pomodoroRemaining > 0) {
                // Pomodoro mode - show remaining time
                newTimeText = '🍅 ' + this._formatDuration(data.pomodoroRemaining, true);
            } else if (data.elapsedSeconds !== undefined) {
                // Normal tracking mode - show elapsed time
                newTimeText = this._formatDuration(data.elapsedSeconds);
            }
            
            // OPTIMIZED: Only update label if text actually changed
            if (newTimeText && newTimeText !== this._cachedTimeText) {
                this.actualTimeLabel.set_label(newTimeText);
                this._cachedTimeText = newTimeText;
            }
        }

        // Update task name if changed (e.g., from edit dialog)
        // Only update if entry doesn't have focus (user is not typing)
        // DISABLED: getTrackingState() creates objects - use data from event instead
        // const state = this.coreBridge.getTrackingState();
        if (data && data.taskName && !this.taskNameEntry.is_focus()) {
            const currentText = this.taskNameEntry.get_text();
            if (currentText !== data.taskName) {
                this._blockTaskNameUpdate = true;
                this.taskNameEntry.set_text(data.taskName);
                this.taskNameEntry.set_position(-1); // Move cursor to end
                this._blockTaskNameUpdate = false;
            }
        }

        // DISABLED: Project/client updates in tracking-updated handler
        // These updates should happen only on tracking-started, not every second
        // if (data && data.projectId !== undefined && data.projectId !== this.currentProjectId && this.projectDropdown) {
        //     this.currentProjectId = data.projectId;
        //     this.projectDropdown.setCurrentProject(data.projectId);
        // }
        // 
        // if (data && data.clientId !== undefined && data.clientId !== this.currentClientId && this.clientDropdown) {
        //     this.currentClientId = data.clientId;
        //     this.clientDropdown.setSelectedClient(data.clientId);
        // }
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
            Logger.error('[AdvancedTrackingWidget] Error toggling tracking:', error);
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
            Logger.error('[AdvancedTrackingWidget] Error updating task name:', error);
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
            Logger.error('[AdvancedTrackingWidget] Error updating tracking context:', error);
        }
    }
    /**
     * Subscribe to GlobalTimer ticks for real-time UI updates
     * CRITICAL FIX: Only subscribe once, prevent listener accumulation
     */
    _subscribeToGlobalTimer() {
        // CRITICAL: Check if already subscribed to prevent memory leak
        if (this._isSubscribedToGlobalTimer) {
            console.log('[AdvancedTrackingWidget] Already subscribed to GlobalTimer, skipping');
            return;
        }

        this._isSubscribedToGlobalTimer = true;

        // Listen to TRACKING_UPDATED events (which are now emitted by GlobalTimer via TimeTrackingService)
        this.coreBridge.onUIEvent('tracking-updated', (data) => {
            const state = this.coreBridge?.getTrackingState();
            if (state && state.isTracking) {
                // Update time display based on mode
                if (state.pomodoroMode) {
                    const remaining = state.pomodoroRemaining || 0;
                    this.actualTimeLabel.set_label('🍅 ' + this._formatDuration(remaining, true));
                } else {
                    this.actualTimeLabel.set_label(this._formatDuration(state.elapsedSeconds));
                }
            }
        });

        console.log('[AdvancedTrackingWidget] Subscribed to GlobalTimer (once)');
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
            Logger.error('[AdvancedTrackingWidget] Error loading Pomodoro config:', error);
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
            Logger.error('[AdvancedTrackingWidget] Error setting up config monitor:', error);
        }
    }

    cleanup() {
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
