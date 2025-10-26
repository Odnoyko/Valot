/**
 * DataNavigator
 * Routes data requests to the appropriate provider (Local, Cloud, Plugin)
 * Manages provider registration and selection
 */

import { LocalDBProvider } from './providers/LocalDBProvider.js';

export class DataNavigator {
    constructor() {
        // Registry of available providers
        this.providers = new Map();

        // Currently active provider
        this.activeProvider = null;

        // Active provider type
        this.activeProviderType = null;

        this._initialized = false;
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

        } catch (error) {
            // Rollback to previous provider on error
            this.activeProvider = previousProvider;
            this.activeProviderType = previousProviderType;

            throw new Error(`Failed to switch to provider '${providerName}': ${error.message}`);
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
}
