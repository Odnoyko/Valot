/**
 * Statistics Service
 * Provides quick statistics for UI (sidebar, dashboards)
 */
import { BaseService } from './BaseService.js';

/**
 * Stats Service
 * Handles statistics calculations for UI components
 */
export class StatsService extends BaseService {
    constructor(coreAPI) {
        super(coreAPI);
    }

    /**
     * Get This Week statistics (Monday to Sunday)
     * Returns total time and task count for current week
     * Calculates based on time entries within the week, not task.total_time
     */
    async getThisWeekStats() {
        const GLib = imports.gi.GLib;
        const now = GLib.DateTime.new_now_local();

        // Calculate week boundaries (Monday to Sunday)
        const dayOfWeek = now.get_day_of_week(); // 1=Monday, 7=Sunday
        const daysToMonday = dayOfWeek - 1;
        const monday = now.add_days(-daysToMonday);

        const startDate = GLib.DateTime.new_local(
            monday.get_year(),
            monday.get_month(),
            monday.get_day_of_month(),
            0, 0, 0
        );

        const sunday = monday.add_days(6);
        const endDate = GLib.DateTime.new_local(
            sunday.get_year(),
            sunday.get_month(),
            sunday.get_day_of_month(),
            23, 59, 59
        );

        const startTimestamp = startDate.to_unix();
        const endTimestamp = endDate.to_unix();

        // Get all time entries within this week (filter by END TIME from database)
        const allTimeEntries = await this.core.services.tracking.getAllTimeEntries();

        let totalTime = 0;
        const taskInstanceSet = new Set();
        let matchedCount = 0;

        allTimeEntries.forEach(entry => {
            if (!entry.end_time || !entry.duration) return;

            // Parse entry end_time from database
            let entryEndDate;
            const dateString = entry.end_time;

            // Check if date is in ISO8601 format (with T) or local format (YYYY-MM-DD HH:MM:SS)
            if (dateString.includes('T')) {
                // ISO8601 format - parse as UTC
                entryEndDate = GLib.DateTime.new_from_iso8601(dateString, null);
            } else {
                // Local format YYYY-MM-DD HH:MM:SS - parse as local time
                const parts = dateString.split(' ');
                if (parts.length === 2) {
                    const [datePart, timePart] = parts;
                    const [year, month, day] = datePart.split('-').map(Number);
                    const [hours, minutes, seconds] = timePart.split(':').map(Number);

                    entryEndDate = GLib.DateTime.new_local(
                        year, month, day,
                        hours || 0, minutes || 0, seconds || 0
                    );
                }
            }

            if (!entryEndDate) return;

            const entryEndTimestamp = entryEndDate.to_unix();

            // Check if END TIME is within this week
            if (entryEndTimestamp >= startTimestamp && entryEndTimestamp <= endTimestamp) {
                totalTime += entry.duration || 0;
                taskInstanceSet.add(entry.task_instance_id);
                matchedCount++;
            }
        });

        return {
            totalTime,
            taskCount: taskInstanceSet.size
        };
    }

    /**
     * Get top projects with time tracking
     * Returns array of projects sorted by time (descending)
     */
    async getProjectsWithTime(limit = 5) {
        // Get all projects
        const projects = await this.core.services.projects.getAll();

        // Get all task instances to calculate project times
        const taskInstances = await this.core.services.taskInstances.getAll();

        // Calculate time per project
        const projectTimes = new Map();
        taskInstances.forEach(task => {
            const projectId = task.project_id || 1;
            const currentTime = projectTimes.get(projectId) || 0;
            projectTimes.set(projectId, currentTime + (task.total_time || 0));
        });

        // Map projects with their time
        const projectsWithTime = projects.map(project => ({
            id: project.id,
            name: project.name,
            icon: project.icon,
            color: project.color,
            totalTime: projectTimes.get(project.id) || 0,
        }));

        // Filter projects with time > 0, sort by time, and limit
        return projectsWithTime
            .filter(p => p.totalTime > 0)
            .sort((a, b) => b.totalTime - a.totalTime)
            .slice(0, limit);
    }

