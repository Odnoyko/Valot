/**
 * Database Import System
 * Handles importing data from external database files
 *
 * Two modes:
 * 1. REPLACE: Delete all data from current DB, insert new data
 * 2. MERGE: Add new data to existing data
 *
 * Both modes work with the app's existing database connection (no file operations)
 * Old schema (0.8.x) is automatically adapted to new schema (0.9.0+)
 */

import Gda from 'gi://Gda?version=6.0';
import GLib from 'gi://GLib';

export class DatabaseImport {
    /**
     * @param {GdaDatabaseBridge} appDb - Application's existing database connection
     */
    constructor(appDb) {
        this.appDb = appDb;  // App's database connection (write here)
        this.importDb = null; // Import database connection (read from here)
        this.importConnection = null;

    }

    /**
     * REPLACE MODE: Clear current data and insert imported data
     * @param {string} importPath - Path to database file to import
     * @param {Function} progressCallback - (step, total, message) => void
     * @returns {Promise<{clientsAdded: number, projectsAdded: number, tasksAdded: number, entriesAdded: number}>}
     */
    async replaceData(importPath, progressCallback = null) {

        try {
            // Step 1: Open import database
            this._updateProgress(progressCallback, 1, 7, 'Opening import database...');
            await this._openImportDatabase(importPath);

            // Step 2: Detect schema
            this._updateProgress(progressCallback, 2, 7, 'Checking database version...');
            const isOldSchema = await this._isOldSchema();

            // Step 3: Clear current database
            this._updateProgress(progressCallback, 3, 7, 'Clearing current database...');

            // BEGIN TRANSACTION
            await this.appDb.execute('BEGIN IMMEDIATE');

            try {
                await this._clearAllData();

                // Step 4-6: Import data (without nested transaction)
                const result = await this._importDataWithoutTransaction(isOldSchema, progressCallback, 4);

                // COMMIT
                await this.appDb.execute('COMMIT');

                // Step 7: Finalize
                this._updateProgress(progressCallback, 7, 7, 'Complete');
                await this._closeImportDatabase();

                return result;

            } catch (error) {
                console.error('❌ Replace failed, rolling back...');
                try {
                    await this.appDb.execute('ROLLBACK');
                } catch (rollbackError) {
                    console.error('Rollback error:', rollbackError);
                }
                await this._closeImportDatabase();
                throw error;
            }

        } catch (error) {
            console.error('❌ Replace failed:', error);
            await this._closeImportDatabase();
            throw error;
        }
    }

    /**
     * MERGE MODE: Add imported data to existing data
     * @param {string} importPath - Path to database file to import
     * @param {Function} progressCallback - (step, total, message) => void
     * @returns {Promise<{clientsAdded: number, projectsAdded: number, tasksAdded: number, entriesAdded: number}>}
     */
    async mergeData(importPath, progressCallback = null) {

        try {
            // Step 1: Open import database
            this._updateProgress(progressCallback, 1, 6, 'Opening import database...');
            await this._openImportDatabase(importPath);

            // Step 2: Detect schema
            this._updateProgress(progressCallback, 2, 6, 'Checking database version...');
            const isOldSchema = await this._isOldSchema();

            // Step 3-5: Import data (skip clearing)
            const result = await this._importData(isOldSchema, progressCallback, 3);

            // Step 6: Finalize
            this._updateProgress(progressCallback, 6, 6, 'Complete');
            await this._closeImportDatabase();

            return result;

        } catch (error) {
            console.error('❌ Merge failed:', error);
            await this._closeImportDatabase();
            throw error;
        }
    }

    /**
     * Clear all data from current database (except default Client and Project)
     */
    async _clearAllData() {

        await this.appDb.execute('DELETE FROM TimeEntry');
        await this.appDb.execute('DELETE FROM TaskInstance');
        await this.appDb.execute('DELETE FROM Task');
        await this.appDb.execute('DELETE FROM Project WHERE id != 1');
        await this.appDb.execute('DELETE FROM Client WHERE id != 1');

    }

    /**
     * Import data (works for both old and new schema)
     * Used by mergeData() - has its own transaction
     * @param {boolean} isOldSchema - Whether import DB is old schema
     * @param {Function} progressCallback - Progress callback
     * @param {number} startStep - Starting step number for progress
     * @returns {Promise<{clientsAdded: number, projectsAdded: number, tasksAdded: number, entriesAdded: number}>}
     */
    async _importData(isOldSchema, progressCallback, startStep) {
        // BEGIN TRANSACTION
        await this.appDb.execute('BEGIN IMMEDIATE');

        try {
            const result = await this._importDataWithoutTransaction(isOldSchema, progressCallback, startStep);

            // COMMIT TRANSACTION
            await this.appDb.execute('COMMIT');

            return result;

        } catch (error) {
            // ROLLBACK on error
            console.error('❌ Import failed, rolling back...');
            try {
                await this.appDb.execute('ROLLBACK');
            } catch (rollbackError) {
                console.error('Rollback error:', rollbackError);
            }
            throw error;
        }
    }

