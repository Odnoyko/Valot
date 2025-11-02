/**
 * Task Service - Simplified
 * Direct SQL, minimal object creation
 */
import { BaseService } from './BaseService.js';
import { CoreEvents } from '../events/CoreEvents.js';

export class TaskService extends BaseService {
    constructor(core) {
        super(core);
    }

    /**
     * Get all tasks (direct SQL)
     */
    async getAll() {
        return await this.query(`SELECT * FROM Task ORDER BY name ASC`);
    }

    /**
     * Get task by ID (direct SQL)
     */
    async getById(id) {
        const rows = await this.query(`SELECT * FROM Task WHERE id = ?`, [id]);
        if (rows.length === 0) {
            throw new Error(`Task not found: ${id}`);
        }
        return rows[0];
    }

    /**
     * Get task by name (direct SQL)
     */
    async getByName(name) {
        const rows = await this.query(`SELECT * FROM Task WHERE name = ? LIMIT 1`, [name]);
        return rows.length > 0 ? rows[0] : null;
    }

    /**
     * Create task (direct SQL)
     */
    async create(input) {
        if (!input || !input.name || typeof input.name !== 'string' || input.name.trim() === '') {
            throw new Error('Task name is required');
        }

        // Check if exists
        const existing = await this.getByName(input.name);
        if (existing) {
            return existing.id;
        }

        // Create (direct SQL)
        const taskId = await this.execute(
            `INSERT INTO Task (name, created_at, updated_at) VALUES (?, datetime('now'), datetime('now'))`,
            [input.name]
        );

        this.events.emit(CoreEvents.TASK_CREATED, { id: taskId, ...input });
        return taskId;
    }

    /**
     * Update task (direct SQL)
     */
    async update(id, input) {
        if (input.name === undefined) return;

        await this.execute(
            `UPDATE Task SET name = ?, updated_at = datetime('now') WHERE id = ?`,
            [input.name, id]
        );

        this.events.emit(CoreEvents.TASK_UPDATED, { id, ...input });
    }

    /**
     * Delete task (direct SQL)
     */
    async delete(id) {
        await this.execute(`DELETE FROM Task WHERE id = ?`, [id]);
        this.events.emit(CoreEvents.TASK_DELETED, { id });
    }

    /**
     * Search tasks (direct SQL)
     */
    async search(query) {
        return await this.query(`SELECT * FROM Task WHERE name LIKE ? ORDER BY name ASC`, [`%${query}%`]);
    }

    /**
     * Get tasks count (direct SQL)
     */
    async getCount() {
        const rows = await this.query(`SELECT COUNT(*) as count FROM Task`);
        return rows[0]?.count || 0;
    }

    /**
     * Find or create task (direct SQL)
     */
    async findOrCreate(name) {
        const existing = await this.getByName(name);
        if (existing) {
            return existing;
        }
        const id = await this.create({ name });
        return await this.getById(id);
    }

    /**
     * Get next auto-index (direct SQL)
     */
    async getNextAutoIndex(projectId = null, clientId = null) {
        const sql = `
            SELECT t.name
            FROM Task t
            JOIN TaskInstance ti ON ti.task_id = t.id
            WHERE ti.project_id ${projectId === null ? 'IS NULL' : '= ?'}
              AND ti.client_id ${clientId === null ? 'IS NULL' : '= ?'}
              AND t.name LIKE 'Task - %'
        `;
        const params = [];
        if (projectId !== null) params.push(projectId);
        if (clientId !== null) params.push(clientId);
        const results = await this.query(sql, params);

        const usedIndices = new Set();
        results.forEach(row => {
            const match = row.name.match(/^Task - (\d+)$/);
            if (match) {
                usedIndices.add(parseInt(match[1]));
            }
        });

        let nextIndex = 1;
        while (usedIndices.has(nextIndex)) {
            nextIndex++;
        }
        return nextIndex;
    }

    /**
     * Create auto-indexed task (direct SQL)
     */
    async createAutoIndexed(projectId = null, clientId = null) {
        const nextIndex = await this.getNextAutoIndex(projectId, clientId);
        const taskName = `Task - ${nextIndex}`;
        const id = await this.create({ name: taskName });
        return await this.getById(id);
    }

    /**
     * Cleanup orphaned tasks (direct SQL)
     */
    async cleanupOrphanedTasks() {
        await this.execute(`
            DELETE FROM Task
            WHERE id NOT IN (SELECT DISTINCT task_id FROM TaskInstance)
        `);
    }
}
