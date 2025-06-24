import Gda from 'gi://Gda?version=6.0';
import GLib from 'gi://GLib';

function openDatabase() {
    const dbPath = GLib.build_filenamev([
        GLib.get_user_data_dir(),
        'data',
        'db',
        'valot.db'
    ]);

    // Ensure directory exists
    GLib.mkdir_with_parents(GLib.path_get_dirname(dbPath), 0o755);

    // Alternative connection string formats to try:
    // Format 1: Standard SQLite format
    let connectionString = `DB_DIR=${GLib.path_get_dirname(dbPath)};DB_NAME=${GLib.path_get_basename(dbPath)}`;

    try {
        return Gda.Connection.open_from_string(
            'SQLite',
            connectionString,
            null,
            Gda.ConnectionOptions.NONE
        );
    } catch (error) {
        // Format 2: Try direct path if first format fails
        try {
            connectionString = `DATABASE=${dbPath}`;
            return Gda.Connection.open_from_string(
                'SQLite',
                connectionString,
                null,
                Gda.ConnectionOptions.NONE
            );
        } catch (error2) {
            console.error('Failed to open database with both formats:', error, error2);
            throw error2;
        }
    }
}

function initDatabase(conn) {
    const schema = `
        CREATE TABLE IF NOT EXISTS Project (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            color TEXT,
            total_time INTEGER DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS Task (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            info TEXT,
            project_id INTEGER NOT NULL,
            time_spent INTEGER,
            start_time TEXT,
            end_time TEXT,
            FOREIGN KEY (project_id) REFERENCES Project(id) ON DELETE CASCADE
        );
    `;

    try {
        // Split schema into individual statements
        const statements = schema.split(';').filter(stmt => stmt.trim().length > 0);

        for (const statement of statements) {
            const trimmedStatement = statement.trim();

            // Method 1: Try using execute_non_select_command with SQL string directly
            try {
                const result = conn.execute_non_select_command(trimmedStatement);
                if (result === -1) {
                    throw new Error(`Failed to execute SQL: ${trimmedStatement}`);
                }
            } catch (error1) {
                // Method 2: Try using Gda.Statement if Command doesn't work
                try {
                    const parser = Gda.SqlParser.new();
                    const stmt = parser.parse_string(trimmedStatement);
                    if (!stmt) {
                        throw new Error(`Failed to parse SQL: ${trimmedStatement}`);
                    }

                    const result = conn.statement_execute_non_select(stmt, null);
                    if (result === -1) {
                        throw new Error(`Failed to execute parsed statement: ${trimmedStatement}`);
                    }
                } catch (error2) {
                    // Method 3: Try direct SQL execution if available
                    try {
                        const result = conn.execute_sql_command(trimmedStatement);
                        if (!result) {
                            throw new Error(`Failed to execute SQL command: ${trimmedStatement}`);
                        }
                    } catch (error3) {
                        console.error('All methods failed for statement:', trimmedStatement);
                        console.error('Error 1 (execute_non_select_command):', error1);
                        console.error('Error 2 (statement_execute_non_select):', error2);
                        console.error('Error 3 (execute_sql_command):', error3);
                        throw new Error(`Failed to execute SQL statement: ${trimmedStatement}`);
                    }
                }
            }
        }

        console.log('Database schema initialized successfully');

    } catch (error) {
        console.error('Failed to initialize database:', error);
        throw error;
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
        const parser = Gda.SqlParser.new();
        const stmt = parser.parse_string(sql);

        if (!stmt) {
            throw new Error(`Failed to parse SQL: ${sql}`);
        }

        const result = conn.statement_execute_select(stmt, params);
        return result;
    } catch (error) {
        console.error('Query execution failed:', error);
        throw error;
    }
}

// Helper function for executing non-select commands (INSERT, UPDATE, DELETE)
export function executeNonSelectCommand(conn, sql, params = null) {
    try {
        const parser = Gda.SqlParser.new();
        const stmt = parser.parse_string(sql);

        if (!stmt) {
            throw new Error(`Failed to parse SQL: ${sql}`);
        }

        const result = conn.statement_execute_non_select(stmt, params);
        if (result === -1) {
            throw new Error(`Failed to execute command: ${sql}`);
        }

        return result;
    } catch (error) {
        console.error('Non-select command execution failed:', error);
        throw error;
    }
}
