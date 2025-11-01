/**
 * Tracking File Cache
 * Lightweight JSON file cache for tracking persistence (no GDA objects)
 */
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import { Logger } from '../utils/Logger.js';

export class TrackingFileCache {
    constructor() {
        // Use config directory (same as extensions config)
        this.configDir = GLib.build_filenamev([GLib.get_user_config_dir(), 'valot']);
        this.cacheFile = GLib.build_filenamev([this.configDir, 'tracking-state.json']);
        
        // Ensure directory exists
        this._ensureConfigDir();
    }

    /**
     * Ensure config directory exists
     */
    _ensureConfigDir() {
        try {
            GLib.mkdir_with_parents(this.configDir, 0o755);
        } catch (e) {
            Logger.error(`[TrackingFileCache] Failed to create config dir: ${e.message}`);
        }
    }

    /**
     * Read tracking state from file
     * @returns {Object|null} Tracking state or null if file doesn't exist or is invalid
     */
    read() {
        try {
            const file = Gio.File.new_for_path(this.cacheFile);
            
            if (!file.query_exists(null)) {
                return null; // File doesn't exist yet
            }

            const [, contents] = file.load_contents(null);
            const decoder = new TextDecoder('utf-8');
            const jsonText = decoder.decode(contents);
            
            if (!jsonText || jsonText.trim() === '') {
                return null;
            }

            const state = JSON.parse(jsonText);
            
            // Validate required fields
            if (!state || typeof state !== 'object') {
                return null;
            }

            return state;
        } catch (error) {
            // File doesn't exist or is invalid - this is OK
            Logger.debug(`[TrackingFileCache] Could not read cache: ${error.message}`);
            return null;
        }
    }

    /**
     * Write tracking state to file
     * @param {Object} state - Tracking state to save
     */
    write(state) {
        try {
            if (!state || typeof state !== 'object') {
                Logger.warn('[TrackingFileCache] Invalid state object, skipping write');
                return;
            }

            // Create JSON with pretty formatting (for debugging)
            const jsonText = JSON.stringify(state, null, 2);
            const encoder = new TextEncoder();
            const bytes = encoder.encode(jsonText);

            const file = Gio.File.new_for_path(this.cacheFile);
            const stream = file.replace(null, false, Gio.FileCreateFlags.NONE, null);
            
            stream.write_bytes(new GLib.Bytes(bytes), null);
            stream.close(null);

            Logger.debug(`[TrackingFileCache] Saved tracking state to file`);
        } catch (error) {
            Logger.error(`[TrackingFileCache] Failed to write cache: ${error.message}`);
        }
    }

    /**
     * Clear tracking state file
     */
    clear() {
        try {
            const file = Gio.File.new_for_path(this.cacheFile);
            if (file.query_exists(null)) {
                file.delete(null);
                Logger.debug('[TrackingFileCache] Cleared tracking state file');
            }
        } catch (error) {
            Logger.error(`[TrackingFileCache] Failed to clear cache: ${error.message}`);
        }
    }

}

