/**
 * Cache Service - In-Memory Cache with Write-Back to Database
 * 
 * Strategy:
 * 1. All reads go to cache first (fast)
 * 2. All writes go to cache immediately, then queued for DB sync (write-back)
 * 3. Periodic sync or explicit flush syncs changes to DB
 * 4. On startup, cache is populated from DB
 * 
 * This reduces DB load dramatically, especially for frequent reads
 */

import GLib from 'gi://GLib';

export class CacheService {
    constructor(coreAPI) {
        this.core = coreAPI;
        
        // In-memory caches - Maps by ID for O(1) lookup
        this.tasks = new Map();           // id -> Task
        this.projects = new Map();        // id -> Project
        this.clients = new Map();         // id -> Client
        this.taskInstances = new Map();   // id -> TaskInstance
        this.timeEntries = new Map();     // id -> TimeEntry (only completed ones)
        
        // Cache indices for faster lookups
        this.taskByName = new Map();      // name -> Task
        this.instanceByCombo = new Map(); // "taskId:projectId:clientId" -> TaskInstance
        
        // Dirty flags - track what needs syncing to DB
        this.dirtyTasks = new Set();
        this.dirtyProjects = new Set();
        this.dirtyClients = new Set();
        this.dirtyTaskInstances = new Set();
        this.dirtyTimeEntries = new Set();
        
        // Deleted IDs (for cascade cleanup)
        this.deletedTasks = new Set();
        this.deletedProjects = new Set();
        this.deletedClients = new Set();
        this.deletedTaskInstances = new Set();
        this.deletedTimeEntries = new Set();
        
        // Cache size limits to prevent RAM growth
        this.maxCacheSize = 1000;              // Max items per entity type
        this.maxTimeEntriesCache = 2000;      // Max completed time entries (can have many)
        
        // Sync configuration
        this.syncInProgress = false;
        
        // Statistics
        this.stats = {
            cacheHits: 0,
            cacheMisses: 0,
            dbReads: 0,
            dbWrites: 0,
        };
    }
    
    /**
     * Initialize cache by loading all data from DB
     */
    async initialize() {
        
        try {
            // Load all entities from DB
            await Promise.all([
                this._loadTasks(),
                this._loadProjects(),
                this._loadClients(),
                this._loadTaskInstances(),
                // TimeEntries are loaded on-demand (only completed ones)
            ]);
            
            
            // Start periodic sync
            // DISABLED: Periodic sync timer - sync on demand only, not every 5 seconds
            // this.startPeriodicSync();
        } catch (error) {
            console.error('Cache', 'Failed to initialize cache:', error);
            throw error;
        }
    }
    
    /**
     * Load all tasks from DB
     */
    async _loadTasks() {
        const sql = `SELECT * FROM Task ORDER BY name ASC`;
        const results = await this.core.database.query(sql);
        
        this.tasks.clear();
        this.taskByName.clear();
        
        results.forEach(row => {
            this.tasks.set(row.id, row);
            this.taskByName.set(row.name, row);
        });
        
        this.stats.dbReads++;
    }
    
    /**
     * Load all projects from DB
     */
    async _loadProjects() {
        const sql = `SELECT * FROM Project ORDER BY name ASC`;
        const results = await this.core.database.query(sql);
        
        this.projects.clear();
        
        results.forEach(row => {
            this.projects.set(row.id, row);
        });
        
        this.stats.dbReads++;
    }
    
    /**
     * Load all clients from DB
     */
    async _loadClients() {
        const sql = `SELECT * FROM Client ORDER BY name ASC`;
        const results = await this.core.database.query(sql);
        
        this.clients.clear();
        
        results.forEach(row => {
            this.clients.set(row.id, row);
        });
        
        this.stats.dbReads++;
    }
    
    /**
     * Load all task instances from DB
     */
    async _loadTaskInstances() {
        const sql = `SELECT * FROM TaskInstance`;
        const results = await this.core.database.query(sql);
        
        this.taskInstances.clear();
        this.instanceByCombo.clear();
        
        results.forEach(row => {
            this.taskInstances.set(row.id, row);
            
            // Index by combination
            const comboKey = this._getComboKey(row.task_id, row.project_id, row.client_id);
            this.instanceByCombo.set(comboKey, row);
        });
        
        this.stats.dbReads++;
    }
    
