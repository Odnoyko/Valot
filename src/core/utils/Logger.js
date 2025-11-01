/**
 * Enhanced Logger with levels and filtering
 * For user-facing applications that should be quiet by default
 */
export class Logger {
    static DEBUG_ENABLED = false;
    static INFO_ENABLED = false;
    static WARN_ENABLED = true; // Warnings enabled by default
    
    // Log levels
    static LEVELS = {
        DEBUG: 0,
        INFO: 1,
        WARN: 2,
        ERROR: 3,
    };
    
    // Current log level
    static currentLevel = Logger.LEVELS.ERROR; // Only errors by default
    
    // Log context tracking
    static contexts = new Map(); // context -> { enabled, level }
    
    /**
     * Enable debug mode (can be set from config or environment)
     */
    static enableDebug() {
        Logger.DEBUG_ENABLED = true;
        Logger.INFO_ENABLED = true;
        Logger.currentLevel = Logger.LEVELS.DEBUG;
    }
    
    /**
     * Enable info logging
     */
    static enableInfo() {
        Logger.INFO_ENABLED = true;
        Logger.currentLevel = Math.min(Logger.currentLevel, Logger.LEVELS.INFO);
    }
    
    /**
     * Set log level
     */
    static setLevel(level) {
        Logger.currentLevel = level;
        Logger.DEBUG_ENABLED = level <= Logger.LEVELS.DEBUG;
        Logger.INFO_ENABLED = level <= Logger.LEVELS.INFO;
        Logger.WARN_ENABLED = level <= Logger.LEVELS.WARN;
    }
    
    /**
     * Enable/disable logging for specific context
     */
    static setContextEnabled(context, enabled, level = Logger.LEVELS.DEBUG) {
        Logger.contexts.set(context, { enabled, level });
    }
    
    /**
     * Check if logging is enabled for context
     */
    static _isContextEnabled(context, messageLevel) {
        const ctxConfig = Logger.contexts.get(context);
        if (!ctxConfig) return true; // No context restriction
        
        return ctxConfig.enabled && messageLevel >= ctxConfig.level;
    }
    
    /**
     * Format log message with context
     */
    static _formatMessage(level, context, ...args) {
        const prefix = context ? `[${context}]` : '';
        const timestamp = new Date().toISOString();
        return [`${timestamp} ${prefix}`, ...args];
    }
    
    /**
     * Log debug message (only if debug enabled)
     */
    static debug(context, ...args) {
        if (Logger.DEBUG_ENABLED && 
            Logger.currentLevel <= Logger.LEVELS.DEBUG &&
            Logger._isContextEnabled(context, Logger.LEVELS.DEBUG)) {
            console.log(...Logger._formatMessage('DEBUG', context, ...args));
        }
    }
    
    /**
     * Log info message (only if info enabled)
     */
    static info(context, ...args) {
        if (Logger.INFO_ENABLED && 
            Logger.currentLevel <= Logger.LEVELS.INFO &&
            Logger._isContextEnabled(context, Logger.LEVELS.INFO)) {
            console.log(...Logger._formatMessage('INFO', context, ...args));
        }
    }
    
    /**
     * Log warning (only if warn enabled)
     */
    static warn(context, ...args) {
        if (Logger.WARN_ENABLED && 
            Logger.currentLevel <= Logger.LEVELS.WARN &&
            Logger._isContextEnabled(context, Logger.LEVELS.WARN)) {
            console.warn(...Logger._formatMessage('WARN', context, ...args));
        }
    }
    
    /**
     * Always log errors - critical for debugging issues
     */
    static error(context, ...args) {
        if (Logger._isContextEnabled(context, Logger.LEVELS.ERROR)) {
            console.error(...Logger._formatMessage('ERROR', context, ...args));
        }
    }
    
    /**
     * Performance logging - logs execution time
     */
    static async perf(context, label, fn) {
        if (!Logger.DEBUG_ENABLED) {
            return await fn();
        }
        
        const start = performance.now();
        try {
            const result = await fn();
            const duration = performance.now() - start;
            Logger.debug(context, `⏱️  ${label}: ${duration.toFixed(2)}ms`);
            return result;
        } catch (error) {
            const duration = performance.now() - start;
            Logger.error(context, `⏱️  ${label} (FAILED): ${duration.toFixed(2)}ms`, error);
            throw error;
        }
    }
    
    /**
     * Get logger statistics
     */
    static getStats() {
        return {
            debugEnabled: Logger.DEBUG_ENABLED,
            infoEnabled: Logger.INFO_ENABLED,
            warnEnabled: Logger.WARN_ENABLED,
            currentLevel: Logger.currentLevel,
            contexts: Array.from(Logger.contexts.keys()),
        };
    }
}

