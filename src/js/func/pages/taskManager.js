import { executeQuery, executeNonSelectCommand } from 'resource:///com/odnoyko/valot/js/func/global/dbinitialisation.js';

/**
 * TaskManager - Handles task CRUD operations and data management
 */
export class TaskManager {
    constructor(dbConnection, executeQueryFunc, executeNonSelectCommandFunc) {
        this.dbConnection = dbConnection;
        this.executeQuery = executeQueryFunc || executeQuery;
        this.executeNonSelectCommand = executeNonSelectCommandFunc || executeNonSelectCommand;
    }

    /**
     * Get all tasks with project information
     */
    getAllTasks() {
        const sql = `
            SELECT 
                t.id, 
                t.name, 
                t.info as description,
                t.project_id, 
                t.client_id,
                t.time_spent as duration, 
                t.start_time as start, 
                t.end_time as end, 
                t.created_at,
                p.name as project_name, 
                p.color as project_color,
                c.name as client_name,
                c.rate as client_rate,
                CASE WHEN t.end_time IS NULL AND t.start_time IS NOT NULL THEN 1 ELSE 0 END as is_active
            FROM Task t
            LEFT JOIN Project p ON t.project_id = p.id
            LEFT JOIN Client c ON t.client_id = c.id
            ORDER BY t.created_at DESC
        `;
        
        try {
            const result = this.executeQuery(this.dbConnection, sql);
            const tasks = this._convertResultToArray(result);
            return tasks;
        } catch (error) {
            console.error('❌ TaskManager: Error loading tasks:', error);
            return [];
        }
    }

