console.log("trackingStateManager.js loaded");

import GLib from 'gi://GLib';

/**
 * Centralized tracking state manager for synchronizing UI elements
 * when time tracking starts/stops
 */
class TrackingStateManager {
    constructor() {
        this.currentTrackingTask = null;
        this.trackingStartTime = null;
        this.trackingButtons = new Set();
        this.stackButtons = new Map(); // Maps stack/group base names to buttons
        this.stackTimeLabels = new Map(); // Maps stack/group base names to time labels
        this.timeLabels = new Set(); // Time display labels for real-time updates
        this.projectTimeLabels = new Map(); // Maps project IDs to time labels
        this.sidebarElements = new Map(); // Sidebar quick stats elements
        this.subscribers = new Set(); // Components that need updates
        this.intervalId = null;
        this.realTimeUpdateInterval = null;
        this.currentElapsedTime = 0;
        this._lastSyncedTaskName = null; // Track last synced task name for smart input clearing
    }

    /**
     * Start tracking for a specific task
     * @param {Object} taskInfo - Task information
     * @param {string} taskInfo.name - Task name
     * @param {string} taskInfo.baseName - Base name for grouping (optional)
     * @param {number} taskInfo.projectId - Project ID
     * @param {string} taskInfo.projectName - Project name
     */
    startTracking(taskInfo) {
        console.log('📊 TrackingStateManager: Starting tracking for', taskInfo.name);
        
        // Stop any existing tracking first
        if (this.currentTrackingTask) {
            this.stopTracking();
        }

        this.currentTrackingTask = taskInfo;
        this.trackingStartTime = Date.now();
        this.currentElapsedTime = 0;
        
        // Start real-time updates
        this._startRealTimeUpdates();
        
        // Update all UI elements
        this._updateAllTrackingButtons();
        this._updateStackButtons();
        this._updateAllTimeLabels();
        this._notifySubscribers('start', taskInfo);
        this._notifySubscribers('updateTaskList', taskInfo);
    }

    /**
     * Stop current tracking
     * @returns {Object|null} Information about the stopped task
     */
    stopTracking() {
        if (!this.currentTrackingTask) {
            console.log('📊 TrackingStateManager: No active tracking to stop');
            return null;
        }

        console.log('📊 TrackingStateManager: Stopping tracking for', this.currentTrackingTask.name);
        
        const stoppedTask = {
            ...this.currentTrackingTask,
            duration: this.trackingStartTime ? Math.floor((Date.now() - this.trackingStartTime) / 1000) : 0
        };

        this.currentTrackingTask = null;
        this.trackingStartTime = null;
        this.currentElapsedTime = 0;

        // Stop real-time updates
        this._stopRealTimeUpdates();

        // Update all UI elements
        this._updateAllTrackingButtons();
        this._updateStackButtons();
        this._updateAllTimeLabels();
        this._notifySubscribers('stop', stoppedTask);
        this._notifySubscribers('updateTaskList', stoppedTask);

        return stoppedTask;
    }

    /**
     * Get current tracking status
     * @returns {Object|null} Current tracking task info or null
     */
    getCurrentTracking() {
        return this.currentTrackingTask;
    }

    /**
     * Check if a specific task is being tracked
     * @param {string} taskIdentifier - Task group key (baseName::project::client) to check
     * @returns {boolean}
     */
    isTaskTracking(taskIdentifier) {
        if (!this.currentTrackingTask) {
            return false;
        }
        
        // Create group key for current tracking task
        const currentTaskGroupKey = `${this.currentTrackingTask.baseName}::${this.currentTrackingTask.projectName}::${this.currentTrackingTask.clientName}`;
        return currentTaskGroupKey === taskIdentifier;
    }

