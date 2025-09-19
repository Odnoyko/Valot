import Gda from 'gi://Gda?version=6.0';
import GLib from 'gi://GLib';

function openDatabase() {
    const dbPath = GLib.build_filenamev([
        GLib.get_user_data_dir(),
        'valot',
        'valot.db'
    ]);

    // Database will be created at path

    // Ensure directory exists
    GLib.mkdir_with_parents(GLib.path_get_dirname(dbPath), 0o755);

    // SQLite connection string with DB_DIR and DB_NAME format
    const connectionString = `DB_DIR=${GLib.path_get_dirname(dbPath)};DB_NAME=${GLib.path_get_basename(dbPath)}`;
    
    try {
        const connection = Gda.Connection.open_from_string(
            'SQLite',
            connectionString,
            null,
            Gda.ConnectionOptions.NONE
        );
        
        // Database successfully connected
        return connection;
    } catch (error) {
        console.error('Fehler bei der Datenbankverbindung:', error.message);
        throw error;
    }
}

function initDatabase(conn) {
    try {
        // Database schema initializing
        
        // Create Project table
        const createProjectTable = `
            CREATE TABLE IF NOT EXISTS Project (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL UNIQUE,
                color TEXT DEFAULT '#cccccc',
                total_time INTEGER DEFAULT 0
            )`;
        
        executeNonSelectCommand(conn, createProjectTable);
        // Project table created

        // Create Client table
        const createClientTable = `
            CREATE TABLE IF NOT EXISTS Client (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL UNIQUE,
                email TEXT,
                rate REAL DEFAULT 0.0,
                currency TEXT DEFAULT 'USD'
            )`;
        
        executeNonSelectCommand(conn, createClientTable);
        // Client table created

        // Add client_id to Project table if it doesn't exist
        try {
            const alterProjectSql = `ALTER TABLE Project ADD COLUMN client_id INTEGER DEFAULT 1`;
            executeNonSelectCommand(conn, alterProjectSql);
        } catch (error) {
            if (error.message && error.message.includes('duplicate column name')) {
                // client_id column already exists
            } else {
            }
        }

        // Create Task table
        const createTaskTable = `
            CREATE TABLE IF NOT EXISTS Task (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                info TEXT,
                project_id INTEGER NOT NULL DEFAULT 1,
                client_id INTEGER DEFAULT 1,
                time_spent INTEGER DEFAULT 0,
                start_time TEXT,
                end_time TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (project_id) REFERENCES Project(id) ON DELETE CASCADE,
                FOREIGN KEY (client_id) REFERENCES Client(id) ON DELETE SET DEFAULT
            )`;
        
        executeNonSelectCommand(conn, createTaskTable);
        // Task table created

        // Create default project
        const defaultProjectSql = `
            INSERT OR IGNORE INTO Project (id, name, color, total_time)
            VALUES (1, 'Default', '#cccccc', 0)`;
        
        executeNonSelectCommand(conn, defaultProjectSql);
        // Default project created

        // Create default client
        const defaultClientSql = `
            INSERT OR IGNORE INTO Client (id, name, email, rate, currency)
            VALUES (1, 'Default Client', '', 0.0, 'USD')`;
        
        executeNonSelectCommand(conn, defaultClientSql);
        // Default client created

        // Ensure additional columns exist (for existing databases)
        ensureProjectIconColumn(conn);
        ensureDarkIconsColumn(conn);
        ensureIconColorModeColumn(conn);
        ensureClientCurrencyColumn(conn);

        // Database schema successfully initialized

    } catch (error) {
        console.error('Fehler bei der Datenbankinitialisierung:', error);
        throw error;
    }
}

function ensureProjectIconColumn(conn) {
    try {
        const alterSql = `ALTER TABLE Project ADD COLUMN icon TEXT DEFAULT 'folder-symbolic'`;
        executeNonSelectCommand(conn, alterSql);
    } catch (error) {
        // Column already exists, ignore error
        if (error.message && error.message.includes('duplicate column name')) {
            // Icon column already exists
        } else {
        }
    }
}

function ensureDarkIconsColumn(conn) {
    try {
        const alterSql = `ALTER TABLE Project ADD COLUMN dark_icons INTEGER DEFAULT 0`;
        executeNonSelectCommand(conn, alterSql);
    } catch (error) {
        // Column already exists, ignore error
        if (error.message && error.message.includes('duplicate column name')) {
            // dark_icons column already exists
        } else {
        }
    }
}

function ensureIconColorModeColumn(conn) {
    try {
        const alterSql = `ALTER TABLE Project ADD COLUMN icon_color_mode TEXT DEFAULT 'auto'`;
        executeNonSelectCommand(conn, alterSql);
    } catch (error) {
        // Column already exists, ignore error
        if (error.message && error.message.includes('duplicate column name')) {
            // icon_color_mode column already exists
        } else {
        }
    }
}

function ensureClientCurrencyColumn(conn) {
    try {
        // Add currency column if it doesn't exist
        const alterSql = `ALTER TABLE Client ADD COLUMN currency TEXT DEFAULT 'USD'`;
        executeNonSelectCommand(conn, alterSql);
    } catch (error) {
        // Column already exists, ignore error
        if (error.message && error.message.includes('duplicate column name')) {
            // currency column already exists
        } else {
        }
    }
}

export function setupDatabase() {
    try {
        const conn = openDatabase();
        initDatabase(conn);
        return conn;
    } catch (error) {
        console.error('Database setup failed:', error);
        throw error;
    }
}

// Helper function for executing queries
export function executeQuery(conn, sql, params = null) {
    try {
        // Use the direct execution method to avoid GObject type issues
        const result = conn.execute_select_command(sql);
        return result;
    } catch (error) {
        console.error('Query execution failed:', error);
        throw error;
    }
}

// Helper function for executing non-select commands (INSERT, UPDATE, DELETE)
export function executeNonSelectCommand(conn, sql, params = null) {
    // Executing SQL
    
    // Use direct execution method to avoid GObject type issues
    const result = conn.execute_non_select_command(sql);
    // Direct execution result
    return result;
}