    /**
     * Get tasks filtered by various criteria
     */
    getFilteredTasks(options = {}) {
        const { 
            projectId, 
            dateFrom, 
            dateTo, 
            isActive, 
            searchQuery,
            limit,
            offset 
        } = options;

        let sql = `
            SELECT 
                t.id, 
                t.name, 
                t.info as description,
                t.project_id, 
                t.client_id,
                t.time_spent as duration, 
                t.start_time as start, 
                t.end_time as end, 
                t.created_at,
                p.name as project_name, 
                p.color as project_color,
                c.name as client_name,
                c.rate as client_rate,
                CASE WHEN t.end_time IS NULL AND t.start_time IS NOT NULL THEN 1 ELSE 0 END as is_active
            FROM Task t
            LEFT JOIN Project p ON t.project_id = p.id
            LEFT JOIN Client c ON t.client_id = c.id
            WHERE 1=1
        `;

        const conditions = [];
        
        if (projectId) {
            conditions.push(`t.project_id = ${projectId}`);
        }
        
        if (dateFrom) {
            conditions.push(`DATE(t.created_at) >= '${dateFrom}'`);
        }
        
        if (dateTo) {
            conditions.push(`DATE(t.created_at) <= '${dateTo}'`);
        }
        
        if (isActive !== undefined) {
            if (isActive) {
                conditions.push(`t.end_time IS NULL AND t.start_time IS NOT NULL`);
            } else {
                conditions.push(`t.end_time IS NOT NULL OR t.start_time IS NULL`);
            }
        }
        
        if (searchQuery) {
            const safeQuery = searchQuery.replace(/'/g, "''"); // Basic SQL injection protection
            conditions.push(`(t.name LIKE '%${safeQuery}%' OR t.info LIKE '%${safeQuery}%' OR p.name LIKE '%${safeQuery}%')`);
        }

        if (conditions.length > 0) {
            sql += ' AND ' + conditions.join(' AND ');
        }

        sql += ' ORDER BY t.created_at DESC';

        if (limit) {
            sql += ` LIMIT ${limit}`;
        }
        
        if (offset) {
            sql += ` OFFSET ${offset}`;
        }

        try {
            const result = this.executeQuery(this.dbConnection, sql);
            
            // Convert database result to array format
            const tasks = this._convertResultToArray(result);
            return tasks;
        } catch (error) {
            console.error('❌ TaskManager: Error filtering tasks:', error);
            return [];
        }
    }

    /**
     * Get task by ID
     */
    getTaskById(taskId) {
        const sql = `
            SELECT 
                t.id, 
                t.name, 
                t.info as description,
                t.project_id, 
                t.client_id,
                t.time_spent as duration, 
                t.start_time as start, 
                t.end_time as end, 
                t.created_at,
                p.name as project_name, 
                p.color as project_color,
                c.name as client_name,
                c.rate as client_rate,
                CASE WHEN t.end_time IS NULL AND t.start_time IS NOT NULL THEN 1 ELSE 0 END as is_active
            FROM Task t
            LEFT JOIN Project p ON t.project_id = p.id
            LEFT JOIN Client c ON t.client_id = c.id
            WHERE t.id = ${taskId}
        `;
        
        try {
            const result = this.executeQuery(this.dbConnection, sql);
            const tasks = this._convertResultToArray(result);
            return tasks.length > 0 ? tasks[0] : null;
        } catch (error) {
            console.error('❌ TaskManager: Error getting task by ID:', error);
            return null;
        }
    }

    /**
     * Create new task
     */
    createTask(taskData) {
        const { name, description = '', projectId = 1 } = taskData;
        
        // Basic validation
        if (!name || name.trim() === '') {
            throw new Error('Task name is required');
        }
        
        const safeName = name.replace(/'/g, "''");
        const safeDescription = description.replace(/'/g, "''");
        
        const sql = `
            INSERT INTO Task (name, info, project_id, created_at)
            VALUES ('${safeName}', '${safeDescription}', ${projectId}, datetime('now'))
        `;
        
        try {
            console.log('➕ TaskManager: Creating task:', { name, description, projectId });
            this.executeNonSelectCommand(this.dbConnection, sql);
            return true;
        } catch (error) {
            console.error('❌ TaskManager: Error creating task:', error);
            throw error;
        }
    }

    /**
     * Update task
     */
    updateTask(taskId, taskData) {
        const { name, description, projectId, project_id, client_id, start, end, duration } = taskData;
        
        const updates = [];
        
        if (name !== undefined) {
            const safeName = name.replace(/'/g, "''");
            updates.push(`name = '${safeName}'`);
        }
        
        if (description !== undefined) {
            const safeDescription = description.replace(/'/g, "''");
            updates.push(`info = '${safeDescription}'`);
        }
        
        if (projectId !== undefined) {
            updates.push(`project_id = ${projectId}`);
        }
        
        // Support both projectId and project_id for consistency
        if (project_id !== undefined) {
            updates.push(`project_id = ${project_id}`);
        }
        
        if (client_id !== undefined) {
            updates.push(`client_id = ${client_id}`);
        }
        
        if (start !== undefined) {
            const safeStart = start.replace(/'/g, "''");
            updates.push(`start_time = '${safeStart}'`);
        }
        
        if (end !== undefined) {
            const safeEnd = end.replace(/'/g, "''");
            updates.push(`end_time = '${safeEnd}'`);
        }
        
        if (duration !== undefined) {
            updates.push(`time_spent = ${duration}`);
        }
        
        if (updates.length === 0) {
            console.warn('⚠️ TaskManager: No updates provided for task');
            return false;
        }
        
        const sql = `UPDATE Task SET ${updates.join(', ')} WHERE id = ${taskId}`;
        
        try {
            this.executeNonSelectCommand(this.dbConnection, sql);
            return true;
        } catch (error) {
            console.error('❌ TaskManager: Error updating task:', error);
            throw error;
        }
    }

    /**
     * Delete task
     */
    deleteTask(taskId) {
        const sql = `DELETE FROM Task WHERE id = ${taskId}`;
        
        try {
            this.executeNonSelectCommand(this.dbConnection, sql);
            return true;
        } catch (error) {
            console.error('❌ TaskManager: Error deleting task:', error);
            throw error;
        }
    }

    /**
     * Delete multiple tasks
     */
    deleteTasks(taskIds) {
        if (!Array.isArray(taskIds) || taskIds.length === 0) {
            console.warn('⚠️ TaskManager: No task IDs provided for deletion');
            return false;
        }
        
        const idsString = taskIds.join(',');
        const sql = `DELETE FROM Task WHERE id IN (${idsString})`;
        
        try {
            this.executeNonSelectCommand(this.dbConnection, sql);
            return true;
        } catch (error) {
            console.error('❌ TaskManager: Error deleting tasks:', error);
            throw error;
        }
    }

    /**
     * Start task tracking
     */
    startTracking(taskId) {
        const sql = `UPDATE Task SET start_time = datetime('now'), end_time = NULL WHERE id = ${taskId}`;
        
        try {
            this.executeNonSelectCommand(this.dbConnection, sql);
            return true;
        } catch (error) {
            console.error('❌ TaskManager: Error starting tracking:', error);
            throw error;
        }
    }

    /**
     * Stop task tracking
     */
    stopTracking(taskId, timeSpent = 0) {
        const sql = `UPDATE Task SET end_time = datetime('now'), time_spent = time_spent + ${timeSpent} WHERE id = ${taskId}`;
        
        try {
            this.executeNonSelectCommand(this.dbConnection, sql);
            return true;
        } catch (error) {
            console.error('❌ TaskManager: Error stopping tracking:', error);
            throw error;
        }
    }

    /**
     * Get task statistics
     */
    getTaskStats() {
        const sql = `
            SELECT 
                COUNT(*) as total_tasks,
                COUNT(CASE WHEN t.end_time IS NULL AND t.start_time IS NOT NULL THEN 1 END) as active_tasks,
                SUM(t.time_spent) as total_time_spent,
                COUNT(DISTINCT t.project_id) as projects_with_tasks
            FROM Task t
        `;
        
        try {
            const stats = this.executeQuery(this.dbConnection, sql);
            return stats.length > 0 ? stats[0] : {
                total_tasks: 0,
                active_tasks: 0, 
                total_time_spent: 0,
                projects_with_tasks: 0
            };
        } catch (error) {
            console.error('❌ TaskManager: Error getting task stats:', error);
            return {
                total_tasks: 0,
                active_tasks: 0,
                total_time_spent: 0,
                projects_with_tasks: 0
            };
        }
    }

    /**
     * Convert database result to JavaScript array
     */
    _convertResultToArray(result) {
        if (!result) {
            return [];
        }

        const tasks = [];
        
        try {
            if (result.get_n_rows && result.get_n_rows() > 0) {
                for (let i = 0; i < result.get_n_rows(); i++) {
                    const task = {
                        id: result.get_value_at(0, i),
                        name: result.get_value_at(1, i),
                        description: result.get_value_at(2, i),
                        project_id: result.get_value_at(3, i),
                        client_id: result.get_value_at(4, i),
                        duration: result.get_value_at(5, i) || 0,
                        start: result.get_value_at(6, i),
                        end: result.get_value_at(7, i),
                        created_at: result.get_value_at(8, i),
                        project_name: result.get_value_at(9, i),
                        project_color: result.get_value_at(10, i),
                        client_name: result.get_value_at(11, i),
                        client_rate: result.get_value_at(12, i) || 0,
                        is_active: result.get_value_at(13, i) || 0
                    };

                    tasks.push(task);
                }
            }
        } catch (error) {
            console.error('❌ TaskManager: Error converting result to array:', error);
            return [];
        }

        return tasks;
    }
}