/**
 * Database Migration
 * Migrates data from old schema (v0.8.x) to new schema (v0.9.0)
 *
 * Old schema: Task (id, name, info, project_id, client_id, time_spent, start_time, end_time, created_at)
 * New schema: Task (id, name, created_at, updated_at)
 *             TaskInstance (id, task_id, project_id, client_id, total_time, last_used_at, is_favorite, created_at, updated_at)
 *             TimeEntry (id, task_instance_id, start_time, end_time, duration, created_at)
 */

import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import Gda from 'gi://Gda?version=6.0';

export class DatabaseMigration {
    /**
     * @param {GdaDatabaseBridge} oldDbBridge - Connection to old database (valot.db.db or valot-backup.db)
     * @param {GdaDatabaseBridge} newDbBridge - Connection to new database (valot.db)
     */
    constructor(oldDbBridge, newDbBridge) {
        this.oldDb = oldDbBridge;
        this.newDb = newDbBridge;
        this.isOldSchema = false; // Will be detected during migration
    }

    /**
     * Detect if source database is old schema (0.8.x) or new schema (0.9.x with version >= 2)
     * Logic:
     * - If _metadata table exists AND schema_version >= 2 → New schema (no migration needed)
     * - If _metadata table doesn't exist → Old schema (0.8.x - needs migration)
     * - If _metadata exists but schema_version < 2 → Old schema (needs migration)
     * @returns {Promise<boolean>} True if old schema, false if new schema
     */
    async detectSchema() {
        try {
            // Check if _metadata table exists
            const tables = await this.oldDb.query(
                "SELECT name FROM sqlite_master WHERE type='table' AND name='_metadata'"
            );

            if (tables.length === 0) {
                // No _metadata table → Old schema (0.8.x)
                return true;
            }

            // _metadata table exists - check schema_version
            try {
                const versionResult = await this.oldDb.query(
                    "SELECT value FROM _metadata WHERE key = 'schema_version'"
                );

                if (versionResult.length === 0) {
                    // No schema_version in _metadata → Old schema
                    return true;
                }

                const version = parseInt(versionResult[0].value);

                if (version >= 2) {
                    // New schema with version 2 or higher
                    return false;
                } else {
                    // Old version
                    return true;
                }
            } catch (error) {
                console.error('📋 Error reading schema_version:', error);
                return true;
            }

        } catch (error) {
            console.error('📋 Error detecting schema:', error);
            return true; // Default to old schema for safety
        }
    }

    /**
     * Create backup of old database
     * @param {string} oldDbPath - Path to old database file
     * @returns {string|null} Backup file path or null on error
     */
    static createBackup(oldDbPath) {
        try {
            // Create Documents/valot folder
            const documentsPath = GLib.get_user_special_dir(GLib.UserDirectory.DIRECTORY_DOCUMENTS);
            const valotBackupDir = GLib.build_filenamev([documentsPath, 'valot']);
            GLib.mkdir_with_parents(valotBackupDir, 0o755);

            const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
            const originalDbName = GLib.path_get_basename(oldDbPath);
            const backupFileName = `${originalDbName}-backup-${timestamp}.db`;
            const backupPath = GLib.build_filenamev([valotBackupDir, backupFileName]);


            const sourceFile = Gio.File.new_for_path(oldDbPath);
            const backupFile = Gio.File.new_for_path(backupPath);

            sourceFile.copy(backupFile, Gio.FileCopyFlags.OVERWRITE, null, null);

            return backupPath;
        } catch (error) {
            console.error('❌ Backup failed:', error);
            return null;
        }
    }