    /**
     * Get combo key for indexing
     */
    _getComboKey(taskId, projectId, clientId) {
        return `${taskId}:${projectId ?? 'null'}:${clientId ?? 'null'}`;
    }
    
    // ==================== Cache Read Methods ====================
    
    /**
     * Get task by ID (from cache)
     */
    /**
     * Get task by ID (from cache)
     * OPTIMIZED: Return direct reference - no object creation
     */
    getTask(id) {
        const task = this.tasks.get(id);
        if (task) {
            this.stats.cacheHits++;
            return task; // Direct reference - no object creation
        }
        this.stats.cacheMisses++;
        return null;
    }
    
    /**
     * Get task by name (from cache)
     * OPTIMIZED: Return direct reference
     */
    getTaskByName(name) {
        const task = this.taskByName.get(name);
        if (task) {
            this.stats.cacheHits++;
            return task; // Direct reference
        }
        this.stats.cacheMisses++;
        return null;
    }
    
    /**
     * Get all tasks (from cache)
     * OPTIMIZED: Return direct array reference
     */
    getAllTasks() {
        return Array.from(this.tasks.values()); // Direct references - no map/spread
    }
    
    /**
     * Get project by ID (from cache)
     * OPTIMIZED: Return direct reference
     */
    getProject(id) {
        const project = this.projects.get(id);
        if (project) {
            this.stats.cacheHits++;
            return project; // Direct reference
        }
        this.stats.cacheMisses++;
        return null;
    }
    
    /**
     * Get all projects (from cache)
     * OPTIMIZED: Return direct array reference
     */
    getAllProjects() {
        return Array.from(this.projects.values()); // Direct references
    }
    
    /**
     * Get client by ID (from cache)
     * OPTIMIZED: Return direct reference
     */
    getClient(id) {
        const client = this.clients.get(id);
        if (client) {
            this.stats.cacheHits++;
            return client; // Direct reference
        }
        this.stats.cacheMisses++;
        return null;
    }
    
    /**
     * Get all clients (from cache)
     * OPTIMIZED: Return direct array reference
     */
    getAllClients() {
        return Array.from(this.clients.values()); // Direct references
    }
    
    /**
     * Get task instance by ID (from cache)
     * OPTIMIZED: Return direct reference
     */
    getTaskInstance(id) {
        const instance = this.taskInstances.get(id);
        if (instance) {
            this.stats.cacheHits++;
            return instance; // Direct reference
        }
        this.stats.cacheMisses++;
        return null;
    }
    
    /**
     * Find task instance by combination (from cache)
     * OPTIMIZED: Return direct reference
     */
    findTaskInstanceByCombo(taskId, projectId, clientId) {
        const key = this._getComboKey(taskId, projectId, clientId);
        const instance = this.instanceByCombo.get(key);
        if (instance) {
            this.stats.cacheHits++;
            return instance; // Direct reference
        }
        this.stats.cacheMisses++;
        return null;
    }
    
    /**
     * Get all task instances (from cache)
     */
    /**
     * Get all task instances (from cache)
     * OPTIMIZED: Return direct array reference
     */
    getAllTaskInstances() {
        return Array.from(this.taskInstances.values()); // Direct references - no map/spread
    }
    
    // ==================== Cache Write Methods ====================
    
    /**
     * Add/update task in cache (marks as dirty)
     * Limits cache size to prevent RAM growth
     */
    setTask(task) {
        // Limit cache size - remove oldest if exceeds limit
        if (this.tasks.size >= this.maxCacheSize && !this.tasks.has(task.id)) {
            const oldestId = Array.from(this.tasks.keys())[0];
            const oldestTask = this.tasks.get(oldestId);
            if (oldestTask) {
                this.taskByName.delete(oldestTask.name);
            }
            this.tasks.delete(oldestId);
        }
        
        // OPTIMIZED: Store direct reference - no object copy
        // Object is already created by caller, no need to copy
        this.tasks.set(task.id, task);
        this.taskByName.set(task.name, task);
        this.dirtyTasks.add(task.id);
    }
    
