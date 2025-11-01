import { BaseService } from './BaseService.js';
import { CoreEvents } from '../events/CoreEvents.js';
import { TimeUtils } from '../utils/TimeUtils.js';
import { Logger } from '../utils/Logger.js';
export class TimeTrackingService extends BaseService {
    trackingTimer = null;
    _timerToken = 0;
    lastUsedProjectId = null;
    lastUsedClientId = null;
    _recoveryInProgress = false;
    _lastRecoveryAttempt = 0;
    _recoveryThrottleMs = 30000; // Only attempt recovery once per 30 seconds
    timerStartTime = null;
    constructor(core) {
        super(core);
    }
    /**
     * Start tracking a task instance
     * @param {number} taskId - Task ID
     * @param {number} projectId - Project ID (optional)
     * @param {number} clientId - Client ID (optional)
     * @param {boolean} pomodoroMode - Enable Pomodoro countdown mode (optional)
     * @param {number} pomodoroDuration - Pomodoro duration in seconds (optional)
     */
    async start(taskId, projectId = null, clientId = null, pomodoroMode = false, pomodoroDuration = 0) {
        // If already tracking, stop current task first (like old system)
        const currentState = this.state.getTrackingState();
        if (currentState.isTracking) {
            await this.stop();
        }

        // Validate that project and client exist, fallback to first available
        let validProjectId = projectId || 1;
        let validClientId = clientId || 1;

        // Get all projects and clients
        const projects = await this.core.services.projects.getAll();
        const clients = await this.core.services.clients.getAll();

        // Validate project exists
        if (projectId && !projects.some(p => p.id === projectId)) {
            validProjectId = projects.length > 0 ? projects[0].id : 1;
        }

        // Validate client exists
        if (clientId && !clients.some(c => c.id === clientId)) {
            validClientId = clients.length > 0 ? clients[0].id : 1;
        }

        // Always create NEW task instance for each tracking session (even if combination exists)
        const taskInstance = await this.core.services.taskInstances.create({
            task_id: taskId,
            project_id: validProjectId,
            client_id: validClientId
        });
        // Save last used project/client for UI persistence (use validated IDs)
        this.lastUsedProjectId = validProjectId;
        this.lastUsedClientId = validClientId;

        // Get task name for state
        const task = await this.core.services.tasks.getById(taskId);
        
        // Check if there's saved time from previous crash for this task/project/client
        const persistenceService = this.core.services.persistence;
        const savedTimeFromCrash = persistenceService ? persistenceService.getSavedTimeForTask(taskId, validProjectId, validClientId) : 0;
        
        // Close any abandoned active entries for this task/project/client combination (from previous crashes)
        // This ensures no orphaned entries remain in database
        // Find all task instances with same task/project/client and close their active entries
        try {
            const taskInstances = await this.query(
                `SELECT id FROM TaskInstance 
                 WHERE task_id = ? AND project_id = ? AND client_id = ?`,
                [taskId, validProjectId, validClientId]
            );
            
            if (taskInstances.length > 0) {
                const instanceIds = taskInstances.map(ti => ti.id);
                const placeholders = instanceIds.map(() => '?').join(',');
                
                await this.execute(
                    `UPDATE TimeEntry 
                     SET end_time = datetime('now'), 
                         duration = CASE 
                             WHEN duration > 0 THEN duration 
                             ELSE CAST((julianday('now') - julianday(start_time)) * 86400 AS INTEGER)
                         END
                     WHERE task_instance_id IN (${placeholders}) AND end_time IS NULL`,
                    instanceIds
                );
            }
        } catch (error) {
            // Non-critical - continue even if cleanup fails
            Logger.debug(`[TimeTracking] Could not close abandoned entries: ${error.message}`);
        }
        
        // Always create a NEW unique time entry for this instance (starts at 0)
        const startTime = TimeUtils.getCurrentTimestamp();
        const entryId = await this.createTimeEntry({
            task_instance_id: taskInstance.id,
            start_time: startTime,
        });
        
        // If there's saved time from crash, we'll add it when user stops tracking
        // For now, clear it from JSON and track it separately
        if (savedTimeFromCrash > 0) {
            persistenceService.clearSavedTime();
            Logger.info(`[TimeTracking] Found ${savedTimeFromCrash}s saved from crash, will be added on stop`);
        }
        
        // Get old completed time (excludes active entry) - cache it in state to avoid frequent DB queries
        const oldTime = await this.getCurrentTaskOldTime();
        
        // Update state (use validated IDs)
        // savedTimeFromCrash is stored separately - will be added to duration when stopping
        const trackingState = {
            isTracking: true,
            currentTaskId: taskId,
            currentTaskName: task.name,
            currentTaskInstanceId: taskInstance.id,
            currentProjectId: validProjectId,
            currentClientId: validClientId,
            startTime: startTime,
            elapsedSeconds: 0, // Always start from 0 - saved time will be added on stop
            savedTimeFromCrash: savedTimeFromCrash, // Store saved time separately
            oldTime: oldTime, // Cache old time to avoid frequent DB queries
            pomodoroMode: pomodoroMode,
            pomodoroDuration: pomodoroDuration,
            pomodoroRemaining: pomodoroDuration,
            // Persist the concrete open TimeEntry ID to avoid NULL-based lookups
            currentTimeEntryId: entryId,
        };

        this.state.updateTrackingState(trackingState);
        // Start timer
        this.startTimer();
        this.events.emit(CoreEvents.TRACKING_STARTED, {
            taskId,
            taskName: task.name,
            taskInstanceId: taskInstance.id,
            projectId: validProjectId,
            clientId: validClientId,
            startTime,
            timeEntryId: entryId,
        });
        
        // Force cache sync for critical operations
        if (this.core.services?.cache) {
            await this.core.services.cache.flush().catch(err => {
                Logger.warn('TimeTracking', 'Failed to flush cache after start:', err);
            });
        }
    }
    /**
     * Stop tracking
     */
    async stop() {
        const currentState = this.state.getTrackingState();
        if (!currentState.isTracking || !currentState.currentTaskId) {
            throw new Error('Not currently tracking');
        }
        // Stop timer
        this.stopTimer();
        const endTime = TimeUtils.getCurrentTimestamp();
        
        // Calculate total duration: current elapsed + saved time from crash
        const savedTimeFromCrash = currentState.savedTimeFromCrash || 0;
        const duration = currentState.elapsedSeconds + savedTimeFromCrash;
        // Prefer the stored open TimeEntry ID to avoid NULL queries
        let entryUpdated = false;
        if (currentState.currentTimeEntryId) {
            try {
                // Fetch task_instance_id for cache update
                const row = await this.query(`SELECT task_instance_id FROM TimeEntry WHERE id = ?`, [currentState.currentTimeEntryId]);
                if (row && row.length > 0 && row[0].task_instance_id) {
                    const instanceId = row[0].task_instance_id;
                    await this.updateTimeEntry(currentState.currentTimeEntryId, {
                        end_time: endTime,
                        duration: duration,
                    });
                    await this.core.services.taskInstances.updateTotalTime(instanceId);
                    // Update oldTime in state after total_time is recalculated
                    const newOldTime = await this.getCurrentTaskOldTime();
                    this.state.updateTrackingState({ oldTime: newOldTime });
                    entryUpdated = true;
                }
            } catch (error) {
                Logger.warn(`[TimeTracking] Failed to update entry ${currentState.currentTimeEntryId}: ${error.message}`);
                // Fall through to recovery logic
            }
        }
        
        // Fallback: if currentTimeEntryId is missing or update failed, find entry by task_instance_id
        if (!entryUpdated && currentState.currentTaskInstanceId) {
            try {
                // Direct query to find active entry for this instance (safer than getCurrentTimeEntry)
                const rows = await this.query(
                    `SELECT id, task_instance_id FROM TimeEntry 
                     WHERE task_instance_id = ? AND end_time IS NULL 
                     ORDER BY id DESC LIMIT 1`,
                    [currentState.currentTaskInstanceId]
                );
                
                if (rows && rows.length > 0 && rows[0].id) {
                    const entryId = rows[0].id;
                    const instanceId = rows[0].task_instance_id;
                    await this.updateTimeEntry(entryId, {
                        end_time: endTime,
                        duration: duration,
                    });
                    await this.core.services.taskInstances.updateTotalTime(instanceId);
                    entryUpdated = true;
                    
                    // Update state with found entry ID for consistency
                    this.state.updateTrackingState({
                        currentTimeEntryId: entryId,
                    });
                }
            } catch (error) {
                Logger.error(`[TimeTracking] Failed to find/update entry for instance ${currentState.currentTaskInstanceId}: ${error.message}`);
                // At this point, we've exhausted recovery options - entry might be lost
                // But we still need to reset state to prevent stuck tracking
            }
        }
        
        // If entry still wasn't updated, log warning but continue with state reset
        if (!entryUpdated) {
            Logger.warn(`[TimeTracking] Could not update TimeEntry on stop - entry may be lost. Duration: ${duration}s`);
        }
        const trackingData = {
            taskId: currentState.currentTaskId,
            taskName: currentState.currentTaskName,
            projectId: currentState.currentProjectId,
            startTime: currentState.startTime,
            endTime,
            duration,
        };
        // Reset state
        this.state.updateTrackingState({
            isTracking: false,
            currentTaskId: null,
            currentTaskName: null,
            currentTaskInstanceId: null,
            currentProjectId: null,
            currentClientId: null,
            startTime: null,
            elapsedSeconds: 0,
            oldTime: 0, // Reset oldTime when tracking stops
            savedTimeFromCrash: 0, // Reset saved time when tracking stops
            pomodoroMode: false,
            pomodoroDuration: 0,
            pomodoroRemaining: 0,
            currentTimeEntryId: null,
        });
        this.events.emit(CoreEvents.TRACKING_STOPPED, trackingData);
        
        // Force cache sync for critical operations
        if (this.core.services?.cache) {
            await this.core.services.cache.flush().catch(err => {
                Logger.warn('TimeTracking', 'Failed to flush cache after stop:', err);
            });
        }
    }
    /**
     * Update current tracking task name
     * Switches TaskInstance to a different Task instead of modifying the existing Task
     */
    async updateCurrentTaskName(newName) {
        const currentState = this.state.getTrackingState();
        if (!currentState.isTracking || !currentState.currentTaskInstanceId) {
            throw new Error('Not currently tracking');
        }


        // Find or create task with new name
        const newTask = await this.core.services.tasks.findOrCreate(newName);

        // Update TaskInstance to point to the new task
        await this.core.services.taskInstances.update(currentState.currentTaskInstanceId, {
            task_id: newTask.id
        });

        // Update state
        this.state.updateTrackingState({
            currentTaskId: newTask.id,
            currentTaskName: newName,
        });

        this.events.emit(CoreEvents.TRACKING_UPDATED, {
            taskId: newTask.id,
            taskName: newName,
        });
    }

