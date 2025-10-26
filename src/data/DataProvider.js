/**
 * DataProvider Interface
 * Base class that all data providers must extend
 * Used by DataNavigator to switch between different storage backends
 */

export class DataProvider {
    /**
     * Initialize the data provider
     * @returns {Promise<void>}
     */
    async initialize() {
        throw new Error('Method initialize() must be implemented');
    }

    /**
     * Check if provider is connected/ready
     * @returns {boolean}
     */
    isConnected() {
        throw new Error('Method isConnected() must be implemented');
    }

    /**
     * Execute a raw query (for providers that support SQL)
     * @param {string} sql - SQL query
     * @param {Array} params - Query parameters
     * @returns {Promise<Array>} Query results
     */
    async query(sql, params = []) {
        throw new Error('Method query() must be implemented');
    }

    /**
     * Execute a raw statement (INSERT, UPDATE, DELETE)
     * @param {string} sql - SQL statement
     * @param {Array} params - Statement parameters
     * @returns {Promise<void>}
     */
    async execute(sql, params = []) {
        throw new Error('Method execute() must be implemented');
    }

    /**
     * Begin a transaction
     * @returns {Promise<void>}
     */
    async beginTransaction() {
        throw new Error('Method beginTransaction() must be implemented');
    }

    /**
     * Commit current transaction
     * @returns {Promise<void>}
     */
    async commit() {
        throw new Error('Method commit() must be implemented');
    }

    /**
     * Rollback current transaction
     * @returns {Promise<void>}
     */
    async rollback() {
        throw new Error('Method rollback() must be implemented');
    }

    /**
     * Close the connection
     * @returns {Promise<void>}
     */
    async close() {
        throw new Error('Method close() must be implemented');
    }

    /**
     * Get schema version
     * @returns {Promise<number>}
     */
    async getSchemaVersion() {
        throw new Error('Method getSchemaVersion() must be implemented');
    }

    /**
     * Set schema version
     * @param {number} version - Schema version
     * @returns {Promise<void>}
     */
    async setSchemaVersion(version) {
        throw new Error('Method setSchemaVersion() must be implemented');
    }

    /**
     * Get metadata value by key
     * @param {string} key - Metadata key
     * @returns {Promise<string|null>}
     */
    async getMetadata(key) {
        throw new Error('Method getMetadata() must be implemented');
    }

    /**
     * Set metadata value
     * @param {string} key - Metadata key
     * @param {string} value - Metadata value
     * @returns {Promise<void>}
     */
    async setMetadata(key, value) {
        throw new Error('Method setMetadata() must be implemented');
    }

    /**
     * Get provider type identifier
     * @returns {string} Provider type ('local', 'cloud', 'plugin', etc.)
     */
    getProviderType() {
        throw new Error('Method getProviderType() must be implemented');
    }

    /**
     * Get provider name/identifier (for plugins)
     * @returns {string} Provider name
     */
    getProviderName() {
        throw new Error('Method getProviderName() must be implemented');
    }
}
