console.log("timetracking.js verbunden");

import Adw from 'gi://Adw';
import GLib from 'gi://GLib';
import { saveTask } from 'resource:///com/odnoyko/valot/js/global/addtask.js';
import { trackingStateManager } from 'resource:///com/odnoyko/valot/js/global/trackingStateManager.js';
import { InputValidator } from 'resource:///com/odnoyko/valot/js/global/inputValidation.js';
console.log("Adw & GLib importiert");

// Use trackingStateManager instead of local isTracking variable
// let isTracking = false; // REMOVED - now using trackingStateManager.getCurrentTracking()
let startTime = 0;
let startDateTime = null;
let intervalId = null;

export function timeTrack(button, input, label, taskContext = {}) {
  console.log("Zeitverfolgung initialisiert");
  
  // Register this button with the tracking state manager (include input for synchronization)
  trackingStateManager.registerTrackingButton(button, null, input);
  
  // Register the time label for real-time updates
  if (label) {
    trackingStateManager.registerTimeLabel(label, null);
  }
  
  button.connect("clicked", () => {
    const currentTracking = trackingStateManager.getCurrentTracking();
    if (currentTracking) {
      // STOP tracking
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

      // Icon will be updated by trackingStateManager

      // Get task name
      const taskName = input.get_text().trim();
      
      // Validate task name with comprehensive validation
      const nameValidation = InputValidator.validateTaskName(taskName);
      if (!nameValidation.valid) {
        console.log("Aufgabe nicht gespeichert: Validierungsfehler -", nameValidation.error);
        
        // Show validation error
        InputValidator.showValidationTooltip(input, nameValidation.error, true);
        label.set_label('00:00:00');
        return;
      }

      // Stop tracking in state manager
      const stoppedTask = trackingStateManager.stopTracking();

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
      
      // Validate task name before starting tracking
      const startValidation = InputValidator.validateTaskName(taskName);
      if (!startValidation.valid) {
        console.log("Zeitverfolgung nicht gestartet: Validierungsfehler -", startValidation.error);
        
        // Show validation error
        InputValidator.showValidationTooltip(input, startValidation.error, true);
        return;
      }

      // Use sanitized task name
      const safeTaskName = startValidation.sanitized;
      
      console.log("✅ Zeitverfolgung gestartet für Aufgabe:", safeTaskName);
      startTime = GLib.get_monotonic_time();
      startDateTime = GLib.DateTime.new_now_local();
      console.log("Zeitverfolgung gestartet");

      // Get task context info
      const window = button.get_root();
      const currentProjectName = (window && typeof window.getCurrentProjectName === 'function') ? 
                                  window.getCurrentProjectName() : "Default";
      const currentProjectId = (window && window.currentProjectId) ? window.currentProjectId : 1;

      // Create base name for grouping using sanitized name
      const baseNameMatch = safeTaskName.match(/^(.+?)\s*(?:\(\d+\))?$/);
      const baseName = baseNameMatch ? baseNameMatch[1].trim() : safeTaskName;

      // Get current client context for tracking
      const currentClient = (window && typeof window.getCurrentClient === 'function') ? 
                           window.getCurrentClient() : null;
      const currentClientId = window.currentClientId || 1;
      const currentClientName = currentClient ? currentClient.name : 'Default Client';
      
      // Start tracking in state manager with sanitized name and full context
      trackingStateManager.startTracking({
        name: safeTaskName,
        baseName: baseName,
        projectId: currentProjectId,
        projectName: currentProjectName,
        clientId: currentClientId,
        clientName: currentClientName,
        startTime: startDateTime.format('%Y-%m-%d %H:%M:%S')
      });

      // Icon will be updated by trackingStateManager
      
      // Add task to list immediately when tracking starts
      if (window && typeof window._addTaskToList === 'function') {
        // Get current client context
        const currentClient = (window && typeof window.getCurrentClient === 'function') ? 
                             window.getCurrentClient() : null;
        const currentClientId = window.currentClientId || 1;
        const currentClientName = currentClient ? currentClient.name : 'Default Client';
        
        window._addTaskToList({
          name: safeTaskName,
          project: currentProjectName,
          project_id: currentProjectId,
          client: currentClientName,
          client_id: currentClientId,
          duration: 0,
          start: startDateTime.format('%Y-%m-%d %H:%M:%S'),
          isActive: true
        });
      }

      // Timer is now handled by trackingStateManager - no need for separate timer here
      console.log("🕐 Timer will be handled by trackingStateManager");
    }
  });

  // Real-time validation while typing
  input.connect("changed", () => {
    const text = input.get_text().trim();
    const currentlyTracking = trackingStateManager.getCurrentTracking();
    
    // Enable/disable button based on input
    button.set_sensitive(text.length > 0 || currentlyTracking);
    
    // Real-time validation for dangerous characters
    if (text.length > 0) {
      const validation = InputValidator.validateTaskName(text);
      if (!validation.valid) {
        // Show error styling
        InputValidator.showValidationTooltip(input, validation.error, true);
      } else {
        // Clear error styling when input becomes valid
        InputValidator.showValidationTooltip(input, null, false);
      }
    } else {
      // Clear error styling when input is empty
      InputValidator.showValidationTooltip(input, null, false);
    }
  });

  // Add Enter key functionality to start/stop tracking
  input.connect("activate", () => {
    const text = input.get_text().trim();
    if (text.length > 0) {
      // Simulate button click to start/stop tracking
      button.emit('clicked');
      const trackingAfterClick = trackingStateManager.getCurrentTracking();
      if (trackingAfterClick) {
        console.log(`✅ Enter gedrückt - Zeitverfolgung gestartet für: ${text}`);
      } else {
        console.log(`⏹️ Enter gedrückt - Zeitverfolgung gestoppt für: ${text}`);
      }
    }
  });
} 
