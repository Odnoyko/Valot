/**
 * LocalDBProvider
 * Wrapper for GdaDatabaseBridge (SQLite local database)
 * Extends DataProvider base class
 */

import { DataProvider } from '../DataProvider.js';
import { GdaDatabaseBridge } from './gdaDBBridge/GdaDatabaseBridge.js';

export class LocalDBProvider extends DataProvider {
    constructor(dbPath = null) {
        super();
        this.bridge = new GdaDatabaseBridge();
        this.providerType = 'local';
        this.providerName = 'local-sqlite';
        this.dbPathOverride = dbPath;
    }

    /**
     * Initialize the local database connection
     * @returns {Promise<void>}
     */
    async initialize() {
        await this.bridge.initialize(this.dbPathOverride || null);
    }

    /**
     * Check if database is connected
     * @returns {boolean}
     */
    isConnected() {
        return this.bridge.isConnected();
    }

    /**
     * Execute a SELECT query
     * @param {string} sql - SQL query
     * @param {Array} params - Query parameters
     * @returns {Promise<Array>} Query results
     */
    query(sql, params = []) {
        return this.bridge.query(sql, params);
    }

    /**
     * Execute INSERT, UPDATE, DELETE statement
     * @param {string} sql - SQL statement
     * @param {Array} params - Statement parameters
     * @returns {Promise<void>}
     */
    execute(sql, params = []) {
        return this.bridge.execute(sql, params);
    }

    /**
     * Begin a transaction
     * @returns {Promise<void>}
     */
    beginTransaction() {
        return this.bridge.beginTransaction();
    }

    /**
     * Commit current transaction
     * @returns {Promise<void>}
     */
    commit() {
        return this.bridge.commit();
    }

    /**
     * Rollback current transaction
     * @returns {Promise<void>}
     */
    rollback() {
        return this.bridge.rollback();
    }

    /**
     * Close the database connection
     * @returns {Promise<void>}
     */
    close() {
        return this.bridge.close();
    }

    /**
     * Get database schema version
     * @returns {Promise<number>}
     */
    getSchemaVersion() {
        return this.bridge.getSchemaVersion();
    }

    /**
     * Set database schema version
     * @param {number} version - Schema version
     * @returns {Promise<void>}
     */
    setSchemaVersion(version) {
        return this.bridge.setSchemaVersion(version);
    }

    /**
     * Get metadata value by key
     * @param {string} key - Metadata key
     * @returns {Promise<string|null>}
     */
    getMetadata(key) {
        return this.bridge.getMetadata(key);
    }

    /**
     * Set metadata value
     * @param {string} key - Metadata key
     * @param {string} value - Metadata value
     * @returns {Promise<void>}
     */
    setMetadata(key, value) {
        return this.bridge.setMetadata(key, value);
    }

    /**
     * Get provider type
     * @returns {string}
     */
    getProviderType() {
        return this.providerType;
    }

    /**
     * Get provider name
     * @returns {string}
     */
    getProviderName() {
        return this.providerName;
    }

    /**
     * Get database path (LocalDB-specific method)
     * @returns {string|null}
     */
    getDatabasePath() {
        return this.bridge.dbPath;
    }

    /**
     * Change database path for this provider (must re-initialize)
     * @param {string} dbPath
     */
    setDatabasePath(dbPath) {
        this.dbPathOverride = dbPath;
    }

    /**
     * Get underlying GdaDatabaseBridge instance (for advanced usage)
     * @returns {GdaDatabaseBridge}
     */
    getBridge() {
        return this.bridge;
    }
}
