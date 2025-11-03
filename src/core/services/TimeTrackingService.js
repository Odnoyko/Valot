/**
 * Time Tracking Service - Simplified
 * Minimal object creation, direct SQL operations
 */
import { BaseService } from './BaseService.js';
import { CoreEvents } from '../events/CoreEvents.js';
import { TimeUtils } from '../utils/TimeUtils.js';
import { GlobalTimer } from './GlobalTimer.js';

export class TimeTrackingService extends BaseService {
    lastUsedProjectId = null;
    lastUsedClientId = null;

    constructor(core) {
        super(core);

        // Initialize GlobalTimer
        this.globalTimer = new GlobalTimer(core);

        // Subscribe to global timer ticks
        this._subscribeToGlobalTimer();
    }

    /**
     * Start tracking
     * Simple: stop current if tracking, create instance and entry, update state
     */
    async start(taskId, projectId = null, clientId = null, pomodoroMode = false, pomodoroDuration = 0) {
        // Stop if already tracking
        const tracking = this.state.state.tracking;
        if (tracking.isTracking) {
            await this.stop();
        }

        const validProjectId = projectId || null;
        const validClientId = clientId || null;
        this.lastUsedProjectId = validProjectId;
        this.lastUsedClientId = validClientId;

        // Get task name (single query, minimal object)
        const taskRows = await this.query(`SELECT name FROM Task WHERE id = ?`, [taskId]);
        if (!taskRows || taskRows.length === 0) {
            throw new Error(`Task ${taskId} not found`);
        }
        const taskName = taskRows[0].name;
        
        // OPTIMIZED: Clear query result array immediately after use to free RAM
        if (taskRows && Array.isArray(taskRows)) {
            taskRows.length = 0;
        }

        // Check saved time from crash
        const persistence = this.core.services.persistence;
        const savedTime = persistence ? persistence.getSavedTimeForTask(taskId, validProjectId, validClientId) : 0;

        // Close abandoned entries (simple SQL)
        try {
            await this.execute(
                `UPDATE TimeEntry SET duration = MAX(1, CAST((julianday('now') - julianday(start_time)) * 86400 AS INTEGER))
                 WHERE task_instance_id IN (SELECT id FROM TaskInstance WHERE task_id = ? AND project_id = ? AND client_id = ?)
                 AND end_time IS NULL`,
                [taskId, validProjectId, validClientId]
            );
            await this.execute(
                `UPDATE TimeEntry SET end_time = datetime(start_time, '+' || CAST(duration AS TEXT) || ' seconds')
                 WHERE task_instance_id IN (SELECT id FROM TaskInstance WHERE task_id = ? AND project_id = ? AND client_id = ?)
                 AND end_time IS NULL`,
                [taskId, validProjectId, validClientId]
            );
        } catch (error) {
            console.log(`[Tracking] Close abandoned: ${error.message}`);
        }

        // Create TaskInstance (direct SQL)
        const now = TimeUtils.getCurrentTimestamp();
        const instanceId = await this.execute(
            `INSERT INTO TaskInstance (task_id, project_id, client_id, last_used_at, created_at)
             VALUES (?, ?, ?, ?, ?)`,
            [taskId, validProjectId, validClientId, now, now]
        );

        // Create TimeEntry (direct SQL)
        const startTime = TimeUtils.getCurrentTimestamp();
        const entryId = await this.execute(
            `INSERT INTO TimeEntry (task_instance_id, start_time, end_time, duration, created_at)
             VALUES (?, ?, NULL, 0, ?)`,
            [instanceId, startTime, now]
        );

        // Clear saved time if exists
        if (savedTime > 0 && persistence) {
            persistence.clearSavedTime();
        }

        // Update state (single object)
        this.state.updateTrackingState({
            isTracking: true,
            currentTaskId: taskId,
            currentTaskName: taskName,
            currentTaskInstanceId: instanceId,
            currentProjectId: validProjectId,
            currentClientId: validClientId,
            startTime: startTime,
            savedTimeFromCrash: savedTime,
            pomodoroMode: pomodoroMode,
            pomodoroDuration: pomodoroDuration,
            pomodoroRemaining: pomodoroDuration,
            currentTimeEntryId: entryId,
        });

        // Start timer
        this.stopTimer();
        this.startTimer();

        // Emit event
        this.events.emit(CoreEvents.TRACKING_STARTED, {
            taskId,
            taskName,
            taskInstanceId: instanceId,
            projectId: validProjectId,
            clientId: validClientId,
            startTime,
            timeEntryId: entryId,
        });
    }