    /**
     * Check if any task in a stack/group is being tracked
     * @param {string} groupKey - Full group key (baseName::project::client) of the stack/group
     * @returns {boolean}
     */
    isStackTracking(groupKey) {
        if (!this.currentTrackingTask) {
            console.log(`📊 TrackingStateManager: isStackTracking("${groupKey}") = false (no active tracking)`);
            return false;
        }
        
        // Create group key for current tracking task
        const currentTaskGroupKey = `${this.currentTrackingTask.baseName}::${this.currentTrackingTask.projectName}::${this.currentTrackingTask.clientName}`;
        const taskBelongsToStack = currentTaskGroupKey === groupKey;
        
        console.log(`📊 TrackingStateManager: isStackTracking("${groupKey}") = ${taskBelongsToStack}`);
        console.log(`📊 Current task group key: "${currentTaskGroupKey}"`);
        console.log(`📊 Requested group key: "${groupKey}"`);
        
        return taskBelongsToStack;
    }

    /**
     * Register a tracking button for updates
     * @param {Gtk.Button} button - The button to register
     * @param {string} taskIdentifier - Associated task identifier (group key for individual tasks, null for general buttons)
     * @param {Gtk.Entry} input - Associated input field (optional)
     */
    registerTrackingButton(button, taskIdentifier = null, input = null) {
        this.trackingButtons.add({ button, taskName: taskIdentifier, input });
    }

    /**
     * Register a stack/group tracking button
     * @param {Gtk.Button} button - The stack button
     * @param {string} groupKey - Full group key (baseName::project::client) of the stack/group
     */
    registerStackButton(button, groupKey) {
        this.stackButtons.set(groupKey, button);
    }

    /**
     * Register a stack/group time label for real-time updates
     * @param {Gtk.Label} label - The time label
     * @param {string} groupKey - Full group key (baseName::project::client) of the stack/group
     */
    registerStackTimeLabel(label, groupKey) {
        this.stackTimeLabels.set(groupKey, label);
    }

    /**
     * Register a time label for real-time updates
     * @param {Gtk.Label} label - The time label
     * @param {string} taskName - Associated task name (optional)
     */
    registerTimeLabel(label, taskName = null) {
        this.timeLabels.add({ label, taskName });
    }

    /**
     * Register a project time label for real-time updates
     * @param {Gtk.Label} label - The project time label
     * @param {number} projectId - Project ID
     */
    registerProjectTimeLabel(label, projectId) {
        this.projectTimeLabels.set(projectId, label);
    }

    /**
     * Register sidebar elements for real-time updates
     * @param {string} elementType - Type of element (weeklyTime, todayTime, etc.)
     * @param {Gtk.Widget} element - The sidebar element
     */
    registerSidebarElement(elementType, element) {
        this.sidebarElements.set(elementType, element);
    }

    /**
     * Subscribe to tracking state changes
     * @param {Function} callback - Callback function(event, taskInfo)
     */
    subscribe(callback) {
        this.subscribers.add(callback);
        return () => this.subscribers.delete(callback);
    }

    /**
     * Update all registered tracking buttons
     * @private
     */
    _updateAllTrackingButtons() {
        this.trackingButtons.forEach(({ button, taskName, input }) => {
            if (!button || typeof button.set_icon_name !== 'function') return;

            const isThisTaskTracking = taskName && this.isTaskTracking(taskName);
            const isAnyTracking = this.currentTrackingTask !== null;

            if (isThisTaskTracking || (isAnyTracking && !taskName)) {
                // This specific task is being tracked OR it's a general button and something is tracking
                button.set_icon_name('media-playback-stop-symbolic');
                button.set_tooltip_text('Stop tracking');
                
                // Synchronize input field if provided - set to current tracking task name
                if (input && this.currentTrackingTask) {
                    try {
                        input.set_text(this.currentTrackingTask.name);
                        this._lastSyncedTaskName = this.currentTrackingTask.name;
                        console.log(`📊 TrackingStateManager: Synced input field to "${this.currentTrackingTask.name}"`);
                    } catch (error) {
                        console.error('📊 TrackingStateManager: Error syncing input field:', error);
                    }
                }
            } else {
                // This task is not being tracked
                button.set_icon_name('media-playback-start-symbolic');
                button.set_tooltip_text('Start tracking');
                
                // FIXED: Only clear input field if it was previously synced with tracking data
                // Don't clear user input that wasn't related to tracking
                if (input && !isAnyTracking && !taskName) {
                    try {
                        // Only clear if the input contains tracking-related data
                        const currentText = input.get_text();
                        if (currentText && this._lastSyncedTaskName && currentText === this._lastSyncedTaskName) {
                            input.set_text('');
                            console.log('📊 TrackingStateManager: Cleared synced input field (no active tracking)');
                        }
                        this._lastSyncedTaskName = null;
                    } catch (error) {
                        console.error('📊 TrackingStateManager: Error clearing input field:', error);
                    }
                }
            }
        });
    }

