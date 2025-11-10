/**
 * String Cache - Prevents creating new strings every second
 * Caches formatted time strings to avoid memory leaks
 */

export class StringCache {
    constructor() {
        // Cache formatted time strings (key: seconds, value: formatted string)
        this.timeCache = new Map();
        // Cache size limit to prevent unbounded growth
        this.maxCacheSize = 7200; // 2 hours worth of seconds
    }

    /**
     * Get formatted time string (HH:MM:SS) from cache or create once
     * @param {number} totalSeconds
     * @returns {string} Formatted time string
     */
    getTimeString(totalSeconds) {
        // Check cache first
        if (this.timeCache.has(totalSeconds)) {
            return this.timeCache.get(totalSeconds);
        }

        // Create string once
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const secs = totalSeconds % 60;

        // Pre-format components (avoid String() wrapper, use direct conversion)
        const h = hours < 10 ? `0${hours}` : `${hours}`;
        const m = minutes < 10 ? `0${minutes}` : `${minutes}`;
        const s = secs < 10 ? `0${secs}` : `${secs}`;

        const formatted = `${h}:${m}:${s}`;

        // Store in cache (with size limit)
        if (this.timeCache.size < this.maxCacheSize) {
            this.timeCache.set(totalSeconds, formatted);
        }

        return formatted;
    }

    /**
     * Get formatted time string with indicator (● HH:MM:SS)
     * @param {number} totalSeconds
     * @returns {string} Formatted time string with indicator
     */
    getTimeStringWithIndicator(totalSeconds) {
        // Use cached base string + indicator
        return '● ' + this.getTimeString(totalSeconds);
    }

    /**
     * Get formatted money string
     * @param {number} amount
     * @param {string} currency
     * @returns {string} Formatted money string
     */
    getMoneyString(amount, currency) {
        // Round to 2 decimals first to cache properly
        const roundedAmount = Math.round(amount * 100) / 100;
        const cacheKey = `${currency}:${roundedAmount}`;

        if (this.timeCache.has(cacheKey)) {
            return this.timeCache.get(cacheKey);
        }

        // Create string once
        const formatted = `${currency}${roundedAmount.toFixed(2)}`;

        // Store in cache (with size limit)
        if (this.timeCache.size < this.maxCacheSize) {
            this.timeCache.set(cacheKey, formatted);
        }

        return formatted;
    }

    /**
     * Clear cache (call when tracking stops)
     */
    clear() {
        this.timeCache.clear();
    }

    /**
     * Clear old entries if cache is too large
     */
    prune() {
        if (this.timeCache.size > this.maxCacheSize) {
            // Keep only most recent half
            const entries = Array.from(this.timeCache.entries());
            const toKeep = entries.slice(entries.length / 2);
            this.timeCache.clear();
            toKeep.forEach(([key, value]) => this.timeCache.set(key, value));
        }
    }
}

// Global singleton
export const stringCache = new StringCache();