    /**
     * Stop tracking
     * Simple: calculate duration, update entry, update total_time, reset state
     */
    async stop() {
        const tracking = this.state.state.tracking;
        if (!tracking.isTracking || !tracking.currentTaskId) {
            throw new Error('Not tracking');
        }

        // CRITICAL: Calculate elapsed time DIRECTLY from startTime (don't stop timer first!)
        // Use startTime from state - it's the source of truth
        const savedTime = tracking.savedTimeFromCrash || 0;
        let elapsed = 0;
        
        if (!tracking.startTime) {
            console.error(`[Tracking] Stop: No startTime in tracking state!`);
            elapsed = 1; // Force minimum
        } else {
            // Parse startTime string to timestamp
            // startTime is "YYYY-MM-DD HH:MM:SS" format from TimeUtils.getCurrentTimestamp()
            let startTimestamp;
            if (typeof tracking.startTime === 'string') {
                // Parse "YYYY-MM-DD HH:MM:SS" format correctly
                // Replace space with T for ISO format, add Z for UTC
                const isoString = tracking.startTime.replace(' ', 'T');
                startTimestamp = new Date(isoString).getTime();
                
                // If parsing failed (NaN), try alternative parsing
                if (isNaN(startTimestamp)) {
                    const parts = tracking.startTime.split(' ');
                    if (parts.length === 2) {
                        const [datePart, timePart] = parts;
                        const [year, month, day] = datePart.split('-').map(Number);
                        const [hours, mins, secs] = timePart.split(':').map(Number);
                        startTimestamp = new Date(year, month - 1, day, hours, mins, secs || 0).getTime();
                    }
                }
            } else {
                startTimestamp = tracking.startTime;
            }
            
            const now = Date.now();
            elapsed = Math.floor((now - startTimestamp) / 1000);
            
            console.log(`[Tracking] Stop: startTime="${tracking.startTime}", parsed=${startTimestamp}, now=${now}, elapsed=${elapsed}s`);
            
            // CRITICAL: If elapsed is 0 or negative, use minimum (very fast start/stop or parsing error)
            if (elapsed <= 0) {
                console.warn(`[Tracking] Stop: elapsed=${elapsed}s is invalid, forcing to 1 second (startTime=${tracking.startTime})`);
                elapsed = 1;
            }
        }
        
        // CRITICAL: duration must be at least 1 second, use elapsed + savedTime
        let duration = Math.max(1, elapsed + savedTime);
        // CRITICAL: If duration is still 0 after calculation, force to 1 (should not happen but safety check)
        if (duration <= 0) {
            console.error(`[Tracking] Stop: CRITICAL - duration=${duration} is invalid, forcing to 1 second!`);
            duration = 1;
        }

        // CRITICAL: Stop timer AFTER we've calculated elapsed (don't clear state before!)
        this.stopTimer();

        let updated = false;
        if (tracking.currentTimeEntryId) {
            try {
                // Update entry (guarantees end_time > start_time via SQL)
                // CRITICAL: Verify duration > 0 before update
                if (duration <= 0) {
                    console.error(`[Tracking] Stop: Invalid duration=${duration}, cannot update TimeEntry`);
                    throw new Error(`Invalid duration: ${duration}`);
                }
                
                // Update TimeEntry (no verify - trust SQL)
                await this.execute(
                    `UPDATE TimeEntry 
                     SET end_time = datetime(start_time, '+' || CAST(? AS TEXT) || ' seconds'),
                         duration = ?
                     WHERE id = ?`,
                    [duration, duration, tracking.currentTimeEntryId]
                );

                // Get instance ID (single query, no verify)
                const instanceRow = await this.query(
                    `SELECT task_instance_id FROM TimeEntry WHERE id = ?`,
                    [tracking.currentTimeEntryId]
                );

                if (instanceRow && instanceRow.length > 0) {
                    const instanceId = instanceRow[0].task_instance_id;
                    
                    // OPTIMIZED: Update total_time in single query (no separate SELECT)
                    await this.execute(
                        `UPDATE TaskInstance 
                         SET total_time = COALESCE(total_time, 0) + ?,
                             updated_at = datetime('now')
                         WHERE id = ?`,
                        [duration, instanceId]
                    );
                    
                    console.log(`[Tracking] Stop: Updated TaskInstance ${instanceId} total_time: added ${duration}s`);
                    updated = true;
                } else {
                    console.warn(`[Tracking] Stop: instanceRow is empty or invalid`);
                }
                
                // OPTIMIZED: Clear query result array immediately to free RAM
                if (instanceRow && Array.isArray(instanceRow)) {
                    instanceRow.length = 0;
                }
            } catch (error) {
                console.error(`[Tracking] Stop error: ${error.message}`);
            }
        }

        // Fallback: find by instance ID
        if (!updated && tracking.currentTaskInstanceId) {
            try {
                await this.execute(
                    `UPDATE TimeEntry 
                     SET end_time = datetime(start_time, '+' || CAST(? AS TEXT) || ' seconds'),
                         duration = ?
                     WHERE task_instance_id = ? AND end_time IS NULL
                     ORDER BY id DESC LIMIT 1`,
                    [duration, duration, tracking.currentTaskInstanceId]
                );
                
                // OPTIMIZED: Update total_time in single query (no separate SELECT)
                await this.execute(
                    `UPDATE TaskInstance 
                     SET total_time = COALESCE(total_time, 0) + ?,
                         updated_at = datetime('now')
                     WHERE id = ?`,
                    [duration, tracking.currentTaskInstanceId]
                );
                
                console.log(`[Tracking] Stop fallback: Updated TaskInstance ${tracking.currentTaskInstanceId} total_time: added ${duration}s`);
            } catch (error) {
                console.error(`[Tracking] Stop fallback error: ${error.message}`);
            }
        }

        // CRITICAL: Save tracking data BEFORE clearing state (for event emission)
        const savedTrackingData = {
            taskId: tracking.currentTaskId,
            taskName: tracking.currentTaskName,
            taskInstanceId: tracking.currentTaskInstanceId,
            projectId: tracking.currentProjectId,
            clientId: tracking.currentClientId,
            startTime: tracking.startTime,
        };
        

        // Reset state (this will clear StateManager cache via updateTrackingState)
        this.state.updateTrackingState({
            isTracking: false,
            currentTaskId: null,
            currentTaskName: null,
            currentTaskInstanceId: null,
            currentProjectId: null,
            currentClientId: null,
            startTime: null,
            savedTimeFromCrash: 0,
            pomodoroMode: false,
            pomodoroDuration: 0,
            pomodoroRemaining: 0,
            currentTimeEntryId: null,
        });

        // OPTIMIZED: Clear any remaining timer references and cached data
        // Timer is already stopped above, but ensure token is cleared
        this._timerToken = 0;
        this._cachedStartTimestamp = null; // Clear cached timestamp to free RAM

        // Emit event (minimal object - only primitives)
        // Include taskInstanceId and duration for UI to update correct task
        // CRITICAL: duration is guaranteed to be >= 1 from calculation above
        // CRITICAL: Use savedTrackingData, not tracking (which is now cleared)
        const eventData = {
            taskId: savedTrackingData.taskId,
            taskName: savedTrackingData.taskName,
            taskInstanceId: savedTrackingData.taskInstanceId, // For UI update
            projectId: savedTrackingData.projectId,
            clientId: savedTrackingData.clientId,
            startTime: savedTrackingData.startTime,
            duration: duration, // CRITICAL: This is the saved duration, guaranteed >= 1
        };
        
        this.events.emit(CoreEvents.TRACKING_STOPPED, eventData);
        
        // OPTIMIZED: Clear ALL event data immediately after emit to free RAM
        // Event handlers should extract data immediately, not store references
        savedTrackingData.taskId = null;
        savedTrackingData.taskName = null;
        savedTrackingData.taskInstanceId = null;
        savedTrackingData.projectId = null;
        savedTrackingData.clientId = null;
        savedTrackingData.startTime = null;
        
        // Clear eventData object too
        eventData.taskId = null;
        eventData.taskName = null;
        eventData.taskInstanceId = null;
        eventData.projectId = null;
        eventData.clientId = null;
        eventData.startTime = null;
        eventData.duration = null;
        
        // CRITICAL: Force garbage collection after stop to free RAM immediately
        // This helps GJS GC collect removed objects right away
        try {
            if (typeof global !== 'undefined' && typeof global.gc === 'function') {
                global.gc();
            }
        } catch (e) {
            // GC not available - ignore
        }
    }