    /**
     * Update all stack/group buttons based on current tracking
     * @private
     */
    _updateStackButtons() {
        this.stackButtons.forEach((button, groupKey) => {
            if (!button || typeof button.set_icon_name !== 'function') return;

            try {
                const isTracking = this.isStackTracking(groupKey);
                if (isTracking) {
                    // A task in this stack is being tracked
                    button.set_icon_name('media-playback-stop-symbolic');
                    button.set_tooltip_text('Stop tracking');
                    console.log(`📊 TrackingStateManager: Stack button "${groupKey}" updated to STOP state`);
                } else {
                    // No task in this stack is being tracked
                    button.set_icon_name('media-playback-start-symbolic');
                    button.set_tooltip_text('Start New Session');
                    console.log(`📊 TrackingStateManager: Stack button "${groupKey}" updated to START state`);
                }
            } catch (error) {
                console.error(`📊 TrackingStateManager: Error updating stack button "${groupKey}":`, error);
            }
        });
    }

    /**
     * Notify all subscribers of tracking state changes
     * @private
     */
    _notifySubscribers(event, taskInfo) {
        this.subscribers.forEach(callback => {
            try {
                callback(event, taskInfo);
            } catch (error) {
                console.error('📊 TrackingStateManager: Error in subscriber callback:', error);
            }
        });
    }

