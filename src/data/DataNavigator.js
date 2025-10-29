/**
 * DataNavigator
 * Routes data requests to the appropriate provider (Local, Cloud, Plugin)
 * Manages provider registration and selection
 */

import { LocalDBProvider } from './providers/LocalDBProvider.js';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

export class DataNavigator {
    constructor() {
        // Registry of available providers
        this.providers = new Map();

        // Currently active provider
        this.activeProvider = null;

        // Active provider type
        this.activeProviderType = null;

        this._initialized = false;

        // Simple event callbacks (provider-switched, providers-changed)
        this._callbacks = new Map();
    }

    /**
     * Initialize DataNavigator with default providers
     * @returns {Promise<void>}
     */
    async initialize() {
        if (this._initialized) {
            return;
        }

        // Register LocalDB provider
        const localProvider = new LocalDBProvider();
        this.registerProvider('local', localProvider);

        // Select local provider as default
        await this.switchProvider('local');

        this._initialized = true;
    }

    /**
     * Register a data provider
     * @param {string} name - Provider identifier (e.g., 'local', 'cloud', 'my-plugin')
     * @param {DataProvider} provider - Provider implementation
     */
    registerProvider(name, provider) {
        if (!provider) {
            throw new Error(`Cannot register null provider: ${name}`);
        }

        // Verify provider implements required methods
        this._validateProvider(provider);

        this.providers.set(name, provider);
    }

    /**
     * Validate that provider implements DataProvider interface
     * @param {DataProvider} provider - Provider to validate
     * @private
     */
    _validateProvider(provider) {
        const requiredMethods = [
            'initialize',
            'isConnected',
            'query',
            'execute',
            'beginTransaction',
            'commit',
            'rollback',
            'close',
            'getSchemaVersion',
            'setSchemaVersion',
            'getMetadata',
            'setMetadata',
            'getProviderType',
            'getProviderName'
        ];

        for (const method of requiredMethods) {
            if (typeof provider[method] !== 'function') {
                throw new Error(`Provider must implement method: ${method}()`);
            }
        }
    }

    /**
     * Switch to a different provider
     * @param {string} providerName - Name of provider to activate
     * @returns {Promise<void>}
     */
    async switchProvider(providerName) {
        const provider = this.providers.get(providerName);

        if (!provider) {
            throw new Error(`Provider '${providerName}' not found. Available: ${Array.from(this.providers.keys()).join(', ')}`);
        }

        // Save previous provider for rollback
        const previousProvider = this.activeProvider;
        const previousProviderType = this.activeProviderType;

        try {
            // Close current provider if active
            if (this.activeProvider && this.activeProvider !== provider) {
                await this.activeProvider.close();
            }

            // Initialize new provider if not already initialized
            if (!provider.isConnected()) {
                await provider.initialize();
            }

            // Verify connection after initialization
            if (!provider.isConnected()) {
                throw new Error(`Provider '${providerName}' failed to connect`);
            }

            this.activeProvider = provider;
            this.activeProviderType = providerName;

            // Notify listeners
            this._emit('provider-switched', { name: providerName, provider });

        } catch (error) {
            // Rollback to previous provider on error
            this.activeProvider = previousProvider;
            this.activeProviderType = previousProviderType;

            throw new Error(`Failed to switch to provider '${providerName}': ${error.message}`);
        }
    }

    /**
     * Register a new local database by absolute path and optional name
     * @param {string} name - Provider key (unique)
     * @param {string} dbPath - Absolute path to .db file
     */
    async registerLocalDatabase(name, dbPath) {
        if (!name || !dbPath)
            throw new Error('registerLocalDatabase requires name and dbPath');

        const provider = new LocalDBProvider(dbPath);
        this.registerProvider(name, provider);
        this._emit('providers-changed', Array.from(this.providers.keys()));
    }

