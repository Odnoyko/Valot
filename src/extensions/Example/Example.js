/**
 * Example Extension
 * A template extension showing how to create custom functionality
 */

import Gtk from 'gi://Gtk';
import Adw from 'gi://Adw?version=1';

export class Example {
    constructor() {
        this.metadata = {
            id: 'example-extension',
            name: 'Example Extension',
            description: 'A template extension showing how to create custom functionality',
            version: '1.0.0',
            author: 'Your Name',
            type: 'plugin', // or 'addon'
        };

        // Your extension state
        this.someProperty = null;
        this.context = null;
    }

    /**
     * Activate the extension
     * Called when user enables the extension
     * @param {Object} context - Extension context
     */
    async activate(context) {
        this.context = context;

        // Example: Access application components
        console.warn('Example Extension: Activating...');
        console.warn('  App:', context.app ? 'EXISTS' : 'NULL');
        console.warn('  CoreAPI:', context.coreAPI ? 'EXISTS' : 'NULL');
        console.warn('  CoreBridge:', context.coreBridge ? 'EXISTS' : 'NULL');
        console.warn('  DataNavigator:', context.dataNavigator ? 'EXISTS' : 'NULL');
        console.warn('  MainWindow:', context.mainWindow ? 'EXISTS' : 'NULL');

        // TODO: Add your extension logic here
        // Example: Add UI elements, subscribe to events, etc.
    }

    /**
     * Deactivate the extension
     * Called when user disables the extension
     */
    async deactivate() {
        console.warn('Example Extension: Deactivating...');

        // TODO: Cleanup
        // Example: Remove UI elements, disconnect signals, etc.

        // Clear references
        this.context = null;
        this.someProperty = null;
    }

    /**
     * Optional: Create settings page for this extension
     * Called when user clicks settings button
     * @returns {Adw.PreferencesPage} Settings page or null
     */
    createSettingsPage = () => {
        const page = new Adw.PreferencesPage({
            title: this.metadata.name,
            icon_name: 'emblem-system-symbolic',
        });

        const group = new Adw.PreferencesGroup({
            title: 'Settings',
            description: 'Configure this extension',
        });

        const infoRow = new Adw.ActionRow({
            title: 'About',
            subtitle: `Version ${this.metadata.version}`,
        });

        group.add(infoRow);
        page.add(group);

        return page;
    };
}