    /**
     * Import data without transaction (used inside existing transaction)
     * @param {boolean} isOldSchema - Whether import DB is old schema
     * @param {Function} progressCallback - Progress callback
     * @param {number} startStep - Starting step number for progress
     * @returns {Promise<{clientsAdded: number, projectsAdded: number, tasksAdded: number, entriesAdded: number}>}
     */
    async _importDataWithoutTransaction(isOldSchema, progressCallback, startStep) {
        let clientsAdded = 0;
        let projectsAdded = 0;
        let tasksAdded = 0;
        let entriesAdded = 0;

        if (isOldSchema) {
            // OLD SCHEMA: Adapt data while importing
            this._updateProgress(progressCallback, startStep, startStep + 2, 'Importing from old database...');

            const clientIdMap = await this._importClients();
            clientsAdded = clientIdMap.size;

            const projectIdMap = await this._importProjects(clientIdMap);
            projectsAdded = projectIdMap.size;

            const taskResult = await this._importFromOldSchema(clientIdMap, projectIdMap);
            tasksAdded = taskResult.tasksAdded;
            entriesAdded = taskResult.entriesAdded;

        } else {
            // NEW SCHEMA: Direct import
            this._updateProgress(progressCallback, startStep, startStep + 2, 'Importing clients...');
            const clientIdMap = await this._importClients();
            clientsAdded = clientIdMap.size;

            this._updateProgress(progressCallback, startStep + 1, startStep + 2, 'Importing projects...');
            const projectIdMap = await this._importProjects(clientIdMap);
            projectsAdded = projectIdMap.size;

            this._updateProgress(progressCallback, startStep + 2, startStep + 2, 'Importing tasks...');
            const taskIdMap = await this._importTasks();
            tasksAdded = taskIdMap.size;

            entriesAdded = await this._importFromNewSchema(clientIdMap, projectIdMap, taskIdMap);
        }

            // Sync total_time for all TaskInstances
            await this._syncTotalTimes();

        // Let caller handle COMMIT/ROLLBACK
            return { clientsAdded, projectsAdded, tasksAdded, entriesAdded };
    }

    /**
     * Verify import by counting records
     */
    async _verifyImport() {

        const clientCount = await this.appDb.query('SELECT COUNT(*) as count FROM Client');
        const projectCount = await this.appDb.query('SELECT COUNT(*) as count FROM Project');
        const taskCount = await this.appDb.query('SELECT COUNT(*) as count FROM Task');
        const taskInstanceCount = await this.appDb.query('SELECT COUNT(*) as count FROM TaskInstance');
        const timeEntryCount = await this.appDb.query('SELECT COUNT(*) as count FROM TimeEntry');

    }

    /**
     * Import Clients
     * @returns {Promise<Map>} Map of old ID -> new ID
     */
    async _importClients() {
        const clients = await this.importDb.query('SELECT * FROM Client WHERE id != 1');
        const idMap = new Map();


        for (const client of clients) {
            // Check if exists
            const existing = await this.appDb.query(
                'SELECT id FROM Client WHERE name = ?',
                [client.name]
            );

            if (existing.length > 0) {
                idMap.set(client.id, existing[0].id);
            } else {
                const newId = await this.appDb.execute(
                    'INSERT INTO Client (name, rate, currency) VALUES (?, ?, ?)',
                    [client.name, client.rate || 0.0, client.currency || 'USD']
                );
                idMap.set(client.id, newId);
            }
        }

        return idMap;
    }

    /**
     * Import Projects
     * @param {Map} clientIdMap - Map of client IDs
     * @returns {Promise<Map>} Map of old ID -> new ID
     */
    async _importProjects(clientIdMap) {
        const projects = await this.importDb.query('SELECT * FROM Project WHERE id != 1');
        const idMap = new Map();


        for (const project of projects) {
            const newClientId = project.client_id ? clientIdMap.get(project.client_id) || null : null;

            // Check if exists
            const existing = await this.appDb.query(
                'SELECT id FROM Project WHERE name = ?',
                [project.name]
            );

            if (existing.length > 0) {
                idMap.set(project.id, existing[0].id);
            } else {
                const newId = await this.appDb.execute(
                    'INSERT INTO Project (name, color, icon, client_id) VALUES (?, ?, ?, ?)',
                    [project.name, project.color || '#cccccc', project.icon || 'folder-symbolic', newClientId]
                );
                idMap.set(project.id, newId);
            }
        }

        return idMap;
    }