    /**
     * Perform full migration - Backup & Migrate
     * @param {string} backupDbPath - Path to backup database
     * @param {string} newDbPath - Path to new database (valot.db)
     * @param {string} oldSchemaDbPath - Path to valot.db.db (if exists)
     * @param {boolean} forceOldSchema - Force treating as old schema (skip detection)
     * @param {Function} onProgress - Progress callback (step, total, message)
     * @returns {Promise<boolean>} Success status
     */
    static async performBackupAndMigrate(backupDbPath, newDbPath, oldSchemaDbPath, forceOldSchema = false, onProgress = null) {
        try {
            const { GdaDatabaseBridge } = await import('resource:///com/odnoyko/valot/data/providers/gdaDBBridge/GdaDatabaseBridge.js');

            const totalSteps = 20; // Total progress steps for smooth animation
            let currentStep = 0;

            const updateProgress = async (message) => {
                if (onProgress) {
                    currentStep++;
                    onProgress(currentStep, totalSteps, message);
                    await new Promise(resolve => setTimeout(resolve, 25));
                }
            };

            await updateProgress('Preparing migration...');

            // Rename valot.db.db to temporary name instead of deleting
            const oldSchemaDbFile = Gio.File.new_for_path(oldSchemaDbPath);
            const tempOldPath = `${oldSchemaDbPath}.migrating`;
            const tempOldFile = Gio.File.new_for_path(tempOldPath);

            if (oldSchemaDbFile.query_exists(null)) {
                oldSchemaDbFile.move(tempOldFile, Gio.FileCopyFlags.OVERWRITE, null, null);
            }

            await updateProgress('Cleaning up old files...');

            // Delete valot.db if exists
            const currentDbFile = Gio.File.new_for_path(newDbPath);
            if (currentDbFile.query_exists(null)) {
                currentDbFile.delete(null);
            }

            // Open backup database
            await updateProgress('Opening backup database...');
            const oldDb = new GdaDatabaseBridge();
            oldDb.dbPath = backupDbPath;

            const oldConnString = `DB_DIR=${GLib.path_get_dirname(backupDbPath)};DB_NAME=${GLib.path_get_basename(backupDbPath)}`;
            oldDb.connection = Gda.Connection.open_from_string('SQLite', oldConnString, null, Gda.ConnectionOptions.NONE);
            oldDb.isConnected_ = true;

            await updateProgress('Initializing new database...');

            // Create new database
            await updateProgress('Creating new database...');
            const newDb = new GdaDatabaseBridge();
            await newDb.initialize();

            // Migrate data with sub-progress
            await updateProgress('Starting data migration...');
            const migration = new DatabaseMigration(oldDb, newDb);

            // If forceOldSchema is true, set it before migration
            if (forceOldSchema) {
                migration.isOldSchema = true;
            }

            // Create sub-progress callback
            const subProgressCallback = async (step, total, message) => {
                await updateProgress(message);
            };

            await migration.migrate(subProgressCallback);

            // Close databases - IMPORTANT: close to flush to disk
            await updateProgress('Finalizing migration...');

            // Force commit before close
            try {
                if (newDb.connection && newDb.connection.is_opened()) {
                    // Execute PRAGMA to ensure everything is written
                    newDb.connection.execute_non_select_command('PRAGMA wal_checkpoint(FULL)');
                    newDb.connection.execute_non_select_command('PRAGMA synchronous = FULL');
                }
            } catch (error) {
            }

            await updateProgress('Saving changes...');
            await oldDb.close();
            await newDb.close();

            await updateProgress('Completing...');
            // Give SQLite more time to flush
            await new Promise(resolve => setTimeout(resolve, 500));

            // Verify new database was created
            if (!currentDbFile.query_exists(null)) {
                console.error('❌ New database file was not created!');
                console.error('Expected path:', newDbPath);

                // Check if there are any .db files in directory
                const dir = Gio.File.new_for_path(GLib.path_get_dirname(newDbPath));
                const enumerator = dir.enumerate_children('standard::name', Gio.FileQueryInfoFlags.NONE, null);
                let fileInfo;
                while ((fileInfo = enumerator.next_file(null)) !== null) {
                    const fileName = fileInfo.get_name();
                    if (fileName.endsWith('.db') || fileName.includes('valot')) {
                    }
                }

                // Restore old database if migration failed
                if (tempOldFile.query_exists(null)) {
                    tempOldFile.move(oldSchemaDbFile, Gio.FileCopyFlags.OVERWRITE, null, null);
                }

                return false;
            }

            // Delete temporary old database file
            if (tempOldFile.query_exists(null)) {
                tempOldFile.delete(null);
            }

            return true;

        } catch (error) {
            console.error('❌ Migration failed:', error);
            throw error;
        }
    }

