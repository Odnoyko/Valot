# How to Create a New Extension

## 1. Copy Template

```bash
cp -r Example/ my-new-extension/
cd my-new-extension/
```

## 2. Rename Files

- Rename `Example.js` to `MyNewExtension.js`
- Update class name in the file from `Example` to `MyNewExtension`

## 3. Update Metadata

Edit `manifest.json`:
- Change `id` to your unique extension ID
- Update `name`, `description`, `author`, `repository`
- Set `type` to `"plugin"` or `"addon"`
- Set correct `main` filename

## 4. Implement Logic

Edit your main JS file:
- Implement `activate()` method
- Implement `deactivate()` method
- Optionally implement `createSettingsPage()` for settings UI

## 5. Add Resources (Optional)

- Put icons in `resources/icon.svg`
- Put images in `resources/*.png`
- Add logic modules in `logic/*.js`

## 6. Test Locally

1. Copy your extension JS file to `~/.var/app/com.odnoyko.valot/cache/valot/extensions/`
2. Open Valot → Preferences → Extensions
3. Click "Add" → "From File"
4. Select your JS file
5. Toggle to test

## 7. Publish to GitLab

1. Create a new GitLab repository (e.g., https://gitlab.com/valot/my-new-extension)
2. Push your files
3. Add the main JS file URL to https://gitlab.com/valot/extensions

## Extension Types

### Plugin
- Small feature
- Minimal UI changes
- Example: Quick actions, integrations

### Addon
- Big feature
- Complete functionality with dedicated tabs
- Example: Tags system, team collaboration

## Context API

```javascript
async activate(context) {
    // Access application
    context.app            // GTK Application instance
    
    // Access core services
    context.coreAPI        // Business logic API
    context.coreAPI.services.tasks      // Task service
    context.coreAPI.services.projects   // Project service
    context.coreAPI.services.clients    // Client service
    context.coreAPI.services.tracking   // Time tracking service
    
    // Access UI bridge
    context.coreBridge     // UI-Core bridge
    context.coreBridge.startTracking()
    context.coreBridge.stopTracking()
    context.coreBridge.getTrackingState()
    context.coreBridge.emitUIEvent('task-updated')
    
    // Access data layer
    context.dataNavigator  // Data layer
    context.dataNavigator.exportActiveDatabase()
    context.dataNavigator.mergeFromDatabaseFile()
    
    // Access main window
    context.mainWindow     // Main window instance
    context.mainWindow.tasksPageInstance
    context.mainWindow.projectsPageInstance
}
```

## Best Practices

1. **Clean up in deactivate()** - Always remove UI elements and disconnect signals
2. **Error handling** - Wrap risky operations in try/catch
3. **Performance** - Don't block the UI thread
4. **Testing** - Test activation/deactivation multiple times
5. **Documentation** - Document your API and usage

