import { EventBus } from '../events/EventBus';

/**
 * Application state interface
 */
export interface AppState {
    tracking: TrackingState;
    ui: UIState;
}

/**
 * Tracking state
 */
export interface TrackingState {
    isTracking: boolean;
    currentTaskId: number | null;
    currentTaskName: string | null;
    currentProjectId: number | null;
    startTime: string | null;
    elapsedSeconds: number;
}

/**
 * UI state
 */
export interface UIState {
    currentPage: string;
    sidebarVisible: boolean;
    compactMode: boolean;
}

/**
 * State Manager
 * Manages application state with event notifications
 */
export class StateManager {
    private state: AppState;
    private events: EventBus;

    constructor(events: EventBus) {
        this.events = events;
        this.state = this.getInitialState();
    }

    private getInitialState(): AppState {
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
    getState(): AppState {
        return { ...this.state };
    }

    /**
     * Get tracking state
     */
    getTrackingState(): TrackingState {
        return { ...this.state.tracking };
    }

    /**
     * Update tracking state
     */
    updateTrackingState(update: Partial<TrackingState>): void {
        this.state.tracking = {
            ...this.state.tracking,
            ...update,
        };
        this.events.emit('state:tracking-updated', this.state.tracking);
    }

    /**
     * Get UI state
     */
    getUIState(): UIState {
        return { ...this.state.ui };
    }

    /**
     * Update UI state
     */
    updateUIState(update: Partial<UIState>): void {
        this.state.ui = {
            ...this.state.ui,
            ...update,
        };
        this.events.emit('state:ui-updated', this.state.ui);
    }

    /**
     * Reset state to initial
     */
    reset(): void {
        this.state = this.getInitialState();
        this.events.emit('state:reset', this.state);
    }

    /**
     * Check if currently tracking
     */
    isTracking(): boolean {
        return this.state.tracking.isTracking;
    }

    /**
     * Get current task ID
     */
    getCurrentTaskId(): number | null {
        return this.state.tracking.currentTaskId;
    }
}
