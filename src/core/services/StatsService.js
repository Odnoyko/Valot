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

        // Get all task instances with last_used_at in this week
        const allTaskInstances = await this.core.services.taskInstances.getAll();

        let totalTime = 0;
        let taskCount = 0;

        allTaskInstances.forEach(task => {
            if (!task.last_used_at) return;

            // Parse last_used_at (try with Z suffix if not present)
            let dateString = task.last_used_at;
            if (!dateString.endsWith('Z') && !dateString.includes('+')) {
                dateString = dateString + 'Z';
            }

            const taskDate = GLib.DateTime.new_from_iso8601(dateString, null);
            if (!taskDate) {
                return;
            }

            const taskTimestamp = taskDate.to_unix();
            if (taskTimestamp >= startTimestamp && taskTimestamp <= endTimestamp) {
                totalTime += task.total_time || 0;
                taskCount++;
            }
        });

        return { totalTime, taskCount };
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
}