    /**
     * Start real-time updates for tracking display
     * @private
     */
    _startRealTimeUpdates() {
        if (this.realTimeUpdateInterval) {
            GLib.source_remove(this.realTimeUpdateInterval);
            this.realTimeUpdateInterval = null;
        }

        this.realTimeUpdateInterval = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 1, () => {
            if (this.currentTrackingTask && this.trackingStartTime) {
                this.currentElapsedTime = Math.floor((Date.now() - this.trackingStartTime) / 1000);
                this._updateAllTimeLabels();
                this._updateSidebarStats();
                this._notifySubscribers('updateTaskListRealTime', { 
                    taskInfo: this.currentTrackingTask, 
                    elapsedTime: this.currentElapsedTime 
                });
            }
            return GLib.SOURCE_CONTINUE;
        });
    }

    /**
     * Stop real-time updates
     * @private
     */
    _stopRealTimeUpdates() {
        if (this.realTimeUpdateInterval) {
            GLib.source_remove(this.realTimeUpdateInterval);
            this.realTimeUpdateInterval = null;
        }
    }

    /**
     * Update all time labels with current elapsed time
     * @private
     */
    _updateAllTimeLabels() {
        const timeStr = this._formatElapsedTime(this.currentElapsedTime);

        // Update individual task time labels
        this.timeLabels.forEach(({ label, taskName }) => {
            if (!label || typeof label.set_text !== 'function') return;
            
            if (this.currentTrackingTask) {
                if (!taskName) {
                    // Header timer (taskName = null) - always show current tracking time
                    console.log(`📊 TrackingStateManager: Updating header timer to "${timeStr}"`);
                    label.set_text(timeStr);
                } else if (taskName === this.currentTrackingTask.name) {
                    // Specific task label - only show time if it matches current task
                    label.set_text(timeStr);
                }
            } else {
                // No tracking active - reset all labels
                if (!taskName) {
                    console.log('📊 TrackingStateManager: Resetting header timer to 00:00:00');
                }
                label.set_text('00:00:00');
            }
        });

        // Update stack time labels
        this.stackTimeLabels.forEach((stackLabel, groupKey) => {
            if (stackLabel && typeof stackLabel.set_text === 'function') {
                if (this.currentTrackingTask && this.isStackTracking(groupKey)) {
                    stackLabel.set_text(`Tracking: ${timeStr}`);
                    console.log(`📊 TrackingStateManager: Updated stack label for "${groupKey}" to "Tracking: ${timeStr}"`);
                } else if (!this.currentTrackingTask) {
                    // Reset stack label when tracking stops - this would need the original text
                    // For now, we'll clear the tracking indicator
                    try {
                        const currentText = stackLabel.get_text();
                        if (currentText && currentText.startsWith('Tracking: ')) {
                            // Remove the tracking prefix, but this is not ideal since we don't know the original text
                            console.log(`📊 TrackingStateManager: Clearing tracking indicator for stack "${groupKey}"`);
                            stackLabel.set_text(''); // This should be improved to restore original text
                        }
                    } catch (error) {
                        console.error(`📊 TrackingStateManager: Error clearing stack label for "${groupKey}":`, error);
                    }
                }
            }
        });

        // Update project time labels
        if (this.currentTrackingTask && this.currentTrackingTask.projectId) {
            const projectLabel = this.projectTimeLabels.get(this.currentTrackingTask.projectId);
            if (projectLabel && typeof projectLabel.set_text === 'function') {
                // This would need to be calculated with existing project time + current elapsed time
                this._notifySubscribers('updateProjectTime', {
                    projectId: this.currentTrackingTask.projectId,
                    additionalTime: this.currentElapsedTime
                });
            }
        }
    }

    /**
     * Update sidebar statistics with current tracking time
     * @private
     */
    _updateSidebarStats() {
        if (!this.currentTrackingTask) return;

        // Update weekly time
        const weeklyTimeElement = this.sidebarElements.get('weeklyTime');
        if (weeklyTimeElement && typeof weeklyTimeElement.set_subtitle === 'function') {
            this._notifySubscribers('updateWeeklyTime', { additionalTime: this.currentElapsedTime });
        }

        // Update today time
        const todayTimeElement = this.sidebarElements.get('todayTime');
        if (todayTimeElement && typeof todayTimeElement.set_subtitle === 'function') {
            this._notifySubscribers('updateTodayTime', { additionalTime: this.currentElapsedTime });
        }
    }

    /**
     * Format elapsed time in HH:MM:SS format
     * @private
     */
    _formatElapsedTime(seconds) {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const remainingSeconds = seconds % 60;
        
        return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
    }

    /**
     * Clear all task-related UI registrations (called before refreshing task list)
     */
    clearTaskButtons() {
        console.log('📊 TrackingStateManager: Clearing task buttons and labels');
        
        // Clear task buttons but keep the main tracking button (the one without taskName)
        const mainButtons = [];
        this.trackingButtons.forEach(({ button, taskName, input }) => {
            if (!taskName) {
                // Keep main tracking button
                mainButtons.push({ button, taskName, input });
            }
        });
        this.trackingButtons.clear();
        mainButtons.forEach(buttonInfo => this.trackingButtons.add(buttonInfo));
        
        // Clear stack-related elements
        this.stackButtons.clear();
        this.stackTimeLabels.clear();
        
        // Clear task-specific time labels but keep general ones
        const generalLabels = [];
        this.timeLabels.forEach(({ label, taskName }) => {
            if (!taskName) {
                // Keep general time labels
                generalLabels.push({ label, taskName });
            }
        });
        this.timeLabels.clear();
        generalLabels.forEach(labelInfo => this.timeLabels.add(labelInfo));
        
        console.log('📊 TrackingStateManager: Task UI elements cleared');
    }

    /**
     * Clean up resources
     */
    destroy() {
        this.trackingButtons.clear();
        this.stackButtons.clear();
        this.stackTimeLabels.clear();
        this.timeLabels.clear();
        this.projectTimeLabels.clear();
        this.sidebarElements.clear();
        this.subscribers.clear();
        
        if (this.intervalId) {
            GLib.source_remove(this.intervalId);
            this.intervalId = null;
        }
        
        if (this.realTimeUpdateInterval) {
            GLib.source_remove(this.realTimeUpdateInterval);
            this.realTimeUpdateInterval = null;
        }
    }
}

// Global instance
const trackingStateManager = new TrackingStateManager();

export { trackingStateManager, TrackingStateManager };