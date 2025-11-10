# Example Extension

A template extension showing how to create custom functionality for Valot.

## Features

- Feature 1
- Feature 2
- Feature 3

## Installation

1. Download `Example.js`
2. Open Valot → Preferences → Extensions
3. Click "Add" button
4. Select "From File" or "From URL"
5. Toggle the extension to activate

## Usage

How to use your extension.

## Development

### Project Structure

```
Example/
├── manifest.json       # Extension metadata
├── Example.js          # Main extension class
├── logic/              # Business logic
│   └── *.js
├── resources/          # Assets (icons, images, etc.)
│   ├── icon.svg
│   └── *.png
└── README.md           # This file
```

### API

```javascript
export class Example {
    constructor() {
        this.metadata = {
            id: 'example-extension',
            name: 'Example Extension',
            description: 'Short description',
            version: '1.0.0',
            author: 'Your Name',
            type: 'plugin', // or 'addon'
        };
    }

    async activate(context) {
        // context.app - Application instance
        // context.coreAPI - Core API
        // context.coreBridge - UI-Core bridge
        // context.dataNavigator - Data layer
        // context.mainWindow - Main window
        
        // Add your extension logic here
    }

    async deactivate() {
        // Cleanup: remove UI elements, disconnect signals
    }

    createSettingsPage = () => {
        // Optional: Return Adw.PreferencesPage for settings
        return new Adw.PreferencesPage({...});
    };
}
```

### Building

1. Fork this template
2. Modify `Example.js`
3. Update `manifest.json`
4. Commit and push to your repository
5. Submit for inclusion in https://gitlab.com/valot/extensions

## License

GPL-3.0-or-later (or your preferred license)

