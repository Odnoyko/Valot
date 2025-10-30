/**
 * Extension Manager
 * Manages loading, activation, and lifecycle of extensions (addons and plugins)
 */

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

export class ExtensionManager {
    constructor(app) {
        this.app = app;
        this.extensions = new Map();
        this.activeExtensions = new Set();
        this.extensionSettings = new Map();
        
        // Get config directory for storing extension state
        this.configDir = GLib.build_filenamev([GLib.get_user_config_dir(), 'valot']);
        this.extensionsConfigFile = GLib.build_filenamev([this.configDir, 'extensions.json']);
        
        // Ensure config directory exists
        this._ensureConfigDir();
    }

    /**
     * Register an extension
     * @param {string} id - Unique extension ID
     * @param {Object} extension - Extension object with metadata and activate/deactivate methods
     */
    registerExtension(id, extension) {
        if (this.extensions.has(id)) {
            console.warn(`Extension ${id} already registered`);
            return false;
        }

        // Validate extension structure
        if (!extension.metadata || !extension.activate) {
            console.error(`Invalid extension structure for ${id}`);
            return false;
        }

        this.extensions.set(id, extension);
        return true;
    }

    /**
     * Activate an extension (non-blocking)
     */
    activateExtension(id) {
        const extension = this.extensions.get(id);
        if (!extension) {
            console.error(`Extension ${id} not found`);
            return Promise.resolve(false);
        }

        if (this.activeExtensions.has(id)) {
            console.warn(`Extension ${id} already active`);
            return Promise.resolve(true);
        }

        // Schedule activation non-blocking
        const checkAndActivate = () => {
            const mainWindow = this.app.active_window;
            if (!mainWindow) {
                // Check again later
                setTimeout(checkAndActivate, 100);
                return;
            }

            // Window ready, activate
            const context = {
                app: this.app,
                coreAPI: this.app.coreAPI,
                coreBridge: this.app.coreBridge,
                dataNavigator: this.app.dataNavigator,
                mainWindow: mainWindow,
            };

            extension.activate(context)
                .then(() => {
                    this.activeExtensions.add(id);
                    this._saveActiveExtensions();
                })
                .catch(error => {
                    console.error(`ExtensionManager: Failed to activate ${id}:`, error);
                });
        };

        // Start checking immediately
        setTimeout(checkAndActivate, 0);
        return Promise.resolve(true);
    }

    /**
     * Deactivate an extension
     */
    async deactivateExtension(id) {
        const extension = this.extensions.get(id);
        if (!extension) {
            return false;
        }

        if (!this.activeExtensions.has(id)) {
            return true;
        }

        try {
            if (extension.deactivate) {
                await extension.deactivate();
            }
            this.activeExtensions.delete(id);
            this._saveActiveExtensions();
            return true;
        } catch (error) {
            console.error(`Failed to deactivate extension ${id}:`, error);
            return false;
        }
    }

    /**
     * Get all registered extensions
     */
    getAllExtensions() {
        return Array.from(this.extensions.entries()).map(([id, ext]) => ({
            id,
            ...ext.metadata,
            active: this.activeExtensions.has(id),
        }));
    }

    /**
     * Get active extensions
     */
    getActiveExtensions() {
        return Array.from(this.activeExtensions).map(id => {
            const ext = this.extensions.get(id);
            return {
                id,
                ...ext.metadata,
            };
        });
    }

    /**
     * Check if extension is active
     */
    isExtensionActive(id) {
        return this.activeExtensions.has(id);
    }

    /**
     * Get extension settings page generator (if provided)
     */
    getExtensionSettingsPage(id) {
        const extension = this.extensions.get(id);
        return extension?.createSettingsPage || null;
    }

    /**
     * Load all builtin extensions
     */
    async loadBuiltinExtensions() {
        try {
            // Import demo addon
            const { QuickTaskAddon } = await import('./builtin/QuickTaskAddon.js');
            this.registerExtension('quick-task-addon', new QuickTaskAddon());
        } catch (error) {
            console.warn('No builtin extensions found or error loading:', error);
        }
    }

    /**
     * Auto-activate extensions based on saved settings (non-blocking)
     */
    autoActivateExtensions() {
        // Load previously activated extensions from GSettings
        const savedExtensions = this._loadActiveExtensions();
        
        if (savedExtensions.length > 0) {
            for (const id of savedExtensions) {
                if (this.extensions.has(id)) {
                    this.activateExtension(id);
                }
            }
        }
    }

    /**
     * Ensure config directory exists
     */
    _ensureConfigDir() {
        try {
            const dir = Gio.File.new_for_path(this.configDir);
            if (!dir.query_exists(null)) {
                dir.make_directory_with_parents(null);
            }
        } catch (error) {
            console.warn('Could not create config directory:', error);
        }
    }

    /**
     * Save active extensions to JSON file
     */
    _saveActiveExtensions() {
        try {
            const config = {
                activeExtensions: Array.from(this.activeExtensions),
                lastUpdated: new Date().toISOString()
            };
            
            const file = Gio.File.new_for_path(this.extensionsConfigFile);
            const contents = JSON.stringify(config, null, 2);
            
            file.replace_contents(
                contents,
                null,
                false,
                Gio.FileCreateFlags.REPLACE_DESTINATION,
                null
            );
        } catch (error) {
            console.warn('Could not save active extensions:', error);
        }
    }

    /**
     * Load active extensions from JSON file
     */
    _loadActiveExtensions() {
        try {
            const file = Gio.File.new_for_path(this.extensionsConfigFile);
            
            if (!file.query_exists(null)) {
                return [];
            }
            
            const [success, contents] = file.load_contents(null);
            if (!success) {
                return [];
            }
            
            const decoder = new TextDecoder('utf-8');
            const text = decoder.decode(contents);
            const config = JSON.parse(text);
            
            return config.activeExtensions || [];
        } catch (error) {
            console.warn('Could not load active extensions:', error);
            return [];
        }
    }

    /**
     * Load extension from file
     * @param {string} filePath - Path to extension .js file
     */
    async loadExtensionFromFile(filePath) {
        try {
            // Dynamic import of extension file
            const module = await import(`file://${filePath}`);
            
            // Find extension class (should be the default export or named export)
            const ExtensionClass = module.default || Object.values(module)[0];
            if (!ExtensionClass) {
                throw new Error('No extension class found in file');
            }

            const extension = new ExtensionClass();
            if (!extension.metadata || !extension.metadata.id) {
                throw new Error('Invalid extension: missing metadata.id');
            }

            // Register and activate
            this.registerExtension(extension.metadata.id, extension);
            await this.activateExtension(extension.metadata.id);

            return extension.metadata;
        } catch (error) {
            console.error(`Failed to load extension from ${filePath}:`, error);
            throw error;
        }
    }
}

