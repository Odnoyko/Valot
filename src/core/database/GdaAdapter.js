/**
 * GDA Database Adapter for SQLite
 * This will be implemented in GJS with access to Gda library
 */
export class GdaAdapter {
    dbPath;
    connection = null; // Gda.Connection
    isConnected_ = false;
    constructor(dbPath) {
        this.dbPath = dbPath;
    }
    /**
     * Initialize database connection
     */
    async initialize() {
        // This method will be overridden in GJS implementation
        // because we can't directly import Gda in TypeScript
        throw new Error('GdaAdapter.initialize must be implemented in GJS');
    }
    /**
     * Execute a SELECT query
     */
    async query(sql, params) {
        if (!this.connection) {
            throw new Error('Database not connected');
        }
        // This will be implemented in GJS
        throw new Error('GdaAdapter.query must be implemented in GJS');
    }
    /**
     * Execute an INSERT/UPDATE/DELETE query
     */
    async execute(sql, params) {
        if (!this.connection) {
            throw new Error('Database not connected');
        }
        // This will be implemented in GJS
        throw new Error('GdaAdapter.execute must be implemented in GJS');
    }
    /**
     * Begin a transaction
     */
    async beginTransaction() {
        if (!this.connection) {
            throw new Error('Database not connected');
        }
        // This will be implemented in GJS
        throw new Error('GdaAdapter.beginTransaction must be implemented in GJS');
    }
    /**
     * Commit a transaction
     */
    async commit() {
        if (!this.connection) {
            throw new Error('Database not connected');
        }
        // This will be implemented in GJS
        throw new Error('GdaAdapter.commit must be implemented in GJS');
    }
    /**
     * Rollback a transaction
     */
    async rollback() {
        if (!this.connection) {
            throw new Error('Database not connected');
        }
        // This will be implemented in GJS
        throw new Error('GdaAdapter.rollback must be implemented in GJS');
    }
    /**
     * Close database connection
     */
    async close() {
        if (this.connection) {
            // This will be implemented in GJS
            this.connection = null;
            this.isConnected_ = false;
        }
    }
    /**
     * Check if database is connected
     */
    isConnected() {
        return this.isConnected_;
    }
    /**
     * Set connection (used by GJS implementation)
     */
    setConnection(connection) {
        this.connection = connection;
        this.isConnected_ = true;
    }
    /**
     * Get connection (for legacy code compatibility)
     */
    getConnection() {
        return this.connection;
    }
}
