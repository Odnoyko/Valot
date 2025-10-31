/**
 * GDA Database Bridge
 * Implements DatabaseAdapter interface using libgda (GJS)
 */

import Gda from 'gi://Gda?version=6.0';
import GLib from 'gi://GLib';
import { Logger } from 'resource:///com/odnoyko/valot/core/utils/Logger.js';

export class GdaDatabaseBridge {
    constructor() {
        this.connection = null;
        this.isConnected_ = false;
        this.dbPath = null;
    }

    /**
     * Initialize database connection
     * @param {string|null} customDbPath - Optional absolute path to a SQLite .db file
     */
    async initialize(customDbPath = null) {
        const dbPath = customDbPath || GLib.build_filenamev([
            GLib.get_user_data_dir(),
            'valot',
            'valot.db'
        ]);

        this.dbPath = dbPath;

        // Ensure directory exists for local paths
        try {
        GLib.mkdir_with_parents(GLib.path_get_dirname(dbPath), 0o755);
        } catch (e) {
            // Ignore if path is not creatable (e.g., read-only or external file)
        }

        // SQLite connection string - use basename WITHOUT extension, GDA adds .db automatically
        const dbName = GLib.path_get_basename(dbPath).replace('.db', '');
        const connectionString = `DB_DIR=${GLib.path_get_dirname(dbPath)};DB_NAME=${dbName}`;

        try {
            this.connection = Gda.Connection.open_from_string(
                'SQLite',
                connectionString,
                null,
                Gda.ConnectionOptions.NONE
            );

            this.isConnected_ = true;

            // Initialize schema
            await this._initSchema();

        } catch (error) {
            console.error('❌ Database connection error:', error.message);
            throw error;
        }
    }

    /**
     * Initialize database schema
     */
    async _initSchema() {
        try {
            // Create _metadata table for storing app metadata
            const createMetadataTable = `
                CREATE TABLE IF NOT EXISTS _metadata (
                    key TEXT PRIMARY KEY,
                    value TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )`;
            await this.execute(createMetadataTable);

            // Set current schema version (v2 for 0.9.0)
            const currentVersion = await this.getSchemaVersion();
            if (currentVersion === 0) {
                await this.execute("INSERT OR IGNORE INTO _metadata (key, value) VALUES ('schema_version', '2')");
                await this.execute("INSERT OR IGNORE INTO _metadata (key, value) VALUES ('app_version', '0.9.0')");
            }

            // Create Project table
            const createProjectTable = `
                CREATE TABLE IF NOT EXISTS Project (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL UNIQUE,
                    color TEXT DEFAULT '#cccccc',
                    icon TEXT DEFAULT 'folder-symbolic',
                    client_id INTEGER,
                    total_time INTEGER DEFAULT 0,
                    dark_icons INTEGER DEFAULT 0,
                    icon_color TEXT DEFAULT '#cccccc',
                    icon_color_mode TEXT DEFAULT 'auto',
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )`;
            await this.execute(createProjectTable);

            // Insert default project (ID = 1)
            const insertDefaultProject = `
                INSERT OR IGNORE INTO Project (id, name, color, icon)
                VALUES (1, 'Default', '#3584e4', 'folder-symbolic')`;
            await this.execute(insertDefaultProject);

            // Create Client table
            const createClientTable = `
                CREATE TABLE IF NOT EXISTS Client (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL UNIQUE,
                    rate REAL DEFAULT 0.0,
                    currency TEXT DEFAULT 'USD',
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )`;
            await this.execute(createClientTable);

            // Insert default client (ID = 1)
            const insertDefaultClient = `
                INSERT OR IGNORE INTO Client (id, name, rate, currency)
                VALUES (1, 'Default Client', 0.0, 'USD')`;
            await this.execute(insertDefaultClient);

            // Create Task table (template - only name)
            const createTaskTable = `
                CREATE TABLE IF NOT EXISTS Task (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL UNIQUE,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )`;
            await this.execute(createTaskTable);

            // Create TaskInstance table (tracking sessions)
            const createTaskInstanceTable = `
                CREATE TABLE IF NOT EXISTS TaskInstance (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    task_id INTEGER NOT NULL,
                    project_id INTEGER,
                    client_id INTEGER,
                    total_time INTEGER DEFAULT 0,
                    last_used_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    is_favorite INTEGER DEFAULT 0,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (task_id) REFERENCES Task(id) ON DELETE CASCADE,
                    FOREIGN KEY (project_id) REFERENCES Project(id) ON DELETE CASCADE,
                    FOREIGN KEY (client_id) REFERENCES Client(id) ON DELETE CASCADE
                )`;
            await this.execute(createTaskInstanceTable);

            // Create TimeEntry table
            const createTimeEntryTable = `
                CREATE TABLE IF NOT EXISTS TimeEntry (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    task_instance_id INTEGER NOT NULL,
                    start_time TEXT NOT NULL,
                    end_time TEXT,
                    duration INTEGER DEFAULT 0,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (task_instance_id) REFERENCES TaskInstance(id) ON DELETE CASCADE
                )`;
            await this.execute(createTimeEntryTable);

            // Apply indices and integrity constraints/migrations
            await this._applyIndicesAndConstraints();

        } catch (error) {
            console.error('❌ Schema initialization error:', error);
            throw error;
        }
    }

