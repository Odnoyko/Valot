/**
 * Task Instance Service - Simplified
 * Direct SQL, minimal object creation
 */
import { BaseService } from './BaseService.js';
import { TimeUtils } from '../utils/TimeUtils.js';

export class TaskInstanceService extends BaseService {
    constructor(coreAPI) {
        super(coreAPI);
    }

    /**
     * Find or create instance (direct SQL)
     */
    async findOrCreate(taskId, projectId = null, clientId = null) {
        const existing = await this.findByCombo(taskId, projectId, clientId);
        if (existing) {
            await this.updateLastUsed(existing.id);
            return existing;
        }
        return await this.create({
            task_id: taskId,
            project_id: projectId,
            client_id: clientId,
        });
    }

    /**
     * Find by combination (direct SQL)
     */
    async findByCombo(taskId, projectId = null, clientId = null) {
        const sql = `
            SELECT * FROM TaskInstance
            WHERE task_id = ?
              AND (project_id IS ? OR project_id = ?)
              AND (client_id IS ? OR client_id = ?)
            LIMIT 1
        `;
        const rows = await this.query(sql, [
            taskId,
            projectId === null ? null : undefined,
            projectId,
            clientId === null ? null : undefined,
            clientId
        ]);
        return rows.length > 0 ? this.mapToModel(rows[0]) : null;
    }

    /**
     * Get view with related data (direct SQL)
     */
    async getView(id) {
        const sql = `
            SELECT ti.*, t.name as task_name, p.name as project_name, p.color as project_color,
                   c.name as client_name, c.rate as client_rate, c.currency as client_currency,
                   COUNT(te.id) as entry_count
            FROM TaskInstance ti
            JOIN Task t ON t.id = ti.task_id
            LEFT JOIN Project p ON p.id = ti.project_id
            LEFT JOIN Client c ON c.id = ti.client_id
            LEFT JOIN TimeEntry te ON te.task_instance_id = ti.id
            WHERE ti.id = ?
            GROUP BY ti.id
        `;
        const rows = await this.query(sql, [id]);
        return rows.length > 0 ? this.mapToView(rows[0]) : null;
    }

    /**
     * Get all views (direct SQL)
     */
    async getAllViews(options) {
        const where = [];
        const params = [];

        if (options?.taskId) {
            where.push('ti.task_id = ?');
            params.push(options.taskId);
        }
        if (options?.projectId) {
            where.push('ti.project_id = ?');
            params.push(options.projectId);
        }
        if (options?.clientId) {
            where.push('ti.client_id = ?');
            params.push(options.clientId);
        }
        if (options?.favoritesOnly) {
            where.push('ti.is_favorite = 1');
        }

        const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
        let orderBy = 'ti.last_used_at DESC';
        if (options?.sortBy === 'total_time') orderBy = 'ti.total_time DESC';
        if (options?.sortBy === 'name') orderBy = 't.name ASC';

        const sql = `
            SELECT ti.*, t.name as task_name, p.name as project_name, p.color as project_color,
                   c.name as client_name, c.rate as client_rate, c.currency as client_currency,
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
        const rows = await this.query(sql, params);
        return rows.map(row => this.mapToView(row));
    }

    /**
     * Create instance (direct SQL)
     */
    async create(data) {
        const now = TimeUtils.getCurrentTimestamp();
        const instanceId = await this.execute(
            `INSERT INTO TaskInstance (task_id, project_id, client_id, last_used_at, created_at)
             VALUES (?, ?, ?, ?, ?)`,
            [data.task_id, data.project_id || null, data.client_id || null, now, now]
        );
        return await this.getById(instanceId);
    }

    /**
     * Restore instance (direct SQL with validation)
     */
    async restore(data) {
        // Validate task exists
        try {
            await this.core.services.tasks.getById(data.task_id);
        } catch (e) {
            throw new Error(`Task ${data.task_id} does not exist`);
        }

        // Validate project if provided
        let validProjectId = data.project_id || null;
        if (validProjectId !== null) {
            try {
                const project = await this.core.services.projects.getById(validProjectId);
                if (!project) validProjectId = null;
            } catch (e) {
                validProjectId = null;
            }
        }

        // Validate client if provided
        let validClientId = data.client_id || null;
        if (validClientId !== null) {
            try {
                const client = await this.core.services.clients.getById(validClientId);
                if (!client) validClientId = null;
            } catch (e) {
                validClientId = null;
            }
        }

        const instanceId = await this.execute(
            `INSERT INTO TaskInstance (task_id, project_id, client_id, total_time, last_used_at, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
            [data.task_id, validProjectId, validClientId, data.total_time || 0, data.last_used_at]
        );
        return await this.getById(instanceId);
    }

