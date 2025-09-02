import Gio from 'gi://Gio';
import { executeNonSelectCommand } from 'resource:///com/odnoyko/valot/js/dbinitialisation.js';

// Get connection from main app
let dbConnection = null;

function getDbConnection() {
  if (!dbConnection) {
    // Get connection from main application
    const app = Gio.Application.get_default();
    if (app && app.database_connection) {
      dbConnection = app.database_connection;
      console.log("Datenbank aus Anwendung erhalten");
    } else {
      console.error("Datenbank in der Anwendung nicht gefunden");
      throw new Error("Database connection not found");
    }
  }
  return dbConnection;
}

export function saveTask(name, project, startTime, endTime, spentSeconds, projectId = 1, context = null) {
  try {
    console.log(`=== Aufgabe speichern ===`);
    console.log(`Name: ${name}`);
    console.log(`Projekt: ${project}`); 
    console.log(`Beginn: ${startTime}`);
    console.log(`Ende: ${endTime}`);
    console.log(`Verbrachte Zeit: ${spentSeconds} Sekunden`);
    
    if (context) {
      console.log(`Client: ${context.client?.name} (ID: ${context.client?.id})`);
      console.log(`Currency: ${context.currency?.symbol} ${context.currency?.code}`);
    }
    
    const conn = getDbConnection();
    
    // Escape single quotes to prevent SQL errors
    const escapedName = name.replace(/'/g, "''");
    
    // Direct SQL without complex parameters for now
    const clientId = context?.client?.id || 1; // Default to client ID 1
    const sql = `
      INSERT INTO Task (name, project_id, client_id, start_time, end_time, time_spent, created_at)
      VALUES ('${escapedName}', ${projectId}, ${clientId}, '${startTime}', '${endTime}', ${spentSeconds}, CURRENT_TIMESTAMP)
    `;

    console.log("SQL-Abfrage:", sql);
    
    const result = executeNonSelectCommand(conn, sql, null);
    console.log("✅ Aufgabe erfolgreich gespeichert, Ergebnis:", result);
    
    return result;
    
  } catch (error) {
    console.error("❌ Fehler beim Speichern der Aufgabe:", error.message);
    console.error("Stack-Trace:", error.stack);
    throw error;
  }
}
