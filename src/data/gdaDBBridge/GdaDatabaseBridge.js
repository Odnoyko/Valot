/**
 * GDA Database Bridge
 * Implements DatabaseAdapter interface using libgda (GJS)
 */

import Gda from 'gi://Gda?version=6.0';
import GLib from 'gi://GLib';

export class GdaDatabaseBridge {
    constructor() {
        this.connection = null;
        this.isConnected_ = false;
        this.dbPath = null;
    }

    /**
     * Initialize database connection
     */
    async initialize() {
        const dbPath = GLib.build_filenamev([
            GLib.get_user_data_dir(),
            'valot',
            'valot.db'
        ]);

        this.dbPath = dbPath;

        // Ensure directory exists
        GLib.mkdir_with_parents(GLib.path_get_dirname(dbPath), 0o755);

        // SQLite connection string
        const connectionString = `DB_DIR=${GLib.path_get_dirname(dbPath)};DB_NAME=${GLib.path_get_basename(dbPath)}`;

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
            // Create schema_version table
            const createSchemaVersionTable = `
                CREATE TABLE IF NOT EXISTS schema_version (
                    version INTEGER PRIMARY KEY,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )`;
            await this.execute(createSchemaVersionTable);

            // Set current schema version (v2 for 0.9.0)
            const currentVersion = await this.getSchemaVersion();
            if (currentVersion === 0) {
                await this.execute('INSERT INTO schema_version (version) VALUES (2)');
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

        } catch (error) {
            console.error('❌ Schema initialization error:', error);
            throw error;
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

            // If no params, execute directly
            if (!params || params.length === 0) {
                dataModel = this.connection.execute_select_command(sql);
            } else {
                // Simple approach: escape and substitute params
                // For SQLite, we can safely escape strings
                let processedSql = sql;
                for (let i = 0; i < params.length; i++) {
                    const value = params[i];
                    let escapedValue;

                    if (value === null || value === undefined) {
                        escapedValue = 'NULL';
                    } else if (typeof value === 'number') {
                        escapedValue = value.toString();
                    } else if (typeof value === 'boolean') {
                        escapedValue = value ? '1' : '0';
                    } else {
                        // Escape string: replace ' with ''
                        escapedValue = "'" + String(value).replace(/'/g, "''") + "'";
                    }

                    // Replace first occurrence of ?
                    processedSql = processedSql.replace('?', escapedValue);
                }

                dataModel = this.connection.execute_select_command(processedSql);
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
                    const value = dataModel.get_value_at(j, i);

                    // Convert GDA value to JavaScript value
                    if (value === null || value === undefined) {
                        row[columnName] = null;
                    } else if (typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean') {
                        // Already a JS primitive (happens when we use escaped params)
                        row[columnName] = value;
                    } else if (typeof value === 'object' && typeof value.get_value_type === 'function') {
                        // GDA Value object
                        const gType = value.get_value_type();
                        if (gType === GLib.TYPE_INT64 || gType === GLib.TYPE_INT) {
                            row[columnName] = value.get_int();
                        } else if (gType === GLib.TYPE_DOUBLE) {
                            row[columnName] = value.get_double();
                        } else if (gType === GLib.TYPE_STRING) {
                            row[columnName] = value.get_string();
                        } else {
                            row[columnName] = value.get_string();
                        }
                    } else {
                        // Fallback: convert to string
                        row[columnName] = String(value);
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
            let processedSql = sql;

            // If params provided, escape and substitute
            if (params && params.length > 0) {
                for (let i = 0; i < params.length; i++) {
                    const value = params[i];
                    let escapedValue;

                    if (value === null || value === undefined) {
                        escapedValue = 'NULL';
                    } else if (typeof value === 'number') {
                        escapedValue = value.toString();
                    } else if (typeof value === 'boolean') {
                        escapedValue = value ? '1' : '0';
                    } else {
                        // Escape string: replace ' with ''
                        escapedValue = "'" + String(value).replace(/'/g, "''") + "'";
                    }

                    // Replace first occurrence of ?
                    processedSql = processedSql.replace('?', escapedValue);
                }
            }

            // Execute
            const result = this.connection.execute_non_select_command(processedSql);

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
            const result = await this.query('SELECT version FROM schema_version ORDER BY version DESC LIMIT 1');
            return result.length > 0 ? result[0].version : 0;
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
        await this.execute('INSERT OR REPLACE INTO schema_version (version) VALUES (?)', [version]);
    }
}