    /**
     * Update instance (direct SQL)
     */
    async update(id, data) {
        const updates = [];
        const params = [];

        if (data.task_id !== undefined) {
            updates.push('task_id = ?');
            params.push(data.task_id);
        }
        if (data.project_id !== undefined) {
            updates.push('project_id = ?');
            params.push(data.project_id === null ? null : data.project_id);
        }
        if (data.client_id !== undefined) {
            updates.push('client_id = ?');
            params.push(data.client_id === null ? null : data.client_id);
        }
        if (data.total_time !== undefined) {
            updates.push('total_time = ?');
            params.push(data.total_time);
        }
        if (data.last_used_at !== undefined) {
            updates.push('last_used_at = ?');
            params.push(data.last_used_at);
        }
        if (data.is_favorite !== undefined) {
            updates.push('is_favorite = ?');
            params.push(data.is_favorite ? 1 : 0);
        }

        if (updates.length === 0) return await this.getById(id);

        updates.push("updated_at = datetime('now')");
        params.push(id);

        await this.execute(`UPDATE TaskInstance SET ${updates.join(', ')} WHERE id = ?`, params);
        return await this.getById(id);
    }

    /**
     * Update with tracking sync (direct SQL)
     */
    async updateWithTrackingSync(id, data, newTaskName = null) {
        const currentInstance = await this.getById(id);
        if (!currentInstance) {
            throw new Error(`TaskInstance ${id} not found`);
        }

        const trackingState = this.state.getTrackingState();
        const isTracked = trackingState.isTracking && trackingState.currentTaskInstanceId === id;

        if (isTracked) {
            if (data.task_id !== undefined && newTaskName) {
                await this.core.services.tracking.updateCurrentTaskName(newTaskName);
            } else if (data.task_id !== undefined && data.task_id !== currentInstance.task_id) {
                const task = await this.core.services.tasks.getById(data.task_id);
                if (task) {
                    await this.core.services.tracking.updateCurrentTaskName(task.name);
                }
            }

            const projectChanged = data.project_id !== undefined && data.project_id !== currentInstance.project_id;
            const clientChanged = data.client_id !== undefined && data.client_id !== currentInstance.client_id;

            if (projectChanged || clientChanged) {
                const newProjectId = data.project_id !== undefined ? data.project_id : trackingState.currentProjectId;
                const newClientId = data.client_id !== undefined ? data.client_id : trackingState.currentClientId;
                await this.core.services.tracking.updateCurrentProjectClient(newProjectId, newClientId);
            }

            const nonTrackingFields = {};
            if (data.last_used_at !== undefined) nonTrackingFields.last_used_at = data.last_used_at;
            if (data.is_favorite !== undefined) nonTrackingFields.is_favorite = data.is_favorite;
            if (data.total_time !== undefined) nonTrackingFields.total_time = data.total_time;

            if (Object.keys(nonTrackingFields).length > 0) {
                await this.update(id, nonTrackingFields);
            }

            return await this.getById(id);
        } else {
            return await this.update(id, data);
        }
    }

    /**
     * Update last used (direct SQL)
     */
    async updateLastUsed(id) {
        const now = TimeUtils.getCurrentTimestamp();
        await this.execute(
            `UPDATE TaskInstance SET last_used_at = ?, updated_at = datetime('now') WHERE id = ?`,
            [now, id]
        );
    }

    /**
     * Update total time (direct SQL)
     */
    async updateTotalTime(id) {
        const rows = await this.query(
            `SELECT COALESCE(SUM(duration), 0) as total_time
             FROM TimeEntry
             WHERE task_instance_id = ? AND end_time IS NOT NULL`,
            [id]
        );
        const totalTime = rows[0]?.total_time || 0;
        await this.execute(
            `UPDATE TaskInstance SET total_time = ?, updated_at = datetime('now') WHERE id = ?`,
            [totalTime, id]
        );
    }

    /**
     * Toggle favorite (direct SQL)
     */
    async toggleFavorite(id) {
        const instance = await this.getById(id);
        return await this.update(id, { is_favorite: !instance.is_favorite });
    }

    /**
     * Delete instance (direct SQL)
     */
    async delete(id) {
        await this.execute(`DELETE FROM TaskInstance WHERE id = ?`, [id]);
    }

    /**
     * Get by ID (direct SQL)
     */
    async getById(id) {
        const rows = await this.query(`SELECT * FROM TaskInstance WHERE id = ? LIMIT 1`, [id]);
        if (rows.length === 0) {
            throw new Error(`TaskInstance not found: ${id}`);
        }
        return this.mapToModel(rows[0]);
    }

    /**
     * Get all instances (direct SQL)
     */
    async getAll() {
        const rows = await this.query(`SELECT * FROM TaskInstance ORDER BY last_used_at DESC`);
        return rows.map(row => this.mapToModel(row));
    }

    /**
     * Map to model
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
     * Map to view
     * OPTIMIZED: Direct property assignment, no spread operator to avoid object duplication
     */
    mapToView(row) {
        // Get base model (creates one object)
        const model = this.mapToModel(row);
        // Add view properties directly to same object (no spread, no new object)
        model.task_name = row.task_name;
        model.project_name = row.project_name || null;
        model.project_color = row.project_color || null;
        model.client_name = row.client_name || null;
        model.client_rate = row.client_rate || 0;
        model.client_currency = row.client_currency || 'EUR';
        model.entry_count = row.entry_count || 0;
        return model; // Return same object, not a copy
    }
}
