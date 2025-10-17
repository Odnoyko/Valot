import { BaseService } from './BaseService.js';
import { CoreEvents } from '../events/CoreEvents.js';
import { TimeUtils } from '../utils/TimeUtils.js';
export class TimeTrackingService extends BaseService {
    trackingTimer = null;
    constructor(core) {
        super(core);
    }
    /**
     * Start tracking a task instance
     */
    async start(taskId, projectId = null, clientId = null) {
        // If already tracking, stop current task first (like old system)
        const currentState = this.state.getTrackingState();
        if (currentState.isTracking) {
            await this.stop();
        }
        // Always create NEW task instance for each tracking session (even if combination exists)
        const taskInstance = await this.core.services.taskInstances.create({
            task_id: taskId,
            project_id: projectId,
            client_id: clientId
        });
        // Get task name for state
        const task = await this.core.services.tasks.getById(taskId);
        // Create time entry for this instance
        const startTime = TimeUtils.getCurrentTimestamp();
        const entryId = await this.createTimeEntry({
            task_instance_id: taskInstance.id,
            start_time: startTime,
        });
        // Update state
        this.state.updateTrackingState({
            isTracking: true,
            currentTaskId: taskId,
            currentTaskName: task.name,
            currentTaskInstanceId: taskInstance.id,
            currentProjectId: projectId,
            currentClientId: clientId,
            startTime: startTime,
            elapsedSeconds: 0,
        });
        // Start timer
        this.startTimer();
        this.events.emit(CoreEvents.TRACKING_STARTED, {
            taskId,
            taskName: task.name,
            taskInstanceId: taskInstance.id,
            projectId,
            clientId,
            startTime,
            timeEntryId: entryId,
        });
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
        const duration = currentState.elapsedSeconds;
        // Get current time entry
        const timeEntry = await this.getCurrentTimeEntry();
        if (timeEntry) {
            // Update time entry with end time
            await this.updateTimeEntry(timeEntry.id, {
                end_time: endTime,
                duration: duration,
            });
            // Update TaskInstance total_time cache
            await this.core.services.taskInstances.updateTotalTime(timeEntry.task_instance_id);
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
        });
        this.events.emit(CoreEvents.TRACKING_STOPPED, trackingData);
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

        console.log(`🔧 Core: Updating task name from "${currentState.currentTaskName}" to "${newName}"`);

        // Find or create task with new name
        const newTask = await this.core.services.tasks.findOrCreate(newName);
        console.log(`✅ Core: Using task "${newName}" (id: ${newTask.id})`)

        // Update TaskInstance to point to the new task
        await this.core.services.taskInstances.update(currentState.currentTaskInstanceId, {
            task_id: newTask.id
        });
        console.log(`✅ Core: TaskInstance ${currentState.currentTaskInstanceId} switched to task ${newTask.id}`);

        // Update state
        this.state.updateTrackingState({
            currentTaskId: newTask.id,
            currentTaskName: newName,
        });
        console.log(`✅ Core: Tracking state updated with new task`);

        this.events.emit(CoreEvents.TRACKING_UPDATED, {
            taskId: newTask.id,
            taskName: newName,
        });
        console.log(`📡 Core: TRACKING_UPDATED event emitted`);
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
        const sql = `SELECT * FROM TimeEntry WHERE end_time IS NULL ORDER BY id DESC LIMIT 1`;
        const results = await this.query(sql);
        return results.length > 0 ? results[0] : null;
    }
    /**
     * Start internal timer
     */
    startTimer() {
        if (this.trackingTimer) {
            clearInterval(this.trackingTimer);
        }
        this.trackingTimer = setInterval(() => {
            const currentState = this.state.getTrackingState();
            if (currentState.isTracking) {
                this.state.updateTrackingState({
                    elapsedSeconds: currentState.elapsedSeconds + 1,
                });
                this.events.emit(CoreEvents.TRACKING_UPDATED, {
                    taskId: currentState.currentTaskId,
                    elapsedSeconds: currentState.elapsedSeconds + 1,
                });
            }
        }, 1000);
    }
    /**
     * Stop internal timer
     */
    stopTimer() {
        if (this.trackingTimer) {
            clearInterval(this.trackingTimer);
            this.trackingTimer = null;
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
}
