
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import { updateActiveTaskInRealTime } from 'resource:///com/odnoyko/valot/js/func/global/addtask.js';
import { getCurrencySymbol } from 'resource:///com/odnoyko/valot/js/data/currencies.js';

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
        this.moneyLabels = new Set(); // Money display labels for real-time updates
        this.projectTimeLabels = new Map(); // Maps project IDs to time labels
        this.sidebarElements = new Map(); // Sidebar quick stats elements
        this.subscribers = new Set(); // Components that need updates
        this.intervalId = null;
        this.realTimeUpdateInterval = null;
        this.currentElapsedTime = 0;
        this._lastSyncedTaskName = null; // Track last synced task name for smart input clearing
        this.dbUpdateCounter = 0; // Counter for database updates (update every 5 seconds)
    }

    /**
     * Start tracking for a specific task
     * @param {Object} taskInfo - Task information
     * @param {string} taskInfo.name - Task name
     * @param {string} taskInfo.baseName - Base name for grouping (optional)
     * @param {number} taskInfo.projectId - Project ID
     * @param {string} taskInfo.projectName - Project name
     */
    async startTracking(taskInfo) {
        // Stop any existing tracking first
        if (this.currentTrackingTask) {
            await this.stopTracking();
        }

        this.currentTrackingTask = taskInfo;
        this.trackingStartTime = Date.now();
        this.currentElapsedTime = 0;
        this.dbUpdateCounter = 0; // Reset database update counter

        // Create new task in database immediately when tracking starts
        this._createNewTaskInDatabase(taskInfo);

        // Start real-time updates
        this._startRealTimeUpdates();

        // Update all UI elements immediately
        this._updateAllTrackingButtons();
        this._updateStackButtons();

        // Immediately update time labels to show 00:00:00 with dot
        this._updateAllTimeLabels();
        this._updateAllMoneyLabels();

        this._notifySubscribers('start', taskInfo);
        this._notifySubscribers('updateTaskList', taskInfo);
    }

    /**
     * Stop current tracking
     * @returns {Object|null} Information about the stopped task
     */
    async stopTracking() {
        if (!this.currentTrackingTask) {
            return null;
        }

        const stoppedTask = {
            ...this.currentTrackingTask,
            duration: this.trackingStartTime ? Math.floor((Date.now() - this.trackingStartTime) / 1000) : 0
        };

        // Update the existing task in database with final time
        const elapsedSeconds = stoppedTask.duration;
        if (elapsedSeconds > 0) {
            await this._updateTaskInDatabase(stoppedTask, elapsedSeconds);
        }

        this.currentTrackingTask = null;
        this.trackingStartTime = null;
        this.currentElapsedTime = 0;

        // Stop real-time updates
        this._stopRealTimeUpdates();

        // Update all UI elements
        this._updateAllTrackingButtons();
        this._updateStackButtons();
        this._updateAllTimeLabels();
        this._updateAllMoneyLabels();
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
        console.log(`🔍 Checking isTaskTracking: "${currentTaskGroupKey}" === "${taskIdentifier}" ? ${currentTaskGroupKey === taskIdentifier}`);
        return currentTaskGroupKey === taskIdentifier;
    }

    /**
     * Check if any task in a stack/group is being tracked
     * @param {string} groupKey - Full group key (baseName::project::client) of the stack/group
     * @returns {boolean}
     */
    isStackTracking(groupKey) {
        if (!this.currentTrackingTask) {
            return false;
        }

        // Create group key for current tracking task
        const currentTaskGroupKey = `${this.currentTrackingTask.baseName}::${this.currentTrackingTask.projectName}::${this.currentTrackingTask.clientName}`;
        return currentTaskGroupKey === groupKey;
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
     * @param {string} originalText - Original text to restore when tracking stops
     */
    registerStackTimeLabel(label, groupKey, originalText = '') {
        this.stackTimeLabels.set(groupKey, { label, originalText });
    }

    /**
     * Register a time label for real-time updates
     * @param {Gtk.Label} label - The time label
     * @param {string} taskGroupKey - Associated task group key (optional, null for header timer)
     */
    registerTimeLabel(label, taskGroupKey = null) {
        this.timeLabels.add({ label, taskGroupKey });
    }

    /**
     * Register a money label for real-time earnings updates
     * @param {Gtk.Label} label - The money label to register
     * @param {string} taskGroupKey - Associated task group key (optional)
     * @param {Object} clientInfo - Client info with rate for calculations
     */
    registerMoneyLabel(label, taskGroupKey = null, clientInfo = null) {
        this.moneyLabels.add({ label, taskGroupKey, clientInfo });
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
            if (!button || typeof button.set_icon_name !== 'function') {
                return;
            }

            const isThisTaskTracking = taskName && this.isTaskTracking(taskName);
            const isAnyTracking = this.currentTrackingTask !== null;


            if (isThisTaskTracking || (isAnyTracking && !taskName)) {
                // This specific task is being tracked OR it's a general button and something is tracking
                console.log(`🔄 Setting STOP icon for button (taskName: "${taskName}", isAnyTracking: ${isAnyTracking})`);
                button.set_icon_name('media-playback-stop-symbolic');
                button.set_tooltip_text('Stop tracking');

                // Synchronize input field if provided - set to current tracking task name
                if (input && this.currentTrackingTask) {
                    try {
                        input.set_text(this.currentTrackingTask.name);
                        this._lastSyncedTaskName = this.currentTrackingTask.name;
                    } catch (error) {
                        console.error('📊 TrackingStateManager: Error syncing input field:', error);
                    }
                }
            } else {
                // This task is not being tracked
                console.log(`🔄 Setting START icon for button (taskName: "${taskName}", isAnyTracking: ${isAnyTracking})`);
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
            if (!button) return;

            try {
                const isTracking = this.isStackTracking(groupKey);

                if (isTracking) {
                    // A task in this stack is being tracked
                    button.set_icon_name('media-playback-stop-symbolic');
                    button.set_tooltip_text('Stop tracking');
                } else {
                    // No task in this stack is being tracked
                    button.set_icon_name('media-playback-start-symbolic');
                    button.set_tooltip_text('Start New Session');
                }
            } catch (error) {
                console.error(`Error updating stack button "${groupKey}":`, error);
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

                // Async update time labels
                this._updateAllTimeLabels().catch(error => {
                    console.error('Error updating time labels:', error);
                });
                // Async update money labels
                this._updateAllMoneyLabels().catch(error => {
                    console.error('Error updating money labels:', error);
                });

                this._updateSidebarStats();
                this._notifySubscribers('updateTaskListRealTime', {
                    taskInfo: this.currentTrackingTask,
                    elapsedTime: this.currentElapsedTime
                });

                // Update database every 5 seconds to reduce DB load
                this.dbUpdateCounter++;
                if (this.dbUpdateCounter >= 5) {
                    this.dbUpdateCounter = 0;
                    console.log(`💾 Real-time database update: "${this.currentTrackingTask.name}" -> ${this.currentElapsedTime}s`);
                    updateActiveTaskInRealTime(this.currentTrackingTask.name, this.currentElapsedTime);

                    // Notify that database was updated
                    this._notifySubscribers('taskDatabaseUpdated', {
                        taskInfo: this.currentTrackingTask,
                        elapsedTime: this.currentElapsedTime
                    });
                }
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
     * Get total accumulated time for a task (from database + current session)
     * @param {string} taskName - Name of the task
     * @returns {number} Total seconds
     */
    async getTotalTaskTime(taskName) {
        try {
            // Get existing time from database for this task
            // Use same pattern as addtask.js - get from main application
            let dbConnection = null;
            const app = Gio.Application.get_default();
            if (app && app.database_connection) {
                dbConnection = app.database_connection;
            } else {
                console.warn('📊 No database connection available from app for total time calculation');
                return 0;
            }

            const sanitizedName = taskName.replace(/'/g, "''"); // Escape single quotes for SQL
            const sql = `SELECT SUM(time_spent) as total_time FROM Task WHERE name = '${sanitizedName}'`;

            try {
                const result = dbConnection.execute_select_command(sql);
                const rowCount = result.get_n_rows();

                let dbTime = 0;
                if (rowCount > 0) {
                    const totalTimeValue = result.get_value_at(0, 0);
                        if (totalTimeValue && totalTimeValue !== null) {
                        // Try different ways to extract the value
                        try {
                            if (typeof totalTimeValue.get_int === 'function') {
                                dbTime = totalTimeValue.get_int();
                            } else if (typeof totalTimeValue.get_double === 'function') {
                                dbTime = Math.floor(totalTimeValue.get_double());
                            } else {
                                dbTime = parseInt(totalTimeValue.toString());
                            }
                        } catch (parseError) {
                            console.error(`Error parsing DB value for "${taskName}":`, parseError);
                            dbTime = parseInt(totalTimeValue.toString()) || 0;
                        }
                    }
                }

                return dbTime;
            } catch (dbError) {
                console.error(`Error getting database time for "${taskName}":`, dbError);
                return 0;
            }
        } catch (error) {
            console.error('📊 Error calculating total task time:', error);
            return 0;
        }
    }

    /**
     * Update all time labels with current elapsed time and total accumulated time
     * @private
     */
    async _updateAllTimeLabels() {
        const timeStr = this._formatElapsedTime(this.currentElapsedTime);

        // Handle case when tracking stops
        if (!this.currentTrackingTask) {
            // No active tracking - update all labels to show final database values
            this.timeLabels.forEach(async ({ label, taskGroupKey }) => {
                if (!label || typeof label.set_text !== 'function') return;
                
                if (!taskGroupKey) {
                    // Header timer - reset to 00:00:00
                    label.set_text('00:00:00');
                } else {
                    // Task label - extract task name from group key and show total duration
                    try {
                        // Group key format: "taskName::projectName::clientName"
                        const taskName = taskGroupKey.split('::')[0];
                        if (taskName) {
                            const totalTime = await this.getTotalTaskTime(taskName);
                            const formattedTime = this._formatElapsedTime(totalTime);
                            label.set_text(formattedTime);
                        }
                    } catch (error) {
                        console.error(`Error updating task time for ${taskGroupKey}:`, error);
                    }
                }
            });
            
            // Update stack labels too
            this.stackTimeLabels.forEach(async (stackLabelData, groupKey) => {
                if (stackLabelData && stackLabelData.label && stackLabelData.originalText) {
                    try {
                        stackLabelData.label.set_text(stackLabelData.originalText);
                    } catch (error) {
                        console.error(`Error restoring stack label for "${groupKey}":`, error);
                    }
                }
            });
            
            return;
        }

        // Get database time once for the tracked task to avoid multiple DB calls
        const trackedTaskDbTime = await this.getTotalTaskTime(this.currentTrackingTask.name);

        // Update individual task time labels (we know currentTrackingTask exists here)
        for (const { label, taskGroupKey } of this.timeLabels) {
            if (!label || typeof label.set_text !== 'function') continue;

            if (!taskGroupKey) {
                // Header timer (taskGroupKey = null) - always show current tracking time
                console.log(`⏰ Updating header timer: ${timeStr}`);
                label.set_text(timeStr);
            } else if (this.isTaskTracking(taskGroupKey)) {
                // This specific task is being tracked - show in format: ● total time (database + current)
                this._updateTrackingLabel(label, trackedTaskDbTime);


            } else {
                // This task is not being tracked - don't update it during active tracking
            }
        }

        // Update stack time labels
        this.stackTimeLabels.forEach(async (stackLabelData, groupKey) => {
            if (stackLabelData && stackLabelData.label && typeof stackLabelData.label.set_text === 'function') {
                if (this.currentTrackingTask && this.isStackTracking(groupKey)) {
                    // Get database time for the currently tracked task
                    const stackDbTime = await this.getTotalTaskTime(this.currentTrackingTask.name);
                    this._updateTrackingLabel(stackLabelData.label, stackDbTime);

                } else if (!this.currentTrackingTask) {
                    // Restore original text when tracking stops
                    try {
                        stackLabelData.label.set_text(stackLabelData.originalText);
                    } catch (error) {
                        console.error(`📊 TrackingStateManager: Error restoring stack label for "${groupKey}":`, error);
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
     * Update all money labels with current earnings calculations
     * @private
     */
    async _updateAllMoneyLabels() {
        if (!this.currentTrackingTask) {
            // No active tracking - hide money labels
            this.moneyLabels.forEach(({ label }) => {
                if (!label || typeof label.set_visible !== 'function') return;
                label.set_visible(false);
            });
            return;
        }

        // Get database time for earnings calculation
        const trackedTaskDbTime = await this.getTotalTaskTime(this.currentTrackingTask.name);
        
        // Update money labels
        for (const { label, taskGroupKey, clientInfo } of this.moneyLabels) {
            if (!label || typeof label.set_text !== 'function') continue;
            
            if (taskGroupKey && this.isTaskTracking(taskGroupKey)) {
                // This specific task is being tracked - calculate earnings
                const totalTime = trackedTaskDbTime + this.currentElapsedTime;
                const earnings = this._calculateEarnings(totalTime, clientInfo);
                
                if (earnings) {
                    label.set_text(earnings);
                    label.set_visible(true);
                } else {
                    label.set_visible(false);
                }
            }
        }
    }

    /**
     * Calculate earnings from time and client rate using existing currency utilities
     * @private
     */
    _calculateEarnings(totalSeconds, clientInfo) {
        if (!clientInfo || !clientInfo.rate || clientInfo.rate <= 0) {
            return '';
        }

        const hours = totalSeconds / 3600;
        const earnings = hours * clientInfo.rate;
        
        if (earnings <= 0) return '';

        const currency = clientInfo.currency || 'EUR';
        const symbol = getCurrencySymbol(currency);
        
        return `${symbol}${earnings.toFixed(2)}`;
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
     * Update tracking label with total time (database + current)
     * @private
     */
    _updateTrackingLabel(label, dbTime) {
        const totalTime = dbTime + this.currentElapsedTime;
        const totalTimeStr = this._formatElapsedTime(totalTime);
        label.set_css_classes(['caption']); // Set caption class during tracking
        label.set_text(`● ${totalTimeStr}`);
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
     * Extract task base name from group key
     * @private
     */
    _extractTaskNameFromGroupKey(groupKey) {
        if (!groupKey) return null;
        const parts = groupKey.split('::');
        return parts[0]; // Return the base name part
    }

    /**
     * Clear all task-related UI registrations (called before refreshing task list)
     */
    clearTaskButtons() {
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
        this.timeLabels.forEach(({ label, taskGroupKey }) => {
            if (!taskGroupKey) {
                // Keep general time labels (header timer)
                generalLabels.push({ label, taskGroupKey });
            }
        });
        this.timeLabels.clear();
        generalLabels.forEach(labelInfo => this.timeLabels.add(labelInfo));
    }

    /**
     * Create new task in database when tracking starts
     * @private
     */
    async _createNewTaskInDatabase(taskInfo) {
        try {
            const { saveTask } = await import('resource:///com/odnoyko/valot/js/func/global/addtask.js');
            
            // Create new task entry
            const result = saveTask(
                taskInfo.name,
                taskInfo.projectName, 
                taskInfo.startTime,
                null, // end time (null for active task)
                0,    // duration (starts at 0)
                taskInfo.projectId,
                {
                    client: { id: taskInfo.clientId, name: taskInfo.clientName },
                    currency: { code: 'EUR', symbol: '€' }
                }
            );
            
            console.log(`✅ Created new task in database: "${taskInfo.name}"`);
        } catch (error) {
            console.error("❌ Error creating new task in database:", error);
        }
    }

    /**
     * Update task in database when tracking stops
     * @private
     */
    async _updateTaskInDatabase(stoppedTask, elapsedSeconds) {
        try {
            const { updateTaskWhenTrackingStops } = await import('resource:///com/odnoyko/valot/js/func/global/addtask.js');
            
            const endTime = new Date().toISOString().replace('T', ' ').substring(0, 19);
            updateTaskWhenTrackingStops(stoppedTask.name, endTime, elapsedSeconds, {
                client: { id: stoppedTask.clientId, name: stoppedTask.clientName },
                currency: { code: 'EUR', symbol: '€' }
            });
            
            console.log(`✅ Updated task in database: "${stoppedTask.name}" with ${elapsedSeconds}s`);
        } catch (error) {
            console.error("❌ Error updating task in database:", error);
        }
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