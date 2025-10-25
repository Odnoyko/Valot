/* Input Validation Utility Module for Valot
 *
 * Provides comprehensive validation for user inputs to prevent:
 * - SQL injection attacks
 * - Data corruption
 * - Application crashes
 * - Security vulnerabilities
 */

export class InputValidator {

    // Common validation rules
    static MAX_NAME_LENGTH = 100;
    static MAX_DESCRIPTION_LENGTH = 500;
    static MIN_NAME_LENGTH = 1;

    // Dangerous characters that could cause issues
    static DANGEROUS_CHARS = /[<>"'&;\\]/g;
    static SQL_INJECTION_PATTERNS = /(';|'\\s*(union|select|insert|update|delete|drop|create|alter|exec|execute)\\s+|--|\/\\*|\\*\/)/i;

    /**
     * Basic name validation for all types (projects, clients, tasks)
     * @param {string} name - Name to validate
     * @param {string} type - Type for error messages ('Project', 'Client', 'Task')
     * @returns {ValidationResult}
     */
    static validateName(name, type = 'Name') {
        if (!name || typeof name !== 'string') {
            return {
                valid: false,
                error: `${type} name is required`,
                sanitized: ''
            };
        }

        const trimmed = name.trim();

        // Check minimum length
        if (trimmed.length < this.MIN_NAME_LENGTH) {
            return {
                valid: false,
                error: `${type} name cannot be empty`,
                sanitized: trimmed
            };
        }

        // Check maximum length
        if (trimmed.length > this.MAX_NAME_LENGTH) {
            return {
                valid: false,
                error: `${type} name too long (max ${this.MAX_NAME_LENGTH} characters)`,
                sanitized: trimmed.substring(0, this.MAX_NAME_LENGTH)
            };
        }

        // Only block truly dangerous SQL injection patterns
        if (this.SQL_INJECTION_PATTERNS.test(trimmed)) {
            return {
                valid: false,
                error: `${type} name contains potentially dangerous content`,
                sanitized: trimmed.replace(this.SQL_INJECTION_PATTERNS, '')
            };
        }

        return {
            valid: true,
            error: null,
            sanitized: trimmed
        };
    }

    /**
     * Validates project name input
     * @param {string} name - Project name to validate
     * @returns {ValidationResult} - {valid: boolean, error: string, sanitized: string}
     */
    static validateProjectName(name) {
        return this.validateName(name, 'Project');
    }

    /**
     * Validates task name input
     * @param {string} name - Task name to validate
     * @returns {ValidationResult}
     */
    static validateTaskName(name) {
        return this.validateName(name, 'Task');
    }

    /**
     * Validates client name input
     * @param {string} name - Client name to validate
     * @returns {ValidationResult}
     */
    static validateClientName(name) {
        return this.validateName(name, 'Client');
    }

    /**
     * Validates email address
     * @param {string} email - Email to validate
     * @returns {ValidationResult}
     */
    static validateEmail(email) {
        if (!email || email.trim().length === 0) {
            return {
                valid: true,
                error: null,
                sanitized: ''
            };
        }

        const trimmed = email.trim();
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

        if (!emailRegex.test(trimmed)) {
            return {
                valid: false,
                error: 'Invalid email address',
                sanitized: trimmed
            };
        }

        return {
            valid: true,
            error: null,
            sanitized: trimmed
        };
    }

    /**
     * Validates color hex value
     * @param {string} color - Color hex to validate
     * @returns {ValidationResult}
     */
    static validateColor(color) {
        if (!color || typeof color !== 'string') {
            return {
                valid: false,
                error: 'Color is required',
                sanitized: '#3584e4'
            };
        }

        const trimmed = color.trim();
        const hexRegex = /^#[0-9A-Fa-f]{6}$/;

        if (!hexRegex.test(trimmed)) {
            return {
                valid: false,
                error: 'Invalid color format (use #RRGGBB)',
                sanitized: '#3584e4'
            };
        }

        return {
            valid: true,
            error: null,
            sanitized: trimmed
        };
    }

    /**
     * Validates number input
     * @param {any} value - Value to validate as number
     * @param {number} min - Minimum value (optional)
     * @param {number} max - Maximum value (optional)
     * @returns {ValidationResult}
     */
    static validateNumber(value, min = null, max = null) {
        const num = Number(value);

        if (isNaN(num)) {
            return {
                valid: false,
                error: 'Must be a valid number',
                sanitized: min || 0
            };
        }

        if (min !== null && num < min) {
            return {
                valid: false,
                error: `Must be at least ${min}`,
                sanitized: min
            };
        }

        if (max !== null && num > max) {
            return {
                valid: false,
                error: `Must be at most ${max}`,
                sanitized: max
            };
        }

        return {
            valid: true,
            error: null,
            sanitized: num
        };
    }

    /**
     * Show validation tooltip on a widget
     * @param {Gtk.Widget} widget - Widget to show tooltip on
     * @param {string} message - Error message
     * @param {boolean} isError - Whether this is an error
     */
    static showValidationTooltip(widget, message, isError) {
        if (isError && message) {
            widget.add_css_class('error');
            widget.set_tooltip_text(message);
        } else {
            widget.remove_css_class('error');
            widget.set_tooltip_text('');
        }
    }

    /**
     * Sanitize string for SQL (escape single quotes)
     * @param {string} input - Input to sanitize
     * @returns {string} - Sanitized string
     */
    static sanitizeForSQL(input) {
        if (!input || typeof input !== 'string') {
            return '';
        }
        return input.replace(/'/g, "''");
    }
}
