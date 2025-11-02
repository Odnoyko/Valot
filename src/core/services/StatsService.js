/**
 * Statistics Service - Simplified
 * Direct SQL aggregation, minimal object creation
 */
import { BaseService } from './BaseService.js';

export class StatsService extends BaseService {
    constructor(coreAPI) {
        super(coreAPI);
    }

    /**
     * Get This Week statistics (direct SQL)
     */
    async getThisWeekStats() {
        const GLib = imports.gi.GLib;
        const now = GLib.DateTime.new_now_local();

        const dayOfWeek = now.get_day_of_week();
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

        const startStr = startDate.format('%Y-%m-%d %H:%M:%S');
        const endStr = endDate.format('%Y-%m-%d %H:%M:%S');

        // SQL aggregation - no object creation
        const rows = await this.query(`
            SELECT 
                COALESCE(SUM(duration), 0) as total_time,
                COUNT(DISTINCT task_instance_id) as task_count
            FROM TimeEntry
            WHERE end_time IS NOT NULL
              AND duration > 0
              AND end_time >= ?
              AND end_time <= ?
        `, [startStr, endStr]);

        return {
            totalTime: rows[0]?.total_time || 0,
            taskCount: rows[0]?.task_count || 0
        };
    }

    /**
     * Get top projects with time (direct SQL)
     */
    async getProjectsWithTime(limit = 5) {
        const rows = await this.query(`
            SELECT 
                p.id,
                p.name,
                p.icon,
                p.color,
                COALESCE(SUM(te.duration), 0) as total_time
            FROM Project p
            LEFT JOIN TaskInstance ti ON ti.project_id = p.id
            LEFT JOIN TimeEntry te ON te.task_instance_id = ti.id AND te.end_time IS NOT NULL
            GROUP BY p.id
            HAVING total_time > 0
            ORDER BY total_time DESC
            LIMIT ?
        `, [limit]);

        return rows.map(row => ({
            id: row.id,
            name: row.name,
            icon: row.icon,
            color: row.color,
            totalTime: row.total_time || 0,
        }));
    }

    /**
     * Get all projects with time (direct SQL)
     */
    async getAllProjectsWithTime() {
        const rows = await this.query(`
            SELECT 
                p.*,
                COALESCE(SUM(te.duration), 0) as total_time
            FROM Project p
            LEFT JOIN TaskInstance ti ON ti.project_id = p.id
            LEFT JOIN TimeEntry te ON te.task_instance_id = ti.id AND te.end_time IS NOT NULL
            GROUP BY p.id
        `);

        return rows.map(row => ({
            ...row,
            total_time: row.total_time || 0,
        }));
    }

    /**
     * Get Today statistics (direct SQL)
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

        const startStr = startDate.format('%Y-%m-%d %H:%M:%S');
        const endStr = endDate.format('%Y-%m-%d %H:%M:%S');

        const rows = await this.query(`
            SELECT 
                COALESCE(SUM(duration), 0) as total_time,
                COUNT(DISTINCT task_instance_id) as task_count
            FROM TimeEntry
            WHERE end_time IS NOT NULL
              AND duration > 0
              AND end_time >= ?
              AND end_time <= ?
        `, [startStr, endStr]);

        return {
            totalTime: rows[0]?.total_time || 0,
            taskCount: rows[0]?.task_count || 0
        };
    }

    /**
     * Get This Month statistics (direct SQL)
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

        const startStr = startDate.format('%Y-%m-%d %H:%M:%S');
        const endStr = endDate.format('%Y-%m-%d %H:%M:%S');

        const rows = await this.query(`
            SELECT 
                COALESCE(SUM(duration), 0) as total_time,
                COUNT(DISTINCT task_instance_id) as task_count
            FROM TimeEntry
            WHERE end_time IS NOT NULL
              AND duration > 0
              AND end_time >= ?
              AND end_time <= ?
        `, [startStr, endStr]);

        return {
            totalTime: rows[0]?.total_time || 0,
            taskCount: rows[0]?.task_count || 0
        };
    }

    /**
     * Get statistics for period (direct SQL aggregation)
     */
    async getStatsForPeriod(dateRange, taskInstanceIds = null) {
        const GLib = imports.gi.GLib;

        const startDateStr = dateRange.startDate.format('%Y-%m-%d %H:%M:%S');
        const endDateStr = dateRange.endDate.format('%Y-%m-%d %H:%M:%S');

        // Build WHERE clause with parameterized query
        let whereClause = `WHERE te.end_time IS NOT NULL AND te.duration > 0
              AND te.end_time >= ? AND te.end_time <= ?`;
        const params = [startDateStr, endDateStr];

        if (taskInstanceIds && taskInstanceIds.length > 0) {
            const placeholders = taskInstanceIds.map(() => '?').join(',');
            whereClause += ` AND ti.id IN (${placeholders})`;
            params.push(...taskInstanceIds);
        }

        // Main stats query
        const statsSql = `
            SELECT 
                COALESCE(SUM(te.duration), 0) as total_time,
                COUNT(DISTINCT ti.id) as tracked_tasks,
                COUNT(DISTINCT ti.project_id) as active_projects
            FROM TimeEntry te
            INNER JOIN TaskInstance ti ON te.task_instance_id = ti.id
            ${whereClause}
        `;

        const statsRows = await this.query(statsSql, params);
        const row = statsRows[0] || {};
        const totalTime = row.total_time || 0;

        // Earnings query
        const earningsSql = `
            SELECT 
                c.currency as currency,
                SUM(te.duration * c.rate / 3600.0) as earnings
            FROM TimeEntry te
            INNER JOIN TaskInstance ti ON te.task_instance_id = ti.id
            INNER JOIN Client c ON ti.client_id = c.id
            ${whereClause}
              AND c.rate > 0
            GROUP BY c.currency
        `;

        const earningsRows = await this.query(earningsSql, params);
        const earningsByCurrency = new Map();
        earningsRows.forEach(row => {
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
     * Get task instance IDs for period (direct SQL)
     */
    async getTaskInstanceIdsForPeriod(dateRange) {
        const GLib = imports.gi.GLib;

        const startStr = dateRange.startDate.format('%Y-%m-%d %H:%M:%S');
        const endStr = dateRange.endDate.format('%Y-%m-%d %H:%M:%S');

        const rows = await this.query(`
            SELECT DISTINCT task_instance_id
            FROM TimeEntry
            WHERE end_time IS NOT NULL
              AND duration > 0
              AND end_time >= ?
              AND end_time <= ?
        `, [startStr, endStr]);

        return rows.map(row => row.task_instance_id);
    }
}
