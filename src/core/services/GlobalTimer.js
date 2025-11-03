import { BaseService } from './BaseService.js';
import { CoreEvents } from '../events/CoreEvents.js';

/**
 * GlobalTimer - Single source of truth for time tracking
 *
 * Simple formula: Current Time - Start Time = Elapsed Time
 *
 * All UI components subscribe to this timer for real-time updates.
 */
export class GlobalTimer extends BaseService {
    constructor(core) {
        super(core);

        this.timerId = null;
        this.startTime = null;
        this.isRunning = false;

        // Update interval: 1 second
        this.updateInterval = 1000;
    }

    /**
     * Start the global timer
     * @param {number} startTime - Unix timestamp in milliseconds (Date.now())
     */
    start(startTime) {
        // If already running, stop first
        if (this.isRunning) {
            this.stop();
        }

        this.startTime = startTime || Date.now();
        this.isRunning = true;

        console.log(`[GlobalTimer] Started at ${new Date(this.startTime).toISOString()}`);

        // Start interval
        this._startInterval();
    }

    /**
     * Stop the global timer
     */
    stop() {
        if (this.timerId) {
            clearInterval(this.timerId);
            this.timerId = null;
        }

        this.isRunning = false;
        this.startTime = null;

        console.log('[GlobalTimer] Stopped');
    }

    /**
     * Get current elapsed time in seconds
     * Formula: (Current Time - Start Time) / 1000
     *
     * @returns {number} Elapsed seconds
     */
    getElapsedSeconds() {
        if (!this.isRunning || !this.startTime) {
            return 0;
        }

        const currentTime = Date.now();
        const elapsedMs = currentTime - this.startTime;
        const elapsedSeconds = Math.floor(elapsedMs / 1000);

        return elapsedSeconds;
    }

    /**
     * Get current elapsed time as formatted string
     * @returns {string} Formatted time (HH:MM:SS)
     */
    getElapsedFormatted() {
        const seconds = this.getElapsedSeconds();
        return this._formatTime(seconds);
    }

    /**
     * Internal interval that emits updates every second
     */
    _startInterval() {
        // Reuse single object to avoid creating new objects every second
        const tickData = {
            elapsedSeconds: 0,
            startTime: this.startTime,
            currentTime: 0
        };

        this.timerId = setInterval(() => {
            if (!this.isRunning) {
                this.stop();
                return;
            }

            // Update existing object properties - NO NEW OBJECT CREATION
            tickData.elapsedSeconds = this.getElapsedSeconds();
            tickData.currentTime = Date.now();

            // Emit event with SAME object (updated values)
            this.events.emit(CoreEvents.GLOBAL_TIMER_TICK, tickData);

        }, this.updateInterval);
    }

    /**
     * Format seconds to HH:MM:SS
     * @param {number} totalSeconds
     * @returns {string}
     */
    _formatTime(totalSeconds) {
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;

        if (hours > 0) {
            return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
        }
        return `${minutes}:${String(seconds).padStart(2, '0')}`;
    }

    /**
     * Check if timer is currently running
     * @returns {boolean}
     */
    isTimerRunning() {
        return this.isRunning;
    }

    /**
     * Get start time
     * @returns {number|null} Start time in milliseconds
     */
    getStartTime() {
        return this.startTime;
    }
}

