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

            console.log('✅ Database connected successfully');
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

            // Create Task table (template - only name)
            const createTaskTable = `
                CREATE TABLE IF NOT EXISTS Task (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL UNIQUE,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )`;
            await this.execute(createTaskTable);

            // Create TaskInstance table (unique combinations)
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
                    UNIQUE(task_id, project_id, client_id),
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

            console.log('✅ Database schema initialized');
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
            // For now, we don't use params (need to implement prepared statements)
            const dataModel = this.connection.execute_select_command(sql);

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
                    if (value) {
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
            // For now, we don't use params (need to implement prepared statements)
            const result = this.connection.execute_non_select_command(sql);

            // For INSERT, get last insert rowid
            if (sql.trim().toUpperCase().startsWith('INSERT')) {
                const lastIdResult = this.connection.execute_select_command('SELECT last_insert_rowid() as id');
                if (lastIdResult && lastIdResult.get_n_rows() > 0) {
                    const value = lastIdResult.get_value_at(0, 0);
                    return value ? value.get_int() : result;
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
                console.log('✅ Database connection closed');
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
}
