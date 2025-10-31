/**
 * Extension Manager
 * Manages loading, activation, and lifecycle of extensions (addons and plugins)
 */

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Soup from 'gi://Soup?version=3.0';

export class ExtensionManager {
    constructor(app) {
        this.app = app;
        this.extensions = new Map();
        this.activeExtensions = new Set();
        this.extensionSettings = new Map();
        this.availableExtensions = [];
        this.extensionSources = new Map(); // Track extension sources (development/user/flatpak/installed)
        
        // Get config directory for storing extension state
        this.configDir = GLib.build_filenamev([GLib.get_user_config_dir(), 'valot']);
        this.extensionsConfigFile = GLib.build_filenamev([this.configDir, 'extensions.json']);
        this.installedExtensionsConfigFile = GLib.build_filenamev([this.configDir, 'installed-extensions.json']);
        
        // Cache directory for downloaded extensions
        this.cacheDir = GLib.build_filenamev([GLib.get_user_cache_dir(), 'valot', 'extensions']);
        
        // Ensure directories exist
        this._ensureConfigDir();
        this._ensureCacheDir();
        
        // Initialize HTTP session for downloads
        this.session = new Soup.Session();
        
        // GitLab repository for public extensions
        this.gitlabExtensionsRepo = 'https://gitlab.com/valot/extensions';
    }
    
    /**
     * Ensure cache directory exists
     */
    _ensureCacheDir() {
        try {
            const dir = Gio.File.new_for_path(this.cacheDir);
            if (!dir.query_exists(null)) {
                dir.make_directory_with_parents(null);
            }
        } catch (error) {
            console.warn('Could not create cache directory:', error);
        }
    }

