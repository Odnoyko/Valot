import Gio from 'gi://Gio';
import { executeNonSelectCommand } from 'resource:///com/odnoyko/valot/js/dbinitialisation.js';
import { InputValidator } from 'resource:///com/odnoyko/valot/js/global/inputValidation.js';

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
    
    // Validate task name
    const nameValidation = InputValidator.validateTaskName(name);
    if (!nameValidation.valid) {
      console.error('Task name validation failed:', nameValidation.error);
      return false;
    }
    
    // Validate project name if provided
    if (project) {
      const projectValidation = InputValidator.validateProjectName(project);
      if (!projectValidation.valid) {
        console.error('Project name validation failed:', projectValidation.error);
        return false;
      }
    }
    
    // Validate project ID
    const projectIdValidation = InputValidator.validateNumber(projectId, 1);
    if (!projectIdValidation.valid) {
      console.error('Project ID validation failed:', projectIdValidation.error);
      return false;
    }
    
    // Validate spent seconds
    const timeValidation = InputValidator.validateNumber(spentSeconds, 0);
    if (!timeValidation.valid) {
      console.error('Time validation failed:', timeValidation.error);
      return false;
    }
    
    // Validate client ID if provided
    let safeClientId = 1; // Default
    if (context?.client?.id) {
      const clientIdValidation = InputValidator.validateNumber(context.client.id, 1);
      if (!clientIdValidation.valid) {
        console.error('Client ID validation failed:', clientIdValidation.error);
        return false;
      }
      safeClientId = clientIdValidation.sanitized;
    }
    
    const conn = getDbConnection();
    
    // Use sanitized values
    const safeName = nameValidation.sanitized;
    const safeProjectId = projectIdValidation.sanitized;
    const safeSpentSeconds = timeValidation.sanitized;
    
    // Use secure SQL with sanitized inputs
    const sql = `
      INSERT INTO Task (name, project_id, client_id, start_time, end_time, time_spent, created_at)
      VALUES ('${InputValidator.sanitizeForSQL(safeName)}', ${safeProjectId}, ${safeClientId}, '${startTime}', '${endTime}', ${safeSpentSeconds}, CURRENT_TIMESTAMP)
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