    /**
     * Create indices, triggers and apply light migrations for integrity.
     * - Indices for common queries
     * - Trigger to ensure only one active entry (end_time IS NULL) per task_instance
     * - Schema version bump to 3 when applied
     */
    async _applyIndicesAndConstraints() {
        const version = await this.getSchemaVersion();

        // For fresh installs (version == 0) also try to enforce CHECK via recreate is skipped; rely on triggers.

        // Indices (idempotent)
        await this.execute(`CREATE INDEX IF NOT EXISTS idx_timeentry_task_start ON TimeEntry(task_instance_id, start_time)`);
        await this.execute(`CREATE INDEX IF NOT EXISTS idx_taskinstance_task_proj_client ON TaskInstance(task_id, project_id, client_id)`);

        // Repair data before enabling constraints: close extra active entries per task_instance
        await this._repairMultipleActiveEntries();
        // Repair invalid time intervals and durations
        await this._repairInvalidTimeIntervals();
        await this._normalizeDurations();

        // Note: Triggers are disabled due to libgda parsing issues with BEGIN/END blocks
        // Integrity is enforced at application level (TimeTrackingService ensures single active entry)
        // Database-level triggers would be ideal but libgda cannot parse them correctly

        // Bump schema version if needed
        if (version < 4) {
            await this.setSchemaVersion(4);
        }
    }

    /**
     * Close extra active entries: if multiple rows have end_time IS NULL for the same task_instance_id,
     * keep the latest by start_time as active, close others with end_time = start_time and duration = 0.
     */
    async _repairMultipleActiveEntries() {
        // Find task_instance_ids with more than one active entry
        const rows = await this.query(`
            SELECT task_instance_id
            FROM TimeEntry
            WHERE end_time IS NULL
            GROUP BY task_instance_id
            HAVING COUNT(1) > 1
        `);

        for (const row of rows) {
            const taskInstanceId = row.task_instance_id;
            const actives = await this.query(
                `SELECT id, start_time FROM TimeEntry WHERE task_instance_id = ? AND end_time IS NULL ORDER BY start_time DESC`,
                [taskInstanceId]
            );
            if (!actives || actives.length <= 1) continue;

            // Keep the most recent as the only active
            const [keep, ...close] = actives;
            for (const c of close) {
                await this.execute(
                    `UPDATE TimeEntry SET end_time = start_time, duration = 0 WHERE id = ?`,
                    [c.id]
                );
            }
        }
    }

    /**
     * Repair invalid time intervals where end_time <= start_time.
     * Strategy: set end_time = start_time and duration = 0 to mark as zero-length completed entries.
     */
    async _repairInvalidTimeIntervals() {
        // Find invalid rows
        const rows = await this.query(`
            SELECT id FROM TimeEntry
            WHERE end_time IS NOT NULL AND start_time IS NOT NULL AND end_time <= start_time
        `);
        for (const row of rows) {
            await this.execute(
                `UPDATE TimeEntry SET end_time = start_time, duration = 0 WHERE id = ?`,
                [row.id]
            );
        }
    }

    /**
     * Normalize durations: if end_time IS NOT NULL and duration is NULL/negative, recalculate as max(0, end-start) in seconds.
     * If end_time IS NULL (active), leave duration as-is (should be 0 for active rows in our model).
     */
    async _normalizeDurations() {
        // Select rows with end_time and invalid/missing duration
        const rows = await this.query(`
            SELECT id, start_time, end_time, duration FROM TimeEntry
            WHERE end_time IS NOT NULL AND (duration IS NULL OR duration < 0)
        `);
        for (const row of rows) {
            const start = row.start_time;
            const end = row.end_time;
            if (!start || !end) continue;
            // SQLite datetime difference in seconds
            await this.execute(
                `UPDATE TimeEntry SET duration = CAST((strftime('%s', end_time) - strftime('%s', start_time)) AS INTEGER)
                 WHERE id = ?`,
                [row.id]
            );
            // Ensure non-negative
            await this.execute(
                `UPDATE TimeEntry SET duration = 0 WHERE id = ? AND duration < 0`,
                [row.id]
            );
        }
    }