    /**
     * Delete task from cache (marks for DB deletion)
     */
    deleteTask(id) {
        const task = this.tasks.get(id);
        if (task) {
            this.tasks.delete(id);
            this.taskByName.delete(task.name);
            this.deletedTasks.add(id);
            this.dirtyTasks.delete(id); // No need to update if deleted
        }
    }
    
    /**
     * Add/update project in cache
     * Limits cache size to prevent RAM growth
     */
    setProject(project) {
        // Limit cache size - remove oldest if exceeds limit
        if (this.projects.size >= this.maxCacheSize && !this.projects.has(project.id)) {
            const oldestId = Array.from(this.projects.keys())[0];
            this.projects.delete(oldestId);
        }
        
        // OPTIMIZED: Store direct reference - no object copy
        this.projects.set(project.id, project);
        this.dirtyProjects.add(project.id);
    }
    
    /**
     * Delete project from cache
     */
    deleteProject(id) {
        this.projects.delete(id);
        this.deletedProjects.add(id);
        this.dirtyProjects.delete(id);
    }
    
    /**
     * Add/update client in cache
     * Limits cache size to prevent RAM growth
     */
    setClient(client) {
        // Limit cache size - remove oldest if exceeds limit
        if (this.clients.size >= this.maxCacheSize && !this.clients.has(client.id)) {
            const oldestId = Array.from(this.clients.keys())[0];
            this.clients.delete(oldestId);
        }
        
        // OPTIMIZED: Store direct reference - no object copy
        this.clients.set(client.id, client);
        this.dirtyClients.add(client.id);
    }
    
    /**
     * Delete client from cache
     */
    deleteClient(id) {
        this.clients.delete(id);
        this.deletedClients.add(id);
        this.dirtyClients.delete(id);
    }
    
    /**
     * Add/update task instance in cache
     * Limits cache size to prevent RAM growth
     */
    setTaskInstance(instance) {
        const oldInstance = this.taskInstances.get(instance.id);
        
        // Limit cache size - remove oldest if exceeds limit
        if (this.taskInstances.size >= this.maxCacheSize && !this.taskInstances.has(instance.id)) {
            const oldestId = Array.from(this.taskInstances.keys())[0];
            const oldestInstance = this.taskInstances.get(oldestId);
            if (oldestInstance) {
                const oldComboKey = this._getComboKey(oldestInstance.task_id, oldestInstance.project_id, oldestInstance.client_id);
                this.instanceByCombo.delete(oldComboKey);
            }
            this.taskInstances.delete(oldestId);
        }
        
        // OPTIMIZED: Store direct reference - no object copy
        this.taskInstances.set(instance.id, instance);
        
        // Update combo index
        const comboKey = this._getComboKey(instance.task_id, instance.project_id, instance.client_id);
        this.instanceByCombo.set(comboKey, instance);
        
        // Remove old combo index if combination changed
        if (oldInstance && 
            (oldInstance.task_id !== instance.task_id ||
             oldInstance.project_id !== instance.project_id ||
             oldInstance.client_id !== instance.client_id)) {
            const oldKey = this._getComboKey(oldInstance.task_id, oldInstance.project_id, oldInstance.client_id);
            if (oldKey !== comboKey) {
                this.instanceByCombo.delete(oldKey);
            }
        }
        
        this.dirtyTaskInstances.add(instance.id);
    }
    
    /**
     * Delete task instance from cache
     */
    deleteTaskInstance(id) {
        const instance = this.taskInstances.get(id);
        if (instance) {
            this.taskInstances.delete(id);
            const comboKey = this._getComboKey(instance.task_id, instance.project_id, instance.client_id);
            this.instanceByCombo.delete(comboKey);
            this.deletedTaskInstances.add(id);
            this.dirtyTaskInstances.delete(id);
        }
    }
    
    // ==================== Sync Methods ====================
    
    /**
     * Sync all dirty changes to DB (write-back)
     */
    async syncToDB() {
        if (this.syncInProgress) {
            return;
        }
        
        this.syncInProgress = true;
        
        try {
            // Sync deletions first
            await this._syncDeletions();
            
            // Sync updates/inserts
            await Promise.all([
                this._syncTasks(),
                this._syncProjects(),
                this._syncClients(),
                this._syncTaskInstances(),
                this._syncTimeEntries(),
            ]);
            
        } catch (error) {
            console.error('Cache', 'Sync to DB failed:', error);
            throw error;
        } finally {
            this.syncInProgress = false;
        }
    }
    
