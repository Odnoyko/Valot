/**
 * Debouncer Utility
 * Provides debounce and throttle functions for UI updates
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
    
    /**
     * Throttle function - limits execution to once per wait time
     * @param {Function} fn - Function to throttle
     * @param {number} wait - Wait time in milliseconds
     * @returns {Function} Throttled function
     */
    static throttle(fn, wait) {
        let lastCallTime = 0;
        let timeoutId = null;
        
        return function(...args) {
            const context = this;
            const now = Date.now();
            const timeSinceLastCall = now - lastCallTime;
            
            // If enough time has passed, execute immediately
            if (timeSinceLastCall >= wait) {
                lastCallTime = now;
                fn.apply(context, args);
            } else {
                // Schedule execution for after remaining wait time
                if (timeoutId !== null) {
                    clearTimeout(timeoutId);
                }
                
                timeoutId = setTimeout(() => {
                    lastCallTime = Date.now();
                    fn.apply(context, args);
                    timeoutId = null;
                }, wait - timeSinceLastCall);
            }
        };
    }
    
    /**
     * Create a debounced version of a function with automatic cleanup
     * Returns object with { call, cancel } methods
     */
    static createDebounced(fn, wait) {
        let timeoutId = null;
        
        return {
            call(...args) {
                if (timeoutId !== null) {
                    clearTimeout(timeoutId);
                }
                
                timeoutId = setTimeout(() => {
                    fn(...args);
                    timeoutId = null;
                }, wait);
            },
            cancel() {
                if (timeoutId !== null) {
                    clearTimeout(timeoutId);
                    timeoutId = null;
                }
            }
        };
    }
    
    /**
     * Create a throttled version of a function with automatic cleanup
     * Returns object with { call, cancel } methods
     */
    static createThrottled(fn, wait) {
        let lastCallTime = 0;
        let timeoutId = null;
        
        return {
            call(...args) {
                const now = Date.now();
                const timeSinceLastCall = now - lastCallTime;
                
                if (timeSinceLastCall >= wait) {
                    lastCallTime = now;
                    fn(...args);
                } else {
                    if (timeoutId !== null) {
                        clearTimeout(timeoutId);
                    }
                    
                    timeoutId = setTimeout(() => {
                        lastCallTime = Date.now();
                        fn(...args);
                        timeoutId = null;
                    }, wait - timeSinceLastCall);
                }
            },
            cancel() {
                if (timeoutId !== null) {
                    clearTimeout(timeoutId);
                    timeoutId = null;
                }
            }
        };
    }
}