    /**
     * Import Tasks (NEW schema only)
     * @returns {Promise<Map>} Map of old ID -> new ID
     */
    async _importTasks() {
        const tasks = await this.importDb.query('SELECT * FROM Task');
        const idMap = new Map();


        for (const task of tasks) {
            // Check if exists
            const existing = await this.appDb.query(
                'SELECT id FROM Task WHERE name = ?',
                [task.name]
            );

            if (existing.length > 0) {
                idMap.set(task.id, existing[0].id);
            } else {
                const newId = await this.appDb.execute(
                    'INSERT INTO Task (name) VALUES (?)',
                    [task.name]
                );
                idMap.set(task.id, newId);
            }
        }

        return idMap;
    }

    /**
     * Import from NEW schema (0.9.0+)
     * @param {Map} clientIdMap - Client ID map
     * @param {Map} projectIdMap - Project ID map
     * @param {Map} taskIdMap - Task ID map
     * @returns {Promise<number>} Number of time entries added
     */
    async _importFromNewSchema(clientIdMap, projectIdMap, taskIdMap) {
        // NEW SCHEMA FIX: Import TaskInstances FIRST to preserve stack structure
        // Don't use _getOrCreateTaskInstance() - import each TaskInstance separately!
        
        // Step 1: Import TaskInstances and create ID mapping
        const taskInstances = await this.importDb.query('SELECT * FROM TaskInstance');
        const taskInstanceIdMap = new Map(); // old ID -> new ID
        let instancesAdded = 0;


        for (const instance of taskInstances) {
            const newTaskId = taskIdMap.get(instance.task_id);
            const newProjectId = projectIdMap.get(instance.project_id) || 1;
            const newClientId = instance.client_id ? clientIdMap.get(instance.client_id) || 1 : 1;

            if (!newTaskId) {
                console.warn(`  ⚠️  Task ID ${instance.task_id} not found, skipping TaskInstance ${instance.id}`);
                continue;
            }

            // Check if this exact TaskInstance was already imported (by checking unique TimeEntries later)
            // For now, always create a NEW TaskInstance to preserve stack structure
            const newInstanceId = await this.appDb.execute(
                'INSERT INTO TaskInstance (task_id, project_id, client_id, total_time, last_used_at, is_favorite) VALUES (?, ?, ?, ?, ?, ?)',
                [newTaskId, newProjectId, newClientId, 0, instance.last_used_at || new Date().toISOString(), instance.is_favorite || 0]
            );

            taskInstanceIdMap.set(instance.id, newInstanceId);
            instancesAdded++;
        }


        // Step 2: Import TimeEntries using the TaskInstance ID mapping
        const timeEntries = await this.importDb.query('SELECT * FROM TimeEntry');
        let entriesAdded = 0;


        for (const entry of timeEntries) {
            const newTaskInstanceId = taskInstanceIdMap.get(entry.task_instance_id);

            if (!newTaskInstanceId) {
                console.warn(`  ⚠️  TaskInstance ID ${entry.task_instance_id} not found, skipping TimeEntry ${entry.id}`);
                continue;
            }

            // Check if TimeEntry exists (duplicate prevention)
            const existing = await this.appDb.query(
                'SELECT id FROM TimeEntry WHERE task_instance_id = ? AND start_time = ?',
                [newTaskInstanceId, entry.start_time]
            );

            if (existing.length === 0) {
                await this.appDb.execute(
                    'INSERT INTO TimeEntry (task_instance_id, start_time, end_time, duration) VALUES (?, ?, ?, ?)',
                    [newTaskInstanceId, entry.start_time, entry.end_time, entry.duration]
                );
                entriesAdded++;
            }
        }

        return entriesAdded;
    }