    /**
     * Update time entry
     * Simple: ensure end_time > start_time via SQL
     */
    async updateTimeEntry(id, input) {
        const updates = [];
        const params = [];

        if (input.start_time !== undefined) {
            updates.push('start_time = ?');
            params.push(input.start_time);
        }

        if (input.end_time !== undefined) {
            // Ensure end_time >= start_time
            updates.push(`end_time = CASE 
                WHEN julianday(?) <= julianday(start_time) THEN datetime(start_time, '+1 seconds')
                ELSE ?
            END`);
            params.push(input.end_time);
            params.push(input.end_time);

            if (input.duration !== undefined) {
                updates.push('duration = ?');
                params.push(Math.max(1, input.duration));
            } else {
                updates.push(`duration = MAX(1, CAST((julianday(end_time) - julianday(start_time)) * 86400 AS INTEGER))`);
            }
        } else if (input.duration !== undefined) {
            const duration = Math.max(1, input.duration);
            updates.push(`end_time = datetime(start_time, '+' || CAST(? AS TEXT) || ' seconds')`);
            params.push(duration);
            updates.push('duration = ?');
            params.push(duration);
        }

        if (updates.length === 0) return;

        params.push(id);
        await this.execute(`UPDATE TimeEntry SET ${updates.join(', ')} WHERE id = ?`, params);

        // Remove from cache if completed
        if (input.end_time !== undefined && this.core.services?.cache) {
            try {
                this.core.services.cache.timeEntries.delete(id);
            } catch (e) {
                // Ignore
            }
        }

        // Update state if tracking
        const tracking = this.state.state.tracking;
        if (tracking.isTracking && tracking.currentTimeEntryId === id && input.start_time) {
            this.state.updateTrackingState({ startTime: input.start_time });
        }

        this.events.emit(CoreEvents.TIME_ENTRY_UPDATED, { id, ...input });
    }