    /**
     * Update current tracking project/client
     * Updates the CURRENT instance instead of creating a new one
     */
    async updateCurrentProjectClient(projectId = null, clientId = null) {
        const currentState = this.state.getTrackingState();
        if (!currentState.isTracking || !currentState.currentTaskInstanceId) {
            throw new Error('Not currently tracking');
        }

        // Update the current TaskInstance with new project/client
        await this.core.services.taskInstances.update(currentState.currentTaskInstanceId, {
            project_id: projectId,
            client_id: clientId
        });

        // Update state
        this.state.updateTrackingState({
            currentProjectId: projectId,
            currentClientId: clientId,
        });

        this.events.emit(CoreEvents.TRACKING_UPDATED, {
            taskInstanceId: currentState.currentTaskInstanceId,
            projectId: projectId,
            clientId: clientId,
        });
    }

    /**
     * Pause tracking
     */
    async pause() {
        const currentState = this.state.getTrackingState();
        if (!currentState.isTracking) {
            throw new Error('Not currently tracking');
        }
        this.stopTimer();
        this.events.emit(CoreEvents.TRACKING_PAUSED, {
            taskId: currentState.currentTaskId,
            elapsedSeconds: currentState.elapsedSeconds,
        });
    }
    /**
     * Resume tracking
     */
    async resume() {
        const currentState = this.state.getTrackingState();
        if (!currentState.isTracking) {
            throw new Error('Not currently tracking');
        }
        this.startTimer();
        this.events.emit(CoreEvents.TRACKING_RESUMED, {
            taskId: currentState.currentTaskId,
            elapsedSeconds: currentState.elapsedSeconds,
        });
    }
    /**
     * Get current tracking state
     */
    getCurrentTracking() {
        return this.state.getTrackingState();
    }

