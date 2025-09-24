
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
        this.cachedDbTime = null; // Cache database time to avoid multiple fetches

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
        this.cachedDbTime = null;

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
                button.set_icon_name('media-playback-stop-symbolic');
                button.set_tooltip_text('Stop tracking');

                // Synchronize input field if provided - set to current tracking task name
                if (input && this.currentTrackingTask) {
                    try {
                        input.set_text(this.currentTrackingTask.name);
                        this._lastSyncedTaskName = this.currentTrackingTask.name;
                    } catch (error) {
                        //('📊 TrackingStateManager: Error syncing input field:', error);
                    }
                }
            } else {
                // This task is not being tracked
                button.set_icon_name('media-playback-start-symbolic');
                button.set_tooltip_text('Start tracking');

                // KEEP LATEST TRACKED NAME: Don't clear input field when tracking stops
                // This allows users to see and reuse the last tracked task name
                if (input && !isAnyTracking && !taskName && this._lastSyncedTaskName) {
                    try {
                        // Keep the last tracked task name in the input field
                        input.set_text(this._lastSyncedTaskName);
                        // Don't clear _lastSyncedTaskName so it persists
                    } catch (error) {
                        //('📊 TrackingStateManager: Error keeping input field:', error);
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
                //(`Error updating stack button "${groupKey}":`, error);
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
                //('📊 TrackingStateManager: Error in subscriber callback:', error);
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
                    //('Error updating time labels:', error);
                });
                // Async update money labels
                this._updateAllMoneyLabels().catch(error => {
                    //('Error updating money labels:', error);
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
     * Get project ID by name from database
     * @param {string} projectName - Project name
     * @returns {number} Project ID or 1 if not found
     */
    async getProjectIdByName(projectName) {
        try {
            const app = Gio.Application.get_default();
            if (!app || !app.database_connection) {
                return 1;
            }
            
            const sanitizedName = projectName.replace(/'/g, "''");
            const sql = `SELECT id FROM Project WHERE name = '${sanitizedName}' LIMIT 1`;
            
            const result = app.database_connection.execute_select_command(sql);
            if (result.get_n_rows() > 0) {
                const idValue = result.get_value_at(0, 0);
                return parseInt(idValue.toString()) || 1;
            }
            return 1;
        } catch (error) {
            //(`Error getting project ID for "${projectName}":`, error);
            return 1;
        }
    }

    /**
     * Get client ID by name from database
     * @param {string} clientName - Client name
     * @returns {number} Client ID or 1 if not found
     */
    async getClientIdByName(clientName) {
        try {
            const app = Gio.Application.get_default();
            if (!app || !app.database_connection) {
                return 1;
            }
            
            const sanitizedName = clientName.replace(/'/g, "''");
            const sql = `SELECT id FROM Client WHERE name = '${sanitizedName}' LIMIT 1`;
            
            const result = app.database_connection.execute_select_command(sql);
            if (result.get_n_rows() > 0) {
                const idValue = result.get_value_at(0, 0);
                return parseInt(idValue.toString()) || 1;
            }
            return 1;
        } catch (error) {
            //(`Error getting client ID for "${clientName}":`, error);
            return 1;
        }
    }

    /**
     * Get total accumulated time for a task (from database + current session)
     * @param {string} taskName - Name of the task
     * @param {number} projectId - Project ID (optional, defaults to current tracking project)
     * @param {number} clientId - Client ID (optional, defaults to current tracking client)
     * @returns {number} Total seconds
     */
    async getTotalTaskTime(taskName, projectId = null, clientId = null) {
        try {
            // Get existing time from database for this task
            // Use same pattern as addtask.js - get from main application
            let dbConnection = null;
            const app = Gio.Application.get_default();
            if (app && app.database_connection) {
                dbConnection = app.database_connection;
            } else {
                return 0;
            }

            // Use current tracking task context if no IDs provided
            if (projectId === null && this.currentTrackingTask) {
                projectId = this.currentTrackingTask.projectId;
            }
            if (clientId === null && this.currentTrackingTask) {
                clientId = this.currentTrackingTask.clientId;
            }

            // Default to 1 if still null
            projectId = projectId || 1;
            clientId = clientId || 1;

            const sanitizedName = taskName.replace(/'/g, "''"); // Escape single quotes for SQL
            const sql = `SELECT SUM(time_spent) as total_time FROM Task WHERE name = '${sanitizedName}' AND project_id = ${projectId} AND client_id = ${clientId}`;

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
                            //(`Error parsing DB value for "${taskName}":`, parseError);
                            dbTime = parseInt(totalTimeValue.toString()) || 0;
                        }
                    }
                }

                return dbTime;
            } catch (dbError) {
                //(`Error getting database time for "${taskName}":`, dbError);
                return 0;
            }
        } catch (error) {
            //('📊 Error calculating total task time:', error);
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
                        const [taskName, projectName, clientName] = taskGroupKey.split('::');
                        if (taskName && projectName && clientName) {
                            const projectId = await this.getProjectIdByName(projectName);
                            const clientId = await this.getClientIdByName(clientName);
                            const totalTime = await this.getTotalTaskTime(taskName, projectId, clientId);
                            const formattedTime = this._formatElapsedTime(totalTime);
                            label.set_text(formattedTime);
                        }
                    } catch (error) {
                        //(`Error updating task time for ${taskGroupKey}:`, error);
                    }
                }
            });
            
            // Update stack labels too
            this.stackTimeLabels.forEach(async (stackLabelData, groupKey) => {
                if (stackLabelData && stackLabelData.label && stackLabelData.originalText) {
                    try {
                        stackLabelData.label.set_text(stackLabelData.originalText);
                    } catch (error) {
                        //(`Error restoring stack label for "${groupKey}":`, error);
                    }
                }
            });
            
            return;
        }

        // Get database time once and cache it to avoid multiple DB calls and prevent accumulation
        if (this.cachedDbTime === null) {
            this.cachedDbTime = await this.getTotalTaskTime(this.currentTrackingTask.name, this.currentTrackingTask.projectId, this.currentTrackingTask.clientId);
        }

        // Update individual task time labels (we know currentTrackingTask exists here)
        for (const { label, taskGroupKey } of this.timeLabels) {
            if (!label || typeof label.set_text !== 'function') continue;

            if (!taskGroupKey) {
                // Header timer (taskGroupKey = null) - always show current tracking time
                label.set_text(timeStr);
            } else if (this.isTaskTracking(taskGroupKey)) {
                // This specific task is being tracked - show total time (cached database + current session)
                const totalTime = this.cachedDbTime + this.currentElapsedTime;
                const totalTimeStr = this._formatElapsedTime(totalTime);
                label.set_css_classes(['caption']);
                label.set_text(`● ${totalTimeStr}`);


            } else {
                // This task is not being tracked - don't update it during active tracking
            }
        }

        // Update stack time labels
        this.stackTimeLabels.forEach(async (stackLabelData, groupKey) => {
            if (stackLabelData && stackLabelData.label && typeof stackLabelData.label.set_text === 'function') {
                if (this.currentTrackingTask && this.isStackTracking(groupKey)) {
                    // Use cached database time for consistency
                    this._updateTrackingLabel(stackLabelData.label, this.cachedDbTime);

                } else if (!this.currentTrackingTask) {
                    // Restore original text when tracking stops
                    try {
                        stackLabelData.label.set_text(stackLabelData.originalText);
                    } catch (error) {
                        //(`📊 TrackingStateManager: Error restoring stack label for "${groupKey}":`, error);
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

        // Use cached database time for earnings calculation
        if (this.cachedDbTime === null) {
            this.cachedDbTime = await this.getTotalTaskTime(this.currentTrackingTask.name, this.currentTrackingTask.projectId, this.currentTrackingTask.clientId);
        }
        
        // Update money labels
        for (const { label, taskGroupKey, clientInfo } of this.moneyLabels) {
            if (!label || typeof label.set_text !== 'function') continue;
            
            if (taskGroupKey && this.isTaskTracking(taskGroupKey)) {
                // This specific task is being tracked - calculate earnings using cached time
                const totalTime = this.cachedDbTime + this.currentElapsedTime;
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
            
        } catch (error) {
            //("❌ Error creating new task in database:", error);
        }
    }

    /**
     * Update task in database when tracking stops
     * @private
     */
    async _updateTaskInDatabase(stoppedTask, elapsedSeconds) {
        try {
            const { updateTaskWhenTrackingStops } = await import('resource:///com/odnoyko/valot/js/func/global/addtask.js');
            
            // Use local time instead of UTC
            const now = new Date();
            const year = now.getFullYear();
            const month = (now.getMonth() + 1).toString().padStart(2, '0');
            const day = now.getDate().toString().padStart(2, '0');
            const hours = now.getHours().toString().padStart(2, '0');
            const minutes = now.getMinutes().toString().padStart(2, '0');
            const seconds = now.getSeconds().toString().padStart(2, '0');
            const endTime = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
            updateTaskWhenTrackingStops(stoppedTask.name, endTime, elapsedSeconds, {
                client: { id: stoppedTask.clientId, name: stoppedTask.clientName },
                currency: { code: 'EUR', symbol: '€' }
            });
            
        } catch (error) {
            //("❌ Error updating task in database:", error);
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