    /**
     * Create time entry
     */
    async createTimeEntry(input) {
        const entryId = await this.execute(
            `INSERT INTO TimeEntry (task_instance_id, start_time, end_time, duration, created_at)
             VALUES (?, ?, NULL, 0, datetime('now'))`,
            [input.task_instance_id, input.start_time]
        );
        this.events.emit(CoreEvents.TIME_ENTRY_CREATED, { id: entryId, ...input });
        return entryId;
    }

    /**
     * Get current time entry
     */
    async getCurrentTimeEntry() {
        const tracking = this.state.state.tracking;
        const rows = await this.query(
            `SELECT id, task_instance_id, start_time, end_time, created_at
             FROM TimeEntry
             WHERE end_time IS NULL AND task_instance_id = ?
             ORDER BY id DESC LIMIT 1`,
            [tracking.currentTaskInstanceId]
        );
        return rows.length > 0 ? rows[0] : null;
    }

    /**
     * Start timer
     * OPTIMIZED: Cache startTime timestamp, no Date creation every second
     * CRITICAL: Use weak references to avoid holding objects in closure
     */
    startTimer() {
        const tracking = this.state.state.tracking;
        if (!tracking.isTracking || !tracking.startTime) {
            console.warn(`[Tracking] startTimer: Not tracking or no startTime. isTracking=${tracking.isTracking}, startTime=${tracking.startTime}`);
            return;
        }

        // Cache startTime as timestamp once (avoid Date creation every second)
        // Store as instance variable to avoid closure holding references
        // CRITICAL: Parse "YYYY-MM-DD HH:MM:SS" format correctly
        if (typeof tracking.startTime === 'string') {
            // Parse "YYYY-MM-DD HH:MM:SS" format (replace space with T for ISO)
            this._cachedStartTimestamp = new Date(tracking.startTime.replace(' ', 'T')).getTime();
            console.log(`[Tracking] startTimer: Parsed startTime string "${tracking.startTime}" to timestamp ${this._cachedStartTimestamp}`);
        } else {
            this._cachedStartTimestamp = tracking.startTime;
            console.log(`[Tracking] startTimer: Using startTime timestamp directly: ${this._cachedStartTimestamp}`);
        }
        
        if (!this._cachedStartTimestamp || isNaN(this._cachedStartTimestamp)) {
            console.error(`[Tracking] startTimer: Invalid timestamp! startTime=${tracking.startTime}, parsed=${this._cachedStartTimestamp}`);
            return;
        }

        this._timerToken = this._getScheduler().subscribe(() => {
            // Get fresh tracking state (don't hold reference in closure)
            const t = this.state.state.tracking;
            if (!t.isTracking || !t.startTime) return;

            const now = Date.now();
            // Use instance variable instead of closure variable
            const elapsed = Math.floor((now - this._cachedStartTimestamp) / 1000);

            // Pomodoro check
            if (t.pomodoroMode && t.pomodoroDuration > 0 && elapsed >= t.pomodoroDuration) {
                this.stop().catch(err => console.error(`[Tracking] Pomodoro stop: ${err.message}`));
                return;
            }

            const pomodoroRemaining = t.pomodoroMode && t.pomodoroDuration > 0
                ? Math.max(0, t.pomodoroDuration - elapsed)
                : 0;

            // OPTIMIZED: Reuse minimal event object to prevent RAM accumulation
            // Emit event with minimal data (primitives only)
            // Event handlers should extract data immediately and not store references
            const eventData = {
                taskId: t.currentTaskId,
                elapsedSeconds: elapsed,
                pomodoroRemaining: pomodoroRemaining,
            };
            this.events.emit(CoreEvents.TRACKING_UPDATED, eventData);
            // Clear reference immediately after emit (helps GC if handlers store references)
            // Note: eventData is still valid for handlers, we just clear our reference
            eventData.taskId = null;
            eventData.elapsedSeconds = null;
            eventData.pomodoroRemaining = null;
        });
    }

