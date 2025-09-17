/**
 * Color utility functions for calculating colors, brightness, and text colors
 */

/**
 * Calculate color brightness to determine if text should be dark or light
 * @param {string} hexColor - Hex color string (with or without #)
 * @returns {number} Brightness value (0-255)
 */
export function calculateColorBrightness(hexColor) {
    // Remove # if present
    const hex = hexColor.replace('#', '');

    // Parse RGB values
    const r = parseInt(hex.substr(0, 2), 16);
    const g = parseInt(hex.substr(2, 2), 16);
    const b = parseInt(hex.substr(4, 2), 16);

    // Calculate brightness using standard formula
    return (r * 299 + g * 587 + b * 114) / 1000;
}

/**
 * Get the appropriate text color (black or white) for a background color
 * @param {string} backgroundColor - Hex color string
 * @returns {string} 'black' or 'white'
 */
export function getContrastTextColor(backgroundColor) {
    const brightness = calculateColorBrightness(backgroundColor);
    return brightness > 128 ? 'black' : 'white';
}

/**
 * Get project icon color based on project settings
 * @param {Object} project - Project object with color and icon_color_mode
 * @returns {string} Color string for the icon
 */
export function getProjectIconColor(project) {
    const iconColorMode = project.icon_color_mode || 'auto';

    if (iconColorMode === 'dark') {
        return 'black';
    } else if (iconColorMode === 'light') {
        return 'white';
    } else {
        // Auto mode - determine from color brightness
        return getContrastTextColor(project.color);
    }
}

/**
 * Convert hex color to Gdk.RGBA for GTK4 ColorDialog
 * @param {string} hexColor - Hex color string
 * @returns {Gdk.RGBA} RGBA color object
 */
export function hexToGdkRGBA(hexColor) {
    const hex = hexColor.replace('#', '');
    const r = parseInt(hex.substr(0, 2), 16) / 255;
    const g = parseInt(hex.substr(2, 2), 16) / 255;
    const b = parseInt(hex.substr(4, 2), 16) / 255;

    const rgba = new Gdk.RGBA();
    rgba.red = r;
    rgba.green = g;
    rgba.blue = b;
    rgba.alpha = 1.0;

    return rgba;
}

/**
 * Convert Gdk.RGBA to hex color string
 * @param {Gdk.RGBA} rgba - RGBA color object
 * @returns {string} Hex color string
 */
export function gdkRGBAToHex(rgba) {
    const r = Math.round(rgba.red * 255);
    const g = Math.round(rgba.green * 255);
    const b = Math.round(rgba.blue * 255);

    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

/**
 * Validate if a color is a valid hex color
 * @param {string} color - Color string to validate
 * @returns {boolean} True if valid hex color
 */
export function isValidHexColor(color) {
    const hexRegex = /^#?[0-9A-Fa-f]{6}$/;
    return hexRegex.test(color);
}

/**
 * Ensure color has # prefix
 * @param {string} color - Color string
 * @returns {string} Color with # prefix
 */
export function normalizeHexColor(color) {
    if (!color) return '#cccccc';
    return color.startsWith('#') ? color : `#${color}`;
}