    /**
     * Get all projects with calculated total_time
     * Returns all projects with their total tracked time
     */
    async getAllProjectsWithTime() {
        // Get all projects
        const projects = await this.core.services.projects.getAll();

        // Get all task instances to calculate project times
        const taskInstances = await this.core.services.taskInstances.getAll();

        // Calculate time per project
        const projectTimes = new Map();
        taskInstances.forEach(task => {
            // Only count tasks that actually have this project assigned
            if (!task.project_id) return;

            const currentTime = projectTimes.get(task.project_id) || 0;
            projectTimes.set(task.project_id, currentTime + (task.total_time || 0));
        });

        // Add total_time to each project
        return projects.map(project => ({
            ...project,
            total_time: projectTimes.get(project.id) || 0,
        }));
    }

    /**
     * Get Today statistics
     */
    async getTodayStats() {
        const GLib = imports.gi.GLib;
        const now = GLib.DateTime.new_now_local();

        const startDate = GLib.DateTime.new_local(
            now.get_year(),
            now.get_month(),
            now.get_day_of_month(),
            0, 0, 0
        );

        const endDate = GLib.DateTime.new_local(
            now.get_year(),
            now.get_month(),
            now.get_day_of_month(),
            23, 59, 59
        );

        const startTimestamp = startDate.to_unix();
        const endTimestamp = endDate.to_unix();

        const taskInstances = await this.core.services.taskInstances.getAll();

        let totalTime = 0;
        let taskCount = 0;

        taskInstances.forEach(task => {
            if (!task.last_used_at) return;

            const taskDate = GLib.DateTime.new_from_iso8601(task.last_used_at, null);
            if (!taskDate) return;

            const taskTimestamp = taskDate.to_unix();
            if (taskTimestamp >= startTimestamp && taskTimestamp <= endTimestamp) {
                totalTime += task.total_time || 0;
                taskCount++;
            }
        });

        return { totalTime, taskCount };
    }

    /**
     * Get This Month statistics
     */
    async getThisMonthStats() {
        const GLib = imports.gi.GLib;
        const now = GLib.DateTime.new_now_local();

        const startDate = GLib.DateTime.new_local(
            now.get_year(),
            now.get_month(),
            1,
            0, 0, 0
        );

        // Get last day of month
        const nextMonth = now.add_months(1);
        const firstDayNextMonth = GLib.DateTime.new_local(
            nextMonth.get_year(),
            nextMonth.get_month(),
            1,
            0, 0, 0
        );
        const lastDayThisMonth = firstDayNextMonth.add_days(-1);

        const endDate = GLib.DateTime.new_local(
            lastDayThisMonth.get_year(),
            lastDayThisMonth.get_month(),
            lastDayThisMonth.get_day_of_month(),
            23, 59, 59
        );

        const startTimestamp = startDate.to_unix();
        const endTimestamp = endDate.to_unix();

        const taskInstances = await this.core.services.taskInstances.getAll();

        let totalTime = 0;
        let taskCount = 0;

        taskInstances.forEach(task => {
            if (!task.last_used_at) return;

            const taskDate = GLib.DateTime.new_from_iso8601(task.last_used_at, null);
            if (!taskDate) return;

            const taskTimestamp = taskDate.to_unix();
            if (taskTimestamp >= startTimestamp && taskTimestamp <= endTimestamp) {
                totalTime += task.total_time || 0;
                taskCount++;
            }
        });

        return { totalTime, taskCount };
    }

