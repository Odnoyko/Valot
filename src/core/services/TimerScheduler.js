import GLib from 'gi://GLib';

export class TimerScheduler {
    constructor(intervalSeconds = 1) {
        this.intervalSeconds = Math.max(1, intervalSeconds);
        this._sourceId = 0;
        this._nextToken = 1;
        this._subscribers = new Map(); // token -> callback
    }

    start() {
        if (this._sourceId) return;
        this._sourceId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, this.intervalSeconds, () => {
            // Snapshot to avoid mutation during iteration
            const callbacks = Array.from(this._subscribers.values());
            for (const cb of callbacks) {
                try {
                    cb();
                } catch (e) {
                    // Swallow to keep the loop running
                    // console.error('TimerScheduler subscriber error:', e);
                }
            }
            return true; // continue
        });
    }

    stop() {
        if (this._sourceId) {
            GLib.Source.remove(this._sourceId);
            this._sourceId = 0;
        }
    }

    subscribe(callback) {
        if (typeof callback !== 'function') return 0;
        const token = this._nextToken++;
        this._subscribers.set(token, callback);
        // Ensure scheduler is running when someone subscribes
        this.start();
        return token;
    }

    unsubscribe(token) {
        if (this._subscribers.has(token)) {
            this._subscribers.delete(token);
            if (this._subscribers.size === 0) {
                this.stop();
            }
            return true;
        }
        return false;
    }
}


