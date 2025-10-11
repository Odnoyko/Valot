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
                startTime: null,
                elapsedSeconds: 0,
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
     */
    getTrackingState() {
        return { ...this.state.tracking };
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