    /**
     * Get statistics for a specific date range based on time entries
     * Returns totalTime, activeProjects, trackedTasks, and earnings by currency
     *
     * @param {Object} dateRange - { startDate: GLib.DateTime, endDate: GLib.DateTime }
     * @param {Array} taskInstanceIds - Optional array of task instance IDs to filter
     * @returns {Object} { totalTime, activeProjects, trackedTasks, earningsByCurrency }
     */
    async getStatsForPeriod(dateRange, taskInstanceIds = null) {
        const GLib = imports.gi.GLib;

        const startTimestamp = dateRange.startDate.to_unix();
        const endTimestamp = dateRange.endDate.to_unix();

        // Get all time entries
        const allTimeEntries = await this.core.services.tracking.getAllTimeEntries();

        // Filter time entries by date range (using END TIME from database)
        const filteredEntries = allTimeEntries.filter(entry => {
            if (!entry.end_time || !entry.duration) return false;

            // Filter by task instance IDs if provided
            if (taskInstanceIds && !taskInstanceIds.includes(entry.task_instance_id)) {
                return false;
            }

            // Parse entry end_time from database
            let entryEndDate;
            const dateString = entry.end_time;

            // Check if date is in ISO8601 format (with T) or local format (YYYY-MM-DD HH:MM:SS)
            if (dateString.includes('T')) {
                // ISO8601 format - parse as UTC
                entryEndDate = GLib.DateTime.new_from_iso8601(dateString, null);
            } else {
                // Local format YYYY-MM-DD HH:MM:SS - parse as local time
                const parts = dateString.split(' ');
                if (parts.length === 2) {
                    const [datePart, timePart] = parts;
                    const [year, month, day] = datePart.split('-').map(Number);
                    const [hours, minutes, seconds] = timePart.split(':').map(Number);

                    entryEndDate = GLib.DateTime.new_local(
                        year, month, day,
                        hours || 0, minutes || 0, seconds || 0
                    );
                }
            }

            if (!entryEndDate) return false;

            const entryEndTimestamp = entryEndDate.to_unix();

            // Check if END TIME is within the period
            return entryEndTimestamp >= startTimestamp && entryEndTimestamp <= endTimestamp;
        });

        // Calculate total time from filtered entries
        let totalTime = 0;
        filteredEntries.forEach(entry => {
            totalTime += entry.duration || 0;
        });

        // Get unique task instances and projects
        const taskInstanceSet = new Set();
        const projectSet = new Set();
        const earningsByCurrency = new Map();

        // Get all task instances for lookup
        const allTaskInstances = await this.core.services.taskInstances.getAll();
        const taskInstanceMap = new Map();
        allTaskInstances.forEach(ti => taskInstanceMap.set(ti.id, ti));

        filteredEntries.forEach(entry => {
            const taskInstance = taskInstanceMap.get(entry.task_instance_id);
            if (!taskInstance) return;

            taskInstanceSet.add(entry.task_instance_id);

            if (taskInstance.project_id) {
                projectSet.add(taskInstance.project_id);
            }

            // Calculate earnings if task has rate
            if (taskInstance.client_rate && entry.duration) {
                const hours = entry.duration / 3600;
                const earnings = hours * taskInstance.client_rate;
                const currency = taskInstance.client_currency || 'USD';

                const currentEarnings = earningsByCurrency.get(currency) || 0;
                earningsByCurrency.set(currency, currentEarnings + earnings);
            }
        });

        return {
            totalTime,
            activeProjects: projectSet.size,
            trackedTasks: taskInstanceSet.size,
            earningsByCurrency
        };
    }

    /**
     * Get task instance IDs that have time entries with end_time in the specified period
     * Used for filtering tasks in UI by period
     *
     * @param {Object} dateRange - { startDate: GLib.DateTime, endDate: GLib.DateTime }
     * @returns {Array<number>} Array of task instance IDs
     */
    async getTaskInstanceIdsForPeriod(dateRange) {
        const GLib = imports.gi.GLib;

        const startTimestamp = dateRange.startDate.to_unix();
        const endTimestamp = dateRange.endDate.to_unix();

        // Get all time entries
        const allTimeEntries = await this.core.services.tracking.getAllTimeEntries();

        const taskInstanceIds = new Set();

        allTimeEntries.forEach(entry => {
            if (!entry.end_time || !entry.duration) return;

            // Parse entry end_time from database
            let entryEndDate;
            const dateString = entry.end_time;

            // Check if date is in ISO8601 format (with T) or local format (YYYY-MM-DD HH:MM:SS)
            if (dateString.includes('T')) {
                // ISO8601 format - parse as UTC
                entryEndDate = GLib.DateTime.new_from_iso8601(dateString, null);
            } else {
                // Local format YYYY-MM-DD HH:MM:SS - parse as local time
                const parts = dateString.split(' ');
                if (parts.length === 2) {
                    const [datePart, timePart] = parts;
                    const [year, month, day] = datePart.split('-').map(Number);
                    const [hours, minutes, seconds] = timePart.split(':').map(Number);

                    entryEndDate = GLib.DateTime.new_local(
                        year, month, day,
                        hours || 0, minutes || 0, seconds || 0
                    );
                }
            }

            if (!entryEndDate) return;

            const entryEndTimestamp = entryEndDate.to_unix();

            // Check if END TIME is within the period
            if (entryEndTimestamp >= startTimestamp && entryEndTimestamp <= endTimestamp) {
                taskInstanceIds.add(entry.task_instance_id);
            }
        });

        return Array.from(taskInstanceIds);
    }
}
