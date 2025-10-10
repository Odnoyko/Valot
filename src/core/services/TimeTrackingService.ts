import { BaseService } from './BaseService';
import { CoreAPI } from '../api/CoreAPI';
import { TimeEntry, TimeEntryCreateInput } from '../models/TimeEntry';
import { CoreEvents } from '../events/CoreEvents';
import { TimeUtils } from '../utils/TimeUtils';

export class TimeTrackingService extends BaseService {
    private trackingTimer: any = null;

    constructor(core: CoreAPI) {
        super(core);
    }

    /**
     * Start tracking a task instance
     */
    async start(
        taskId: number,
        projectId: number | null = null,
        clientId: number | null = null
    ): Promise<void> {
        // Check if already tracking
        const currentState = this.state.getTrackingState();
        if (currentState.isTracking) {
            throw new Error('Already tracking a task. Stop current task first.');
        }

        // Find or create task instance for this combination
        const taskInstance = await this.core.services.taskInstances.findOrCreate(
            taskId,
            projectId,
            clientId
        );

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
            currentProjectId: projectId,
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
    async stop(): Promise<void> {
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
            currentProjectId: null,
            startTime: null,
            elapsedSeconds: 0,
        });

        this.events.emit(CoreEvents.TRACKING_STOPPED, trackingData);
    }

    /**
     * Pause tracking
     */
    async pause(): Promise<void> {
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
    async resume(): Promise<void> {
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
     * Create a time entry
     */
    private async createTimeEntry(input: TimeEntryCreateInput): Promise<number> {
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
    private async updateTimeEntry(id: number, input: { end_time?: string; duration?: number }): Promise<void> {
        const updates: string[] = [];
        const params: any[] = [];

        if (input.end_time !== undefined) {
            updates.push('end_time = ?');
            params.push(input.end_time);
        }
        if (input.duration !== undefined) {
            updates.push('duration = ?');
            params.push(input.duration);
        }

        if (updates.length === 0) return;

        params.push(id);
        const sql = `UPDATE TimeEntry SET ${updates.join(', ')} WHERE id = ?`;

        await this.execute(sql, params);

        this.events.emit(CoreEvents.TIME_ENTRY_UPDATED, { id, ...input });
    }

    /**
     * Get current time entry (active tracking)
     */
    private async getCurrentTimeEntry(): Promise<TimeEntry | null> {
        const sql = `SELECT * FROM TimeEntry WHERE end_time IS NULL ORDER BY id DESC LIMIT 1`;
        const results = await this.query<TimeEntry>(sql);
        return results.length > 0 ? results[0] : null;
    }

    /**
     * Start internal timer
     */
    private startTimer(): void {
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
    private stopTimer(): void {
        if (this.trackingTimer) {
            clearInterval(this.trackingTimer);
            this.trackingTimer = null;
        }
    }

    /**
     * Get all time entries
     */
    async getAllTimeEntries(): Promise<TimeEntry[]> {
        const sql = `SELECT * FROM TimeEntry ORDER BY start_time DESC`;
        return await this.query<TimeEntry>(sql);
    }

    /**
     * Get time entries for a task instance
     */
    async getTimeEntriesByInstance(instanceId: number): Promise<TimeEntry[]> {
        const sql = `SELECT * FROM TimeEntry WHERE task_instance_id = ? ORDER BY start_time DESC`;
        return await this.query<TimeEntry>(sql, [instanceId]);
    }

    /**
     * Delete a time entry
     */
    async deleteTimeEntry(entryId: number): Promise<void> {
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