    /**
     * Perform Delete & Start Fresh
     * @param {string} originalDbPath - Path to original database
     * @param {string} backupDbPath - Path to temporary backup
     * @param {string} newDbPath - Path to new database (valot.db)
     * @param {string} oldSchemaDbPath - Path to valot.db.db (if exists)
     * @param {Function} onProgress - Progress callback (step, total, message)
     * @returns {Promise<boolean>} Success status
     */
    static async performDeleteAndStartFresh(originalDbPath, backupDbPath, newDbPath, oldSchemaDbPath, onProgress = null) {
        try {
            if (onProgress) onProgress(1, 4, 'Moving database to Documents...');

            // Create Documents/valot folder
            const documentsPath = GLib.get_user_special_dir(GLib.UserDirectory.DIRECTORY_DOCUMENTS);
            const valotBackupDir = GLib.build_filenamev([documentsPath, 'valot']);
            GLib.mkdir_with_parents(valotBackupDir, 0o755);

            // Move original database to Documents/Valot
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
            const originalDbName = GLib.path_get_basename(originalDbPath);
            const backupFileName = `${originalDbName}-${timestamp}.db`;
            const documentsBackupPath = GLib.build_filenamev([valotBackupDir, backupFileName]);

            const originalDbFile = Gio.File.new_for_path(originalDbPath);
            const documentsBackupFile = Gio.File.new_for_path(documentsBackupPath);

            if (originalDbFile.query_exists(null)) {
                originalDbFile.move(documentsBackupFile, Gio.FileCopyFlags.NONE, null, null);
            }

            if (onProgress) onProgress(2, 4, 'Deleting old databases...');

            // Delete valot.db if exists
            const currentDbFile = Gio.File.new_for_path(newDbPath);
            if (currentDbFile.query_exists(null)) {
                currentDbFile.delete(null);
            }

            // Delete valot.db.db if exists (and not already moved)
            const oldSchemaDbFile = Gio.File.new_for_path(oldSchemaDbPath);
            if (oldSchemaDbFile.query_exists(null)) {
                oldSchemaDbFile.delete(null);
            }

            // Delete temporary backup file
            if (onProgress) onProgress(3, 4, 'Cleaning up...');
            const backupDbFile = Gio.File.new_for_path(backupDbPath);
            if (backupDbFile.query_exists(null)) {
                backupDbFile.delete(null);
            }

            if (onProgress) onProgress(4, 4, 'Ready to create new database...');
            return true;

        } catch (error) {
            console.error('❌ Delete and start fresh failed:', error);
            throw error;
        }
    }

    /**
     * Migrate all data from old schema to new schema
     * @param {Function} onProgress - Progress callback (step, total, message)
     */
    async migrate(onProgress = null) {
        // Detect source schema (only if not already set)
        if (this.isOldSchema === false || this.isOldSchema === true) {
            // Schema already detected, skip
        } else {
            // Detect schema
            this.isOldSchema = await this.detectSchema();
        }

        let steps;

        if (this.isOldSchema) {
            // Old schema (0.8.x) - full migration needed
            steps = [
                { name: 'Migrating Projects', fn: () => this._migrateProjects() },
                { name: 'Migrating Clients', fn: () => this._migrateClients() },
                { name: 'Migrating Tasks', fn: () => this._migrateTasks() },
                { name: 'Creating Task Instances', fn: () => this._createTaskInstances() },
                { name: 'Creating Time Entries', fn: () => this._createTimeEntries() },
                { name: 'Synchronizing total times', fn: () => this._syncTotalTimes() },
            ];
        } else {
            // New schema (0.9.x) - direct copy
            steps = [
                { name: 'Copying Projects', fn: () => this._copyProjects() },
                { name: 'Copying Clients', fn: () => this._copyClients() },
                { name: 'Copying Tasks', fn: () => this._copyTasks() },
                { name: 'Copying Task Instances', fn: () => this._copyTaskInstances() },
                { name: 'Copying Time Entries', fn: () => this._copyTimeEntries() },
                { name: 'Synchronizing total times', fn: () => this._syncTotalTimes() },
            ];
        }

        const total = steps.length;

        try {
            for (let i = 0; i < steps.length; i++) {
                const step = steps[i];

                if (onProgress) {
                    onProgress(i + 1, total, step.name);
                }

                await step.fn();

                // Add small delay to show progress visually (25ms per step)
                await new Promise(resolve => setTimeout(resolve, 25));
            }

            // Set schema version to 2 (0.9.0)
            await this.newDb.setSchemaVersion(2);

            return true;
        } catch (error) {
            console.error('❌ Migration failed:', error);
            throw error;
        }
    }

