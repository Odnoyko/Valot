import Gtk from 'gi://Gtk';
import { InputValidator } from 'resource:///com/odnoyko/valot/utils/InputValidator.js';

/**
 * Reusable Entry component with validation and consistent styling
 */
export class Entry {
    constructor(config = {}) {
        const defaultConfig = {
            placeholderText: '',
            text: '',
            hexpand: true,
            validator: null,
            realTimeValidation: false,
            onChanged: null,
            onActivate: null,
            maxLength: -1,
            isPassword: false,
            cssClasses: []
        };

        this.validationError = null;
    }

    _createWidget() {
        const entry = new Gtk.Entry({
            placeholder_text: this.config.placeholderText,
            text: this.config.text,
            hexpand: this.config.hexpand,
            visibility: !this.config.isPassword
        });

        if (this.config.maxLength > 0) {
            entry.set_max_length(this.config.maxLength);
        }

        return entry;
    }

    _setupEvents() {
        if (this.config.onChanged) {
            this.widget.connect('changed', () => {
                const text = this.widget.get_text();
                this.config.onChanged(text, this);
                this._emit('changed', text);
            });
        }

        if (this.config.onActivate) {
            this.widget.connect('activate', () => {
                const text = this.widget.get_text();
                this.config.onActivate(text, this);
                this._emit('activate', text);
            });
        }

        // Real-time validation
        if (this.config.validator && this.config.realTimeValidation) {
            this.widget.connect('changed', () => {
                this._validateInput();
            });
        }
    }

    /**
     * Validate current input
     * @private
     */
    _validateInput() {
        if (!this.config.validator) {
            return { valid: true, error: null };
        }

        const text = this.widget.get_text();
        const validation = this.config.validator(text);

        if (!validation.valid) {
            this._showValidationError(validation.error);
            this.validationError = validation.error;
        } else {
            this._clearValidationError();
            this.validationError = null;
        }

        this._emit('validationChanged', {
            valid: validation.valid,
            error: validation.error,
            sanitized: validation.sanitized
        });

        return validation;
    }

    /**
     * Show validation error
     * @private
     */
    _showValidationError(message) {
        InputValidator.showValidationTooltip(this.widget, message, true);
    }

    /**
     * Clear validation error
     * @private
     */
    _clearValidationError() {
        InputValidator.showValidationTooltip(this.widget, null, false);
    }

    /**
     * Get current text value
     */
    getText() {
        return this.widget.get_text();
    }

    /**
     * Set text value
     */
    setText(text, preserveCursor = false) {
        const newText = text || '';
        
        // Check if the text is actually different to avoid unnecessary updates
        if (this.widget.get_text() === newText) {
            return;
        }
        
        let cursorPosition = 0;
        if (preserveCursor) {
            // Store current cursor position
            cursorPosition = this.widget.get_position();
        }
        
        this.widget.set_text(newText);
        this.config.text = newText;
        
        if (preserveCursor) {
            // Restore cursor position if it's still valid for the new text
            if (cursorPosition <= newText.length) {
                this.widget.set_position(cursorPosition);
            } else {
                // If cursor was beyond new text length, put it at the end
                this.widget.set_position(newText.length);
            }
        }
        
        // Validate after setting text
        if (this.config.validator && this.config.realTimeValidation) {
            this._validateInput();
        }
    }

    /**
     * Get validated and sanitized text
     */
    getValidatedText() {
        const validation = this._validateInput();
        return validation.valid ? validation.sanitized : null;
    }

    /**
     * Check if current input is valid
     */
    isValid() {
        const validation = this._validateInput();
        return validation.valid;
    }

    /**
     * Set placeholder text
     */
    setPlaceholder(text) {
        this.widget.set_placeholder_text(text);
        this.config.placeholderText = text;
    }

    /**
     * Set maximum length
     */
    setMaxLength(length) {
        this.widget.set_max_length(length);
        this.config.maxLength = length;
    }

    /**
     * Focus the entry
     */
    focus() {
        this.widget.grab_focus();
    }

    /**
     * Select all text
     */
    selectAll() {
        this.widget.select_region(0, -1);
    }

    /**
     * Clear the entry
     */
    clear() {
        this.setText('');
    }

    /**
     * Set validator
     */
    setValidator(validator, realTime = false) {
        this.config.validator = validator;
        this.config.realTimeValidation = realTime;
        
        if (realTime) {
            this._validateInput();
        }
    }
}