    /**
     * Switch to a local SQLite database by file path (creates a provider if needed)
     * @param {string} dbPath - Absolute path to .db file
     */
    async switchToLocalDatabaseByPath(dbPath) {
        const existing = Array.from(this.providers.entries()).find(([key, prov]) => prov.getProviderType && prov.getProviderType() === 'local' && prov.getDatabasePath && prov.getDatabasePath() === dbPath);
        let name = existing?.[0];
        if (!name) {
            name = `local:${dbPath}`;
            await this.registerLocalDatabase(name, dbPath);
        }
        await this.switchProvider(name);
    }

    /**
     * Subscribe to DataNavigator events
     * @param {string} event
     * @param {Function} cb
     */
    on(event, cb) {
        if (!this._callbacks.has(event)) this._callbacks.set(event, new Set());
        this._callbacks.get(event).add(cb);
    }

    _emit(event, data) {
        const set = this._callbacks.get(event);
        if (!set) return;
        for (const cb of set) {
            try { cb(data); } catch (e) { console.error('DataNavigator event error', e); }
        }
    }

    /**
     * Get current provider name
     * @returns {string|null}
     */
    getCurrentProviderName() {
        return this.activeProviderType;
    }

    /**
     * Get list of registered providers
     * @returns {Array<string>}
     */
    getAvailableProviders() {
        return Array.from(this.providers.keys());
    }

    /**
     * Check if a provider is registered
     * @param {string} providerName - Provider name to check
     * @returns {boolean}
     */
    hasProvider(providerName) {
        return this.providers.has(providerName);
    }

    /**
     * Unregister a provider
     * @param {string} providerName - Provider name to remove
     */
    unregisterProvider(providerName) {
        if (this.activeProviderType === providerName) {
            throw new Error(`Cannot unregister active provider '${providerName}'. Switch to another provider first.`);
        }

        return this.providers.delete(providerName);
    }

    /**
     * Get the currently active provider
     * @returns {DataProvider}
     * @private
     */
    _getActiveProvider() {
        if (!this.activeProvider) {
            throw new Error('No active provider selected. Call initialize() first.');
        }
        return this.activeProvider;
    }

    /**
     * Execute a SELECT query
     * @param {string} sql - SQL query
     * @param {Array} params - Query parameters
     * @returns {Promise<Array>}
     */
    query(sql, params = []) {
        return this._getActiveProvider().query(sql, params);
    }

    /**
     * Execute INSERT, UPDATE, DELETE statement
     * @param {string} sql - SQL statement
     * @param {Array} params - Statement parameters
     * @returns {Promise<void>}
     */
    execute(sql, params = []) {
        return this._getActiveProvider().execute(sql, params);
    }

    /**
     * Begin a transaction
     * @returns {Promise<void>}
     */
    beginTransaction() {
        return this._getActiveProvider().beginTransaction();
    }

    /**
     * Commit current transaction
     * @returns {Promise<void>}
     */
    commit() {
        return this._getActiveProvider().commit();
    }

    /**
     * Rollback current transaction
     * @returns {Promise<void>}
     */
    rollback() {
        return this._getActiveProvider().rollback();
    }

    /**
     * Get database schema version
     * @returns {Promise<number>}
     */
    getSchemaVersion() {
        return this._getActiveProvider().getSchemaVersion();
    }

    /**
     * Set database schema version
     * @param {number} version - Schema version
     * @returns {Promise<void>}
     */
    setSchemaVersion(version) {
        return this._getActiveProvider().setSchemaVersion(version);
    }

    /**
     * Get metadata value
     * @param {string} key - Metadata key
     * @returns {Promise<string|null>}
     */
    getMetadata(key) {
        return this._getActiveProvider().getMetadata(key);
    }

    /**
     * Set metadata value
     * @param {string} key - Metadata key
     * @param {string} value - Metadata value
     * @returns {Promise<void>}
     */
    setMetadata(key, value) {
        return this._getActiveProvider().setMetadata(key, value);
    }