    /**
     * Get total completed time for current task instance
     * (excludes the active/current time entry)
     */
    async getCurrentTaskOldTime() {
        const currentState = this.state.getTrackingState();
        if (!currentState.isTracking || !currentState.currentTaskInstanceId) {
            return 0;
        }

        const sql = `
            SELECT COALESCE(SUM(duration), 0) as total
            FROM TimeEntry
            WHERE task_instance_id = ?
                AND end_time IS NOT NULL
        `;
        const results = await this.query(sql, [currentState.currentTaskInstanceId]);
        return results.length > 0 ? results[0].total : 0;
    }
    /**
     * Create a time entry
     */
    async createTimeEntry(input) {
        const sql = `
            INSERT INTO TimeEntry (task_instance_id, start_time, end_time, duration, created_at)
            VALUES (?, ?, NULL, 0, datetime('now'))
        `;
        const entryId = await this.execute(sql, [input.task_instance_id, input.start_time]);
        this.events.emit(CoreEvents.TIME_ENTRY_CREATED, { id: entryId, ...input });
        return entryId;
    }
    /**
     * Update a time entry
     * If this is the currently tracked entry, recalculates elapsedSeconds and updates tracking state
     */
    async updateTimeEntry(id, input) {
        const updates = [];
        const params = [];
        if (input.start_time !== undefined) {
            updates.push('start_time = ?');
            params.push(input.start_time);
        }
        if (input.end_time !== undefined) {
            updates.push('end_time = ?');
            params.push(input.end_time);
        }
        if (input.duration !== undefined) {
            updates.push('duration = ?');
            params.push(input.duration);
        }
        if (updates.length === 0)
            return;
        params.push(id);
        const sql = `UPDATE TimeEntry SET ${updates.join(', ')} WHERE id = ?`;
        await this.execute(sql, params);
        
        // If this is the currently tracked entry and tracking is active, recalculate elapsedSeconds
        const currentState = this.state.getTrackingState();
        if (currentState.isTracking && currentState.currentTimeEntryId === id) {
            // Get updated entry data from database to check if it's still active
            const updatedEntry = await this.query(`SELECT start_time, end_time, duration FROM TimeEntry WHERE id = ?`, [id]);
            
            if (updatedEntry && updatedEntry.length > 0) {
                const entry = updatedEntry[0];
                
                // Update oldTime in state when entry is edited
                // If end_time was set/changed or duration changed, oldTime may have changed
                if (input.end_time !== undefined || input.duration !== undefined) {
                    // Recalculate oldTime (excludes active entries) after edit
                    const newOldTime = await this.getCurrentTaskOldTime();
                    this.state.updateTrackingState({ oldTime: newOldTime });
                }
                
                // If entry still has no end_time (still active), recalculate elapsedSeconds from start_time
                if (!entry.end_time && entry.start_time) {
                    const startDate = new Date(entry.start_time);
                    const currentDate = new Date(TimeUtils.getCurrentTimestamp());
                    const newElapsedSeconds = Math.floor((currentDate.getTime() - startDate.getTime()) / 1000);
                    
                    // Update tracking state with recalculated elapsed seconds
                    this.state.updateTrackingState({
                        startTime: entry.start_time,
                        elapsedSeconds: Math.max(0, newElapsedSeconds),
                    });
                    
                    // Emit tracking updated event to refresh UI widget
                    this.events.emit(CoreEvents.TRACKING_UPDATED, {
                        taskId: currentState.currentTaskId,
                        elapsedSeconds: Math.max(0, newElapsedSeconds),
                        pomodoroRemaining: currentState.pomodoroRemaining,
                    });
                } else if (entry.end_time && entry.duration) {
                    // Entry was closed, but user might have edited it - update elapsedSeconds to match duration
                    // This handles case where user edits a closed entry that was previously tracked
                    this.state.updateTrackingState({
                        elapsedSeconds: entry.duration,
                    });
                    
                    // Emit tracking updated event to refresh UI widget
                    this.events.emit(CoreEvents.TRACKING_UPDATED, {
                        taskId: currentState.currentTaskId,
                        elapsedSeconds: entry.duration,
                        pomodoroRemaining: currentState.pomodoroRemaining,
                    });
                }
            }
        }
        
        this.events.emit(CoreEvents.TIME_ENTRY_UPDATED, { id, ...input });
    }
    /**
     * Get current time entry (active tracking)
     */
    async getCurrentTimeEntry() {
        const currentState = this.state.getTrackingState();
        // Scope to the current task instance to avoid unrelated NULL rows causing issues
        const sql = `SELECT id, task_instance_id, start_time, end_time, duration, created_at
                     FROM TimeEntry
                     WHERE end_time IS NULL AND task_instance_id = ?
                     ORDER BY id DESC LIMIT 1`;
        const results = await this.query(sql, [currentState.currentTaskInstanceId]);
        return results.length > 0 ? results[0] : null;
    }
    /**
     * Start internal timer
     */
    startTimer() {
        // Unsubscribe previous token if any
        if (this._timerToken) {
            this._getScheduler().unsubscribe(this._timerToken);
            this._timerToken = 0;
        }

        // Store when timer started for watchdog
        this.timerStartTime = Date.now();

        this._timerToken = this._getScheduler().subscribe(() => {
            const currentState = this.state.getTrackingState();
            if (currentState.isTracking) {
                // DISABLED: Recovery creates GDA objects that accumulate GWeakRef
                // currentTimeEntryId should be set correctly on start() and never lost
                // If it is lost, the entry will be closed on next start()
                // This prevents frequent DB queries during tracking
                //
                // Original recovery code (commented out):
                // const now = Date.now();
                // if (!currentState.currentTimeEntryId && currentState.currentTaskInstanceId && 
                //     !this._recoveryInProgress && 
                //     (now - this._lastRecoveryAttempt) >= this._recoveryThrottleMs) {
                //     this._lastRecoveryAttempt = now;
                //     void this._recoverCurrentTimeEntryId().catch(error => {
                //         Logger.debug(`[TimeTracking] Could not recover currentTimeEntryId: ${error.message}`);
                //     });
                // }
                
                const newElapsed = currentState.elapsedSeconds + 1;

                // Update elapsed time
                const updates = {
                    elapsedSeconds: newElapsed,
                };

                // Pomodoro countdown logic
                if (currentState.pomodoroMode) {
                    // Auto-stop when elapsed time reaches duration
                    if (newElapsed >= currentState.pomodoroDuration) {
                        // Update state with final elapsed time BEFORE stopping
                        this.state.updateTrackingState(updates);

                        this.stop().catch(error => {
                            Logger.error(`[TimeTracking] Error auto-stopping Pomodoro: ${error.message}`);
                        });
                        return;
                    }

                    // Calculate remaining time for countdown
                    // When elapsed = 1, remaining = 300 - 1 = 299 (show 4:59)
                    // When elapsed = 299, remaining = 300 - 299 = 1 (show 0:01)
                    const remaining = currentState.pomodoroDuration - newElapsed;
                    updates.pomodoroRemaining = Math.max(0, remaining);
                }

                this.state.updateTrackingState(updates);
                this.events.emit(CoreEvents.TRACKING_UPDATED, {
                    taskId: currentState.currentTaskId,
                    elapsedSeconds: newElapsed,
                    pomodoroRemaining: updates.pomodoroRemaining,
                });
                
                // Watchdog: restart timer every 1 hour to prevent GWeakRef accumulation
                const hoursRunning = (Date.now() - this.timerStartTime) / (1000 * 60 * 60);
                if (hoursRunning >= 1) {
                    this.restartTimer();
                }
            }
        });
    }
    
