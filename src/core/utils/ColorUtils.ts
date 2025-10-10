/**
 * Color utility functions
 * Pure business logic - NO UI dependencies
 */

/**
 * RGB color representation
 */
export interface RGB {
    r: number; // 0-255
    g: number; // 0-255
    b: number; // 0-255
}

/**
 * RGBA color representation
 */
export interface RGBA extends RGB {
    a: number; // 0-1
}

/**
 * HSL color representation
 */
export interface HSL {
    h: number; // 0-360
    s: number; // 0-100
    l: number; // 0-100
}

/**
 * Color utility class
 */
export class ColorUtils {
    /**
     * Validate if a string is a valid hex color
     */
    static isValidHexColor(color: string): boolean {
        const hexRegex = /^#?[0-9A-Fa-f]{6}$/;
        return hexRegex.test(color);
    }

    /**
     * Normalize hex color - ensure # prefix
     */
    static normalizeHexColor(color: string): string {
        if (!color) return '#cccccc';
        return color.startsWith('#') ? color : `#${color}`;
    }

    /**
     * Parse hex color to RGB
     */
    static hexToRgb(hex: string): RGB {
        const normalized = hex.replace('#', '');

        if (normalized.length !== 6) {
            throw new Error(`Invalid hex color: ${hex}`);
        }

        return {
            r: parseInt(normalized.substr(0, 2), 16),
            g: parseInt(normalized.substr(2, 2), 16),
            b: parseInt(normalized.substr(4, 2), 16),
        };
    }

    /**
     * Convert RGB to hex color
     */
    static rgbToHex(rgb: RGB): string {
        const { r, g, b } = rgb;
        return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
    }

    /**
     * Calculate color brightness (0-255)
     * Uses standard luminance formula
     */
    static calculateBrightness(hexColor: string): number {
        const rgb = this.hexToRgb(hexColor);
        // Standard luminance formula
        return (rgb.r * 299 + rgb.g * 587 + rgb.b * 114) / 1000;
    }

    /**
     * Determine if text should be dark or light for given background
     * Returns 'black' or 'white'
     */
    static getContrastTextColor(backgroundColor: string): 'black' | 'white' {
        const brightness = this.calculateBrightness(backgroundColor);
        return brightness > 128 ? 'black' : 'white';
    }

    /**
     * Convert RGB to HSL
     */
    static rgbToHsl(rgb: RGB): HSL {
        const r = rgb.r / 255;
        const g = rgb.g / 255;
        const b = rgb.b / 255;

        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        const delta = max - min;

        let h = 0;
        let s = 0;
        const l = (max + min) / 2;

        if (delta !== 0) {
            s = l > 0.5 ? delta / (2 - max - min) : delta / (max + min);

            switch (max) {
                case r:
                    h = ((g - b) / delta + (g < b ? 6 : 0)) / 6;
                    break;
                case g:
                    h = ((b - r) / delta + 2) / 6;
                    break;
                case b:
                    h = ((r - g) / delta + 4) / 6;
                    break;
            }
        }

        return {
            h: Math.round(h * 360),
            s: Math.round(s * 100),
            l: Math.round(l * 100),
        };
    }

    /**
     * Convert HSL to RGB
     */
    static hslToRgb(hsl: HSL): RGB {
        const h = hsl.h / 360;
        const s = hsl.s / 100;
        const l = hsl.l / 100;

        let r, g, b;

        if (s === 0) {
            r = g = b = l; // achromatic
        } else {
            const hue2rgb = (p: number, q: number, t: number) => {
                if (t < 0) t += 1;
                if (t > 1) t -= 1;
                if (t < 1 / 6) return p + (q - p) * 6 * t;
                if (t < 1 / 2) return q;
                if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
                return p;
            };

            const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
            const p = 2 * l - q;

            r = hue2rgb(p, q, h + 1 / 3);
            g = hue2rgb(p, q, h);
            b = hue2rgb(p, q, h - 1 / 3);
        }

        return {
            r: Math.round(r * 255),
            g: Math.round(g * 255),
            b: Math.round(b * 255),
        };
    }

