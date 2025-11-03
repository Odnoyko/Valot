/**
 * State Manager
 * Manages application state with event notifications
 */
export class StateManager {
    state;
    events;
    // OPTIMIZED: Cache tracking state object to prevent creating new object on every call
    _cachedTrackingState = null;
    _cachedStartTimestamp = null; // Cached timestamp of startTime to avoid Date creation
    
    constructor(events) {
        this.events = events;
        this.state = this.getInitialState();
    }
    getInitialState() {
        return {
            tracking: {
                isTracking: false,
                currentTaskId: null,
                currentTaskName: null,
                currentProjectId: null,
                currentClientId: null,
                currentTaskInstanceId: null,
                currentTimeEntryId: null,
                startTime: null, // ONLY stored value - all time computed as (current time - startTime)
<<<<<<< HEAD
                // elapsedSeconds removed - calculated dynamically from startTime to prevent RAM growth
                // oldTime removed - calculated on demand when needed, not stored in RAM
                savedTimeFromCrash: 0, // Time saved in JSON from previous crash - added to duration on stop (small number)
=======
                // elapsedSeconds NOT stored - calculated dynamically from startTime to prevent RAM growth
                savedTimeFromCrash: 0, // Time saved in JSON from previous crash - added to duration on stop
>>>>>>> 15443b1 (v0.9.1 beta 4 Initial release)
                pomodoroMode: false,
                pomodoroDuration: 0,
                pomodoroRemaining: 0, // Calculated dynamically from elapsedSeconds and pomodoroDuration
            },
            ui: {
                currentPage: 'tasks',
                sidebarVisible: true,
                compactMode: false,
            },
        };
    }
    /**
     * Get current state
     * OPTIMIZED: Return direct reference to prevent object creation
     */
    getState() {
        return this.state; // Direct reference - no object creation
    }
    /**
     * Get tracking state
     * OPTIMIZED: Caches state object and only recreates when base state changes
     * This prevents creating hundreds of objects per minute, significantly reducing RAM usage
     */
    getTrackingState() {
        const currentState = this.state.tracking;
        
        // Check if base (non-time-based) state has changed
<<<<<<< HEAD
        // Base state includes: isTracking, taskId, taskName, projectId, clientId, startTime, pomodoroMode, pomodoroDuration
        // Time-based fields (elapsedSeconds, pomodoroRemaining) are updated on existing object
=======
>>>>>>> 15443b1 (v0.9.1 beta 4 Initial release)
        const baseStateChanged = 
            !this._cachedTrackingState ||
            this._cachedTrackingState.isTracking !== currentState.isTracking ||
            this._cachedTrackingState.currentTaskId !== currentState.currentTaskId ||
            this._cachedTrackingState.currentTaskName !== currentState.currentTaskName ||
            this._cachedTrackingState.currentProjectId !== currentState.currentProjectId ||
            this._cachedTrackingState.currentClientId !== currentState.currentClientId ||
            this._cachedTrackingState.currentTaskInstanceId !== currentState.currentTaskInstanceId ||
            this._cachedTrackingState.currentTimeEntryId !== currentState.currentTimeEntryId ||
            this._cachedTrackingState.startTime !== currentState.startTime ||
            this._cachedTrackingState.savedTimeFromCrash !== currentState.savedTimeFromCrash ||
            this._cachedTrackingState.pomodoroMode !== currentState.pomodoroMode ||
            this._cachedTrackingState.pomodoroDuration !== currentState.pomodoroDuration;
        
        // If base state changed, recreate the cached object
        if (baseStateChanged) {
            // Create new cached object from current state
            this._cachedTrackingState = {
                isTracking: currentState.isTracking,
                currentTaskId: currentState.currentTaskId,
                currentTaskName: currentState.currentTaskName,
                currentProjectId: currentState.currentProjectId,
                currentClientId: currentState.currentClientId,
                currentTaskInstanceId: currentState.currentTaskInstanceId,
                currentTimeEntryId: currentState.currentTimeEntryId,
                startTime: currentState.startTime,
                savedTimeFromCrash: currentState.savedTimeFromCrash,
                pomodoroMode: currentState.pomodoroMode,
                pomodoroDuration: currentState.pomodoroDuration,
                elapsedSeconds: 0,
                pomodoroRemaining: 0,
            };
            
            // Calculate elapsedSeconds and pomodoroRemaining for new object
            if (this._cachedTrackingState.isTracking && this._cachedTrackingState.startTime) {
                // Convert startTime to timestamp and cache it (avoid creating Date object every call)
                this._cachedStartTimestamp = typeof this._cachedTrackingState.startTime === 'string'
<<<<<<< HEAD
                    ? new Date(this._cachedTrackingState.startTime).getTime()
=======
                    ? new Date(this._cachedTrackingState.startTime.replace(' ', 'T')).getTime()
>>>>>>> 15443b1 (v0.9.1 beta 4 Initial release)
                    : this._cachedTrackingState.startTime;
                const now = Date.now();
                this._cachedTrackingState.elapsedSeconds = Math.floor((now - this._cachedStartTimestamp) / 1000);
                
                // Calculate pomodoroRemaining if in pomodoro mode
                if (this._cachedTrackingState.pomodoroMode && this._cachedTrackingState.pomodoroDuration > 0) {
                    this._cachedTrackingState.pomodoroRemaining = Math.max(0, 
                        this._cachedTrackingState.pomodoroDuration - this._cachedTrackingState.elapsedSeconds);
                } else {
                    this._cachedTrackingState.pomodoroRemaining = 0;
                }
            } else {
                this._cachedTrackingState.elapsedSeconds = 0;
                this._cachedTrackingState.pomodoroRemaining = 0;
            }
        } else {
            // Base state unchanged - only update time-based fields on existing object
            // This prevents creating new objects when only time changes
            if (this._cachedTrackingState.isTracking && this._cachedStartTimestamp !== null) {
                // Use cached timestamp (no Date object creation)
                const now = Date.now();
                
                // Update elapsedSeconds on existing object (no new object creation)
                this._cachedTrackingState.elapsedSeconds = Math.floor((now - this._cachedStartTimestamp) / 1000);
                
                // Update pomodoroRemaining if in pomodoro mode
                if (this._cachedTrackingState.pomodoroMode && this._cachedTrackingState.pomodoroDuration > 0) {
                    this._cachedTrackingState.pomodoroRemaining = Math.max(0, 
                        this._cachedTrackingState.pomodoroDuration - this._cachedTrackingState.elapsedSeconds);
                } else {
                    this._cachedTrackingState.pomodoroRemaining = 0;
                }
            } else {
                this._cachedTrackingState.elapsedSeconds = 0;
                this._cachedTrackingState.pomodoroRemaining = 0;
            }
        }
        
        return this._cachedTrackingState;
    }
    /**
     * Update tracking state
     * OPTIMIZED: Direct property updates, no spread operators
     */
    updateTrackingState(update) {
        // Direct property updates - no object creation
        const tracking = this.state.tracking;
        if (update.isTracking !== undefined) tracking.isTracking = update.isTracking;
        if (update.currentTaskId !== undefined) tracking.currentTaskId = update.currentTaskId;
        if (update.currentTaskName !== undefined) tracking.currentTaskName = update.currentTaskName;
        if (update.currentProjectId !== undefined) tracking.currentProjectId = update.currentProjectId;
        if (update.currentClientId !== undefined) tracking.currentClientId = update.currentClientId;
        if (update.currentTaskInstanceId !== undefined) tracking.currentTaskInstanceId = update.currentTaskInstanceId;
        if (update.currentTimeEntryId !== undefined) tracking.currentTimeEntryId = update.currentTimeEntryId;
        if (update.startTime !== undefined) tracking.startTime = update.startTime;
        if (update.savedTimeFromCrash !== undefined) tracking.savedTimeFromCrash = update.savedTimeFromCrash;
        if (update.pomodoroMode !== undefined) tracking.pomodoroMode = update.pomodoroMode;
        if (update.pomodoroDuration !== undefined) tracking.pomodoroDuration = update.pomodoroDuration;
        if (update.pomodoroRemaining !== undefined) tracking.pomodoroRemaining = update.pomodoroRemaining;
        
<<<<<<< HEAD
        // CRITICAL: Invalidate and clear ALL cache to free RAM
        // This ensures no stale cached objects remain in memory
        if (this._cachedTrackingState) {
            // Clear all properties from cached state object
            const cached = this._cachedTrackingState;
            cached.isTracking = null;
            cached.currentTaskId = null;
            cached.currentTaskName = null;
            cached.currentProjectId = null;
            cached.currentClientId = null;
            cached.currentTaskInstanceId = null;
            cached.currentTimeEntryId = null;
            cached.startTime = null;
            cached.savedTimeFromCrash = null;
            cached.pomodoroMode = null;
            cached.pomodoroDuration = null;
            cached.pomodoroRemaining = null;
            cached.elapsedSeconds = null;
        }
        this._cachedTrackingState = null;
        this._lastStateHash = null;
        this._lastElapsedUpdate = 0;
=======
        // CRITICAL: Invalidate cache to force recalculation on next getTrackingState()
        this._cachedTrackingState = null;
>>>>>>> 15443b1 (v0.9.1 beta 4 Initial release)
        this._cachedStartTimestamp = null;
        
        // Emit event with direct reference (no object creation)
        this.events.emit('state:tracking-updated', tracking);
    }
    /**
     * Get UI state
     * OPTIMIZED: Return direct reference
     */
    getUIState() {
        return this.state.ui; // Direct reference - no object creation
    }
    /**
     * Update UI state
     * OPTIMIZED: Direct property updates
     */
    updateUIState(update) {
        const ui = this.state.ui;
        if (update.currentPage !== undefined) ui.currentPage = update.currentPage;
        if (update.sidebarVisible !== undefined) ui.sidebarVisible = update.sidebarVisible;
        if (update.compactMode !== undefined) ui.compactMode = update.compactMode;
        this.events.emit('state:ui-updated', ui);
    }
    /**
     * Reset state to initial
     */
    reset() {
        this.state = this.getInitialState();
        // Clear cache when resetting state
        this._cachedTrackingState = null;
        this._lastStateHash = null;
        this._lastElapsedUpdate = 0;
        this._cachedStartTimestamp = null;
        this.events.emit('state:reset', this.state);
    }
    /**
     * Check if currently tracking
     */
    isTracking() {
        return this.state.tracking.isTracking;
    }
    /**
     * Get current task ID
     */
    getCurrentTaskId() {
        return this.state.tracking.currentTaskId;
    }
}
