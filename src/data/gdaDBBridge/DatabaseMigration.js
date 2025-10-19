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
     * Detect if source database is old schema (0.8.x) or new schema
     * @returns {Promise<boolean>} True if old schema, false if new schema
     */
    async detectSchema() {
        try {
            // Check table structure using PRAGMA
            const columns = await this.oldDb.query('PRAGMA table_info(Task)');

            // Old schema has project_id, client_id, time_spent columns in Task table
            // New schema has only id, name, created_at, updated_at
            const hasProjectId = columns.some(col => col.name === 'project_id');
            const hasClientId = columns.some(col => col.name === 'client_id');
            const hasTimeSpent = columns.some(col => col.name === 'time_spent');

            if (hasProjectId || hasClientId || hasTimeSpent) {
                console.log('📋 Detected old schema (0.8.x)');
                return true;
            } else {
                console.log('📋 Detected new schema (0.9.x)');
                return false;
            }
        } catch (error) {
            console.error('📋 Error detecting schema:', error);
            console.log('📋 Assuming old schema (0.8.x)');
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
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
            const backupPath = `${oldDbPath}-backup-${timestamp}.db`;

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
     * Migrate all data from old schema to new schema
     * @param {Function} onProgress - Progress callback (step, total, message)
     */
    async migrate(onProgress = null) {
        // Detect source schema
        this.isOldSchema = await this.detectSchema();

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

            // Create TaskInstance
            const instanceId = await this.newDb.execute(
                `INSERT INTO TaskInstance
                    (task_id, project_id, client_id, total_time, last_used_at, is_favorite)
                 VALUES (?, ?, ?, ?, datetime('now'), 0)`,
                [
                    taskId,
                    oldTask.project_id || 1,
                    oldTask.client_id || 1,
                    oldTask.time_spent || 0
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
