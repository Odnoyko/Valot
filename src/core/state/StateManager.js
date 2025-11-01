/**
 * State Manager
 * Manages application state with event notifications
 */
export class StateManager {
    state;
    events;
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
     * Calculates elapsedSeconds dynamically from startTime to prevent RAM growth
     */
    getTrackingState() {
        const tracking = { ...this.state.tracking };
        
        // Calculate elapsedSeconds dynamically from startTime (not stored in state)
        // This prevents state updates every second, reducing RAM usage
        if (tracking.isTracking && tracking.startTime) {
            const startDate = new Date(tracking.startTime);
            const now = Date.now();
            tracking.elapsedSeconds = Math.floor((now - startDate.getTime()) / 1000);
            
            // Calculate pomodoroRemaining if in pomodoro mode
            if (tracking.pomodoroMode && tracking.pomodoroDuration > 0) {
                tracking.pomodoroRemaining = Math.max(0, tracking.pomodoroDuration - tracking.elapsedSeconds);
            }
        } else {
            tracking.elapsedSeconds = 0;
            tracking.pomodoroRemaining = 0;
        }
        
        return tracking;
    }
    /**
     * Update tracking state
     */
    updateTrackingState(update) {
        this.state.tracking = {
            ...this.state.tracking,
            ...update,
        };
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