    /**
     * Import from OLD schema (0.8.x)
     * @param {Map} clientIdMap - Client ID map
     * @param {Map} projectIdMap - Project ID map
     * @returns {Promise<{tasksAdded: number, entriesAdded: number}>}
     */
    async _importFromOldSchema(clientIdMap, projectIdMap) {
        // Get unique task names
        const uniqueTasks = await this.importDb.query('SELECT DISTINCT name FROM Task');
        const taskNameToIdMap = new Map();
        let tasksAdded = 0;


        // Create Tasks
        for (const task of uniqueTasks) {
            const existing = await this.appDb.query(
                'SELECT id FROM Task WHERE name = ?',
                [task.name]
            );

            if (existing.length > 0) {
                taskNameToIdMap.set(task.name, existing[0].id);
            } else {
                const newId = await this.appDb.execute(
                    'INSERT INTO Task (name) VALUES (?)',
                    [task.name]
                );
                taskNameToIdMap.set(task.name, newId);
                tasksAdded++;
            }
        }

        // Process old task entries -> create TaskInstances and TimeEntries
        const oldTasks = await this.importDb.query('SELECT * FROM Task');
        let entriesAdded = 0;


        for (const oldTask of oldTasks) {
            const taskId = taskNameToIdMap.get(oldTask.name);
            const projectId = projectIdMap.get(oldTask.project_id) || 1;
            const clientId = oldTask.client_id ? clientIdMap.get(oldTask.client_id) || 1 : 1;

            if (!taskId) continue;

            // OLD SCHEMA FIX: Create SEPARATE TaskInstance for EACH old Task (session)
            // This is necessary for stacks to work - stacks = multiple TaskInstances with same (task_id, project_id, client_id)
            // Don't use _getOrCreateTaskInstance() here because it deduplicates!
            const lastUsedAt = oldTask.end_time || oldTask.start_time || new Date().toISOString();
            const taskInstanceId = await this.appDb.execute(
                'INSERT INTO TaskInstance (task_id, project_id, client_id, total_time, last_used_at) VALUES (?, ?, ?, ?, ?)',
                [taskId, projectId, clientId, 0, lastUsedAt]
            );

            // Create TimeEntry if valid
            if (oldTask.start_time && oldTask.end_time && oldTask.time_spent > 0) {
                const existing = await this.appDb.query(
                    'SELECT id FROM TimeEntry WHERE task_instance_id = ? AND start_time = ?',
                    [taskInstanceId, oldTask.start_time]
                );

                if (existing.length === 0) {
                    await this.appDb.execute(
                        'INSERT INTO TimeEntry (task_instance_id, start_time, end_time, duration) VALUES (?, ?, ?, ?)',
                        [taskInstanceId, oldTask.start_time, oldTask.end_time, oldTask.time_spent]
                    );
                    entriesAdded++;
                }
            }
        }

        return { tasksAdded, entriesAdded };
    }

    /**
     * Get or create TaskInstance
     * @returns {Promise<number>} TaskInstance ID
     */
    async _getOrCreateTaskInstance(taskId, projectId, clientId, lastUsedAt) {
        // Try to find existing
        const existing = await this.appDb.query(
            'SELECT id FROM TaskInstance WHERE task_id = ? AND project_id = ? AND (client_id = ? OR (client_id IS NULL AND ? IS NULL))',
            [taskId, projectId, clientId, clientId]
        );

        if (existing.length > 0) {
            return existing[0].id;
        }

        // Create new
        const safeLastUsed = lastUsedAt || new Date().toISOString();
        const newId = await this.appDb.execute(
            'INSERT INTO TaskInstance (task_id, project_id, client_id, total_time, last_used_at) VALUES (?, ?, ?, ?, ?)',
            [taskId, projectId, clientId, 0, safeLastUsed]
        );

        return newId;
    }

    /**
     * Sync total_time for all TaskInstances
     */
    async _syncTotalTimes() {

        await this.appDb.execute(`
            UPDATE TaskInstance
            SET total_time = (
                SELECT COALESCE(SUM(duration), 0)
                FROM TimeEntry
                WHERE task_instance_id = TaskInstance.id
            )
        `);

    }

    /**
     * Check if import database is old schema (0.8.x)
     * @returns {Promise<boolean>}
     */
    async _isOldSchema() {
        try {
            const tables = await this.importDb.query(
                "SELECT name FROM sqlite_master WHERE type='table' AND name='TimeEntry'"
            );
            return tables.length === 0;
        } catch (error) {
            return true;
        }
    }

    /**
     * Open import database connection
     */
    async _openImportDatabase(importPath) {
        const importDbName = GLib.path_get_basename(importPath).replace('.db', '');
        const importDbDir = GLib.path_get_dirname(importPath);
        const importConnectionString = `DB_DIR=${importDbDir};DB_NAME=${importDbName}`;

        this.importConnection = Gda.Connection.open_from_string(
            'SQLite',
            importConnectionString,
            null,
            Gda.ConnectionOptions.READ_ONLY
        );

        const { GdaDatabaseBridge } = await import('./GdaDatabaseBridge.js');
        this.importDb = new GdaDatabaseBridge();
        this.importDb.connection = this.importConnection;
        this.importDb.isConnected_ = true;

    }

    /**
     * Close import database connection
     */
    async _closeImportDatabase() {
        if (this.importConnection) {
            this.importConnection.close();
            this.importConnection = null;
        }
        this.importDb = null;
    }

    /**
     * Update progress callback
     */
    _updateProgress(callback, step, total, message) {
        if (callback && typeof callback === 'function') {
            callback(step, total, message);
        }
    }
}