    /**
     * Stop timer
     * OPTIMIZED: Clear cached timestamp to free memory
     */
    stopTimer() {
        if (this._timerToken) {
            this._getScheduler().unsubscribe(this._timerToken);
            this._timerToken = 0;
        }
        // Clear cached timestamp to free memory
        this._cachedStartTimestamp = null;
    }

    _getScheduler() {
        return this.core.services.timerScheduler;
    }

    /**
     * Update current task name
     */
    async updateCurrentTaskName(newName) {
        const tracking = this.state.state.tracking;
        if (!tracking.isTracking || !tracking.currentTaskInstanceId) {
            throw new Error('Not tracking');
        }

        const newTask = await this.core.services.tasks.findOrCreate(newName);
        await this.core.services.taskInstances.update(tracking.currentTaskInstanceId, {
            task_id: newTask.id
        });

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
     * Update project/client
     */
    async updateCurrentProjectClient(projectId = null, clientId = null) {
        const tracking = this.state.state.tracking;
        if (!tracking.isTracking || !tracking.currentTaskInstanceId) {
            throw new Error('Not tracking');
        }

        await this.core.services.taskInstances.update(tracking.currentTaskInstanceId, {
            project_id: projectId,
            client_id: clientId
        });

        this.lastUsedProjectId = projectId;
        this.lastUsedClientId = clientId;

        this.state.updateTrackingState({
            currentProjectId: projectId,
            currentClientId: clientId,
        });

        this.events.emit(CoreEvents.TRACKING_UPDATED, {
            projectId: projectId,
            clientId: clientId,
        });
    }

    /**
     * Pause tracking (same as stop)
     */
    async pause() {
        return await this.stop();
    }

    /**
     * Resume tracking (not implemented)
     */
    async resume() {
        throw new Error('Resume not implemented');
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
            WHERE task_instance_id = ${currentState.currentTaskInstanceId}
                AND end_time IS NOT NULL
        `;
        const results = await this.query(sql);
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
     * Subscribe to GlobalTimer ticks
     */
    _subscribeToGlobalTimer() {
        // Reuse event data object to avoid creating new objects every second
        const updateEvent = {
            taskId: null,
            elapsedSeconds: 0,
            pomodoroRemaining: 0
        };

        this.events.on(CoreEvents.GLOBAL_TIMER_TICK, (data) => {
            // Get cached tracking state (reused object, not created every second)
            const t = this.state.getTrackingState();
            if (!t.isTracking) return;

            // elapsedSeconds is already calculated in getTrackingState() from cached timestamp
            const elapsedSeconds = t.elapsedSeconds;
            const pomodoroRemaining = t.pomodoroRemaining;

            // Pomodoro auto-stop check
            if (t.pomodoroMode && t.pomodoroDuration > 0 && elapsedSeconds >= t.pomodoroDuration) {
                this.stop().catch(error => {
                    console.error('Error auto-stopping Pomodoro:', error);
                });
                return;
            }

            // Emit update event - UI components will update labels
            // Reuse SAME object, just update properties
            updateEvent.taskId = t.currentTaskId;
            updateEvent.elapsedSeconds = elapsedSeconds;
            updateEvent.pomodoroRemaining = pomodoroRemaining;

            this.events.emit(CoreEvents.TRACKING_UPDATED, updateEvent);
        });
    }

    /**
     * Start global timer with current timestamp
     */
    startTimer() {
        const startTime = Date.now();
        this.globalTimer.start(startTime);
        console.log(`[TimeTrackingService] Started GlobalTimer at ${new Date(startTime).toISOString()}`);
    }

    /**
     * Stop global timer
     */
    stopTimer() {
        this.globalTimer.stop();
        console.log('[TimeTrackingService] Stopped GlobalTimer');
    }
    /**
     * Get all time entries
     */
    async getAllTimeEntries() {
        return await this.query(`SELECT * FROM TimeEntry ORDER BY start_time DESC`);
    }

    /**
     * Get time entries by instance
     */
    async getTimeEntriesByInstance(instanceId) {
        return await this.query(`SELECT * FROM TimeEntry WHERE task_instance_id = ? ORDER BY start_time DESC`, [instanceId]);
    }

    /**
     * Delete time entry
     */
    async deleteTimeEntry(entryId) {
        const rows = await this.query(`SELECT task_instance_id FROM TimeEntry WHERE id = ?`, [entryId]);
        if (rows.length > 0) {
            const instanceId = rows[0].task_instance_id;
            await this.execute(`DELETE FROM TimeEntry WHERE id = ?`, [entryId]);
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
