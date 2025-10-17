import { BaseService } from './BaseService.js';
import { CoreEvents } from '../events/CoreEvents.js';
/**
 * Task Service
 * Manages task templates (just names)
 * Use TaskInstanceService for task+project+client combinations
 */
export class TaskService extends BaseService {
    constructor(core) {
        super(core);
    }
    /**
     * Get all tasks
     */
    async getAll() {
        const sql = `SELECT * FROM Task ORDER BY name ASC`;
        return await this.query(sql);
    }
    /**
     * Get task by ID
     */
    async getById(id) {
        const sql = `SELECT * FROM Task WHERE id = ?`;
        const results = await this.query(sql, [id]);
        if (results.length === 0) {
            throw new Error(`Task not found: ${id}`);
        }
        return results[0];
    }
    /**
     * Get task by name
     */
    async getByName(name) {
        const sql = `SELECT * FROM Task WHERE name = ? LIMIT 1`;
        const results = await this.query(sql, [name]);
        return results.length > 0 ? results[0] : null;
    }
    /**
     * Create a new task (or return existing if name exists)
     */
    async create(input) {
        // Validation - business logic (Core)
        if (!input || !input.name || typeof input.name !== 'string' || input.name.trim() === '') {
            throw new Error('Task name is required');
        }

        // Check if task with this name already exists (UNIQUE constraint)
        const existing = await this.getByName(input.name);
        if (existing) {
            return existing.id;
        }
        const sql = `
            INSERT INTO Task (name, created_at, updated_at)
            VALUES (?, datetime('now'), datetime('now'))
        `;
        const taskId = await this.execute(sql, [input.name]);
        this.events.emit(CoreEvents.TASK_CREATED, { id: taskId, ...input });
        return taskId;
    }
    /**
     * Update a task
     */
    async update(id, input) {
        // Check if task exists
        await this.getById(id);
        if (input.name === undefined)
            return;
        const sql = `UPDATE Task SET name = ?, updated_at = datetime('now') WHERE id = ?`;
        await this.execute(sql, [input.name, id]);
        this.events.emit(CoreEvents.TASK_UPDATED, { id, ...input });
    }
    /**
     * Delete a task (will cascade delete all TaskInstances and TimeEntries)
     */
    async delete(id) {
        const sql = `DELETE FROM Task WHERE id = ?`;
        await this.execute(sql, [id]);
        this.events.emit(CoreEvents.TASK_DELETED, { id });
    }
    /**
     * Search tasks by name
     */
    async search(query) {
        const sql = `SELECT * FROM Task WHERE name LIKE ? ORDER BY name ASC`;
        return await this.query(sql, [`%${query}%`]);
    }
    /**
     * Get tasks count
     */
    async getCount() {
        const sql = `SELECT COUNT(*) as count FROM Task`;
        const result = await this.query(sql);
        return result[0]?.count || 0;
    }
    /**
     * Find or create task by name
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
     * Get next free auto-index for "Task - X" naming
     * If "Task - 2" is deleted, next task will be "Task - 2"
     * Otherwise finds next sequential number
     */
    async getNextAutoIndex() {
        const tasks = await this.getAll();
        // Find all existing "Task - X" indices
        const usedIndices = new Set();
        tasks.forEach(task => {
            const match = task.name.match(/^Task - (\d+)$/);
            if (match) {
                usedIndices.add(parseInt(match[1]));
            }
        });
        // Find first free index starting from 1
        let nextIndex = 1;
        while (usedIndices.has(nextIndex)) {
            nextIndex++;
        }
        return nextIndex;
    }
    /**
     * Create auto-indexed task: "Task - 1", "Task - 2", etc.
     * Automatically finds first free index
     */
    async createAutoIndexed() {
        const nextIndex = await this.getNextAutoIndex();
        const taskName = `Task - ${nextIndex}`;
        const id = await this.create({ name: taskName });
        return await this.getById(id);
    }
    /**
     * Clean up orphaned tasks (tasks with no instances)
     */
    async cleanupOrphanedTasks() {
        const sql = `
            DELETE FROM Task
            WHERE id NOT IN (
                SELECT DISTINCT task_id FROM TaskInstance
            )
        `;
        await this.execute(sql);
    }
}
