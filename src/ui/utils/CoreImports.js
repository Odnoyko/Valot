/**
 * Core utilities imports for UI
 * Import compiled TypeScript Core utilities
 */

// After TypeScript compilation, Core will be in compiled/core/
// For now, we prepare the import structure

/**
 * Import Core utilities
 * These will be available after TypeScript compilation
 */

// Color utilities
export const ColorUtils = {
    // Will be imported from compiled Core
    // import { ColorUtils } from 'resource:///com/odnoyko/valot/core/index.js';

    // Placeholder for development
    getContrastTextColor: (bgColor) => {
        // Simple fallback until Core is compiled
        const brightness = parseInt(bgColor.slice(1), 16) > 0x7FFFFF ? 'black' : 'white';
        return brightness;
    },
};

// Date filtering utilities
export const DateFilters = {
    // Will be imported from compiled Core

    // Placeholder
    getToday: () => ({
        start: new Date(new Date().setHours(0, 0, 0, 0)),
        end: new Date(new Date().setHours(23, 59, 59, 999)),
    }),

    getThisWeek: () => {
        const now = new Date();
        const start = new Date(now);
        start.setDate(now.getDate() - now.getDay());
        start.setHours(0, 0, 0, 0);

        const end = new Date(start);
        end.setDate(start.getDate() + 6);
        end.setHours(23, 59, 59, 999);

        return { start, end };
    },

    getThisMonth: () => {
        const now = new Date();
        const start = new Date(now.getFullYear(), now.getMonth(), 1);
        const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
        return { start, end };
    },
};

// Validation utilities
export const ValidationUtils = {
    // Will be imported from compiled Core

    // Placeholder
    validateString: (value, rules) => {
        if (rules.required && !value?.trim()) {
            return { valid: false, error: 'This field is required' };
        }

        if (rules.minLength && value.length < rules.minLength) {
            return { valid: false, error: `Minimum ${rules.minLength} characters` };
        }

        if (rules.maxLength && value.length > rules.maxLength) {
            return { valid: false, error: `Maximum ${rules.maxLength} characters` };
        }

        return { valid: true };
    },

    validateProjectName: (name) => {
        return ValidationUtils.validateString(name, {
            required: true,
            minLength: 1,
            maxLength: 100,
        });
    },

    validateEmail: (email) => {
        if (!email) return { valid: true };
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return { valid: false, error: 'Invalid email address' };
        }
        return { valid: true };
    },
};

/**
 * TODO: After TypeScript compilation, replace placeholders with:
 *
 * import { ColorUtils, DateFilters, ValidationUtils } from 'resource:///com/odnoyko/valot/core/index.js';
 * export { ColorUtils, DateFilters, ValidationUtils };
 */