    /**
     * Execute a SELECT query
     */
    async query(sql, params = []) {
        if (!this.connection) {
            throw new Error('Database not connected');
        }

        try {
            let dataModel;
            if (!params || params.length === 0) {
                dataModel = this.connection.execute_select_command(sql);
            } else {
                dataModel = this._executeSelectPrepared(sql, params);
            }

            if (!dataModel) {
                return [];
            }

            // Convert Gda.DataModel to array of objects
            const results = [];
            const nRows = dataModel.get_n_rows();
            const nCols = dataModel.get_n_columns();

            for (let i = 0; i < nRows; i++) {
                const row = {};
                for (let j = 0; j < nCols; j++) {
                    const columnName = dataModel.get_column_name(j);
                    let value;
                    try {
                        value = dataModel.get_value_at(j, i);
                    } catch (e) {
                        // If libgda throws for special NULL typed values, store null and continue
                        row[columnName] = null;
                        continue;
                    }

                    try {
                        // Convert GDA value to JavaScript value
                        if (value === null || value === undefined) {
                            row[columnName] = null;
                        } else if (typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean') {
                            // Already a JS primitive (happens when we use escaped params)
                            row[columnName] = value;
                        } else if (typeof value === 'object') {
                            // Some GDA values expose helpers, guard all calls
                            if (typeof value.is_null === 'function' && value.is_null()) {
                                row[columnName] = null;
                            } else if (typeof value.get_value_type === 'function') {
                                const gType = value.get_value_type();
                                if (gType === GLib.TYPE_INT64 || gType === GLib.TYPE_INT) {
                                    row[columnName] = value.get_int();
                                } else if (gType === GLib.TYPE_DOUBLE) {
                                    row[columnName] = value.get_double();
                                } else if (gType === GLib.TYPE_STRING) {
                                    row[columnName] = value.get_string();
                                } else {
                                    // Best effort string fallback
                                    row[columnName] = (typeof value.get_string === 'function') ? value.get_string() : null;
                                }
                            } else {
                                // Unknown object – best effort stringify
                                row[columnName] = String(value);
                            }
                        } else {
                            // Fallback: convert to string
                            row[columnName] = String(value);
                        }
                    } catch (e) {
                        // Any failure decoding a cell → treat as NULL
                        row[columnName] = null;
                    }
                }
                results.push(row);
            }

            return results;
        } catch (error) {
            console.error('❌ Query error:', sql, error);
            throw error;
        }
    }

    /**
     * Execute an INSERT/UPDATE/DELETE query
     * Returns last insert ID for INSERT, affected rows for UPDATE/DELETE
     */
    async execute(sql, params = []) {
        if (!this.connection) {
            throw new Error('Database not connected');
        }

        try {
            // Execute (prepared when params provided)
            const result = (params && params.length > 0)
                ? this._executeNonSelectPrepared(sql, params)
                : this.connection.execute_non_select_command(sql);

            // For INSERT, get last insert rowid
            if (sql.trim().toUpperCase().startsWith('INSERT')) {
                const lastIdResult = this.connection.execute_select_command('SELECT last_insert_rowid() as id');
                if (lastIdResult && lastIdResult.get_n_rows() > 0) {
                    const value = lastIdResult.get_value_at(0, 0);

                    if (value !== null && value !== undefined) {
                        // After escaped params, GDA returns JS primitives
                        if (typeof value === 'number') {
                            return value;
                        } else if (typeof value === 'string') {
                            return parseInt(value) || result;
                        } else if (typeof value === 'object' && typeof value.get_int === 'function') {
                            // GDA Value object
                            return value.get_int();
                        } else {
                            // Fallback
                            return parseInt(String(value)) || result;
                        }
                    }
                    return result;
                }
            }

            return result;
        } catch (error) {
            console.error('❌ Execute error:', sql, error);
            throw error;
        }
    }