    /**
     * Check if provider is connected
     * @returns {boolean}
     */
    isConnected() {
        return this._getActiveProvider().isConnected();
    }

    /**
     * Get the active provider instance (for advanced usage)
     * @returns {DataProvider}
     */
    getActiveProvider() {
        return this._getActiveProvider();
    }

    /**
     * Cleanup and close all providers
     * @returns {Promise<void>}
     */
    async cleanup() {
        for (const [name, provider] of this.providers.entries()) {
            try {
                if (provider.isConnected()) {
                    await provider.close();
                }
            } catch (error) {
                console.error(`Error closing provider '${name}':`, error);
            }
        }

        this.activeProvider = null;
        this.activeProviderType = null;
        this.providers.clear();
        this._initialized = false;
    }

    /**
     * Merge data from an external SQLite database file into the ACTIVE provider
     * @param {string} importPath - Absolute path to source .db
     * @param {(step:number,total:number,message:string)=>void} progress - Optional progress callback
     */
    async mergeFromDatabaseFile(importPath, progress = null) {
        const active = this._getActiveProvider();
        if (active.getProviderType() !== 'local' || !active.getBridge) {
            throw new Error('mergeFromDatabaseFile is supported only for local SQLite provider');
        }
        const { DatabaseImport } = await import('resource:///com/odnoyko/valot/data/providers/gdaDBBridge/DatabaseImport.js');
        const dbImport = new DatabaseImport(active.getBridge());
        const result = await dbImport.mergeData(importPath, progress);
        this._emit('data-merged', result);
        return result;
    }

    /**
     * Replace active database contents with data from external SQLite file
     * @param {string} importPath
     * @param {(step:number,total:number,message:string)=>void} progress
     */
    async replaceWithDatabaseFile(importPath, progress = null) {
        const active = this._getActiveProvider();
        if (active.getProviderType() !== 'local' || !active.getBridge) {
            throw new Error('replaceWithDatabaseFile is supported only for local SQLite provider');
        }
        const { DatabaseImport } = await import('resource:///com/odnoyko/valot/data/providers/gdaDBBridge/DatabaseImport.js');
        const dbImport = new DatabaseImport(active.getBridge());
        const result = await dbImport.replaceData(importPath, progress);
        this._emit('data-replaced', result);
        return result;
    }

    /**
     * Export active database file to destination path (overwrites)
     * @param {string} destPath
     */
    async exportActiveDatabase(destPath) {
        const active = this._getActiveProvider();
        const srcPath = active.getDatabasePath?.();
        if (!srcPath) throw new Error('Active provider does not expose database path');

        const src = Gio.File.new_for_path(srcPath);
        const dst = Gio.File.new_for_path(destPath);
        src.copy(dst, Gio.FileCopyFlags.OVERWRITE, null, null);
        this._emit('database-exported', { from: srcPath, to: destPath });
    }

    /**
     * Reset active database contents without closing connection
     */
    async resetActiveDatabase() {
        const active = this._getActiveProvider();
        const appDb = active.getBridge?.() || active;
        if (!appDb?.execute) throw new Error('Active provider has no execute capability');

        await appDb.execute('BEGIN IMMEDIATE');
        try {
            await appDb.execute('DELETE FROM TimeEntry');
            await appDb.execute('DELETE FROM TaskInstance');
            await appDb.execute('DELETE FROM Task');
            await appDb.execute('DELETE FROM Project WHERE id != 1');
            await appDb.execute('DELETE FROM Client WHERE id != 1');
            await appDb.execute('COMMIT');
        } catch (e) {
            try { await appDb.execute('ROLLBACK'); } catch {}
            throw e;
        }
        this._emit('database-reset', true);
    }

    /**
     * Get active database absolute path (if available)
     */
    getActiveDatabasePath() {
        const active = this._getActiveProvider();
        return active.getDatabasePath?.() || null;
    }
}
