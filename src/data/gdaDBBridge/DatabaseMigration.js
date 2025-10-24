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
                console.log('📋 Detected old schema (0.8.x) - no _metadata table');
                return true;
            }

            // _metadata table exists - check schema_version
            try {
                const versionResult = await this.oldDb.query(
                    "SELECT value FROM _metadata WHERE key = 'schema_version'"
                );

                if (versionResult.length === 0) {
                    // No schema_version in _metadata → Old schema
                    console.log('📋 Detected old schema - no schema_version in _metadata');
                    return true;
                }

                const version = parseInt(versionResult[0].value);

                if (version >= 2) {
                    // New schema with version 2 or higher
                    console.log(`📋 Detected new schema (v${version}) - no migration needed`);
                    return false;
                } else {
                    // Old version
                    console.log(`📋 Detected old schema (v${version}) - needs migration`);
                    return true;
                }
            } catch (error) {
                console.error('📋 Error reading schema_version:', error);
                console.log('📋 Assuming old schema');
                return true;
            }

        } catch (error) {
            console.error('📋 Error detecting schema:', error);
            console.log('📋 Assuming old schema (0.8.x) for safety');
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

            console.log(`💾 Creating backup: ${backupPath}`);

            const sourceFile = Gio.File.new_for_path(oldDbPath);
            const backupFile = Gio.File.new_for_path(backupPath);

            sourceFile.copy(backupFile, Gio.FileCopyFlags.OVERWRITE, null, null);

            console.log(`✅ Backup created successfully`);
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
            const { GdaDatabaseBridge } = await import('resource:///com/odnoyko/valot/data/gdaDBBridge/GdaDatabaseBridge.js');

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
                console.log('📦 Renamed valot.db.db to .migrating');
            }

            await updateProgress('Cleaning up old files...');

            // Delete valot.db if exists
            const currentDbFile = Gio.File.new_for_path(newDbPath);
            if (currentDbFile.query_exists(null)) {
                currentDbFile.delete(null);
                console.log('🗑️ Deleted existing valot.db');
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
            console.log(`📂 New database created at: ${newDb.dbPath}`);

            // Migrate data with sub-progress
            await updateProgress('Starting data migration...');
            const migration = new DatabaseMigration(oldDb, newDb);

            // If forceOldSchema is true, set it before migration
            if (forceOldSchema) {
                migration.isOldSchema = true;
                console.log('🔧 Forcing old schema migration (0.8.x → 0.9.x)');
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
                console.log('Note: Could not execute PRAGMA commands:', error.message);
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
                console.log('Files in directory:');
                while ((fileInfo = enumerator.next_file(null)) !== null) {
                    const fileName = fileInfo.get_name();
                    if (fileName.endsWith('.db') || fileName.includes('valot')) {
                        console.log('  -', fileName);
                    }
                }

                // Restore old database if migration failed
                if (tempOldFile.query_exists(null)) {
                    tempOldFile.move(oldSchemaDbFile, Gio.FileCopyFlags.OVERWRITE, null, null);
                    console.log('🔄 Restored valot.db.db after failed migration');
                }

                return false;
            }

            // Delete temporary old database file
            if (tempOldFile.query_exists(null)) {
                tempOldFile.delete(null);
                console.log('🗑️ Deleted temporary .migrating file');
            }

            console.log(`✅ Migration completed - backup saved at: ${backupDbPath}`);
            console.log(`✅ New database created: ${newDbPath}`);
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
                console.log(`📦 Moved original database to: ${documentsBackupPath}`);
            }

            if (onProgress) onProgress(2, 4, 'Deleting old databases...');

            // Delete valot.db if exists
            const currentDbFile = Gio.File.new_for_path(newDbPath);
            if (currentDbFile.query_exists(null)) {
                currentDbFile.delete(null);
                console.log('🗑️ Deleted existing valot.db');
            }

            // Delete valot.db.db if exists (and not already moved)
            const oldSchemaDbFile = Gio.File.new_for_path(oldSchemaDbPath);
            if (oldSchemaDbFile.query_exists(null)) {
                oldSchemaDbFile.delete(null);
                console.log('🗑️ Deleted existing valot.db.db');
            }

            // Delete temporary backup file
            if (onProgress) onProgress(3, 4, 'Cleaning up...');
            const backupDbFile = Gio.File.new_for_path(backupDbPath);
            if (backupDbFile.query_exists(null)) {
                backupDbFile.delete(null);
                console.log('🗑️ Deleted temporary backup');
            }

            if (onProgress) onProgress(4, 4, 'Ready to create new database...');
            console.log(`✅ Old database saved to: ${documentsBackupPath}`);
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
            console.log(`📋 Using pre-detected schema: ${this.isOldSchema ? 'Old (0.8.x)' : 'New (0.9.x)'}`);
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
            ];
        } else {
            // New schema (0.9.x) - direct copy
            steps = [
                { name: 'Copying Projects', fn: () => this._copyProjects() },
                { name: 'Copying Clients', fn: () => this._copyClients() },
                { name: 'Copying Tasks', fn: () => this._copyTasks() },
                { name: 'Copying Task Instances', fn: () => this._copyTaskInstances() },
                { name: 'Copying Time Entries', fn: () => this._copyTimeEntries() },
            ];
        }

        const total = steps.length;

        try {
            for (let i = 0; i < steps.length; i++) {
                const step = steps[i];

                if (onProgress) {
                    onProgress(i + 1, total, step.name);
                }

                console.log(`🔄 ${step.name}...`);
                await step.fn();
                console.log(`✅ ${step.name} completed`);

                // Add small delay to show progress visually (25ms per step)
                await new Promise(resolve => setTimeout(resolve, 25));
            }

            // Set schema version to 2 (0.9.0)
            await this.newDb.setSchemaVersion(2);
            console.log('✅ Schema version updated to 2');

            console.log('✅ Migration completed successfully');
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

        console.log(`  → Found ${oldProjects.length} projects`);

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

        console.log(`  ✓ Migrated ${oldProjects.length} projects`);
    }

    /**
     * Migrate Clients table
     */
    async _migrateClients() {
        // Get all clients from old DB
        const oldClients = await this.oldDb.query('SELECT * FROM Client');

        console.log(`  → Found ${oldClients.length} clients`);

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

        console.log(`  ✓ Migrated ${oldClients.length} clients`);
    }

    /**
     * Migrate Tasks table (only unique task names)
     */
    async _migrateTasks() {
        // Get unique task names from old DB
        const oldTasks = await this.oldDb.query('SELECT DISTINCT name FROM Task');

        console.log(`  → Found ${oldTasks.length} unique tasks`);

        for (const task of oldTasks) {
            await this.newDb.execute(
                `INSERT OR IGNORE INTO Task (name)
                 VALUES (?)`,
                [
                    task.name
                ]
            );
        }

        console.log(`  ✓ Migrated ${oldTasks.length} unique tasks`);
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

        console.log(`  → Creating TaskInstances from ${oldTasks.length} old tasks`);

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

        console.log(`  ✓ Created ${oldTasks.length} task instances`);
    }

    /**
     * Create TimeEntries from old Tasks
     * Old schema had start_time, end_time in Task
     * New schema has TimeEntry table
     */
    async _createTimeEntries() {
        if (!this.taskInstanceMap || this.taskInstanceMap.size === 0) {
            console.log('  → No task instances to create time entries for');
            return;
        }

        console.log(`  → Creating TimeEntries for ${this.taskInstanceMap.size} task instances`);

        let count = 0;
        for (const [oldTaskId, data] of this.taskInstanceMap) {
            // Only create TimeEntry if we have valid start_time and end_time
            if (data.start_time && data.end_time) {
                await this.newDb.execute(
                    `INSERT INTO TimeEntry (task_instance_id, start_time, end_time, duration)
                     VALUES (?, ?, ?, ?)`,
                    [
                        data.instanceId,
                        data.start_time,
                        data.end_time,
                        data.duration || 0
                    ]
                );
                count++;
            }
        }

        console.log(`  ✓ Created ${count} time entries`);
    }

    /**
     * Copy Projects from new schema to new schema (direct copy)
     */
    async _copyProjects() {
        const projects = await this.oldDb.query('SELECT * FROM Project');
        console.log(`  → Found ${projects.length} projects`);

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

        console.log(`  ✓ Copied ${projects.length} projects`);
    }

    /**
     * Copy Clients from new schema to new schema (direct copy)
     */
    async _copyClients() {
        const clients = await this.oldDb.query('SELECT * FROM Client');
        console.log(`  → Found ${clients.length} clients`);

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

        console.log(`  ✓ Copied ${clients.length} clients`);
    }

    /**
     * Copy Tasks from new schema to new schema (direct copy)
     */
    async _copyTasks() {
        const tasks = await this.oldDb.query('SELECT * FROM Task');
        console.log(`  → Found ${tasks.length} tasks`);

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

        console.log(`  ✓ Copied ${tasks.length} tasks`);
    }

    /**
     * Copy TaskInstances from new schema to new schema (direct copy)
     */
    async _copyTaskInstances() {
        const instances = await this.oldDb.query('SELECT * FROM TaskInstance');
        console.log(`  → Found ${instances.length} task instances`);

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

        console.log(`  ✓ Copied ${instances.length} task instances`);
    }

    /**
     * Copy TimeEntries from new schema to new schema (direct copy)
     */
    async _copyTimeEntries() {
        const entries = await this.oldDb.query('SELECT * FROM TimeEntry');
        console.log(`  → Found ${entries.length} time entries`);

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

        console.log(`  ✓ Copied ${entries.length} time entries`);
    }
}
