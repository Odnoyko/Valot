import { BaseService } from './BaseService.js';
import { CoreEvents } from '../events/CoreEvents.js';
import { TimeUtils } from '../utils/TimeUtils.js';
export class TimeTrackingService extends BaseService {
    trackingTimer = null;
    lastUsedProjectId = null;
    lastUsedClientId = null;
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
        // Create time entry for this instance
        const startTime = TimeUtils.getCurrentTimestamp();
        const entryId = await this.createTimeEntry({
            task_instance_id: taskInstance.id,
            start_time: startTime,
        });
        // Update state (use validated IDs)
        const trackingState = {
            isTracking: true,
            currentTaskId: taskId,
            currentTaskName: task.name,
            currentTaskInstanceId: taskInstance.id,
            currentProjectId: validProjectId,
            currentClientId: validClientId,
            startTime: startTime,
            elapsedSeconds: 0,
            pomodoroMode: pomodoroMode,
            pomodoroDuration: pomodoroDuration,
            pomodoroRemaining: pomodoroDuration,
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
            pomodoroMode: false,
            pomodoroDuration: 0,
            pomodoroRemaining: 0,
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
                            console.error('Error auto-stopping Pomodoro:', error);
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
