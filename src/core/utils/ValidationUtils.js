/**
 * Input validation utilities
 * Pure business logic - NO UI dependencies
 */
/**
 * Input validation utilities
 */
export class ValidationUtils {
    /**
     * Validate string against rules
     */
    static validateString(value, rules) {
        // Required check
        if (rules.required && (!value || value.trim().length === 0)) {
            return { valid: false, error: 'This field is required' };
        }
        // Skip other checks if not required and empty
        if (!value && !rules.required) {
            return { valid: true };
        }
        // Min length
        if (rules.minLength && value.length < rules.minLength) {
            return {
                valid: false,
                error: `Minimum length is ${rules.minLength} characters`,
            };
        }
        // Max length
        if (rules.maxLength && value.length > rules.maxLength) {
            return {
                valid: false,
                error: `Maximum length is ${rules.maxLength} characters`,
            };
        }
        // Pattern matching
        if (rules.pattern && !rules.pattern.test(value)) {
            return {
                valid: false,
                error: rules.customError || 'Invalid format',
            };
        }
        // Custom validation
        if (rules.custom && !rules.custom(value)) {
            return {
                valid: false,
                error: rules.customError || 'Validation failed',
            };
        }
        return { valid: true };
    }
    /**
     * Validate number against rules
     */
    static validateNumber(value, rules) {
        // Required check
        if (rules.required && (value === null || value === undefined)) {
            return { valid: false, error: 'This field is required' };
        }
        // Skip other checks if not required and empty
        if ((value === null || value === undefined) && !rules.required) {
            return { valid: true };
        }
        // Min value
        if (rules.min !== undefined && value < rules.min) {
            return { valid: false, error: `Minimum value is ${rules.min}` };
        }
        // Max value
        if (rules.max !== undefined && value > rules.max) {
            return { valid: false, error: `Maximum value is ${rules.max}` };
        }
        // Check if valid number
        if (isNaN(value)) {
            return { valid: false, error: 'Must be a valid number' };
        }
        // Custom validation
        if (rules.custom && !rules.custom(value)) {
            return {
                valid: false,
                error: rules.customError || 'Validation failed',
            };
        }
        return { valid: true };
    }
    /**
     * Validate project name
     */
    static validateProjectName(name) {
        return this.validateString(name, {
            required: true,
            minLength: 1,
            maxLength: 100,
        });
    }
    /**
     * Validate client name
     */
    static validateClientName(name) {
        return this.validateString(name, {
            required: true,
            minLength: 1,
            maxLength: 100,
        });
    }
    /**
     * Validate task name
     */
    static validateTaskName(name) {
        return this.validateString(name, {
            required: true,
            minLength: 1,
            maxLength: 200,
        });
    }
    /**
     * Validate email address
     */
    static validateEmail(email) {
        if (!email) {
            return { valid: true }; // Email is optional
        }
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return { valid: false, error: 'Invalid email address' };
        }
        return { valid: true };
    }
    /**
     * Validate hourly rate
     */
    static validateHourlyRate(rate) {
        return this.validateNumber(rate, {
            min: 0,
            max: 999999,
            custom: (val) => {
                // Check for max 2 decimal places
                const decimals = (val.toString().split('.')[1] || '').length;
                return decimals <= 2;
            },
            customError: _('Maximum 2 decimal places allowed'),
        });
    }
    /**
     * Validate currency code (3-letter ISO code)
     */
    static validateCurrencyCode(code) {
        return this.validateString(code, {
            required: true,
            pattern: /^[A-Z]{3}$/,
            customError: _('Must be a 3-letter currency code (e.g., USD, EUR)'),
        });
    }
    /**
     * Validate URL
     */
    static validateUrl(url) {
        if (!url) {
            return { valid: true }; // URL is optional
        }
        try {
            new URL(url);
            return { valid: true };
        }
        catch {
            return { valid: false, error: 'Invalid URL format' };
        }
    }
    /**
     * Validate phone number (basic validation)
     */
    static validatePhone(phone) {
        if (!phone) {
            return { valid: true }; // Phone is optional
        }
        const phoneRegex = /^[+]?[(]?[0-9]{1,4}[)]?[-\s.]?[(]?[0-9]{1,4}[)]?[-\s.]?[0-9]{1,9}$/;
        if (!phoneRegex.test(phone.replace(/\s/g, ''))) {
            return { valid: false, error: 'Invalid phone number' };
        }
        return { valid: true };
    }
    /**
     * Sanitize string input (remove dangerous characters)
     */
    static sanitizeInput(input) {
        if (!input)
            return '';
        return input
            .replace(/[<>]/g, '') // Remove < and >
            .trim();
    }
    /**
     * Sanitize HTML input (escape HTML entities)
     */
    static sanitizeHtml(input) {
        if (!input)
            return '';
        const entityMap = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;',
            '/': '&#x2F;',
        };
        return input.replace(/[&<>"'\/]/g, (s) => entityMap[s]);
    }
    /**
     * Validate time duration (in minutes)
     */
    static validateDuration(minutes) {
        return this.validateNumber(minutes, {
            required: true,
            min: 0,
            max: 10080, // Max 1 week in minutes
        });
    }
    /**
     * Validate date string
     */
    static validateDate(dateString) {
        if (!dateString) {
            return { valid: false, error: 'Date is required' };
        }
        const date = new Date(dateString);
        if (isNaN(date.getTime())) {
            return { valid: false, error: 'Invalid date format' };
        }
        return { valid: true };
    }
    /**
     * Validate date range
     */
    static validateDateRange(startDate, endDate) {
        const startResult = this.validateDate(startDate);
        if (!startResult.valid) {
            return startResult;
        }
        const endResult = this.validateDate(endDate);
        if (!endResult.valid) {
            return endResult;
        }
        const start = new Date(startDate);
        const end = new Date(endDate);
        if (start > end) {
            return { valid: false, error: 'Start date must be before end date' };
        }
        return { valid: true };
    }
    /**
     * Validate percentage (0-100)
     */
    static validatePercentage(value) {
        return this.validateNumber(value, {
            required: true,
            min: 0,
            max: 100,
        });
    }
    /**
     * Validate color hex code
     */
    static validateHexColor(color) {
        if (!color) {
            return { valid: false, error: 'Color is required' };
        }
        const hexRegex = /^#?[0-9A-Fa-f]{6}$/;
        if (!hexRegex.test(color)) {
            return { valid: false, error: 'Invalid hex color format (e.g., #FF0000)' };
        }
        return { valid: true };
    }
    /**
     * Validate password strength
     */
    static validatePassword(password) {
        if (!password) {
            return { valid: false, error: 'Password is required' };
        }
        if (password.length < 8) {
            return { valid: false, error: 'Password must be at least 8 characters' };
        }
        const hasUpper = /[A-Z]/.test(password);
        const hasLower = /[a-z]/.test(password);
        const hasNumber = /[0-9]/.test(password);
        const hasSpecial = /[!@#$%^&*(),.?":{}|<>]/.test(password);
        const strength = [hasUpper, hasLower, hasNumber, hasSpecial].filter(Boolean).length;
        if (strength < 3) {
            return {
                valid: false,
                error: 'Password must contain at least 3 of: uppercase, lowercase, number, special character',
            };
        }
        return { valid: true };
    }
    /**
     * Validate username (alphanumeric, underscore, dash)
     */
    static validateUsername(username) {
        return this.validateString(username, {
            required: true,
            minLength: 3,
            maxLength: 30,
            pattern: /^[a-zA-Z0-9_-]+$/,
            customError: _('Username can only contain letters, numbers, underscore, and dash'),
        });
    }
}