    /**
     * Lighten a color by percentage (0-100)
     */
    static lighten(hexColor: string, percent: number): string {
        const rgb = this.hexToRgb(hexColor);
        const hsl = this.rgbToHsl(rgb);

        hsl.l = Math.min(100, hsl.l + percent);

        const newRgb = this.hslToRgb(hsl);
        return this.rgbToHex(newRgb);
    }

    /**
     * Darken a color by percentage (0-100)
     */
    static darken(hexColor: string, percent: number): string {
        const rgb = this.hexToRgb(hexColor);
        const hsl = this.rgbToHsl(rgb);

        hsl.l = Math.max(0, hsl.l - percent);

        const newRgb = this.hslToRgb(hsl);
        return this.rgbToHex(newRgb);
    }

    /**
     * Adjust color saturation by percentage (-100 to 100)
     */
    static saturate(hexColor: string, percent: number): string {
        const rgb = this.hexToRgb(hexColor);
        const hsl = this.rgbToHsl(rgb);

        hsl.s = Math.max(0, Math.min(100, hsl.s + percent));

        const newRgb = this.hslToRgb(hsl);
        return this.rgbToHex(newRgb);
    }

    /**
     * Calculate contrast ratio between two colors (WCAG)
     */
    static getContrastRatio(color1: string, color2: string): number {
        const luminance = (rgb: RGB): number => {
            const [r, g, b] = [rgb.r, rgb.g, rgb.b].map(val => {
                const v = val / 255;
                return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
            });
            return 0.2126 * r + 0.7152 * g + 0.0722 * b;
        };

        const rgb1 = this.hexToRgb(color1);
        const rgb2 = this.hexToRgb(color2);

        const lum1 = luminance(rgb1);
        const lum2 = luminance(rgb2);

        const brightest = Math.max(lum1, lum2);
        const darkest = Math.min(lum1, lum2);

        return (brightest + 0.05) / (darkest + 0.05);
    }

    /**
     * Check if color combination meets WCAG AA standard (4.5:1)
     */
    static meetsWCAG_AA(foreground: string, background: string): boolean {
        return this.getContrastRatio(foreground, background) >= 4.5;
    }

    /**
     * Check if color combination meets WCAG AAA standard (7:1)
     */
    static meetsWCAG_AAA(foreground: string, background: string): boolean {
        return this.getContrastRatio(foreground, background) >= 7;
    }

    /**
     * Mix two colors
     */
    static mix(color1: string, color2: string, weight: number = 0.5): string {
        const rgb1 = this.hexToRgb(color1);
        const rgb2 = this.hexToRgb(color2);

        const w = weight * 2 - 1;
        const a = 0; // No alpha

        const w1 = ((w * a === -1 ? w : (w + a) / (1 + w * a)) + 1) / 2;
        const w2 = 1 - w1;

        return this.rgbToHex({
            r: Math.round(rgb1.r * w1 + rgb2.r * w2),
            g: Math.round(rgb1.g * w1 + rgb2.g * w2),
            b: Math.round(rgb1.b * w1 + rgb2.b * w2),
        });
    }

    /**
     * Generate color palette from base color
     */
    static generatePalette(baseColor: string, count: number = 5): string[] {
        const palette: string[] = [];
        const step = 100 / (count + 1);

        for (let i = 0; i < count; i++) {
            if (i < Math.floor(count / 2)) {
                // Lighter variants
                palette.push(this.lighten(baseColor, step * (Math.floor(count / 2) - i)));
            } else if (i === Math.floor(count / 2)) {
                // Base color
                palette.push(baseColor);
            } else {
                // Darker variants
                palette.push(this.darken(baseColor, step * (i - Math.floor(count / 2))));
            }
        }

        return palette;
    }
}
