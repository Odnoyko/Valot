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
import Gio from 'gi://Gio';

export class HeaderTrackingWidget {
    constructor(config = {}) {
        this.parentWindow = config.parentWindow;
        this.coreBridge = config.coreBridge;

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

        this._buildWidget();
        this._connectToCore();
        this._updateUIFromCore();
        this._loadPomodoroConfig();
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
            tooltip_text: _('Start tracking (Long press or P for Pomodoro)'),
            css_classes: ['suggested-action', 'circular'],
        });

        // Long press gesture for Pomodoro mode (must be added before click handler)
        const longPressGesture = new Gtk.GestureLongPress();
        longPressGesture.set_touch_only(false); // Allow mouse long press
        longPressGesture.set_delay_factor(1.5); // 1.5 seconds delay

        longPressGesture.connect('pressed', () => {
            this.pomodoroActivated = true; // Flag to prevent normal click
            this._toggleTracking(true); // Activate Pomodoro mode
        });

        this.trackBtn.add_controller(longPressGesture);

        // Regular click handler
        this.trackBtn.connect('clicked', () => {
            // Prevent normal click if long press was triggered
            if (this.pomodoroActivated) {
                this.pomodoroActivated = false;
                return;
            }
            this._toggleTracking(false);
        });

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
            console.error('[HeaderTrackingWidget] CoreBridge not available - tracking widget cannot work');
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
            this.coreBridge.onUIEvent(event, this._coreEventHandlers[event]);
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

                // Pomodoro mode UI
                if (state.pomodoroMode) {
                    // OPTIMIZED: Only update icon if needed
                    if (this.trackBtn.get_icon_name() !== 'media-playback-stop-symbolic') {
                        this.trackBtn.set_icon_name('media-playback-stop-symbolic');
                    }
                    this.trackBtn.set_tooltip_text(_('Stop Pomodoro'));
                    this.trackBtn.remove_css_class('suggested-action');
                    this.trackBtn.remove_css_class('destructive-action');
                    this.trackBtn.add_css_class('pomodoro-active');

                    // Show countdown time
                    const remaining = state.pomodoroRemaining || 0;
                    this.timeLabel.set_label('🍅 ' + this._formatDuration(remaining, true));
                } else {
                    // Normal tracking mode
                    // OPTIMIZED: Only update icon if needed
                    if (this.trackBtn.get_icon_name() !== 'media-playback-stop-symbolic') {
                        this.trackBtn.set_icon_name('media-playback-stop-symbolic');
                    }
                    this.trackBtn.set_tooltip_text(_('Stop tracking'));
                    this.trackBtn.remove_css_class('suggested-action');
                    this.trackBtn.remove_css_class('pomodoro-active');
                    this.trackBtn.add_css_class('destructive-action');

                    // Update time display
                    this.timeLabel.set_label(this._formatDuration(state.elapsedSeconds));
                }

                // Start UI update timer
                this._subscribeToGlobalTimer();
            } else {
                // Update UI to idle mode
                this.taskButton.set_label(_('Select task...'));
                this.taskButton.set_sensitive(true);
                this.projectBtn.set_sensitive(true);
                this.clientBtn.set_sensitive(true);

                // OPTIMIZED: Only update icon if needed
                if (this.trackBtn.get_icon_name() !== 'media-playback-start-symbolic') {
                    this.trackBtn.set_icon_name('media-playback-start-symbolic');
                    this.trackBtn.set_tooltip_text(_('Start tracking (Long press or P for Pomodoro)'));
                }
                this.trackBtn.remove_css_class('destructive-action');
                this.trackBtn.remove_css_class('pomodoro-active');
                this.trackBtn.add_css_class('suggested-action');

                const timeText = '00:00:00';
                if (this._cachedTimeText !== timeText) {
                    this.timeLabel.set_label(timeText);
                    this._cachedTimeText = timeText;
                }
            }
        } catch (error) {
            console.error('[HeaderTrackingWidget] Error updating UI from Core:', error);
        }
    }

    /**
     * Core event: tracking started (from ANY widget/window)
     */
    _onTrackingStarted(data) {
        // OPTIMIZED: Clear cached UI state when starting new session
        // This prevents memory leaks when starting new Pomodoro session
        this._cachedPomodoroMode = null; // Force re-check
        this._cachedTimeText = '';
        this._cachedIconName = '';
        this._cachedTooltipText = '';
        
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
     * NOTE: Time updates come from global TimeTrackingService timer via tracking-updated event
     * UI components subscribe to events, not create separate timers
     */
    _onTrackingUpdated(data) {
        // tracking-updated fires every second from Core timer
        // Core timer calculates elapsedSeconds (currentTime - startTime), we just show it
        // No calculation in UI, no RAM storage - just display Core timer result
        // OPTIMIZED: Only update label text if it actually changed to prevent unnecessary redraws
        
        if (data && this.timeLabel) {
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
                this.timeLabel.set_label(newTimeText);
                this._cachedTimeText = newTimeText;
            }
        }
    }

    /**
     * User clicked start/stop button
     * @param {boolean} pomodoroMode - Whether to start in Pomodoro mode
     */
    async _toggleTracking(pomodoroMode = false) {
        if (!this.coreBridge) return;

        try {
            const state = this.coreBridge.getTrackingState();

            if (state.isTracking) {
                // If Pomodoro requested while already tracking, ignore
                if (pomodoroMode) return;

                // Stop tracking
                await this.coreBridge.stopTracking();
            } else {
                // Start tracking - need task ID
                // For now, show task selector with pomodoro flag
                this.pendingPomodoroMode = pomodoroMode;
                this._selectTask();
            }
        } catch (error) {
            console.error('[HeaderTrackingWidget] Error toggling tracking:', error);
            this._showError(error.message);
        }
    }

    /**
     * Start tracking with specific task
     */
    async _startTracking(taskId, projectId = null, clientId = null) {
        try {
            const pomodoroMode = this.pendingPomodoroMode || false;
            const pomodoroDuration = pomodoroMode ? this.pomodoroDuration : 0;

            await this.coreBridge.startTracking(taskId, projectId, clientId, pomodoroMode, pomodoroDuration);

            // Clear pending flag
            this.pendingPomodoroMode = false;
        } catch (error) {
            console.error('[HeaderTrackingWidget] Error starting tracking:', error);
            this._showError(error.message);
        }
    }

    /**
     * Subscribe to GlobalTimer for real-time UI updates
     * CRITICAL FIX: Only subscribe once, prevent listener accumulation
     */
    _subscribeToGlobalTimer() {
        // CRITICAL: Check if already subscribed to prevent memory leak
        if (this._isSubscribedToGlobalTimer) {
            return;
        }

        this._isSubscribedToGlobalTimer = true;

        // Listen to TRACKING_UPDATED events (emitted by GlobalTimer via TimeTrackingService)
        this.coreBridge.onUIEvent('tracking-updated', (data) => {
            const state = this.coreBridge.getTrackingState();
            if (state.isTracking) {
                // Update time display based on mode
                if (state.pomodoroMode) {
                    const remaining = state.pomodoroRemaining || 0;
                    this.timeLabel.set_label('🍅 ' + this._formatDuration(remaining, true));
                } else {
                    this.timeLabel.set_label(this._formatDuration(state.elapsedSeconds));
                }
            }
        });

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
            console.error('[HeaderTrackingWidget] Error opening task selector:', error);
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
            console.error('[HeaderTrackingWidget] Cannot open compact tracker: no application reference');
            return;
        }

        // Launch compact tracker via Application
        this.parentWindow.application._launchCompactTracker(shiftMode);
    }

    _showError(message) {
        console.error('[HeaderTrackingWidget] Tracking error:', message);
        // TODO: Show toast notification
    }

    getWidget() {
        return this.widget;
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
            console.error('[HeaderTrackingWidget] Error loading Pomodoro config:', error);
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
            console.error('[HeaderTrackingWidget] Error setting up config monitor:', error);
        }
    }

    cleanup() {
        if (this.pomodoroConfigMonitor) {
            this.pomodoroConfigMonitor.cancel();
            this.pomodoroConfigMonitor = null;
        }
    }
}
