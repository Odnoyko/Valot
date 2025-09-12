import Gio from 'gi://Gio';
import { executeQuery, executeNonSelectCommand, setupDatabase } from 'resource:///com/odnoyko/valot/js/func/global/dbinitialisation.js';
import { InputValidator } from 'resource:///com/odnoyko/valot/js/func/global/inputValidation.js';

// Get connection from main app
let dbConnection = null;

function getDbConnection() {
  if (!dbConnection) {
    // Get connection from main application
    const app = Gio.Application.get_default();
    if (app && app.database_connection) {
      dbConnection = app.database_connection;
    } else {
      console.error("❌ Datenbank in der Anwendung nicht gefunden - App:", !!app, "DB Connection:", !!app?.database_connection);
      
      // Try to get database connection from global window if available
      try {
        const display = app ? app.get_active_window() : null;
        if (display && display.database_connection) {
          dbConnection = display.database_connection;
        } else {
          // Last resort - try to setup database directly
          dbConnection = setupDatabase();
        }
      } catch (fallbackError) {
        console.error("❌ Alle Datenbankverbindungsversuche gescheitert:", fallbackError);
        throw new Error("Database connection not found - all fallbacks failed");
      }
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
    const endTimeValue = endTime ? `'${endTime}'` : 'NULL';
    const sql = `
      INSERT INTO Task (name, project_id, client_id, start_time, end_time, time_spent, created_at)
      VALUES ('${InputValidator.sanitizeForSQL(safeName)}', ${safeProjectId}, ${safeClientId}, '${startTime}', ${endTimeValue}, ${safeSpentSeconds}, CURRENT_TIMESTAMP)
    `;

    console.log("SQL-Abfrage:", sql);
    
    const result = executeNonSelectCommand(conn, sql, null);
    
    // Verify that the task was actually saved by checking if it exists
    if (result > 0) {
      const verifySql = `SELECT id, name, start_time FROM Task WHERE name = '${InputValidator.sanitizeForSQL(safeName)}' AND start_time = '${startTime}' ORDER BY id DESC LIMIT 1`;
      try {
        const verifyResult = executeQuery(conn, verifySql);
        if (verifyResult && verifyResult.get_n_rows() > 0) {
          const savedTaskId = verifyResult.get_value_at(0, 0);
          const savedTaskName = verifyResult.get_value_at(1, 0);
        } else {
          console.warn("⚠️ Task save reported success but verification failed");
        }
      } catch (verifyError) {
        console.error("❌ Error verifying saved task:", verifyError);
      }
    } else {
      console.warn(`⚠️ Task save failed - 0 rows affected for "${safeName}"`);
    }
    
    return result;
    
  } catch (error) {
    console.error("❌ Fehler beim Speichern der Aufgabe:", error.message);
    console.error("Stack-Trace:", error.stack);
    throw error;
  }
}

export function updateTaskWhenTrackingStops(taskName, endTime, spentSeconds, context = null) {
  try {
    console.log(`🚨 === updateTaskWhenTrackingStops CALLED ===`);
    console.log(`🚨 Name: ${taskName}`);
    console.log(`🚨 Ende: ${endTime}`);
    console.log(`🚨 Zusätzliche verbrachte Zeit: ${spentSeconds} Sekunden`);
    
    // Validate inputs
    const nameValidation = InputValidator.validateTaskName(taskName);
    if (!nameValidation.valid) {
      console.error('Task name validation failed:', nameValidation.error);
      return false;
    }
    
    const timeValidation = InputValidator.validateNumber(spentSeconds, 0);
    if (!timeValidation.valid) {
      console.error('Time validation failed:', timeValidation.error);
      return false;
    }
    
    const conn = getDbConnection();
    const safeName = nameValidation.sanitized;
    const safeSpentSeconds = timeValidation.sanitized;
    
    // First, let's check if there's an active task with this name
    const checkSql = `SELECT id, name, start_time, end_time, time_spent FROM Task WHERE name = '${InputValidator.sanitizeForSQL(safeName)}' AND (end_time IS NULL OR end_time = 'null') AND start_time IS NOT NULL ORDER BY start_time DESC LIMIT 1`;
    
    let foundTaskId = null;
    let currentTimeSpent = 0;
    
    // Check if task exists before trying to update
    try {
      const checkResult = executeQuery(conn, checkSql);
      const rowCount = checkResult ? checkResult.get_n_rows() : 0;
      
      if (checkResult && rowCount > 0) {
        try {
          foundTaskId = checkResult.get_value_at(0, 0);
          const foundTaskName = checkResult.get_value_at(1, 0);
          const startTime = checkResult.get_value_at(2, 0);
          const existingEndTime = checkResult.get_value_at(3, 0);
          currentTimeSpent = checkResult.get_value_at(4, 0) || 0;
          
        } catch (rowReadError) {
          console.error("🔍 Error reading found task row:", rowReadError);
          foundTaskId = null; // Reset so we show debug info
        }
      }
      
      if (!foundTaskId) {
        console.log(`❌ No active task found with name "${safeName}"`);
        
        // Try to find ANY task with this name for debugging
        const debugSql = `SELECT id, name, start_time, end_time, time_spent FROM Task WHERE name = '${InputValidator.sanitizeForSQL(safeName)}' ORDER BY id DESC LIMIT 5`;
        try {
          const debugResult = executeQuery(conn, debugSql);
          const rowCount = debugResult ? debugResult.get_n_rows() : 0;
          
          if (debugResult && rowCount > 0) {
            for (let i = 0; i < rowCount; i++) {
              try {
                const id = debugResult.get_value_at(0, i);
                const name = debugResult.get_value_at(1, i);
                const start = debugResult.get_value_at(2, i);
                const end = debugResult.get_value_at(3, i);
                const spent = debugResult.get_value_at(4, i);
              } catch (rowError) {
                console.error(`🔍 Error reading debug row ${i}:`, rowError);
              }
            }
          }
        } catch (debugError) {
          console.error("🔍 Debug query failed:", debugError);
        }
        
        return 0; // No task found, return 0 rows affected
      }
    } catch (checkError) {
      console.error("❌ Error checking for active task:", checkError);
      throw checkError;
    }
    
    // Now update the specific task by ID
    // Note: Don't add safeSpentSeconds to currentTimeSpent because updateActiveTaskInRealTime already keeps time_spent current
    const updateSql = `UPDATE Task SET end_time = '${endTime}', time_spent = ${safeSpentSeconds} WHERE id = ${foundTaskId}`;
    console.log("💾 SQL-Update für Task ID", foundTaskId, ":", updateSql);
    
    const result = executeNonSelectCommand(conn, updateSql, null);
    
    if (result === 0) {
      console.warn(`⚠️ No rows updated for task "${safeName}" - task may not exist or is not active`);
    }
    
    return result;
    
  } catch (error) {
    console.error("❌ Fehler beim Aktualisieren der Aufgabe:", error.message);
    console.error("Stack-Trace:", error.stack);
    throw error;
  }
}

export function updateActiveTaskInRealTime(taskName, currentSpentSeconds) {
  try {
    console.log(`=== Real-time Aufgaben-Update ===`);
    console.log(`Name: ${taskName}`);
    console.log(`Aktuelle verbrachte Zeit: ${currentSpentSeconds} Sekunden`);
    
    // Validate inputs
    const nameValidation = InputValidator.validateTaskName(taskName);
    if (!nameValidation.valid) {
      console.error('Task name validation failed:', nameValidation.error);
      return false;
    }
    
    const timeValidation = InputValidator.validateNumber(currentSpentSeconds, 0);
    if (!timeValidation.valid) {
      console.error('Time validation failed:', timeValidation.error);
      return false;
    }
    
    const conn = getDbConnection();
    const safeName = nameValidation.sanitized;
    const safeSpentSeconds = timeValidation.sanitized;
    
    // Update the active task with current elapsed time (without changing end_time)
    const sql = `
      UPDATE Task 
      SET time_spent = ${safeSpentSeconds}
      WHERE id = (
        SELECT id FROM Task 
        WHERE name = '${InputValidator.sanitizeForSQL(safeName)}' 
          AND end_time IS NULL 
          AND start_time IS NOT NULL
        ORDER BY start_time DESC 
        LIMIT 1
      )
    `;

    console.log("SQL-Abfrage für Real-time Update:", sql);
    
    const result = executeNonSelectCommand(conn, sql, null);
    
    if (result === 0) {
      console.warn(`⚠️ No rows updated during real-time update for task "${safeName}"`);
    }
    
    return result;
    
  } catch (error) {
    console.error("❌ Fehler beim Real-time Aktualisieren der Aufgabe:", error.message);
    return false; // Don't throw error for real-time updates to avoid disrupting tracking
  }
}
