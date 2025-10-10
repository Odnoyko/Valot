import { BaseService } from './BaseService';
import { CoreAPI } from '../api/CoreAPI';
import { Task, TaskCreateInput, TaskUpdateInput } from '../models/Task';
import { CoreEvents } from '../events/CoreEvents';

/**
 * Task Service
 * Manages task templates (just names)
 * Use TaskInstanceService for task+project+client combinations
 */
export class TaskService extends BaseService {
    constructor(core: CoreAPI) {
        super(core);
    }

    /**
     * Get all tasks
     */
    async getAll(): Promise<Task[]> {
        const sql = `SELECT * FROM Task ORDER BY name ASC`;
        return await this.query<Task>(sql);
    }

    /**
     * Get task by ID
     */
    async getById(id: number): Promise<Task> {
        const sql = `SELECT * FROM Task WHERE id = ?`;
        const results = await this.query<Task>(sql, [id]);

        if (results.length === 0) {
            throw new Error(`Task not found: ${id}`);
        }

        return results[0];
    }

    /**
     * Get task by name
     */
    async getByName(name: string): Promise<Task | null> {
        const sql = `SELECT * FROM Task WHERE name = ? LIMIT 1`;
        const results = await this.query<Task>(sql, [name]);
        return results.length > 0 ? results[0] : null;
    }

    /**
     * Create a new task (or return existing if name exists)
     */
    async create(input: TaskCreateInput): Promise<number> {
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
    async update(id: number, input: TaskUpdateInput): Promise<void> {
        // Check if task exists
        await this.getById(id);

        if (input.name === undefined) return;

        const sql = `UPDATE Task SET name = ?, updated_at = datetime('now') WHERE id = ?`;

        await this.execute(sql, [input.name, id]);

        this.events.emit(CoreEvents.TASK_UPDATED, { id, ...input });
    }

    /**
     * Delete a task (will cascade delete all TaskInstances and TimeEntries)
     */
    async delete(id: number): Promise<void> {
        const sql = `DELETE FROM Task WHERE id = ?`;
        await this.execute(sql, [id]);

        this.events.emit(CoreEvents.TASK_DELETED, { id });
    }

    /**
     * Search tasks by name
     */
    async search(query: string): Promise<Task[]> {
        const sql = `SELECT * FROM Task WHERE name LIKE ? ORDER BY name ASC`;
        return await this.query<Task>(sql, [`%${query}%`]);
    }

    /**
     * Get tasks count
     */
    async getCount(): Promise<number> {
        const sql = `SELECT COUNT(*) as count FROM Task`;
        const result = await this.query<{ count: number }>(sql);
        return result[0]?.count || 0;
    }

    /**
     * Find or create task by name
     */
    async findOrCreate(name: string): Promise<Task> {
        const existing = await this.getByName(name);
        if (existing) {
            return existing;
        }

        const id = await this.create({ name });
        return await this.getById(id);
    }
}