    /**
     * Migrate Projects table
     */
    async _migrateProjects() {
        // Get all projects from old DB
        const oldProjects = await this.oldDb.query('SELECT * FROM Project');


        for (const project of oldProjects) {
            await this.newDb.execute(
                `INSERT OR IGNORE INTO Project (id, name, color, icon, client_id, total_time, dark_icons, icon_color, icon_color_mode)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    project.id,
                    project.name,
                    project.color || '#cccccc',
                    project.icon || 'folder-symbolic',
                    project.client_id || null,
                    project.total_time || 0,
                    project.dark_icons || 0,
                    project.icon_color || '#cccccc',
                    project.icon_color_mode || 'auto'
                ]
            );
        }

    }

    /**
     * Migrate Clients table
     */
    async _migrateClients() {
        // Get all clients from old DB
        const oldClients = await this.oldDb.query('SELECT * FROM Client');


        for (const client of oldClients) {
            await this.newDb.execute(
                `INSERT OR IGNORE INTO Client (id, name, rate, currency)
                 VALUES (?, ?, ?, ?)`,
                [
                    client.id,
                    client.name,
                    client.rate || 0.0,
                    client.currency || 'USD'
                ]
            );
        }

    }

    /**
     * Migrate Tasks table (only unique task names)
     */
    async _migrateTasks() {
        // Get unique task names from old DB
        const oldTasks = await this.oldDb.query('SELECT DISTINCT name FROM Task');


        for (const task of oldTasks) {
            await this.newDb.execute(
                `INSERT OR IGNORE INTO Task (name)
                 VALUES (?)`,
                [
                    task.name
                ]
            );
        }

    }

    /**
     * Create TaskInstances from old Tasks
     * Old schema: Task had project_id, client_id, time_spent per entry
     * New schema: TaskInstance represents each unique combination of (task_name, project_id, client_id)
     */
    async _createTaskInstances() {
        // Get all old tasks
        const oldTasks = await this.oldDb.query(`
            SELECT
                t.id as old_id,
                t.name,
                t.project_id,
                t.client_id,
                t.time_spent,
                t.start_time,
                t.end_time,
                t.created_at
            FROM Task t
        `);


        for (const oldTask of oldTasks) {
            // Get new Task id by name
            const newTask = await this.newDb.query('SELECT id FROM Task WHERE name = ?', [oldTask.name]);

            if (!newTask || newTask.length === 0) {
                console.warn(`  ⚠️  Task not found: ${oldTask.name}`);
                continue;
            }

            const taskId = newTask[0].id;

            // Create TaskInstance with correct last_used_at from end_time or created_at
            const lastUsedAt = oldTask.end_time || oldTask.created_at || 'datetime(\'now\')';

            const instanceId = await this.newDb.execute(
                `INSERT INTO TaskInstance
                    (task_id, project_id, client_id, total_time, last_used_at, is_favorite)
                 VALUES (?, ?, ?, ?, ?, 0)`,
                [
                    taskId,
                    oldTask.project_id || 1,
                    oldTask.client_id || 1,
                    oldTask.time_spent || 0,
                    lastUsedAt
                ]
            );

            // Store mapping for TimeEntry creation
            if (!this.taskInstanceMap) {
                this.taskInstanceMap = new Map();
            }
            this.taskInstanceMap.set(oldTask.old_id, {
                instanceId: instanceId,
                start_time: oldTask.start_time,
                end_time: oldTask.end_time,
                duration: oldTask.time_spent
            });
        }

    }

    /**
     * Create TimeEntries from old Tasks
     * Old schema had start_time, end_time in Task
     * New schema has TimeEntry table
     */
    async _createTimeEntries() {
        if (!this.taskInstanceMap || this.taskInstanceMap.size === 0) {
            return;
        }


        let count = 0;
        let recoveredCount = 0;

        for (const [oldTaskId, data] of this.taskInstanceMap) {
            let startTime = data.start_time;
            let endTime = data.end_time;
            let duration = data.duration || 0;

            // If we have valid start_time and end_time, use them
            if (startTime && endTime) {
                await this.newDb.execute(
                    `INSERT INTO TimeEntry (task_instance_id, start_time, end_time, duration)
                     VALUES (?, ?, ?, ?)`,
                    [
                        data.instanceId,
                        startTime,
                        endTime,
                        duration
                    ]
                );
                count++;
            }
            // If we don't have time data but have duration > 0, recover the data
            else if (duration > 0) {
                // Get TaskInstance to get last_used_at
                const taskInstance = await this.newDb.query(
                    'SELECT last_used_at FROM TaskInstance WHERE id = ?',
                    [data.instanceId]
                );

                if (taskInstance && taskInstance.length > 0) {
                    const lastUsedAt = taskInstance[0].last_used_at;

                    // Use last_used_at as end_time
                    endTime = lastUsedAt;

                    // Calculate start_time = end_time - duration
                    // Parse the datetime string to calculate start_time
                    const endDate = new Date(lastUsedAt);
                    const startDate = new Date(endDate.getTime() - duration * 1000);

                    // Format as "YYYY-MM-DD HH:MM:SS" (local format)
                    const formatDateTime = (date) => {
                        const year = date.getFullYear();
                        const month = String(date.getMonth() + 1).padStart(2, '0');
                        const day = String(date.getDate()).padStart(2, '0');
                        const hours = String(date.getHours()).padStart(2, '0');
                        const minutes = String(date.getMinutes()).padStart(2, '0');
                        const seconds = String(date.getSeconds()).padStart(2, '0');
                        return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
                    };

                    startTime = formatDateTime(startDate);

                    await this.newDb.execute(
                        `INSERT INTO TimeEntry (task_instance_id, start_time, end_time, duration)
                         VALUES (?, ?, ?, ?)`,
                        [
                            data.instanceId,
                            startTime,
                            endTime,
                            duration
                        ]
                    );

                    recoveredCount++;
                    count++;
                }
            }
        }

    }

    /**
     * Copy Projects from new schema to new schema (direct copy)
     */
    async _copyProjects() {
        const projects = await this.oldDb.query('SELECT * FROM Project');

        for (const project of projects) {
            await this.newDb.execute(
                `INSERT OR IGNORE INTO Project (id, name, color, icon, client_id, total_time, dark_icons, icon_color, icon_color_mode)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    project.id,
                    project.name,
                    project.color,
                    project.icon,
                    project.client_id,
                    project.total_time,
                    project.dark_icons,
                    project.icon_color,
                    project.icon_color_mode
                ]
            );
        }

    }

    /**
     * Copy Clients from new schema to new schema (direct copy)
     */
    async _copyClients() {
        const clients = await this.oldDb.query('SELECT * FROM Client');

        for (const client of clients) {
            await this.newDb.execute(
                `INSERT OR IGNORE INTO Client (id, name, rate, currency)
                 VALUES (?, ?, ?, ?)`,
                [
                    client.id,
                    client.name,
                    client.rate,
                    client.currency
                ]
            );
        }

    }

    /**
     * Copy Tasks from new schema to new schema (direct copy)
     */
    async _copyTasks() {
        const tasks = await this.oldDb.query('SELECT * FROM Task');

        for (const task of tasks) {
            await this.newDb.execute(
                `INSERT OR IGNORE INTO Task (id, name)
                 VALUES (?, ?)`,
                [
                    task.id,
                    task.name
                ]
            );
        }

    }

    /**
     * Copy TaskInstances from new schema to new schema (direct copy)
     */
    async _copyTaskInstances() {
        const instances = await this.oldDb.query('SELECT * FROM TaskInstance');

        for (const instance of instances) {
            await this.newDb.execute(
                `INSERT INTO TaskInstance (id, task_id, project_id, client_id, total_time, last_used_at, is_favorite)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [
                    instance.id,
                    instance.task_id,
                    instance.project_id,
                    instance.client_id,
                    instance.total_time,
                    instance.last_used_at,
                    instance.is_favorite
                ]
            );
        }

    }

    /**
     * Copy TimeEntries from new schema to new schema (direct copy)
     */
    async _copyTimeEntries() {
        const entries = await this.oldDb.query('SELECT * FROM TimeEntry');

        for (const entry of entries) {
            await this.newDb.execute(
                `INSERT INTO TimeEntry (id, task_instance_id, start_time, end_time, duration)
                 VALUES (?, ?, ?, ?, ?)`,
                [
                    entry.id,
                    entry.task_instance_id,
                    entry.start_time,
                    entry.end_time,
                    entry.duration
                ]
            );
        }

    }

    /**
     * Synchronize total_time for all TaskInstances based on actual TimeEntry data
     * This ensures data integrity after migration by recalculating total_time from TimeEntry.duration
     */
    async _syncTotalTimes() {

        // Get count of instances that will be updated
        const instancesWithMismatch = await this.newDb.query(`
            SELECT COUNT(*) as count
            FROM TaskInstance ti
            WHERE ti.total_time != (
                SELECT COALESCE(SUM(duration), 0)
                FROM TimeEntry
                WHERE task_instance_id = ti.id
            )
        `);

        const mismatchCount = instancesWithMismatch[0]?.count || 0;

        if (mismatchCount > 0) {
        }

        // Update all TaskInstance total_time based on sum of TimeEntry durations
        await this.newDb.execute(`
            UPDATE TaskInstance
            SET total_time = (
                SELECT COALESCE(SUM(duration), 0)
                FROM TimeEntry
                WHERE task_instance_id = TaskInstance.id
            )
        `);

    }
}