    /**
     * Register an extension
     * @param {string} id - Unique extension ID
     * @param {Object} extension - Extension object with metadata and activate/deactivate methods
     */
    registerExtension(id, extension) {
        if (this.extensions.has(id)) {
            // console.warn(`Extension ${id} already registered`);
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
            // console.warn(`Extension ${id} already active`);
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
            source: this.getExtensionSource(id),
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
     * Get extension source (development/user/flatpak/installed)
     */
    getExtensionSource(id) {
        const sourceInfo = this.extensionSources.get(id);
        return sourceInfo ? sourceInfo.source : 'unknown';
    }

    /**
     * Load all builtin extensions
     */
    async loadBuiltinExtensions() {
        try {
            // Development extensions disabled by default
            // await this._loadDevelopmentExtensions();
            
            // Load extensions from /app/extensions/ (Flatpak extensions)
            await this._loadFlatpakExtensions();
            
            // Load extensions from user extensions directory
            await this._loadUserExtensions();
            
            // Load previously installed extensions from cache
            await this._loadInstalledExtensionsFromCache();
        } catch (error) {
            console.warn('Error loading builtin extensions:', error);
        }
    }
    
    /**
     * Load development extensions from src/extensions/ (only in dev environment)
     */
    async _loadDevelopmentExtensions() {
        try {
            // Try to load from resource URI first (built-in extensions)
            try {
                const { Example } = await import('resource:///com/odnoyko/valot/extensions/Example/Example.js');
                const extension = new Example();
                if (extension.metadata && extension.metadata.id) {
                    this.registerExtension(extension.metadata.id, extension);
                    this.extensionSources.set(extension.metadata.id, { source: 'development:Example', filePath: 'resource' });
                    // console.warn(`✅ Registered development extension: ${extension.metadata.name}`);
                }
            } catch (error) {
                // Not loaded from resources, try file system
                const devPath = GLib.build_filenamev([imports.package.datadir, 'src', 'extensions']);
                const dir = Gio.File.new_for_path(devPath);
                
                if (!dir.query_exists(null)) {
                    return; // Not in dev environment
                }
                
                const enumerator = dir.enumerate_children('standard::name,standard::type', Gio.FileQueryInfoFlags.NONE, null);
                
                while (true) {
                    const info = enumerator.next_file(null);
                    if (!info) break;
                    
                    const fileType = info.get_file_type();
                    const fileName = info.get_name();
                    
                    if (fileType === Gio.FileType.DIRECTORY && fileName !== '.' && fileName !== '..') {
                        // Check for main JS file
                        const mainFile = Gio.File.new_for_path(`${devPath}/${fileName}/${fileName}.js`);
                        
                        if (mainFile.query_exists(null)) {
                            const filePath = mainFile.get_path();
                            await this._loadExtensionFromPath(filePath, `development:${fileName}`);
                        }
                    }
                }
                
                enumerator.close(null);
            }
        } catch (error) {
            // Silently fail if not in dev environment
        }
    }
    
    /**
     * Load previously installed extensions from cache
     */
    async _loadInstalledExtensionsFromCache() {
        try {
            const installed = this._loadInstalledExtensions();
            
            for (const extInfo of installed) {
                if (extInfo.cachedPath) {
                    const file = Gio.File.new_for_path(extInfo.cachedPath);
                    if (file.query_exists(null)) {
                        await this._loadExtensionFromPath(extInfo.cachedPath, `installed:${extInfo.name}`);
                    }
                }
            }
        } catch (error) {
            console.warn('Error loading installed extensions from cache:', error);
        }
    }
    
    /**
     * Load Flatpak extensions from /app/extensions/
     */
    async _loadFlatpakExtensions() {
        const flatpakExtensionsDir = '/app/extensions';
        
        try {
            const dir = Gio.File.new_for_path(flatpakExtensionsDir);
            
            if (!dir.query_exists(null)) {
                return; // Not in Flatpak environment
            }
            
            const enumerator = dir.enumerate_children('standard::name,standard::type', Gio.FileQueryInfoFlags.NONE, null);
            
            while (true) {
                const info = enumerator.next_file(null);
                if (!info) break;
                
                const fileType = info.get_file_type();
                const fileName = info.get_name();
                
                if (fileType === Gio.FileType.DIRECTORY) {
                    // Flatpak extension directory
                    const extensionMainFile = Gio.File.new_for_path(`${flatpakExtensionsDir}/${fileName}/${fileName}.js`);
                    
                    if (extensionMainFile.query_exists(null)) {
                        const filePath = extensionMainFile.get_path();
                        await this._loadExtensionFromPath(filePath, `flatpak:${fileName}`);
                    }
                }
            }
            
            enumerator.close(null);
        } catch (error) {
            console.warn('Error loading Flatpak extensions:', error);
        }
    }
    
    /**
     * Load user extensions from ~/.config/valot/extensions/
     */
    async _loadUserExtensions() {
        const userExtensionsDir = GLib.build_filenamev([GLib.get_user_config_dir(), 'valot', 'extensions']);
        
        try {
            const dir = Gio.File.new_for_path(userExtensionsDir);
            
            if (!dir.query_exists(null)) {
                return; // No user extensions directory
            }
            
            const enumerator = dir.enumerate_children('standard::name,standard::type', Gio.FileQueryInfoFlags.NONE, null);
            
            while (true) {
                const info = enumerator.next_file(null);
                if (!info) break;
                
                const fileName = info.get_name();
                
                if (fileName.endsWith('.js')) {
                    const filePath = GLib.build_filenamev([userExtensionsDir, fileName]);
                    await this._loadExtensionFromPath(filePath, `user:${fileName}`);
                }
            }
            
            enumerator.close(null);
        } catch (error) {
            console.warn('Error loading user extensions:', error);
        }
    }
    
    /**
     * Load extension from file path with error handling
     */
    async _loadExtensionFromPath(filePath, source) {
        try {
            const module = await import(`file://${filePath}`);
            
            const ExtensionClass = module.default || Object.values(module)[0];
            if (!ExtensionClass) {
                // console.warn(`No extension class found in ${source}`);
                return;
            }
            
            const extension = new ExtensionClass();
            if (!extension.metadata || !extension.metadata.id) {
                // console.warn(`Invalid extension (missing metadata.id) in ${source}`);
                return;
            }
            
            // Register extension (don't auto-activate, let user control it)
            this.registerExtension(extension.metadata.id, extension);
            // Store source metadata
            this.extensionSources.set(extension.metadata.id, { source, filePath });
            // console.warn(`✅ Registered extension: ${extension.metadata.name} (${source})`);
        } catch (error) {
            // console.warn(`Failed to load extension from ${source}:`, error);
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
    
    /**
     * Load extension from URL (GitLab/GitHub raw file)
     * Downloads and caches the extension
     * @param {string} url - URL to extension .js file
     * @returns {Promise<Object>} Extension metadata
     */
    async loadExtensionFromURL(url) {
        try {
            // Download file using Soup with Promise wrapper
            const message = Soup.Message.new('GET', url);
            const cancellable = new Gio.Cancellable();
            
            // Wrap async call in Promise
            const bytes = await new Promise((resolve, reject) => {
                this.session.send_and_read_async(
                    message,
                    GLib.PRIORITY_DEFAULT,
                    cancellable,
                    (self, result) => {
                        try {
                            const resultBytes = self.send_and_read_finish(result);
                            resolve(resultBytes);
                        } catch (error) {
                            reject(error);
                        }
                    }
                );
            });
            
            if (!bytes) {
                throw new Error('Failed to download extension');
            }
            
            // Convert bytes to string
            const decoder = new TextDecoder('utf-8');
            const code = decoder.decode(bytes.toArray());
            
            // Save to cache with timestamp
            const fileName = url.split('/').pop() || `extension_${Date.now()}.js`;
            const cachedPath = GLib.build_filenamev([this.cacheDir, fileName]);
            
            const file = Gio.File.new_for_path(cachedPath);
            const contents = new TextEncoder().encode(code);
            file.replace_contents(
                contents,
                null,
                false,
                Gio.FileCreateFlags.REPLACE_DESTINATION,
                null
            );
            
            // Load extension to get metadata (for saving info)
            const module = await import(`file://${cachedPath}`);
            
            const ExtensionClass = module.default || Object.values(module)[0];
            if (!ExtensionClass) {
                throw new Error('No extension class found in file');
            }

            const extension = new ExtensionClass();
            if (!extension.metadata || !extension.metadata.id) {
                throw new Error('Invalid extension: missing metadata.id');
            }

            // Save installed extension info (don't register yet, will be loaded on next app start)
            this._saveInstalledExtension({
                id: extension.metadata.id,
                url: url,
                cachedPath: cachedPath,
                name: extension.metadata.name,
                version: extension.metadata.version
            });
            
            // console.warn(`✅ Downloaded and cached extension: ${extension.metadata.name}`);

            return extension.metadata;
        } catch (error) {
            console.error(`Failed to load extension from URL ${url}:`, error);
            throw error;
        }
    }
    
    /**
     * Save installed extension information
     */
    _saveInstalledExtension(extensionInfo) {
        try {
            const installed = this._loadInstalledExtensions();
            const existingIndex = installed.findIndex(e => e.id === extensionInfo.id);
            
            if (existingIndex >= 0) {
                installed[existingIndex] = extensionInfo;
            } else {
                installed.push(extensionInfo);
            }
            
            const file = Gio.File.new_for_path(this.installedExtensionsConfigFile);
            const contents = JSON.stringify({ installed }, null, 2);
            
            file.replace_contents(
                contents,
                null,
                false,
                Gio.FileCreateFlags.REPLACE_DESTINATION,
                null
            );
        } catch (error) {
            console.warn('Could not save installed extension:', error);
        }
    }
    
    /**
     * Load installed extensions information
     */
    _loadInstalledExtensions() {
        try {
            const file = Gio.File.new_for_path(this.installedExtensionsConfigFile);
            
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
            
            return config.installed || [];
        } catch (error) {
            console.warn('Could not load installed extensions:', error);
            return [];
        }
    }
    
    /**
     * Load available extensions list from GitLab repository
     * Scans the repository for .js files and registers them as available
     * @returns {Promise<Array>} Array of available extension info
     */
    async loadAvailableExtensionsFromGitLab() {
        try {
            // For now, hardcoded list - later we can parse GitLab API or file listing
            this.availableExtensions = [
                {
                    id: 'quick-task-addon',
                    name: 'Quick Task Creator',
                    description: 'Add floating button to instantly create tasks with zero duration',
                    url: 'https://gitlab.com/valot/quicktaskaddon/-/raw/main/QuickTaskAddon.js',
                    version: '1.0.0',
                    type: 'plugin'
                }
            ];
            
            // console.warn(`✅ Loaded ${this.availableExtensions.length} available extensions from GitLab`);
            return this.availableExtensions;
        } catch (error) {
            console.error('Failed to load available extensions from GitLab:', error);
            return [];
        }
    }
    
    /**
     * Get available extensions (cached list)
     * @returns {Array} Array of available extension info
     */
    getAvailableExtensions() {
        return this.availableExtensions || [];
    }
}