    /**
     * Force immediate sync (for critical operations)
     */
    async flush() {
        await this.syncToDB();
    }
    
    /**
     * Sync tasks to DB
     */
    async _syncTasks() {
        if (this.dirtyTasks.size === 0) return;
        
        const dirtyIds = Array.from(this.dirtyTasks);
        
        for (const id of dirtyIds) {
            const task = this.tasks.get(id);
            if (!task) continue; // Was deleted
            
            try {
                // Check if exists in DB
                const existing = await this.core.database.query(
                    `SELECT id FROM Task WHERE id = ?`,
                    [id]
                );
                
                if (existing.length > 0) {
                    // Update
                    await this.core.database.execute(
                        `UPDATE Task SET name = ?, updated_at = datetime('now') WHERE id = ?`,
                        [task.name, id]
                    );
                } else {
                    // Insert
                    await this.core.database.execute(
                        `INSERT INTO Task (id, name, created_at, updated_at) VALUES (?, ?, datetime('now'), datetime('now'))`,
                        [id, task.name]
                    );
                }
                
                this.dirtyTasks.delete(id);
                this.stats.dbWrites++;
                
                // OPTIMIZED: Clear from cache after sync - data is in DB now
                // Only keep recently accessed items (keep for 5 minutes of activity)
                // For now, just remove from dirty - cache will be cleared by size limits
                // Objects stay in cache for fast reads, but no extra copies created
            } catch (error) {
                console.error('Cache', `Failed to sync task ${id}:`, error);
            }
        }
    }
    
    /**
     * Sync deletions to DB
     */
    async _syncDeletions() {
        // Delete in reverse dependency order
        if (this.deletedTimeEntries.size > 0) {
            const ids = Array.from(this.deletedTimeEntries);
            const placeholders = ids.map(() => '?').join(',');
            await this.core.database.execute(
                `DELETE FROM TimeEntry WHERE id IN (${placeholders})`,
                ids
            );
            this.deletedTimeEntries.clear();
        }
        
        if (this.deletedTaskInstances.size > 0) {
            const ids = Array.from(this.deletedTaskInstances);
            const placeholders = ids.map(() => '?').join(',');
            await this.core.database.execute(
                `DELETE FROM TaskInstance WHERE id IN (${placeholders})`,
                ids
            );
            this.deletedTaskInstances.clear();
        }
        
        if (this.deletedTasks.size > 0) {
            const ids = Array.from(this.deletedTasks);
            const placeholders = ids.map(() => '?').join(',');
            await this.core.database.execute(
                `DELETE FROM Task WHERE id IN (${placeholders})`,
                ids
            );
            this.deletedTasks.clear();
        }
        
        if (this.deletedProjects.size > 0) {
            const ids = Array.from(this.deletedProjects);
            const placeholders = ids.map(() => '?').join(',');
            await this.core.database.execute(
                `DELETE FROM Project WHERE id IN (${placeholders})`,
                ids
            );
            this.deletedProjects.clear();
        }
        
        if (this.deletedClients.size > 0) {
            const ids = Array.from(this.deletedClients);
            const placeholders = ids.map(() => '?').join(',');
            await this.core.database.execute(
                `DELETE FROM Client WHERE id IN (${placeholders})`,
                ids
            );
            this.deletedClients.clear();
        }
    }
    
    /**
     * Sync projects to DB
     */
    async _syncProjects() {
        if (this.dirtyProjects.size === 0) return;
        
        const dirtyIds = Array.from(this.dirtyProjects);
        
        for (const id of dirtyIds) {
            const project = this.projects.get(id);
            if (!project) continue;
            
            try {
                const existing = await this.core.database.query(
                    `SELECT id FROM Project WHERE id = ?`,
                    [id]
                );
                
                if (existing.length > 0) {
                    await this.core.database.execute(
                        `UPDATE Project SET name = ?, color = ?, client_id = ?, updated_at = datetime('now') WHERE id = ?`,
                        [project.name, project.color, project.client_id, id]
                    );
                } else {
                    await this.core.database.execute(
                        `INSERT INTO Project (id, name, color, client_id, created_at, updated_at) VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))`,
                        [id, project.name, project.color, project.client_id]
                    );
                }
                
                this.dirtyProjects.delete(id);
                this.stats.dbWrites++;
            } catch (error) {
                console.error('Cache', `Failed to sync project ${id}:`, error);
            }
        }
    }
    
