/**
 * Task Instance Service
 * Manages unique combinations of Task + Project + Client
 * Uses cache-first approach: reads from cache, writes to cache + DB
 */
import { BaseService } from './BaseService.js';
import { Logger } from '../utils/Logger.js';

export class TaskInstanceService extends BaseService {
    constructor(coreAPI) {
        super(coreAPI);
    }
    
    /**
     * Get cache service
     */
    get cache() {
        return this.core.services?.cache;
    }
    
    /**
     * Find or create task instance for given combination
     * This ensures UNIQUE constraint: one combination = one instance
     */
    async findOrCreate(taskId, projectId = null, clientId = null) {
        // Try to find existing instance (from cache first)
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
     * Find instance by exact combination (from cache, fallback to DB)
     */
    async findByCombo(taskId, projectId = null, clientId = null) {
        // Try cache first
        if (this.cache) {
            const instance = this.cache.findTaskInstanceByCombo(taskId, projectId, clientId);
            if (instance) {
                return this.mapToModel(instance);
            }
        }
        
        // Cache miss - fetch from DB
        const sql = `
            SELECT * FROM TaskInstance
            WHERE task_id = ${taskId}
                AND (project_id IS ${projectId === null ? 'NULL' : projectId})
                AND (client_id IS ${clientId === null ? 'NULL' : clientId})
            LIMIT 1
        `;
        const results = await this.query(sql);
        if (results.length > 0) {
            const instance = this.mapToModel(results[0]);
            // Update cache
            if (this.cache) {
                this.cache.setTaskInstance(results[0]);
            }
            return instance;
        }
        
        return null;
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
     * Writes to cache immediately, then to DB (write-back)
     */
    async create(data) {
        const { TimeUtils } = await import('resource:///com/odnoyko/valot/core/utils/TimeUtils.js');
        const now = TimeUtils.getCurrentTimestamp();
        
        // Write to DB immediately for ID generation
        const sql = `
            INSERT INTO TaskInstance (task_id, project_id, client_id, last_used_at)
            VALUES (${data.task_id}, ${data.project_id || 'NULL'}, ${data.client_id || 'NULL'}, '${now}')
        `;
        const result = await this.execute(sql);
        
        // Get created instance from DB
        const createdInstance = await this.query(`SELECT * FROM TaskInstance WHERE id = ?`, [result]);
        const instance = createdInstance[0];
        
        // Update cache
        if (this.cache) {
            this.cache.setTaskInstance(instance);
        }
        
        return this.mapToModel(instance);
    }
    /**
     * Restore task instance with preserved timestamps (for undo)
     * Validates foreign keys before inserting to prevent constraint violations
     */
    async restore(data) {
        // Validate task_id exists
        const task = await this.core.services.tasks.getById(data.task_id);
        if (!task) {
            throw new Error(`Cannot restore TaskInstance: Task ${data.task_id} does not exist`);
        }
        
        // Validate project_id if provided
        let validProjectId = data.project_id || null;
        if (validProjectId !== null && validProjectId !== undefined) {
            try {
                const project = await this.core.services.projects.getById(validProjectId);
                if (!project) {
                    Logger.warn(`[TaskInstance] Project ${validProjectId} does not exist, using NULL`);
                    validProjectId = null;
                }
            } catch (error) {
                Logger.warn(`[TaskInstance] Error validating project ${validProjectId}: ${error.message}, using NULL`);
                validProjectId = null;
            }
        }
        
        // Validate client_id if provided
        let validClientId = data.client_id || null;
        if (validClientId !== null && validClientId !== undefined) {
            try {
                const client = await this.core.services.clients.getById(validClientId);
                if (!client) {
                    Logger.warn(`[TaskInstance] Client ${validClientId} does not exist, using NULL`);
                    validClientId = null;
                }
            } catch (error) {
                Logger.warn(`[TaskInstance] Error validating client ${validClientId}: ${error.message}, using NULL`);
                validClientId = null;
            }
        }
        
        // Log values before insert for debugging
        Logger.debug(`[TaskInstance] Restoring: task_id=${data.task_id}, project_id=${validProjectId}, client_id=${validClientId}`);
        
        // Use parameterized query - GdaDatabaseBridge will handle NULL correctly
        // Convert null to undefined for GDA (SQLite treats undefined as NULL)
        const sql = `
            INSERT INTO TaskInstance (task_id, project_id, client_id, total_time, last_used_at, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))
        `;
        const result = await this.execute(sql, [
            data.task_id,
            validProjectId === null ? undefined : validProjectId,
            validClientId === null ? undefined : validClientId,
            data.total_time || 0,
            data.last_used_at
        ]);
        return await this.getById(result);
    }
    /**
     * Update instance
     * Updates cache immediately, then writes to DB (write-back)
     */
    async update(id, data) {
        // Get existing instance
        const existing = await this.getById(id);
        if (!existing) {
            throw new Error(`TaskInstance ${id} not found`);
        }
        
        // Update in cache first
        if (this.cache) {
            const updatedInstance = { ...existing, ...data };
            // Convert is_favorite boolean to number if needed
            if (data.is_favorite !== undefined) {
                updatedInstance.is_favorite = data.is_favorite ? 1 : 0;
            }
            this.cache.setTaskInstance(updatedInstance);
        }
        
        // Build SQL update
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
        
        // Write to DB
        const sql = `UPDATE TaskInstance SET ${updates.join(', ')} WHERE id = ${id}`;
        await this.execute(sql);
        
        // Return updated instance (from cache or fetch)
        return await this.getById(id);
    }

    /**
     * Update TaskInstance with automatic tracking state synchronization
     * If the instance is currently being tracked, changes are applied globally
     * (TaskInstance + tracking state + events). Otherwise, only TaskInstance is updated.
     * 
     * @param {number} id - TaskInstance ID
     * @param {object} data - Update data (task_id, project_id, client_id, last_used_at, is_favorite, total_time)
     * @param {string} newTaskName - Optional: new task name if task_id changed (for tracking sync)
     * @returns {Promise<object>} Updated TaskInstance
     */
    async updateWithTrackingSync(id, data, newTaskName = null) {
        const currentInstance = await this.getById(id);
        if (!currentInstance) {
            throw new Error(`TaskInstance ${id} not found`);
        }

        // Check if this instance is currently being tracked
        const trackingState = this.core.state.getTrackingState();
        const isTracked = trackingState.isTracking && 
                         trackingState.currentTaskInstanceId === id;

        // If tracked, apply changes globally through tracking service
        if (isTracked) {
            // Update task name if changed
            if (data.task_id !== undefined && newTaskName) {
                await this.core.services.tracking.updateCurrentTaskName(newTaskName);
            } else if (data.task_id !== undefined && data.task_id !== currentInstance.task_id) {
                // Get task name if not provided
                const task = await this.core.services.tasks.getById(data.task_id);
                if (task) {
                    await this.core.services.tracking.updateCurrentTaskName(task.name);
                }
            }

            // Update project/client if changed
            const projectChanged = data.project_id !== undefined && 
                                  data.project_id !== currentInstance.project_id;
            const clientChanged = data.client_id !== undefined && 
                                data.client_id !== currentInstance.client_id;
            
            if (projectChanged || clientChanged) {
                const newProjectId = data.project_id !== undefined ? data.project_id : trackingState.currentProjectId;
                const newClientId = data.client_id !== undefined ? data.client_id : trackingState.currentClientId;
                await this.core.services.tracking.updateCurrentProjectClient(newProjectId, newClientId);
            }

            // Update other fields that don't affect tracking state (last_used_at, is_favorite, total_time)
            const nonTrackingFields = {};
            if (data.last_used_at !== undefined) nonTrackingFields.last_used_at = data.last_used_at;
            if (data.is_favorite !== undefined) nonTrackingFields.is_favorite = data.is_favorite;
            if (data.total_time !== undefined) nonTrackingFields.total_time = data.total_time;

            if (Object.keys(nonTrackingFields).length > 0) {
                await this.update(id, nonTrackingFields);
            }

            return await this.getById(id);
        } else {
            // Not tracked - update normally
            return await this.update(id, data);
        }
    }
    /**
     * Update last_used_at timestamp
     * Updates cache and DB
     */
    async updateLastUsed(id) {
        const { TimeUtils } = await import('resource:///com/odnoyko/valot/core/utils/TimeUtils.js');
        const now = TimeUtils.getCurrentTimestamp();
        
        // Update in cache first
        if (this.cache) {
            const instance = this.cache.getTaskInstance(id);
            if (instance) {
                const updated = { ...instance, last_used_at: now };
                this.cache.setTaskInstance(updated);
            }
        }
        
        // Write to DB
        const sql = `UPDATE TaskInstance SET last_used_at = '${now}', updated_at = datetime('now') WHERE id = ${id}`;
        await this.execute(sql);
    }
    /**
     * Update total_time cache
     * Excludes active TimeEntry (end_time IS NULL) to avoid double-counting with elapsedSeconds
     * Updates cache and DB
     */
    async updateTotalTime(id) {
        // Calculate total time from DB
        const sql = `
            SELECT COALESCE(SUM(duration), 0) as total_time
            FROM TimeEntry
            WHERE task_instance_id = ${id}
              AND end_time IS NOT NULL
        `;
        const results = await this.query(sql);
        const totalTime = results[0]?.total_time || 0;
        
        // Update in cache first
        if (this.cache) {
            const instance = this.cache.getTaskInstance(id);
            if (instance) {
                const updated = { ...instance, total_time: totalTime };
                this.cache.setTaskInstance(updated);
            }
        }
        
        // Write to DB
        const updateSql = `UPDATE TaskInstance SET total_time = ${totalTime}, updated_at = datetime('now') WHERE id = ${id}`;
        await this.execute(updateSql);
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
    /**
     * Delete instance
     * Removes from cache and DB
     */
    async delete(id) {
        // Remove from cache
        if (this.cache) {
            this.cache.deleteTaskInstance(id);
        }
        
        // Delete from DB
        const sql = `DELETE FROM TaskInstance WHERE id = ${id}`;
        await this.execute(sql);
    }
    /**
     * Get instance by ID (from cache, fallback to DB)
     */
    async getById(id) {
        // Try cache first
        if (this.cache) {
            const instance = this.cache.getTaskInstance(id);
            if (instance) {
                return this.mapToModel(instance);
            }
        }
        
        // Cache miss - fetch from DB
        const sql = `SELECT * FROM TaskInstance WHERE id = ${id} LIMIT 1`;
        const results = await this.query(sql);
        if (results.length === 0) {
            throw new Error(`TaskInstance not found: ${id}`);
        }
        
        const instance = this.mapToModel(results[0]);
        // Update cache
        if (this.cache) {
            this.cache.setTaskInstance(results[0]);
        }
        
        return instance;
    }
    
    /**
     * Get all instances (from cache)
     */
    async getAll() {
        if (this.cache) {
            const allInstances = this.cache.getAllTaskInstances();
            return allInstances.map(row => this.mapToModel(row))
                .sort((a, b) => {
                    const aTime = a.last_used_at || '';
                    const bTime = b.last_used_at || '';
                    return bTime.localeCompare(aTime); // DESC
                });
        }
        
        // Fallback to DB
        const sql = `SELECT * FROM TaskInstance ORDER BY last_used_at DESC`;
        const results = await this.query(sql);
        
        // Populate cache
        if (this.cache && results.length > 0) {
            results.forEach(row => {
                this.cache.setTaskInstance(row);
            });
        }
        
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
