/**
 * Debouncer Utility
 * Provides debounce function for UI updates
 */

export class Debouncer {
    /**
     * Debounce function - delays execution until after wait time since last call
     * @param {Function} fn - Function to debounce
     * @param {number} wait - Wait time in milliseconds
     * @returns {Function} Debounced function
     */
    static debounce(fn, wait) {
        let timeoutId = null;
        return function(...args) {
            const context = this;
            
            // Clear existing timeout
            if (timeoutId !== null) {
                clearTimeout(timeoutId);
            }
            
            // Set new timeout
            timeoutId = setTimeout(() => {
                fn.apply(context, args);
                timeoutId = null;
            }, wait);
        };
    }
}

