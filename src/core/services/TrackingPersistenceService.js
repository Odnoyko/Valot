/**
 * Tracking Persistence Service
 * Handles periodic saving of tracking duration to JSON file (no database updates during tracking)
 * After crash, saved time is synchronized when user starts tracking the same task again
 * Uses JSON file cache instead of database to avoid GWeakRef accumulation
 */
import { BaseService } from './BaseService.js';
import { CoreEvents } from '../events/CoreEvents.js';
import { TimeUtils } from '../utils/TimeUtils.js';
import { Logger } from '../utils/Logger.js';
import { TrackingFileCache } from './TrackingFileCache.js';

export class TrackingPersistenceService extends BaseService {
    _persistTimerToken = 0;
    _lastPersistTime = 0;
    _persistIntervalSeconds = 60; // Save every 60 seconds
    _eventHandlers = {}; // Store handlers for cleanup
    _fileCache = null; // JSON file cache (no GDA objects)

    constructor(core) {
        super(core);
        this._fileCache = new TrackingFileCache();
    }

    /**
     * Initialize persistence service
     * Should be called after Core is initialized
     */
    async initialize() {
        // NO automatic recovery - just keep time in JSON file
        // Time will be synchronized when user starts tracking again with same task/project/client
        
        // DISABLED: Periodic persistence timer - we don't want to save in RAM/JSON during tracking
        // Time is calculated from startTime, not stored
        // Subscribe to tracking events to manage persistence (store handlers for cleanup)
        this._eventHandlers.trackingStarted = () => {
            // DISABLED: Periodic persistence - no timer during tracking
            // this.startPeriodicPersist();
        };
        this._eventHandlers.trackingStopped = () => {
            // DISABLED: Periodic persistence - no timer during tracking
            // this.stopPeriodicPersist();
            // Clear cache when tracking stops normally (TimeEntry is already closed in TimeTrackingService.stop())
            // If crash happened, time remains in JSON for next start
            this._fileCache.clear();
        };
        
        this.events.on(CoreEvents.TRACKING_STARTED, this._eventHandlers.trackingStarted);
        this.events.on(CoreEvents.TRACKING_STOPPED, this._eventHandlers.trackingStopped);
    }

    /**
     * Get saved tracking time from JSON file for specific task/project/client
     * Returns time in seconds that can be added to new tracking session
     * @param {number} taskId 
     * @param {number|null} projectId 
     * @param {number|null} clientId 
     * @returns {number} Saved time in seconds (0 if not found or doesn't match)
     */
    getSavedTimeForTask(taskId, projectId, clientId) {
        try {
            const cachedState = this._fileCache.read();
            
            if (!cachedState || !cachedState.taskId) {
                return 0; // No saved time
            }
            
            // Check if saved time matches current task/project/client
            const savedTaskId = cachedState.taskId;
            const savedProjectId = cachedState.projectId;
            const savedClientId = cachedState.clientId;
            
            if (savedTaskId === taskId && 
                savedProjectId === projectId && 
                savedClientId === clientId) {
                
                // Match! Calculate saved time from startTime (not from elapsedSeconds in file)
                // This is more accurate and doesn't require storing elapsedSeconds
                if (cachedState.startTime) {
                    const startDate = new Date(cachedState.startTime);
                    const now = Date.now();
                    const totalSavedTime = Math.floor((now - startDate.getTime()) / 1000);
                    
                    Logger.info(`[TrackingPersistence] Found saved time for task (from startTime): ${totalSavedTime}s`);
                    return Math.max(0, totalSavedTime);
                } else if (cachedState.elapsedSeconds) {
                    // Fallback for old format (if file has elapsedSeconds from previous version)
                    const lastPersistTime = cachedState.lastPersistTime || Date.now();
                    const now = Date.now();
                    const timeSinceLastPersist = Math.floor((now - lastPersistTime) / 1000);
                    const totalSavedTime = cachedState.elapsedSeconds + timeSinceLastPersist;
                    
                    Logger.info(`[TrackingPersistence] Found saved time for task (legacy format): ${totalSavedTime}s`);
                    return Math.max(0, totalSavedTime);
                }
            }
            
            return 0; // Task/project/client don't match
        } catch (error) {
            Logger.debug(`[TrackingPersistence] Error reading saved time: ${error.message}`);
            return 0;
        }
    }

    /**
     * Clear saved time after it has been used
     */
    clearSavedTime() {
        this._fileCache.clear();
    }

    /**
     * Start periodic persistence of tracking duration
     * DISABLED: We don't want periodic persistence during tracking - time is calculated from startTime
     */
    startPeriodicPersist() {
        // DISABLED: Periodic persistence timer - time calculated from startTime, not stored
        return;
    }

    /**
     * Stop periodic persistence
     */
    stopPeriodicPersist() {
        if (this._persistTimerToken) {
            const scheduler = this.core.services.timerScheduler;
            scheduler.unsubscribe(this._persistTimerToken);
            this._persistTimerToken = 0;
        }
    }

    /**
     * Persist current tracking state to JSON file ONLY (no database updates)
     * Database is updated only on start/stop, not periodically
     */
    async persistCurrentTracking() {
        const currentState = this.state.getTrackingState();
        
        if (!currentState.isTracking || !currentState.currentTimeEntryId) {
            // Clear cache if not tracking
            this._fileCache.clear();
            return;
        }

        try {
            // elapsedSeconds is calculated dynamically - save only startTime to file
            // This prevents storing time in RAM and reduces memory usage
            const stateToSave = {
                entryId: currentState.currentTimeEntryId,
                taskInstanceId: currentState.currentTaskInstanceId,
                taskId: currentState.currentTaskId,
                taskName: currentState.currentTaskName,
                projectId: currentState.currentProjectId,
                clientId: currentState.currentClientId,
                startTime: currentState.startTime, // Only save startTime - elapsedSeconds calculated from this
                lastPersistTime: Date.now(),
            };
            this._fileCache.write(stateToSave);
            
            // Calculate elapsedSeconds for logging only (not stored)
            const elapsedSeconds = currentState.elapsedSeconds || 0;
            Logger.debug(`[TrackingPersistence] Saved startTime to file (elapsed: ${elapsedSeconds}s) for entry ${currentState.currentTimeEntryId}`);
        } catch (error) {
            Logger.error(`[TrackingPersistence] Failed to persist tracking: ${error.message}`);
        }
    }


    /**
     * Cleanup on service shutdown
     */
    destroy() {
        // Final save to file before shutdown (no database update)
        const currentState = this.state.getTrackingState();
        if (currentState.isTracking && currentState.currentTimeEntryId) {
            // Save to file for crash recovery
            void this.persistCurrentTracking().catch(error => {
                Logger.error(`[TrackingPersistence] Final save on shutdown failed: ${error.message}`);
            });
        } else {
            // Clear cache if not tracking
            this._fileCache.clear();
        }
        
        // Unsubscribe from timer
        this.stopPeriodicPersist();
        
        // Remove event listeners to prevent memory leaks
        if (this._eventHandlers.trackingStarted) {
            this.events.off(CoreEvents.TRACKING_STARTED, this._eventHandlers.trackingStarted);
            delete this._eventHandlers.trackingStarted;
        }
        if (this._eventHandlers.trackingStopped) {
            this.events.off(CoreEvents.TRACKING_STOPPED, this._eventHandlers.trackingStopped);
            delete this._eventHandlers.trackingStopped;
        }
    }
}

