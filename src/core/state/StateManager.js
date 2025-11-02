/**
 * State Manager
 * Manages application state with event notifications
 */
export class StateManager {
    state;
    events;
    // OPTIMIZED: Cache tracking state object to prevent creating new object on every call
    _cachedTrackingState = null;
    _lastStateHash = null; // Hash of non-time-based fields to detect state changes
    _lastElapsedUpdate = 0; // Timestamp of last elapsedSeconds update
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
                // elapsedSeconds removed - calculated dynamically from startTime to prevent RAM growth
                // oldTime removed - calculated on demand when needed, not stored in RAM
                savedTimeFromCrash: 0, // Time saved in JSON from previous crash - added to duration on stop (small number)
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
     */
    getState() {
        return { ...this.state };
    }
    /**
     * Get tracking state
     * OPTIMIZED: Caches state object and only recreates when base state changes
     * This prevents creating hundreds of objects per minute, significantly reducing RAM usage
     */
    getTrackingState() {
        const currentState = this.state.tracking;
        
        // Check if base (non-time-based) state has changed
        // Base state includes: isTracking, taskId, taskName, projectId, clientId, startTime, pomodoroMode, pomodoroDuration
        // Time-based fields (elapsedSeconds, pomodoroRemaining) are updated on existing object
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
                    ? new Date(this._cachedTrackingState.startTime).getTime()
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
     * OPTIMIZED: Invalidates cache when state is updated
     */
    updateTrackingState(update) {
        this.state.tracking = {
            ...this.state.tracking,
            ...update,
        };
        // Invalidate cache - next getTrackingState() will recreate object
        // This ensures cache is always fresh after state changes
        this._cachedTrackingState = null;
        this._lastStateHash = null;
        this._lastElapsedUpdate = 0;
        this._cachedStartTimestamp = null;
        this.events.emit('state:tracking-updated', this.state.tracking);
    }
    /**
     * Get UI state
     */
    getUIState() {
        return { ...this.state.ui };
    }
    /**
     * Update UI state
     */
    updateUIState(update) {
        this.state.ui = {
            ...this.state.ui,
            ...update,
        };
        this.events.emit('state:ui-updated', this.state.ui);
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