    /**
     * Execute a prepared SELECT using Gda.Statement and holders.
     */
    _executeSelectPrepared(sql, params) {
        try {
            const stmt = this.connection.parse_sentence(sql, null, null);
            const prep = this.connection.prepare_statement(stmt);
            const holders = prep.get_parameters();
            if (holders) {
                for (let i = 0; i < params.length; i++) {
                    const holder = holders.get_holder(i);
                    if (!holder) continue;
                    this._bindHolder(holder, params[i]);
                }
            }
            return this.connection.statement_execute_select(prep, null);
        } catch (e) {
            // Fallback to manual substitution if prepare not supported
            let processed = sql;
            for (let i = 0; i < params.length; i++) {
                const v = params[i];
                const esc = (v === null || v === undefined) ? 'NULL' :
                    (typeof v === 'number') ? String(v) :
                    (typeof v === 'boolean') ? (v ? '1' : '0') :
                    "'" + String(v).replace(/'/g, "''") + "'";
                processed = processed.replace('?', esc);
            }
            return this.connection.execute_select_command(processed);
        }
    }

    /**
     * Execute a prepared non-SELECT statement.
     */
    _executeNonSelectPrepared(sql, params) {
        try {
            const stmt = this.connection.parse_sentence(sql, null, null);
            const prep = this.connection.prepare_statement(stmt);
            const holders = prep.get_parameters();
            if (holders) {
                for (let i = 0; i < params.length; i++) {
                    const holder = holders.get_holder(i);
                    if (!holder) continue;
                    this._bindHolder(holder, params[i]);
                }
            }
            return this.connection.statement_execute_non_select(prep, null);
        } catch (e) {
            // Fallback to manual substitution
            let processed = sql;
            for (let i = 0; i < params.length; i++) {
                const v = params[i];
                const esc = (v === null || v === undefined) ? 'NULL' :
                    (typeof v === 'number') ? String(v) :
                    (typeof v === 'boolean') ? (v ? '1' : '0') :
                    "'" + String(v).replace(/'/g, "''") + "'";
                processed = processed.replace('?', esc);
            }
            return this.connection.execute_non_select_command(processed);
        }
    }

    _bindHolder(holder, value) {
        try {
            if (value === null || value === undefined) {
                holder.set_value(null);
            } else if (typeof value === 'number') {
                holder.set_value(value);
            } else if (typeof value === 'boolean') {
                holder.set_value(value ? 1 : 0);
            } else {
                holder.set_value(String(value));
            }
        } catch (e) {
            // Best-effort fallback
            holder.set_value(String(value));
        }
    }

    /**
     * Begin a transaction
     */
    async beginTransaction() {
        if (!this.connection) {
            throw new Error('Database not connected');
        }

        try {
            this.connection.begin_transaction(null, Gda.TransactionIsolation.REPEATABLE_READ);
        } catch (error) {
            console.error('❌ Begin transaction error:', error);
            throw error;
        }
    }

    /**
     * Commit a transaction
     */
    async commit() {
        if (!this.connection) {
            throw new Error('Database not connected');
        }

        try {
            this.connection.commit_transaction(null);
        } catch (error) {
            console.error('❌ Commit error:', error);
            throw error;
        }
    }

    /**
     * Rollback a transaction
     */
    async rollback() {
        if (!this.connection) {
            throw new Error('Database not connected');
        }

        try {
            this.connection.rollback_transaction(null);
        } catch (error) {
            console.error('❌ Rollback error:', error);
            throw error;
        }
    }

    /**
     * Close database connection
     */
    async close() {
        if (this.connection) {
            try {
                this.connection.close();
                this.connection = null;
                this.isConnected_ = false;
            } catch (error) {
                console.error('❌ Close error:', error);
            }
        }
    }

    /**
     * Check if database is connected
     */
    isConnected() {
        return this.isConnected_;
    }

    /**
     * Get raw connection (for legacy code compatibility)
     */
    getConnection() {
        return this.connection;
    }

    /**
     * Get current schema version
     * @returns {Promise<number>} Schema version (0 if not found)
     */
    async getSchemaVersion() {
        try {
            const result = await this.query("SELECT value FROM _metadata WHERE key = 'schema_version'");
            return result.length > 0 ? parseInt(result[0].value) : 0;
        } catch (error) {
            // Table doesn't exist or error - assume version 0
            return 0;
        }
    }

    /**
     * Set schema version
     * @param {number} version - Schema version number
     */
    async setSchemaVersion(version) {
        await this.execute("INSERT OR REPLACE INTO _metadata (key, value) VALUES ('schema_version', ?)", [version.toString()]);
    }

    /**
     * Get metadata value by key
     * @param {string} key - Metadata key
     * @returns {Promise<string|null>} Metadata value or null
     */
    async getMetadata(key) {
        try {
            const result = await this.query("SELECT value FROM _metadata WHERE key = ?", [key]);
            return result.length > 0 ? result[0].value : null;
        } catch (error) {
            return null;
        }
    }

    /**
     * Set metadata value
     * @param {string} key - Metadata key
     * @param {string} value - Metadata value
     */
    async setMetadata(key, value) {
        await this.execute("INSERT OR REPLACE INTO _metadata (key, value) VALUES (?, ?)", [key, value]);
    }
}