    /**
     * Sync clients to DB
     */
    async _syncClients() {
        if (this.dirtyClients.size === 0) return;
        
        const dirtyIds = Array.from(this.dirtyClients);
        
        for (const id of dirtyIds) {
            const client = this.clients.get(id);
            if (!client) continue;
            
            try {
                const existing = await this.core.database.query(
                    `SELECT id FROM Client WHERE id = ?`,
                    [id]
                );
                
                if (existing.length > 0) {
                    await this.core.database.execute(
                        `UPDATE Client SET name = ?, email = ?, rate = ?, currency = ?, updated_at = datetime('now') WHERE id = ?`,
                        [client.name, client.email, client.rate, client.currency, id]
                    );
                } else {
                    await this.core.database.execute(
                        `INSERT INTO Client (id, name, email, rate, currency, created_at, updated_at) VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
                        [id, client.name, client.email, client.rate, client.currency]
                    );
                }
                
                this.dirtyClients.delete(id);
                this.stats.dbWrites++;
            } catch (error) {
                console.error('Cache', `Failed to sync client ${id}:`, error);
            }
        }
    }
    
    /**
     * Sync task instances to DB
     */
    async _syncTaskInstances() {
        if (this.dirtyTaskInstances.size === 0) return;
        
        const dirtyIds = Array.from(this.dirtyTaskInstances);
        
        for (const id of dirtyIds) {
            const instance = this.taskInstances.get(id);
            if (!instance) continue;
            
            try {
                const existing = await this.core.database.query(
                    `SELECT id FROM TaskInstance WHERE id = ?`,
                    [id]
                );
                
                if (existing.length > 0) {
                    await this.core.database.execute(
                        `UPDATE TaskInstance SET task_id = ?, project_id = ?, client_id = ?, total_time = ?, is_favorite = ?, last_used_at = ?, updated_at = datetime('now') WHERE id = ?`,
                        [instance.task_id, instance.project_id, instance.client_id, instance.total_time || 0, instance.is_favorite || 0, instance.last_used_at, id]
                    );
                } else {
                    await this.core.database.execute(
                        `INSERT INTO TaskInstance (id, task_id, project_id, client_id, total_time, is_favorite, last_used_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
                        [id, instance.task_id, instance.project_id, instance.client_id, instance.total_time || 0, instance.is_favorite || 0, instance.last_used_at]
                    );
                }
                
                this.dirtyTaskInstances.delete(id);
                this.stats.dbWrites++;
            } catch (error) {
                console.error('Cache', `Failed to sync task instance ${id}:`, error);
            }
        }
    }
    
    /**
     * Sync time entries to DB (placeholder - TimeEntries are written immediately currently)
     */
    async _syncTimeEntries() {
        // TimeEntries are typically written immediately (on start/stop)
        // But we can queue them here if needed
        if (this.dirtyTimeEntries.size === 0) return;
        
        // Implementation similar to other sync methods
        // For now, TimeEntries are written immediately, so this is mostly for future use
    }
    
    /**
     * Clear all caches
     */
    clear() {
        this.tasks.clear();
        this.projects.clear();
        this.clients.clear();
        this.taskInstances.clear();
        this.timeEntries.clear();
        this.taskByName.clear();
        this.instanceByCombo.clear();
        
        this.dirtyTasks.clear();
        this.dirtyProjects.clear();
        this.dirtyClients.clear();
        this.dirtyTaskInstances.clear();
        this.dirtyTimeEntries.clear();
    }
    
    /**
     * Cleanup on shutdown
     */
    destroy() {
        // Final sync before shutdown
        this.flush().catch(err => {
            console.error('Cache', 'Final sync on shutdown failed:', err);
        });
    }
}

