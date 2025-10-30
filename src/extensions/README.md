# Valot Extensions System

Extensions allow you to add new features to Valot without modifying the core application.

## Types of Extensions

### 1. **Addons** (Big Features)
- Add complete features with dedicated tabs
- Example: Tags system, Advanced reports, Team collaboration
- Have their own settings pages
- Can modify UI extensively

### 2. **Plugins** (Small Features)
- Add buttons, shortcuts, integrations
- Example: Quick actions, external service integrations
- Minimal UI changes
- Focus on specific functionality

## Extension Structure

```javascript
export class MyExtension {
    constructor() {
        this.metadata = {
            id: 'my-extension',  // Unique identifier
            name: 'My Extension',  // Display name
            description: 'Does cool things',  // Short description
            version: '1.0.0',
            author: 'Your Name',
            type: 'addon', // or 'plugin'
        };
    }

    /**
     * Called when extension is activated
     * @param {Object} context - Extension context
     */
    async activate(context) {
        // context.app - Application instance
        // context.coreAPI - Core API for business logic
        // context.coreBridge - UI-Core bridge
        // context.dataNavigator - Data layer access
        // context.mainWindow - Main window instance
        
        console.log('Extension activated');
    }

    /**
     * Called when extension is deactivated
     */
    async deactivate() {
        console.log('Extension deactivated');
        // Cleanup: remove UI elements, disconnect signals, etc.
    }

    /**
     * Optional: Create settings page for preferences
     */
    createSettingsPage = () => {
        const page = new Adw.PreferencesPage({
            title: this.metadata.name,
            icon_name: 'emblem-system-symbolic',
        });
        
        // Add your settings groups/rows here
        
        return page;
    };
}
```

## Installation Methods

### 1. Load from File (User Extensions)
1. Open Valot → Preferences → Extensions
2. Click "Load Extension from File"
3. Select your `.js` file
4. Extension is loaded and activated

### 2. Builtin Extensions
Add to `src/extensions/builtin/` and register in `ExtensionManager.loadBuiltinExtensions()`:

```javascript
const { MyExtension } = await import('./builtin/MyExtension.js');
this.registerExtension('my-extension', new MyExtension());
```

### 3. Flatpak Extensions (Distribution)

For distributing extensions via Flathub, create a Flatpak extension:

#### Extension Manifest (`com.odnoyko.valot.Extension.MyExtension.json`):

```json
{
  "id": "com.odnoyko.valot.Extension.MyExtension",
  "branch": "stable",
  "runtime": "com.odnoyko.valot",
  "runtime-version": "stable",
  "sdk": "org.gnome.Sdk//46",
  "build-extension": true,
  "separate-locales": false,
  "appstream-compose": false,
  "build-options": {
    "prefix": "/app/extensions/MyExtension"
  },
  "modules": [
    {
      "name": "my-extension",
      "buildsystem": "simple",
      "build-commands": [
        "install -Dm644 MyExtension.js /app/extensions/MyExtension/",
        "install -Dm644 com.odnoyko.valot.extension.MyExtension.metainfo.xml /app/share/metainfo/"
      ],
      "sources": [
        {
          "type": "file",
          "path": "MyExtension.js"
        },
        {
          "type": "file",
          "path": "com.odnoyko.valot.extension.MyExtension.metainfo.xml"
        }
      ]
    }
  ]
}
```

#### MetaInfo File (`com.odnoyko.valot.extension.MyExtension.metainfo.xml`):

```xml
<?xml version="1.0" encoding="UTF-8"?>
<component type="addon">
  <id>com.odnoyko.valot.Extension.MyExtension</id>
  <extends>com.odnoyko.valot</extends>
  <name>My Extension</name>
  <summary>Adds cool features to Valot</summary>
  <description>
    <p>
      This extension adds awesome functionality to Valot time tracker.
    </p>
  </description>
  <url type="homepage">https://github.com/yourname/valot-extension</url>
  <metadata_license>CC0-1.0</metadata_license>
  <project_license>GPL-3.0-or-later</project_license>
  <releases>
    <release version="1.0.0" date="2025-01-01">
      <description>
        <p>Initial release</p>
      </description>
    </release>
  </releases>
</component>
```

#### Main App Support (already included in Valot)

The main app manifest includes:

```json
{
  "add-extensions": {
    "com.odnoyko.valot.Extension": {
      "directory": "extensions",
      "version": "stable",
      "subdirectories": true,
      "no-autodownload": false,
      "autodelete": true
    }
  }
}
```

And finish commands:

```json
{
  "finish-args": [
    "--filesystem=~/.var/app/com.odnoyko.valot/extensions:create"
  ]
}
```

## API Reference

### Context Object

```typescript
interface ExtensionContext {
  app: Application;           // GTK Application instance
  coreAPI: CoreAPI;           // Business logic API
  coreBridge: CoreBridge;     // UI-Core bridge
  dataNavigator: DataNavigator; // Data layer
  mainWindow: MainWindow;     // Main window
}
```

### Core API Services

```javascript
// Tasks
await context.coreAPI.services.tasks.create({ name: 'New Task' });
await context.coreAPI.services.tasks.getAll();

// Projects
await context.coreAPI.services.projects.create({ name: 'Project', color: '#ff0000' });

// Time Tracking
await context.coreAPI.services.tracking.start(taskId, projectId, clientId);
await context.coreAPI.services.tracking.stop();

// Stats
const stats = await context.coreAPI.services.stats.getThisWeekStats();
```

### UI Bridge

```javascript
// Start/Stop tracking
await context.coreBridge.startTracking(taskId, projectId, clientId);
await context.coreBridge.stopTracking();

// Get tracking state
const state = context.coreBridge.getTrackingState();

// Emit UI events
context.coreBridge.emitUIEvent('task-updated');
```

### Data Navigator

```javascript
// Export database
await context.dataNavigator.exportActiveDatabase(destPath);

// Import/merge
await context.dataNavigator.mergeFromDatabaseFile(importPath);

// Reset database
await context.dataNavigator.resetActiveDatabase();
```

## Examples

See `builtin/QuickTaskAddon.js` for a complete working example.

## Testing Your Extension

1. Save your extension as `MyExtension.js`
2. Open Valot → Preferences → Extensions
3. Click "Load Extension from File"
4. Select your file
5. Toggle the extension on/off to test activation/deactivation

## Publishing to Flathub

1. Create metainfo file with extension metadata
2. Create Flatpak manifest
3. Submit to Flathub following [extension guidelines](https://docs.flathub.org/docs/for-app-authors/metainfo-guidelines#extensions)
4. Users can install with: `flatpak install flathub com.odnoyko.valot.Extension.MyExtension`

## Guidelines

- **Keep it focused**: Each extension should do one thing well
- **Clean up**: Always remove UI elements in `deactivate()`
- **Error handling**: Wrap risky operations in try/catch
- **Performance**: Don't block the UI thread
- **Compatibility**: Test with latest Valot version

