import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

/**
 * Shared Pomodoro state manager for synchronizing between main window and compact tracker
 */
class PomodoroManager {
    constructor() {
        this.isActive = false;
        this.startTime = null;
        this.minutes = 20; // Default 20 minutes
        this.updateInterval = null;
        this.widgets = new Set(); // Registered widgets that need updates
        this._loadConfig();
    }

    /**
     * Load Pomodoro configuration from JSON file
     */
    _loadConfig() {
        try {
            const configDir = GLib.get_user_config_dir() + '/valot';
            const configPath = configDir + '/pomodoro-config.json';
            let file = Gio.File.new_for_path(configPath);
            
            if (!file.query_exists(null)) {
                file = Gio.File.new_for_uri('resource:///com/odnoyko/valot/js/data/pomodoro-config.json');
            }
            if (file.query_exists(null)) {
                const [success, contents] = file.load_contents(null);
                if (success) {
                    const decoder = new TextDecoder('utf-8');
                    const configText = decoder.decode(contents);
                    const config = JSON.parse(configText);
                    if (config.defaultMinutes) {
                        this.minutes = config.defaultMinutes;
                    }
                }
            }
        } catch (error) {
            // Could not load Pomodoro config, using defaults
        }
    }

    /**
     * Register a widget to receive Pomodoro updates
     * @param {Object} widget - Widget with Pomodoro methods
     */
    registerWidget(widget) {
        this.widgets.add(widget);
        
        // If Pomodoro is already active, immediately notify this widget
        if (this.isActive && widget._onPomodoroStart) {
            widget._onPomodoroStart();
        }
    }

    /**
     * Unregister a widget
     * @param {Object} widget - Widget to remove
     */
    unregisterWidget(widget) {
        this.widgets.delete(widget);
    }

    /**
     * Start Pomodoro mode for all registered widgets
     */
    startPomodoro() {
        if (this.isActive) return;

        this.isActive = true;
        this.startTime = Date.now();

        // Notify all widgets to start Pomodoro display
        this.widgets.forEach(widget => {
            if (widget._onPomodoroStart) {
                widget._onPomodoroStart();
            }
        });

        // Start update interval
        setTimeout(() => {
            this._updateWidgets();
            this.updateInterval = setInterval(() => {
                this._updateWidgets();
            }, 1000);
        }, 500);
    }

    /**
     * Stop Pomodoro mode for all registered widgets
     */
    stopPomodoro() {
        if (!this.isActive) return;

        this.isActive = false;
        this.startTime = null;

        if (this.updateInterval) {
            clearInterval(this.updateInterval);
            this.updateInterval = null;
        }

        // Notify all widgets to stop Pomodoro display
        this.widgets.forEach(widget => {
            if (widget._onPomodoroStop) {
                widget._onPomodoroStop();
            }
        });
    }

    /**
     * Force update button states for all widgets (useful when tracking stops)
     */
    updateAllButtonStates() {
        this.widgets.forEach(widget => {
            if (widget._updateTrackingButtonState) {
                widget._updateTrackingButtonState();
            }
        });
    }

    /**
     * Update all registered widgets with current countdown
     */
    _updateWidgets() {
        if (!this.isActive || !this.startTime) {
            this.stopPomodoro();
            return;
        }

        // Check if tracking is still active - if not, stop Pomodoro
        const trackingActive = this._checkTrackingStatus();
        if (!trackingActive) {
            this.stopPomodoro();
            return;
        }

        const elapsed = Math.floor((Date.now() - this.startTime) / 1000);
        const totalSeconds = this.minutes * 60;
        const remaining = Math.max(0, totalSeconds - elapsed);

        if (remaining === 0) {
            // Time's up! Stop Pomodoro and trigger tracking stop
            this.stopPomodoro();
            
            // Find any widget to trigger stop tracking
            for (const widget of this.widgets) {
                if (widget._triggerTrackingStop) {
                    widget._triggerTrackingStop();
                    break;
                }
            }
            return;
        }

        // Format time
        const hours = Math.floor(remaining / 3600);
        const minutes = Math.floor((remaining % 3600) / 60);
        const seconds = remaining % 60;

        let formatted;
        if (hours > 0) {
            formatted = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        } else {
            formatted = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        }

        // Update all widgets
        this.widgets.forEach(widget => {
            if (widget._onPomodoroUpdate) {
                widget._onPomodoroUpdate(`🍅 ${formatted}`);
            }
        });
    }

    /**
     * Check if tracking is still active by asking widgets
     */
    _checkTrackingStatus() {
        // Ask any widget that can check tracking status
        for (const widget of this.widgets) {
            if (widget._isTrackingActive && typeof widget._isTrackingActive === 'function') {
                return widget._isTrackingActive();
            }
        }
        return true; // Assume active if we can't check
    }

    /**
     * Check if Pomodoro is currently active
     */
    getIsActive() {
        return this.isActive;
    }

    /**
     * Reload configuration (call when settings change)
     */
    reloadConfig() {
        this._loadConfig();
    }
}

// Export singleton instance
export const pomodoroManager = new PomodoroManager();