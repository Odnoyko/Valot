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
    /**
     * Get statistics for a specific date range using SQL aggregation (Lazy Loading principle)
     * Does NOT load all data into RAM - uses SQL aggregation queries instead
     */
    async getStatsForPeriod(dateRange, taskInstanceIds = null) {
        const GLib = imports.gi.GLib;

        // Convert dates to SQLite format (YYYY-MM-DD HH:MM:SS)
        const startDateStr = dateRange.startDate.format('%Y-%m-%d %H:%M:%S');
        const endDateStr = dateRange.endDate.format('%Y-%m-%d %H:%M:%S');

        // SQL aggregation query - NO data loaded into RAM
        // Get aggregated statistics directly from database
        let sql = `
            SELECT 
                COALESCE(SUM(te.duration), 0) as total_time,
                COUNT(DISTINCT ti.id) as tracked_tasks,
                COUNT(DISTINCT ti.project_id) as active_projects
            FROM TimeEntry te
            INNER JOIN TaskInstance ti ON te.task_instance_id = ti.id
            WHERE te.end_time IS NOT NULL
              AND te.duration > 0
              AND te.end_time >= '${startDateStr}'
              AND te.end_time <= '${endDateStr}'
        `;

        // Add task instance filter if provided
        if (taskInstanceIds && taskInstanceIds.length > 0) {
            const idsStr = taskInstanceIds.join(',');
            sql += ` AND ti.id IN (${idsStr})`;
        }

        const results = await this.query(sql);
        const row = results[0] || {};
        const totalTime = row.total_time || 0;

        // Get earnings by currency using SQL aggregation (no RAM load)
        // Note: client_rate and client_currency are in Client table, not TaskInstance
        const earningsSql = `
            SELECT 
                c.currency as currency,
                SUM(te.duration * c.rate / 3600.0) as earnings
            FROM TimeEntry te
            INNER JOIN TaskInstance ti ON te.task_instance_id = ti.id
            INNER JOIN Client c ON ti.client_id = c.id
            WHERE te.end_time IS NOT NULL
              AND te.duration > 0
              AND c.rate > 0
              AND te.end_time >= '${startDateStr}'
              AND te.end_time <= '${endDateStr}'
        `;

        let earningsFilter = '';
        if (taskInstanceIds && taskInstanceIds.length > 0) {
            const idsStr = taskInstanceIds.join(',');
            earningsFilter = ` AND ti.id IN (${idsStr})`;
        }

        const earningsResults = await this.query(earningsSql + earningsFilter + ' GROUP BY c.currency');
        const earningsByCurrency = new Map();
        earningsResults.forEach(row => {
            if (row.currency && row.earnings) {
                earningsByCurrency.set(row.currency, row.earnings);
            }
        });

        return {
            totalTime,
            activeProjects: row.active_projects || 0,
            trackedTasks: row.tracked_tasks || 0,
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
