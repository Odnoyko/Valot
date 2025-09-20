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
     * Validates task description/info
     * @param {string} description - Task description to validate
     * @returns {ValidationResult}
     */
    static validateTaskDescription(description) {
        if (!description) {
            return {
                valid: true,
                error: null,
                sanitized: ''
            };
        }
        
        if (typeof description !== 'string') {
            return {
                valid: false,
                error: 'Task description must be text',
                sanitized: ''
            };
        }
        
        const trimmed = description.trim();
        
        // Check maximum length
        if (trimmed.length > this.MAX_DESCRIPTION_LENGTH) {
            return {
                valid: false,
                error: `Description too long (max ${this.MAX_DESCRIPTION_LENGTH} characters)`,
                sanitized: trimmed.substring(0, this.MAX_DESCRIPTION_LENGTH)
            };
        }
        
        // Check for SQL injection patterns (more lenient for descriptions)
        if (this.SQL_INJECTION_PATTERNS.test(trimmed)) {
            return {
                valid: false,
                error: 'Description contains potentially dangerous content',
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
     * Validates client name input
     * @param {string} name - Client name to validate
     * @returns {ValidationResult}
     */
    static validateClientName(name) {
        return this.validateName(name, 'Client');
    }
    
    /**
     * Validates numeric input (like project ID, time values)
     * @param {any} value - Value to validate as number
     * @param {number} min - Minimum allowed value
     * @param {number} max - Maximum allowed value
     * @returns {ValidationResult}
     */
    static validateNumber(value, min = 0, max = Number.MAX_SAFE_INTEGER) {
        const num = Number(value);
        
        if (isNaN(num)) {
            return {
                valid: false,
                error: 'Value must be a number',
                sanitized: min
            };
        }
        
        if (num < min) {
            return {
                valid: false,
                error: `Value must be at least ${min}`,
                sanitized: min
            };
        }
        
        if (num > max) {
            return {
                valid: false,
                error: `Value must not exceed ${max}`,
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
     * Validates color hex code
     * @param {string} color - Hex color code to validate
     * @returns {ValidationResult}
     */
    static validateColor(color) {
        if (!color || typeof color !== 'string') {
            return {
                valid: false,
                error: 'Color is required',
                sanitized: '#cccccc'
            };
        }
        
        const trimmed = color.trim();
        const hexPattern = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/;
        
        if (!hexPattern.test(trimmed)) {
            return {
                valid: false,
                error: 'Invalid color format (use #RRGGBB or #RGB)',
                sanitized: '#cccccc'
            };
        }
        
        return {
            valid: true,
            error: null,
            sanitized: trimmed.toLowerCase()
        };
    }
    
    /**
     * Creates safe SQL parameter for database operations
     * @param {string} input - User input to sanitize
     * @returns {string} - SQL-safe string
     */
    static sanitizeForSQL(input) {
        if (!input || typeof input !== 'string') {
            return '';
        }
        
        // Replace single quotes with double quotes for SQL safety
        return input.trim().replace(/'/g, "''");
    }
    
    /**
     * Escapes text for safe display in GTK markup contexts
     * @param {string} text - Text to escape
     * @returns {string} - GTK markup-safe text
     */
    static escapeForGTKMarkup(text) {
        if (!text || typeof text !== 'string') {
            return '';
        }
        
        return text
            .replace(/&/g, '&amp;')   // Must be first!
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }
    
    /**
     * Shows or hides validation error styling on widget
     * @param {Object} widget - GTK widget to show error styling on
     * @param {boolean} showError - True to show error, false to hide
     * @param {string} message - Error message (for console logging)
     */
    static showValidationTooltip(widget, message, showError = true) {
        if (!widget) {
            console.error('Validation Error: Widget missing');
            return;
        }
        
        try {
            if (showError && message) {
                // Add error styling only if not already present
                if (!widget.has_css_class('error')) {
                    widget.add_css_class('error');
                }
            } else {
                // Remove error styling
                if (widget.has_css_class('error')) {
                    widget.remove_css_class('error');
                }
            }
            
        } catch (error) {
            console.error('Failed to update validation styling:', error);
        }
    }
    
    /**
     * Validates email address
     * @param {string} email - Email to validate
     * @returns {ValidationResult}
     */
    static validateEmail(email) {
        if (!email || typeof email !== 'string') {
            return {
                valid: false,
                error: 'Email address is required',
                sanitized: ''
            };
        }

        const trimmed = email.trim();
        
        if (trimmed.length === 0) {
            return {
                valid: true,
                error: null,
                sanitized: ''
            };
        }

        const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailPattern.test(trimmed)) {
            return {
                valid: false,
                error: 'Invalid email format',
                sanitized: trimmed
            };
        }

        if (trimmed.length > 255) {
            return {
                valid: false,
                error: 'Email address too long (max 255 characters)',
                sanitized: trimmed.substring(0, 255)
            };
        }

        return {
            valid: true,
            error: null,
            sanitized: trimmed.toLowerCase()
        };
    }

    /**
     * Validates hourly rate
     * @param {any} rate - Rate to validate
     * @returns {ValidationResult}
     */
    static validateRate(rate) {
        const num = Number(rate);
        
        if (isNaN(num)) {
            return {
                valid: false,
                error: 'Rate must be a number',
                sanitized: 0
            };
        }
        
        if (num < 0) {
            return {
                valid: false,
                error: 'Rate cannot be negative',
                sanitized: 0
            };
        }
        
        if (num > 10000) {
            return {
                valid: false,
                error: 'Rate too high (max 10000)',
                sanitized: 10000
            };
        }
        
        // Round to 2 decimal places
        const rounded = Math.round(num * 100) / 100;
        
        return {
            valid: true,
            error: null,
            sanitized: rounded
        };
    }

    /**
     * Shows validation error dialog to user (legacy method)
     * @param {Object} parentWindow - GTK window to show dialog on
     * @param {string} title - Dialog title
     * @param {string} message - Error message
     */
    static showValidationError(parentWindow, title, message) {
        if (!parentWindow) {
            console.error('Validation Error:', title, '-', message);
            return;
        }
        
        try {
            const Adw = imports.gi.Adw;
            const errorDialog = new Adw.AlertDialog({
                heading: title || 'Input Error',
                body: message || 'Invalid input provided'
            });
            
            errorDialog.add_response('ok', 'OK');
            errorDialog.set_response_appearance('ok', Adw.ResponseAppearance.SUGGESTED);
            errorDialog.present(parentWindow);
            
        } catch (error) {
            console.error('Failed to show validation error dialog:', error);
            console.error('Original validation error:', title, '-', message);
        }
    }
}

// Export for backward compatibility
export const validateProjectName = InputValidator.validateProjectName;
export const validateTaskName = InputValidator.validateTaskName;
export const validateClientName = InputValidator.validateClientName;
export const validateEmail = InputValidator.validateEmail;
export const validateRate = InputValidator.validateRate;
export const sanitizeForSQL = InputValidator.sanitizeForSQL;