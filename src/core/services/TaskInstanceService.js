/**
 * Task Instance Service
 * Manages unique combinations of Task + Project + Client
 */
import { BaseService } from './BaseService.js';
export class TaskInstanceService extends BaseService {
    constructor(coreAPI) {
        super(coreAPI);
    }
    /**
     * Find or create task instance for given combination
     * This ensures UNIQUE constraint: one combination = one instance
     */
    async findOrCreate(taskId, projectId = null, clientId = null) {
        // Try to find existing instance
        const existing = await this.findByCombo(taskId, projectId, clientId);
        if (existing) {
            // Update last_used_at
            await this.updateLastUsed(existing.id);
            return existing;
        }
        // Create new instance
        return await this.create({
            task_id: taskId,
            project_id: projectId,
            client_id: clientId,
        });
    }
    /**
     * Find instance by exact combination
     */
    async findByCombo(taskId, projectId = null, clientId = null) {
        const sql = `
            SELECT * FROM TaskInstance
            WHERE task_id = ${taskId}
                AND (project_id IS ${projectId === null ? 'NULL' : projectId})
                AND (client_id IS ${clientId === null ? 'NULL' : clientId})
            LIMIT 1
        `;
        const results = await this.query(sql);
        return results.length > 0 ? this.mapToModel(results[0]) : null;
    }
    /**
     * Get instance with related data for UI
     */
    async getView(id) {
        const sql = `
            SELECT
                ti.*,
                t.name as task_name,
                p.name as project_name,
                p.color as project_color,
                c.name as client_name,
                c.rate as client_rate,
                c.currency as client_currency,
                COUNT(te.id) as entry_count
            FROM TaskInstance ti
            JOIN Task t ON t.id = ti.task_id
            LEFT JOIN Project p ON p.id = ti.project_id
            LEFT JOIN Client c ON c.id = ti.client_id
            LEFT JOIN TimeEntry te ON te.task_instance_id = ti.id
            WHERE ti.id = ${id}
            GROUP BY ti.id
        `;
        const results = await this.query(sql);
        return results.length > 0 ? this.mapToView(results[0]) : null;
    }
    /**
     * Get all instances with related data for UI
     */
    async getAllViews(options) {
        let where = [];
        if (options?.taskId)
            where.push(`ti.task_id = ${options.taskId}`);
        if (options?.projectId)
            where.push(`ti.project_id = ${options.projectId}`);
        if (options?.clientId)
            where.push(`ti.client_id = ${options.clientId}`);
        if (options?.favoritesOnly)
            where.push(`ti.is_favorite = 1`);
        const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
        let orderBy = 'ti.last_used_at DESC';
        if (options?.sortBy === 'total_time')
            orderBy = 'ti.total_time DESC';
        if (options?.sortBy === 'name')
            orderBy = 't.name ASC';
        const sql = `
            SELECT
                ti.*,
                t.name as task_name,
                p.name as project_name,
                p.color as project_color,
                c.name as client_name,
                c.rate as client_rate,
                c.currency as client_currency,
                COUNT(te.id) as entry_count
            FROM TaskInstance ti
            JOIN Task t ON t.id = ti.task_id
            LEFT JOIN Project p ON p.id = ti.project_id
            LEFT JOIN Client c ON c.id = ti.client_id
            LEFT JOIN TimeEntry te ON te.task_instance_id = ti.id
            ${whereClause}
            GROUP BY ti.id
            ORDER BY ${orderBy}
        `;
        const results = await this.query(sql);
        return results.map((row) => this.mapToView(row));
    }
    /**
     * Create new task instance
     */
    async create(data) {
        const sql = `
            INSERT INTO TaskInstance (task_id, project_id, client_id, last_used_at)
            VALUES (${data.task_id}, ${data.project_id || 'NULL'}, ${data.client_id || 'NULL'}, datetime('now'))
        `;
        const result = await this.execute(sql);
        return await this.getById(result);
    }
    /**
     * Restore task instance with preserved timestamps (for undo)
     */
    async restore(data) {
        const sql = `
            INSERT INTO TaskInstance (task_id, project_id, client_id, total_time, last_used_at, created_at, updated_at)
            VALUES (
                ${data.task_id},
                ${data.project_id || 'NULL'},
                ${data.client_id || 'NULL'},
                ${data.total_time || 0},
                '${data.last_used_at}',
                datetime('now'),
                datetime('now')
            )
        `;
        const result = await this.execute(sql);
        return await this.getById(result);
    }
    /**
     * Update instance
     */
    async update(id, data) {
        const updates = [];
        if (data.task_id !== undefined)
            updates.push(`task_id = ${data.task_id}`);
        if (data.project_id !== undefined)
            updates.push(`project_id = ${data.project_id}`);
        if (data.client_id !== undefined)
            updates.push(`client_id = ${data.client_id}`);
        if (data.total_time !== undefined)
            updates.push(`total_time = ${data.total_time}`);
        if (data.last_used_at !== undefined)
            updates.push(`last_used_at = '${data.last_used_at}'`);
        if (data.is_favorite !== undefined)
            updates.push(`is_favorite = ${data.is_favorite ? 1 : 0}`);
        updates.push(`updated_at = datetime('now')`);
        const sql = `UPDATE TaskInstance SET ${updates.join(', ')} WHERE id = ${id}`;
        await this.execute(sql);
        return await this.getById(id);
    }
    /**
     * Update last_used_at timestamp
     */
    async updateLastUsed(id) {
        const sql = `UPDATE TaskInstance SET last_used_at = datetime('now') WHERE id = ${id}`;
        await this.execute(sql);
    }
    /**
     * Update total_time cache
     */
    async updateTotalTime(id) {
        const sql = `
            UPDATE TaskInstance
            SET total_time = (
                SELECT COALESCE(SUM(duration), 0)
                FROM TimeEntry
                WHERE task_instance_id = ${id}
            )
            WHERE id = ${id}
        `;
        await this.execute(sql);
    }
    /**
     * Toggle favorite status
     */
    async toggleFavorite(id) {
        const instance = await this.getById(id);
        return await this.update(id, { is_favorite: !instance.is_favorite });
    }
    /**
     * Delete instance (will cascade delete all TimeEntries)
     */
    async delete(id) {
        const sql = `DELETE FROM TaskInstance WHERE id = ${id}`;
        await this.execute(sql);
    }
    /**
     * Get instance by ID
     */
    async getById(id) {
        const sql = `SELECT * FROM TaskInstance WHERE id = ${id} LIMIT 1`;
        const results = await this.query(sql);
        if (results.length === 0) {
            throw new Error(`TaskInstance not found: ${id}`);
        }
        return this.mapToModel(results[0]);
    }
    /**
     * Get all instances
     */
    async getAll() {
        const sql = `SELECT * FROM TaskInstance ORDER BY last_used_at DESC`;
        const results = await this.query(sql);
        return results.map((row) => this.mapToModel(row));
    }
    /**
     * Map database row to TaskInstance model
     */
    mapToModel(row) {
        return {
            id: row.id,
            task_id: row.task_id,
            project_id: row.project_id,
            client_id: row.client_id,
            total_time: row.total_time || 0,
            last_used_at: row.last_used_at,
            is_favorite: Boolean(row.is_favorite),
            created_at: row.created_at,
            updated_at: row.updated_at,
        };
    }
    /**
     * Map database row to TaskInstanceView
     */
    mapToView(row) {
        return {
            ...this.mapToModel(row),
            task_name: row.task_name,
            project_name: row.project_name || null,
            project_color: row.project_color || null,
            client_name: row.client_name || null,
            client_rate: row.client_rate || 0,
            client_currency: row.client_currency || 'EUR',
            entry_count: row.entry_count || 0,
        };
    }
}
