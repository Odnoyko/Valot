console.log("timetracking.js verbunden");

import Adw from 'gi://Adw';
import GLib from 'gi://GLib';
import { saveTask } from 'resource:///com/odnoyko/valot/js/global/addtask.js';
console.log("Adw & GLib importiert");

let isTracking = false;
let startTime = 0;
let startDateTime = null;
let intervalId = null;

export function timeTrack(button, input, label) {
  console.log("Zeitverfolgung initialisiert");
  
  button.connect("clicked", () => {
    if (isTracking) {
      // STOP tracking
      isTracking = false;
      console.log("Zeitverfolgung gestoppt");
      
      const endTime = GLib.get_monotonic_time();
      const endDateTime = GLib.DateTime.new_now_local();
      const spentMicroseconds = endTime - startTime;
      const spentSeconds = Math.floor(spentMicroseconds / 1_000_000);

      // Stop timer
      if (intervalId) {
        GLib.source_remove(intervalId);
        intervalId = null;
      }

      // Change button icon back to play
      button.set_icon_name("media-playback-start-symbolic");
      button.set_tooltip_text("Start tracking");

      // Get task name
      const taskName = input.get_text().trim();
      
      // Validate task name
      if (!taskName || taskName.length === 0) {
        console.log("Aufgabe nicht gespeichert: leerer Name");
        label.set_label('00:00:00');
        return;
      }

      // Get current context from window (project, client, currency)
      const window = button.get_root();
      const context = (window && typeof window.getSelectedContext === 'function') ? 
                     window.getSelectedContext() : { 
                       project: { id: 1, name: 'Default' },
                       client: { id: 1, name: 'Default Client' },
                       currency: { code: 'EUR', symbol: '€' }
                     };
                     
      const projectId = context.project?.id || 1;
      const projectName = context.project?.name || "Default";
      const clientId = context.client?.id || 1;
      const clientName = context.client?.name || "Default Client";
      const currency = context.currency || { code: 'EUR', symbol: '€' };
      
      // Format time strings
      const startStr = startDateTime.format('%Y-%m-%d %H:%M:%S');
      const endStr = endDateTime.format('%Y-%m-%d %H:%M:%S');

      console.log(`Aufgabe speichern: ${taskName}, Zeit: ${spentSeconds} Sek`);

      // Reset display
      label.set_label('00:00:00');
      input.set_text(''); // Clear input after saving

      // Save task
      try {
        console.log(`💾 Attempting to save task: "${taskName}"`);
        console.log(`📊 Task context: Project: ${projectName}, Client: ${clientName}, Currency: ${currency.symbol} ${currency.code}`);
        console.log(`⏰ Duration: ${spentSeconds}s, Time range: ${startStr} → ${endStr}`);
        
        // Save with extended context information
        const saveResult = saveTask(taskName, projectName, startStr, endStr, spentSeconds, projectId, {
          client: { id: clientId, name: clientName },
          currency: currency
        });
        
        if (saveResult) {
          console.log("✅ Task successfully saved to database");
        } else {
          console.log("❌ Failed to save task to database");
        }
        
        // Update task list in window if available
        const window = button.get_root();
        if (window && typeof window._removeActiveTask === 'function') {
          window._removeActiveTask(taskName);
          console.log("🔄 Active task removed from UI");
        }
        if (window && typeof window.loadTasks === 'function') {
          window.loadTasks();
          console.log("🔄 Task list refreshed");
        }
      } catch (error) {
        console.error("❌ Error during task save process:", error);
      }

    } else {
      // START tracking
      const taskName = input.get_text().trim();
      if (!taskName || taskName.length === 0) {
        console.log("Geben Sie einen Aufgabennamen ein bevor Sie die Zeitverfolgung starten");
        console.log("DEBUG: Aktueller Eingabewert:", `"${input.get_text()}"`);
        console.log("DEBUG: Zum Testen müssen Sie zuerst einen Aufgabennamen in das Eingabefeld eingeben");
        // TODO: Show user notification
        return;
      }

      console.log("✅ Zeitverfolgung gestartet für Aufgabe:", taskName);

      isTracking = true;
      startTime = GLib.get_monotonic_time();
      startDateTime = GLib.DateTime.new_now_local();
      console.log("Zeitverfolgung gestartet");

      // Change button icon to stop
      button.set_icon_name("media-playback-stop-symbolic");
      button.set_tooltip_text("Stop tracking");
      
      // Add task to list immediately when tracking starts
      const window = button.get_root();
      const currentProjectName = (window && typeof window.getCurrentProjectName === 'function') ? 
                                  window.getCurrentProjectName() : "Default";
      if (window && typeof window._addTaskToList === 'function') {
        window._addTaskToList({
          name: taskName,
          project: currentProjectName,
          duration: 0,
          start: startDateTime.format('%Y-%m-%d %H:%M:%S'),
          isActive: true
        });
      }

      // Start timer update
      console.log("🕐 Timer-Intervall wird gestartet");
      intervalId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 1, () => {
        const now = GLib.get_monotonic_time();
        const deltaSec = Math.floor((now - startTime) / 1_000_000);
        const hh = String(Math.floor(deltaSec / 3600)).padStart(2, '0');
        const mm = String(Math.floor((deltaSec % 3600) / 60)).padStart(2, '0');
        const ss = String(deltaSec % 60).padStart(2, '0');
        const timeStr = `${hh}:${mm}:${ss}`;
        console.log("Timer-Update:", timeStr);
        label.set_label(timeStr);
        return GLib.SOURCE_CONTINUE;
      });
    }
  });

  // Optional: Validate task name on input
  input.connect("changed", () => {
    const text = input.get_text().trim();
    // Enable/disable button based on input
    button.set_sensitive(text.length > 0 || isTracking);
  });

  // Add Enter key functionality to start/stop tracking
  input.connect("activate", () => {
    const text = input.get_text().trim();
    if (text.length > 0) {
      // Simulate button click to start/stop tracking
      button.emit('clicked');
      if (!isTracking) {
        console.log(`✅ Enter gedrückt - Zeitverfolgung gestartet für: ${text}`);
      } else {
        console.log(`⏹️ Enter gedrückt - Zeitverfolgung gestoppt für: ${text}`);
      }
    }
  });
} 
