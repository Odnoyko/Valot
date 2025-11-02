/**
 * Time Tracking Service - Simplified
 * Minimal object creation, direct SQL operations
 */
import { BaseService } from './BaseService.js';
import { CoreEvents } from '../events/CoreEvents.js';
import { TimeUtils } from '../utils/TimeUtils.js';
import { Logger } from '../utils/Logger.js';

export class TimeTrackingService extends BaseService {
    _timerToken = 0;
    lastUsedProjectId = null;
    lastUsedClientId = null;

    constructor(core) {
        super(core);
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
                `UPDATE TimeEntry SET end_time = datetime(start_time, '+' || CAST(duration + 1 AS TEXT) || ' seconds')
                 WHERE task_instance_id IN (SELECT id FROM TaskInstance WHERE task_id = ? AND project_id = ? AND client_id = ?)
                 AND end_time IS NULL`,
                [taskId, validProjectId, validClientId]
            );
        } catch (error) {
            Logger.debug(`[Tracking] Close abandoned: ${error.message}`);
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

        this.stopTimer();

        const savedTime = tracking.savedTimeFromCrash || 0;
        const elapsed = tracking.elapsedSeconds || 0;
        const duration = Math.max(1, elapsed + savedTime);

        let updated = false;
        if (tracking.currentTimeEntryId) {
            try {
                // Update entry (guarantees end_time > start_time via SQL)
                await this.execute(
                    `UPDATE TimeEntry 
                     SET end_time = datetime(start_time, '+' || CAST(? AS TEXT) || ' seconds'),
                         duration = ?
                     WHERE id = ?`,
                    [duration, duration, tracking.currentTimeEntryId]
                );

                // Get instance ID and update total_time
                const instanceRow = await this.query(
                    `SELECT task_instance_id FROM TimeEntry WHERE id = ?`,
                    [tracking.currentTimeEntryId]
                );

                if (instanceRow && instanceRow.length > 0) {
                    const instanceId = instanceRow[0].task_instance_id;
                    await this.execute(
                        `UPDATE TaskInstance 
                         SET total_time = (SELECT COALESCE(SUM(duration), 0) FROM TimeEntry WHERE task_instance_id = ? AND end_time IS NOT NULL)
                         WHERE id = ?`,
                        [instanceId, instanceId]
                    );
                    updated = true;
                }
            } catch (error) {
                Logger.error(`[Tracking] Stop error: ${error.message}`);
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
                await this.execute(
                    `UPDATE TaskInstance 
                     SET total_time = (SELECT COALESCE(SUM(duration), 0) FROM TimeEntry WHERE task_instance_id = ? AND end_time IS NOT NULL)
                     WHERE id = ?`,
                    [tracking.currentTaskInstanceId, tracking.currentTaskInstanceId]
                );
            } catch (error) {
                Logger.error(`[Tracking] Stop fallback error: ${error.message}`);
            }
        }

        // Reset state
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

        // Emit event
        this.events.emit(CoreEvents.TRACKING_STOPPED, {
            taskId: tracking.currentTaskId,
            taskName: tracking.currentTaskName,
            projectId: tracking.currentProjectId,
            startTime: tracking.startTime,
            duration: duration,
        });
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
     */
    startTimer() {
        const tracking = this.state.state.tracking;
        if (!tracking.isTracking || !tracking.startTime) return;

        this._timerToken = this._getScheduler().subscribe(() => {
            const t = this.state.state.tracking;
            if (!t.isTracking || !t.startTime) return;

            const now = Date.now();
            const start = typeof t.startTime === 'string' ? new Date(t.startTime).getTime() : t.startTime;
            const elapsed = Math.floor((now - start) / 1000);

            // Pomodoro check
            if (t.pomodoroMode && t.pomodoroDuration > 0 && elapsed >= t.pomodoroDuration) {
                this.stop().catch(err => Logger.error(`[Tracking] Pomodoro stop: ${err.message}`));
                return;
            }

            const pomodoroRemaining = t.pomodoroMode && t.pomodoroDuration > 0
                ? Math.max(0, t.pomodoroDuration - elapsed)
                : 0;

            this.events.emit(CoreEvents.TRACKING_UPDATED, {
                taskId: t.currentTaskId,
                elapsedSeconds: elapsed,
                pomodoroRemaining: pomodoroRemaining,
            });
        });
    }

    /**
     * Stop timer
     */
    stopTimer() {
        if (this._timerToken) {
            this._getScheduler().unsubscribe(this._timerToken);
            this._timerToken = 0;
        }
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