    /**
     * Restart timer to prevent memory leaks from long-running intervals
     */
    restartTimer() {
        const currentState = this.state.getTrackingState();
        if (!currentState.isTracking) return;
        
        // Stop old timer
        this.stopTimer();
        
        // Restart fresh timer
        this.startTimer();
        
        // no-op log in release
    }
    /**
     * Stop internal timer
     */
    stopTimer() {
        if (this._timerToken) {
            this._getScheduler().unsubscribe(this._timerToken);
            this._timerToken = 0;
        }
        this.timerStartTime = null;
    }

    _getScheduler() {
        // Use shared scheduler from CoreAPI
        return this.core.services.timerScheduler;
    }

    /**
     * Attempt to recover currentTimeEntryId if it's been lost from state
     * Called periodically by timer to prevent loss after long-running sessions
     * THROTTLED to prevent GWeakRef accumulation
     */
    async _recoverCurrentTimeEntryId() {
        // Prevent parallel recovery attempts
        if (this._recoveryInProgress) {
            return;
        }
        
        this._recoveryInProgress = true;
        
        try {
            const currentState = this.state.getTrackingState();
            
            // Double-check conditions after acquiring lock
            if (!currentState.isTracking || !currentState.currentTaskInstanceId) {
                return; // Not tracking or missing instance ID
            }
            
            if (currentState.currentTimeEntryId) {
                return; // Already has entry ID (another recovery might have set it)
            }
            
            // Find active entry for current instance
            const rows = await this.query(
                `SELECT id FROM TimeEntry 
                 WHERE task_instance_id = ? AND end_time IS NULL 
                 ORDER BY id DESC LIMIT 1`,
                [currentState.currentTaskInstanceId]
            );
            
            if (rows && rows.length > 0 && rows[0].id) {
                // Restore currentTimeEntryId to state
                this.state.updateTrackingState({
                    currentTimeEntryId: rows[0].id,
                });
                Logger.debug(`[TimeTracking] Recovered currentTimeEntryId: ${rows[0].id}`);
            }
        } catch (error) {
            // Don't throw - this is a recovery attempt that can fail silently
            // Error is logged at debug level in caller
            Logger.debug(`[TimeTracking] Recovery attempt failed: ${error.message}`);
        } finally {
            this._recoveryInProgress = false;
        }
    }
    /**
     * Get all time entries
     */
    async getAllTimeEntries() {
        const sql = `SELECT * FROM TimeEntry ORDER BY start_time DESC`;
        return await this.query(sql);
    }
    /**
     * Get time entries for a task instance
     */
    async getTimeEntriesByInstance(instanceId) {
        const sql = `SELECT * FROM TimeEntry WHERE task_instance_id = ? ORDER BY start_time DESC`;
        return await this.query(sql, [instanceId]);
    }
    /**
     * Delete a time entry
     */
    async deleteTimeEntry(entryId) {
        // Get entry to update instance total_time after deletion
        const sql = `SELECT task_instance_id FROM TimeEntry WHERE id = ?`;
        const results = await this.query(sql, [entryId]);
        if (results.length > 0) {
            const instanceId = results[0].task_instance_id;
            // Delete entry
            await this.execute(`DELETE FROM TimeEntry WHERE id = ?`, [entryId]);
            // Update instance total_time
            await this.core.services.taskInstances.updateTotalTime(instanceId);
            this.events.emit(CoreEvents.TIME_ENTRY_DELETED, { id: entryId });
        }
    }

    /**
     * Get last used project ID
     */
    getLastUsedProjectId() {
        return this.lastUsedProjectId;
    }

    /**
     * Get last used client ID
     */
    getLastUsedClientId() {
        return this.lastUsedClientId;
    }
}
