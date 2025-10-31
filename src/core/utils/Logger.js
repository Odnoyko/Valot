/**
 * Silent Logger - Only logs errors by default
 * For user-facing applications that should be quiet
 */
export class Logger {
    static DEBUG_ENABLED = false; // Can be enabled via environment variable or config
    
    /**
     * Enable debug mode (can be set from config or environment)
     */
    static enableDebug() {
        Logger.DEBUG_ENABLED = true;
    }
    
    /**
     * Log debug message (only if debug enabled)
     */
    static debug(...args) {
        if (Logger.DEBUG_ENABLED) {
            console.log(...args);
        }
    }
    
    /**
     * Log info message (only if debug enabled)
     */
    static info(...args) {
        if (Logger.DEBUG_ENABLED) {
            console.log(...args);
        }
    }
    
    /**
     * Log warning (only if debug enabled)
     */
    static warn(...args) {
        if (Logger.DEBUG_ENABLED) {
            console.warn(...args);
        }
    }
    
    /**
     * Always log errors - critical for debugging issues
     */
    static error(...args) {
        console.error(...args);
    }
}

