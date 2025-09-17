/**
 * Functionality: Entry Behavior and Validation Logic
 */
export class EntryBehavior {
    constructor(entryInterface, config = {}) {
        this.interface = entryInterface;
        this.config = {
            validator: config.validator || null,
            realTimeValidation: config.realTimeValidation || false,
            onChange: config.onChange || null,
            onEnter: config.onEnter || null,
            onFocus: config.onFocus || null,
            onBlur: config.onBlur || null,
            ...config
        };

        this.isValid = true;
        this.validationError = null;
        
        this._setupEvents();
        this._applyInitialValidation();
    }

    _setupEvents() {
        // Text change events
        this.interface.widget.connect('changed', () => {
            const text = this.interface.getText();
            
            if (this.config.realTimeValidation) {
                this.validate(text);
            }
            
            if (this.config.onChange) {
                this.config.onChange(text, this);
            }
        });

        // Enter key
        this.interface.widget.connect('activate', () => {
            if (this.config.onEnter) {
                const text = this.interface.getText();
                this.config.onEnter(text, this);
            }
        });

        // Focus events
        const focusController = new Gtk.EventControllerFocus();
        focusController.connect('enter', () => {
            if (this.config.onFocus) {
                this.config.onFocus(this);
            }
        });
        
        focusController.connect('leave', () => {
            // Validate on blur
            if (!this.config.realTimeValidation && this.config.validator) {
                this.validate(this.interface.getText());
            }
            
            if (this.config.onBlur) {
                this.config.onBlur(this);
            }
        });
        
        this.interface.widget.add_controller(focusController);
    }

    _applyInitialValidation() {
        if (this.config.validator && this.interface.config.text) {
            this.validate(this.interface.config.text);
        }
    }

    // Validation functionality
    validate(text = null) {
        if (!this.config.validator) {
            this.isValid = true;
            this.validationError = null;
            this._updateValidationStyle(true);
            return { valid: true, error: null, sanitized: text };
        }

        const textToValidate = text !== null ? text : this.interface.getText();
        const result = this.config.validator(textToValidate);
        
        this.isValid = result.valid;
        this.validationError = result.error;
        
        this._updateValidationStyle(result.valid);
        
        return result;
    }

    _updateValidationStyle(isValid) {
        if (isValid) {
            this.interface.removeClass('error');
            this.interface.addClass('valid');
        } else {
            this.interface.removeClass('valid');
            this.interface.addClass('error');
        }
    }

    // Utility methods
    getValidatedText() {
        const result = this.validate();
        return result.valid ? result.sanitized : null;
    }

    showError(message) {
        this.validationError = message;
        this.isValid = false;
        this._updateValidationStyle(false);
        this._showTooltip(message);
    }

    clearError() {
        this.validationError = null;
        this.isValid = true;
        this._updateValidationStyle(true);
        this._hideTooltip();
    }

    _showTooltip(message) {
        this.interface.widget.set_tooltip_text(message);
        // Could also show a temporary popover here
    }

    _hideTooltip() {
        this.interface.widget.set_tooltip_text('');
    }

    // State management
    getState() {
        return {
            text: this.interface.getText(),
            isValid: this.isValid,
            error: this.validationError,
            editable: this.interface.config.editable
        };
    }

    setState(state) {
        if (state.hasOwnProperty('text')) {
            this.interface.setText(state.text);
        }
        if (state.hasOwnProperty('editable')) {
            this.interface.setEditable(state.editable);
        }
        if (state.hasOwnProperty('error') && state.error) {
            this.showError(state.error);
        }
    }

    // Project-specific styling
    applyProjectTheme(projectColor) {
        if (projectColor) {
            const css = `
                entry.project-themed:focus {
                    border-color: ${projectColor};
                    box-shadow: inset 0 0 0 1px ${projectColor};
                }
            `;
            
            const provider = new Gtk.CssProvider();
            provider.load_from_data(css, css.length);
            this.interface.widget.get_style_context().add_provider(
                provider,
                Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION
            );
            this.interface.addClass('project-themed');
        }
    }
}