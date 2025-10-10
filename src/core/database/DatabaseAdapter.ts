/**
 * Database Adapter Interface
 * Abstracts database operations for different implementations
 */
export interface DatabaseAdapter {
    /**
     * Initialize database connection
     */
    initialize(): Promise<void>;

    /**
     * Execute a SELECT query
     */
    query<T = any>(sql: string, params?: any[]): Promise<T[]>;

    /**
     * Execute an INSERT/UPDATE/DELETE query
     */
    execute(sql: string, params?: any[]): Promise<number>;

    /**
     * Begin a transaction
     */
    beginTransaction(): Promise<void>;

    /**
     * Commit a transaction
     */
    commit(): Promise<void>;

    /**
     * Rollback a transaction
     */
    rollback(): Promise<void>;

    /**
     * Close database connection
     */
    close(): Promise<void>;

    /**
     * Check if database is connected
     */
    isConnected(): boolean;
}

/**
 * Query result type
 */
export interface QueryResult {
    rows: any[];
    rowCount: number;
}
