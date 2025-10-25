/**
 * SVG Recoloring Utility
 * Dynamically recolors SVG illustrations to match accent color
 */

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk?version=4.0';
import Adw from 'gi://Adw?version=1';
import Gdk from 'gi://Gdk';
import GdkPixbuf from 'gi://GdkPixbuf';

// Global registry of all SVG update functions
const svgUpdateFunctions = [];

/**
 * Get current accent color from CSS (supports custom accent colors)
 * @returns {string} Hex color (e.g., "#3584E4")
 */
export function getAccentColor() {
    try {
        // Create a temporary widget to get the resolved accent color from CSS
        const tempWidget = new Gtk.Label();
        const styleContext = tempWidget.get_style_context();

        // Get the resolved @accent_bg_color from CSS
        const accentRGBA = styleContext.lookup_color('accent_bg_color')[1];

        if (accentRGBA) {
            const r = Math.round(accentRGBA.red * 255);
            const g = Math.round(accentRGBA.green * 255);
            const b = Math.round(accentRGBA.blue * 255);
            const hexColor = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
            return hexColor;
        }

        return '#2EC27E'; // Fallback
    } catch (error) {
        console.warn('[svgRecolor] Error getting accent color, using fallback:', error);
        return '#2EC27E'; // Fallback to green
    }
}

/**
 * Recolor SVG content with accent color
 * @param {string} svgContent - SVG file content
 * @returns {string} Recolored SVG content
 */
function recolorSVGContent(svgContent) {
    const accentColor = getAccentColor();

    // Replace green colors with accent color
    // GNOME green shades: #2EC27E, #26A269, #33D17A, #57E389, #8FF0A4
    // Custom illustration green: #26823B
    let recolored = svgContent.replace(/#2EC27E/gi, accentColor);
    recolored = recolored.replace(/#26A269/gi, accentColor);
    recolored = recolored.replace(/#33D17A/gi, accentColor);
    recolored = recolored.replace(/#57E389/gi, accentColor);
    recolored = recolored.replace(/#8FF0A4/gi, accentColor);
    recolored = recolored.replace(/#26823B/gi, accentColor);

    return recolored;
}

/**
 * Recolor SVG file by replacing green colors with accent color
 * Creates a Picture widget that automatically updates when accent color changes
 * @param {string} svgPath - Path to SVG file
 * @returns {Gtk.Picture} Picture widget with recolored SVG
 */
export function createRecoloredSVG(svgPath, width = 240, height = 140) {
    try {
        // Read original SVG file (support both resource:// and file paths)
        const file = svgPath.startsWith('/com/odnoyko/valot/')
            ? Gio.File.new_for_uri('resource://' + svgPath)
            : Gio.File.new_for_path(svgPath);
        const [success, contents] = file.load_contents(null);

        if (!success) {
            console.warn('[svgRecolor] Failed to load SVG, using original:', svgPath);
            return new Gtk.Picture({
                file: file,
                content_fit: Gtk.ContentFit.CONTAIN,
                width_request: width,
                height_request: height,
            });
        }

        // Store original SVG content
        const originalSVG = new TextDecoder().decode(contents);

        // Create Picture widget
        const picture = new Gtk.Picture({
            content_fit: Gtk.ContentFit.SCALE_DOWN,
            width_request: width,
            height_request: height,
            can_shrink: true,
        });

        // Function to update SVG with current accent color
        const updateSVG = () => {
            try {
                const accentColor = getAccentColor();

                // Recolor SVG content
                let recoloredSVG = recolorSVGContent(originalSVG);

                // Override SVG dimensions to match requested size
                recoloredSVG = recoloredSVG.replace(
                    /<svg[^>]*width="[^"]*"[^>]*height="[^"]*"/,
                    `<svg width="${width}" height="${height}"`
                );

                // Create temporary file with recolored SVG
                const tmpDir = GLib.get_tmp_dir();
                const tmpPath = `${tmpDir}/valot_recolored_${Date.now()}.svg`;
                const tmpFile = Gio.File.new_for_path(tmpPath);

                tmpFile.replace_contents(
                    new TextEncoder().encode(recoloredSVG),
                    null,
                    false,
                    Gio.FileCreateFlags.REPLACE_DESTINATION,
                    null
                );

                // Update picture with new file
                picture.set_file(tmpFile);

            } catch (error) {
                console.error('[svgRecolor] Error updating SVG:', error);
            }
        };

        // Initial render
        updateSVG();

        // Register update function globally
        svgUpdateFunctions.push(updateSVG);

        // Listen for accent color changes via AdwStyleManager
        const styleManager = Adw.StyleManager.get_default();
        if (styleManager) {
            // Monitor accent-color changes
            styleManager.connect('notify::accent-color', () => {
                // Use timeout to ensure color is fully updated
                GLib.timeout_add(GLib.PRIORITY_DEFAULT, 100, () => {
                    updateSVG();
                    return GLib.SOURCE_REMOVE;
                });
            });
        }

        return picture;

    } catch (error) {
        console.error('[svgRecolor] Error creating recolored SVG:', error);
        const fallbackFile = Gio.File.new_for_path(svgPath);
        return new Gtk.Picture({
            file: fallbackFile,
            content_fit: Gtk.ContentFit.CONTAIN,
            width_request: width,
            height_request: height,
        });
    }
}

/**
 * Force update all registered SVG illustrations
 * Call this when accent color changes programmatically (not via system settings)
 */
export function forceUpdateAllSVGs() {
    svgUpdateFunctions.forEach(updateFn => {
        try {
            updateFn();
        } catch (error) {
            console.error('[svgRecolor] Error updating SVG:', error);
        }
    });
}
