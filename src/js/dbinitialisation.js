import Gda from 'gi://Gda?version=6.0';
import GLib from 'gi://GLib';

function openDatabase() {
    const dbPath = GLib.build_filenamev([
        GLib.get_user_data_dir(),
        'valot',
        'valot.db'
    ]);

    console.log(`Datenbank wird erstellt unter Pfad: ${dbPath}`);

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
        
        console.log("Datenbank erfolgreich verbunden");
        return connection;
    } catch (error) {
        console.error('Fehler bei der Datenbankverbindung:', error.message);
        throw error;
    }
}

function initDatabase(conn) {
    try {
        console.log("Datenbankschema wird initialisiert...");
        
        // Create Project table
        const createProjectTable = `
            CREATE TABLE IF NOT EXISTS Project (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL UNIQUE,
                color TEXT DEFAULT '#cccccc',
                total_time INTEGER DEFAULT 0
            )`;
        
        executeNonSelectCommand(conn, createProjectTable);
        console.log("Tabelle Project erstellt");

        // Create Task table
        const createTaskTable = `
            CREATE TABLE IF NOT EXISTS Task (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                info TEXT,
                project_id INTEGER NOT NULL DEFAULT 1,
                time_spent INTEGER DEFAULT 0,
                start_time TEXT,
                end_time TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (project_id) REFERENCES Project(id) ON DELETE CASCADE
            )`;
        
        executeNonSelectCommand(conn, createTaskTable);
        console.log("Tabelle Task erstellt");

        // Create default project
        const defaultProjectSql = `
            INSERT OR IGNORE INTO Project (id, name, color, total_time)
            VALUES (1, 'Default', '#cccccc', 0)`;
        
        executeNonSelectCommand(conn, defaultProjectSql);
        console.log("Standard-Projekt erstellt");

        console.log('Datenbankschema erfolgreich initialisiert');

    } catch (error) {
        console.error('Fehler bei der Datenbankinitialisierung:', error);
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
    console.log("SQL ausführen:", sql);
    
    // Use direct execution method to avoid GObject type issues
    const result = conn.execute_non_select_command(sql);
    console.log("Direktes Ausführungsergebnis:", result);
    return result;
}
