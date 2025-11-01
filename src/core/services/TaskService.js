import { BaseService } from './BaseService.js';
import { CoreEvents } from '../events/CoreEvents.js';
import { Logger } from '../utils/Logger.js';
/**
 * Task Service
 * Manages task templates (just names)
 * Uses cache-first approach: reads from cache, writes to cache + DB
 */
export class TaskService extends BaseService {
    constructor(core) {
        super(core);
    }
    
    /**
     * Get cache service
     */
    get cache() {
        return this.core.services?.cache;
    }
    
    /**
     * Get all tasks (from cache)
     */
    async getAll() {
        if (this.cache) {
            const tasks = this.cache.getAllTasks();
            if (tasks.length > 0) {
                return tasks; // Return cached tasks
            }
        }
        
        // Fallback to DB if cache not available or empty
        const sql = `SELECT * FROM Task ORDER BY name ASC`;
        const results = await this.query(sql);
        
        // Populate cache if cache exists
        if (this.cache && results.length > 0) {
            results.forEach(task => {
                this.cache.setTask(task);
            });
        }
        
        return results;
    }
    
    /**
     * Get task by ID (from cache, fallback to DB)
     */
    async getById(id) {
        if (this.cache) {
            const task = this.cache.getTask(id);
            if (task) {
                return task; // Return from cache
            }
        }
        
        // Cache miss - fetch from DB
        const sql = `SELECT * FROM Task WHERE id = ?`;
        const results = await this.query(sql, [id]);
        if (results.length === 0) {
            throw new Error(`Task not found: ${id}`);
        }
        
        const task = results[0];
        
        // Update cache
        if (this.cache) {
            this.cache.setTask(task);
        }
        
        return task;
    }
    
    /**
     * Get task by name (from cache, fallback to DB)
     */
    async getByName(name) {
        if (this.cache) {
            const task = this.cache.getTaskByName(name);
            if (task) {
                return task; // Return from cache
            }
        }
        
        // Cache miss - fetch from DB
        const sql = `SELECT * FROM Task WHERE name = ? LIMIT 1`;
        const results = await this.query(sql, [name]);
        if (results.length > 0) {
            const task = results[0];
            // Update cache
            if (this.cache) {
                this.cache.setTask(task);
            }
            return task;
        }
        
        return null;
    }
    /**
     * Create a new task (or return existing if name exists)
     * Writes to cache immediately, then to DB (write-back)
     */
    async create(input) {
        // Validation - business logic (Core)
        if (!input || !input.name || typeof input.name !== 'string' || input.name.trim() === '') {
            throw new Error('Task name is required');
        }

        // Check cache first
        let existing = null;
        if (this.cache) {
            existing = this.cache.getTaskByName(input.name);
        }
        
        // If not in cache, check DB
        if (!existing) {
            existing = await this.getByName(input.name);
        }
        
        if (existing) {
            return existing.id;
        }
        
        // Create new task - write to DB immediately for ID generation
        const sql = `
            INSERT INTO Task (name, created_at, updated_at)
            VALUES (?, datetime('now'), datetime('now'))
        `;
        const taskId = await this.execute(sql, [input.name]);
        
        // Get created task from DB
        const createdTask = await this.query(`SELECT * FROM Task WHERE id = ?`, [taskId]);
        const task = createdTask[0];
        
        // Update cache
        if (this.cache) {
            this.cache.setTask(task);
        }
        
        this.events.emit(CoreEvents.TASK_CREATED, { id: taskId, ...input });
        return taskId;
    }
    /**
     * Update a task
     * Updates cache immediately, then writes to DB (write-back)
     */
    async update(id, input) {
        // Get existing task (from cache or DB)
        const existing = await this.getById(id);
        if (input.name === undefined)
            return;
        
        // Update in cache first
        if (this.cache) {
            const updatedTask = { ...existing, name: input.name };
            this.cache.setTask(updatedTask);
        }
        
        // Write to DB (will be synced by cache, but immediate for consistency)
        const sql = `UPDATE Task SET name = ?, updated_at = datetime('now') WHERE id = ?`;
        await this.execute(sql, [input.name, id]);
        
        this.events.emit(CoreEvents.TASK_UPDATED, { id, ...input });
    }
    
    /**
     * Delete a task (will cascade delete all TaskInstances and TimeEntries)
     * Removes from cache and DB
     */
    async delete(id) {
        // Remove from cache
        if (this.cache) {
            this.cache.deleteTask(id);
        }
        
        // Delete from DB
        const sql = `DELETE FROM Task WHERE id = ?`;
        await this.execute(sql, [id]);
        
        this.events.emit(CoreEvents.TASK_DELETED, { id });
    }
    /**
     * Search tasks by name (from cache)
     */
    async search(query) {
        if (this.cache) {
            const allTasks = this.cache.getAllTasks();
            const lowerQuery = query.toLowerCase();
            const filtered = allTasks.filter(task => 
                task.name.toLowerCase().includes(lowerQuery)
            );
            return filtered.sort((a, b) => a.name.localeCompare(b.name));
        }
        
        // Fallback to DB
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
     * Scoped to specific Project+Client combination
     * If "Task - 2" is deleted, next task will be "Task - 2"
     * Otherwise finds next sequential number
     */
    async getNextAutoIndex(projectId = null, clientId = null) {
        // Get all task instances with this project+client combination
        const sql = `
            SELECT t.name
            FROM Task t
            JOIN TaskInstance ti ON ti.task_id = t.id
            WHERE ti.project_id ${projectId === null ? 'IS NULL' : `= ${projectId}`}
              AND ti.client_id ${clientId === null ? 'IS NULL' : `= ${clientId}`}
              AND t.name LIKE 'Task - %'
        `;
        const results = await this.query(sql);

        // Find all existing "Task - X" indices for this combination
        const usedIndices = new Set();
        results.forEach(row => {
            const match = row.name.match(/^Task - (\d+)$/);
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
     * Automatically finds first free index scoped to Project+Client combination
     */
    async createAutoIndexed(projectId = null, clientId = null) {
        const nextIndex = await this.getNextAutoIndex(projectId, clientId);
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
