# Data Providers Architecture

This directory contains the data provider system for Valot. The architecture allows switching between different data storage backends (Local SQLite, Cloud, Plugin-based) transparently.

## Architecture Overview

```
Core Layer (business logic)
    ↓ uses
DataNavigator (routes requests)
    ↓ delegates to
Active Provider (DataProvider implementation)
    ↓ uses
Storage Backend (SQLite, Cloud API, Plugin, etc.)
```

## Components

### 1. DataProvider (Base Class/Interface)
All providers must extend this class. It defines the contract for:
- Connection management (`initialize()`, `close()`, `isConnected()`)
- Query execution (`query()`, `execute()`)
- Transaction management (`beginTransaction()`, `commit()`, `rollback()`)
- Metadata operations (`getMetadata()`, `setMetadata()`)
- Schema versioning (`getSchemaVersion()`, `setSchemaVersion()`)

### 2. DataNavigator (Router/Registry)
The main class that Core layer uses:
- Automatically registers and initializes LocalDBProvider
- `registerProvider(name, provider)` - Register a new provider
- `switchProvider(name)` - Switch to a different provider
- `getActiveProvider()` - Get currently active provider
- `getAvailableProviders()` - List all registered providers
- Delegates all data operations to the active provider

### 3. LocalDBProvider (SQLite Implementation)
Default provider that wraps GdaDatabaseBridge for local SQLite storage.

## Usage Example (Core Layer)

```javascript
// Initialize DataNavigator
const dataNavigator = new DataNavigator();
await dataNavigator.initialize();

// Use it like a database adapter
const rows = await dataNavigator.query('SELECT * FROM Project WHERE id = ?', [1]);
await dataNavigator.execute('INSERT INTO Task (name) VALUES (?)', ['My Task']);

// Switch to a different provider
await dataNavigator.switchProvider('cloud');
```

## Creating a Custom Provider (For Plugins)

1. **Extend DataProvider Base Class**

```javascript
import { DataProvider } from 'resource:///com/odnoyko/valot/data/DataProvider.js';

export class MyCustomProvider extends DataProvider {
    async initialize() {
        // Initialize your storage backend
        console.log('Initializing MyCustomProvider...');
        // Connect to your API, database, etc.
    }

    isConnected() {
        // Return connection status
        return this._connected;
    }

    async query(sql, params = []) {
        // Implement SELECT queries
        // You can translate SQL to API calls, or use your own query format
        const results = await this.myAPI.get('/data', { query: sql });
        return results;
    }

    async execute(sql, params = []) {
        // Implement INSERT/UPDATE/DELETE
        await this.myAPI.post('/data', { statement: sql, params });
    }

    async beginTransaction() {
        // Start a transaction in your backend
    }

    async commit() {
        // Commit the transaction
    }

    async rollback() {
        // Rollback the transaction
    }

    async close() {
        // Close connection
    }

    async getSchemaVersion() {
        // Return schema version
        return 1;
    }

    async setSchemaVersion(version) {
        // Update schema version
    }

    async getMetadata(key) {
        // Get metadata value
    }

    async setMetadata(key, value) {
        // Set metadata value
    }

    getProviderType() {
        return 'custom';
    }

    getProviderName() {
        return 'my-custom-provider';
    }
}
```

2. **Register Your Provider**

```javascript
// In your plugin initialization
import { MyCustomProvider } from './MyCustomProvider.js';

export function activate(extensionContext) {
    // Get DataNavigator instance from Core
    const dataNavigator = extensionContext.getDataNavigator();

    // Register your custom provider
    const myProvider = new MyCustomProvider();
    dataNavigator.registerProvider('my-plugin', myProvider);

    // Optionally switch to your provider
    await dataNavigator.switchProvider('my-plugin');
}
```

## Provider Types

### Local Provider (`local`)
- **Type**: SQLite database via GDA
- **Location**: `~/.var/app/com.odnoyko.valot/data/valot/valot.db`
- **Use Case**: Default, offline-first storage

### Cloud Provider (`cloud`) - Future
- **Type**: REST API to cloud service
- **Use Case**: Sync across devices, backup

### Plugin Providers
- **Type**: Custom implementations via plugins
- **Use Case**: Integration with external services (Notion, Jira, etc.)

## Notes

- All providers must extend the DataProvider base class
- Core layer is unaware of which provider is active
- Switching providers at runtime is supported
- Multiple providers can be registered simultaneously
- Only one provider can be active at a time

## File Structure

```
src/data/
├── DataProvider.js              # Base class/interface for all providers
├── DataNavigator.js             # Main entry point, router/registry
└── providers/
    ├── LocalDBProvider.js       # SQLite implementation
    ├── CloudProvider.js         # Future cloud implementation
    └── gdaDBBridge/             # SQLite backend
        ├── GdaDatabaseBridge.js
        └── DatabaseMigration.js
```
