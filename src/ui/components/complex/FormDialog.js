import Gtk from 'gi://Gtk';
import Adw from 'gi://Adw';
import { Button } from '../primitive/Button.js';
import { Entry } from '../primitive/Entry.js';
import { Label } from '../primitive/Label.js';
import { ColorPicker } from '../primitive/ColorPicker.js';
import { IconPicker } from '../primitive/IconPicker.js';
// TODO: Restore when migrated
// import { InputValidator } from '../../../func/global/inputValidation.js';
import { ValidationUtils } from 'resource:///com/odnoyko/valot/ui/utils/CoreImports.js';

/**
 * Modern form dialog with automatic validation and consistent styling
 */
export class FormDialog {
    constructor(config = {}) {
        const defaultConfig = {
            title: _('Form Dialog'),
            subtitle: '',
            width: 500,
            height: -1,
            fields: [],
            submitLabel: _('Submit'),
            cancelLabel: _('Cancel'),
            onSubmit: null,
            onCancel: null,
            showIcons: true,
            parentWindow: null,
            cssClasses: ['form-dialog']
        };

        this.config = { ...defaultConfig, ...config };
        this.fieldComponents = new Map();
        this.errorLabels = new Map();
        this.isSubmitting = false;
        this.eventListeners = new Map();
        
        this.widget = this._createWidget();
        this._createForm();
        this._createButtons();
    }

    _createWidget() {
        const dialog = new Adw.AlertDialog({
            heading: this.config.title,
            body: this.config.subtitle || undefined
        });

        // AlertDialog doesn't support manual width/height setting
        // It auto-sizes based on content and system preferences

        return dialog;
    }

    _createButtons() {
        this._setupActions();
        this._setupEventHandlers();
    }

    _createForm() {
        const formContainer = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 16,
            margin_top: 20,
            margin_bottom: 20,
            margin_start: 20,
            margin_end: 20
        });

        // Use custom content if provided, otherwise create fields
        if (this.config.customContent) {
            formContainer.append(this.config.customContent);
        } else {
            // Create fields
            this.config.fields.forEach((fieldConfig, index) => {
                const fieldWidget = this._createField(fieldConfig, `field_${index}`);
                if (fieldWidget) {
                    formContainer.append(fieldWidget);
                }
            });
        }

        this.widget.set_extra_child(formContainer);
    }

    _createField(fieldConfig, fieldId) {
        const {
            type = 'entry',
            name,
            label,
            placeholder = '',
            required = false,
            validator = null,
            value = '',
            options = [],
            ...extraConfig
        } = fieldConfig;

        const fieldContainer = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 8
        });

        // Field label
        if (label) {
            const labelText = required ? `${label} *` : label;
            const labelWidget = new Label({
                text: labelText,
                halign: Gtk.Align.START,
                cssClasses: required ? ['field-label', 'required'] : ['field-label']
            });
            fieldContainer.append(labelWidget.getWidget());
        }

        // Create input component based on type
        let component = null;
        
        switch (type) {
            case 'entry':
                component = this._createEntryField(fieldConfig, fieldId);
                break;
                
            case 'password':
                component = this._createPasswordField(fieldConfig, fieldId);
                break;
                
            case 'number':
                component = this._createNumberField(fieldConfig, fieldId);
                break;
                
            case 'dropdown':
                component = this._createDropdownField(fieldConfig, fieldId);
                break;
                
            case 'color':
                component = this._createColorField(fieldConfig, fieldId);
                break;
                
            case 'icon':
                component = this._createIconField(fieldConfig, fieldId);
                break;
                
            case 'textarea':
                component = this._createTextareaField(fieldConfig, fieldId);
                break;
                
            case 'toggle':
                component = this._createToggleField(fieldConfig, fieldId);
                break;
                
            default:
                return null;
        }

        if (component) {
            this.fieldComponents.set(name || fieldId, component);
            fieldContainer.append(component.getWidget());
            
            // Add validation error display
            if (validator) {
                this._addValidationError(fieldContainer, fieldId);
            }
        }

        return fieldContainer;
    }

    _createEntryField(config, fieldId) {
        return new Entry({
            placeholderText: config.placeholder,
            text: config.value || '',
            validator: config.validator,
            realTimeValidation: true,
            maxLength: config.maxLength || -1,
            hexpand: true
        });
    }

    _createPasswordField(config, fieldId) {
        return new Entry({
            placeholderText: config.placeholder,
            text: config.value || '',
            isPassword: true,
            validator: config.validator,
            realTimeValidation: true,
            hexpand: true
        });
    }

    _createNumberField(config, fieldId) {
        const spinButton = new Gtk.SpinButton({
            adjustment: new Gtk.Adjustment({
                lower: config.min || 0,
                upper: config.max || 999999,
                step_increment: config.step || 1,
                value: config.value || config.min || 0
            }),
            digits: config.digits || 0,
            hexpand: true
        });

        return {
            getWidget: () => spinButton,
            getValue: () => spinButton.get_value(),
            setValue: (value) => spinButton.set_value(value),
            subscribe: (callback) => {
                spinButton.connect('value-changed', () => {
                    callback('valueChanged', spinButton.get_value());
                });
                return () => {}; // Cleanup function
            }
        };
    }

    _createDropdownField(config, fieldId) {
        const stringList = new Gtk.StringList();
        config.options.forEach(option => {
            if (typeof option === 'string') {
                stringList.append(option);
            } else {
                stringList.append(option.label || option.value);
            }
        });

        const dropdown = new Gtk.DropDown({
            model: stringList,
            hexpand: true
        });

        // Set initial selection
        if (config.value) {
            const index = config.options.findIndex(opt => 
                (typeof opt === 'string' ? opt : opt.value) === config.value
            );
            if (index >= 0) {
                dropdown.set_selected(index);
            }
        }

        return {
            getWidget: () => dropdown,
            getValue: () => {
                const selected = dropdown.get_selected();
                const option = config.options[selected];
                return typeof option === 'string' ? option : option.value;
            },
            setValue: (value) => {
                const index = config.options.findIndex(opt => 
                    (typeof opt === 'string' ? opt : opt.value) === value
                );
                if (index >= 0) {
                    dropdown.set_selected(index);
                }
            },
            subscribe: (callback) => {
                dropdown.connect('notify::selected', () => {
                    const selected = dropdown.get_selected();
                    const option = config.options[selected];
                    const value = typeof option === 'string' ? option : option.value;
                    callback('selectionChanged', value);
                });
                return () => {}; // Cleanup function
            }
        };
    }

    _createColorField(config, fieldId) {
        return new ColorPicker({
            selectedColor: config.value || '#3584e4',
            colors: config.colors,
            allowCustom: config.allowCustom !== false,
            onColorChanged: (color) => {
                this._emit('fieldChanged', { field: config.name, value: color });
            }
        });
    }

    _createIconField(config, fieldId) {
        return new IconPicker({
            selectedIcon: config.value || 'folder-symbolic',
            icons: config.icons,
            showSearch: config.showSearch !== false,
            showCategories: config.showCategories !== false,
            maxHeight: config.maxHeight || 250,
            onIconChanged: (icon) => {
                this._emit('fieldChanged', { field: config.name, value: icon });
            }
        });
    }

    _createTextareaField(config, fieldId) {
        const textView = new Gtk.TextView({
            hexpand: true,
            height_request: config.height || 100,
            css_classes: ['textarea-field']
        });

        const buffer = textView.get_buffer();
        if (config.value) {
            buffer.set_text(config.value, -1);
        }

        // Wrap in scrolled window
        const scrolled = new Gtk.ScrolledWindow({
            hexpand: true,
            height_request: config.height || 100,
            css_classes: ['textarea-scroll']
        });
        scrolled.set_child(textView);

        return {
            getWidget: () => scrolled,
            getValue: () => {
                const [start, end] = buffer.get_bounds();
                return buffer.get_text(start, end, false);
            },
            setValue: (value) => buffer.set_text(value || '', -1),
            subscribe: (callback) => {
                buffer.connect('changed', () => {
                    const [start, end] = buffer.get_bounds();
                    const text = buffer.get_text(start, end, false);
                    callback('textChanged', text);
                });
                return () => {}; // Cleanup function
            }
        };
    }

    _createToggleField(config, fieldId) {
        const toggle = new Gtk.Switch({
            active: config.value || false,
            halign: Gtk.Align.START
        });

        return {
            getWidget: () => toggle,
            getValue: () => toggle.get_active(),
            setValue: (value) => toggle.set_active(!!value),
            subscribe: (callback) => {
                toggle.connect('state-set', (widget, state) => {
                    callback('stateChanged', state);
                    return false; // Allow default handling
                });
                return () => {}; // Cleanup function
            }
        };
    }

    _addValidationError(container, fieldId) {
        const errorLabel = new Label({
            text: '',
            cssClasses: ['error-label', 'caption'],
            halign: Gtk.Align.START,
            visible: false
        });

        container.append(errorLabel.widget);
        this.errorLabels.set(`error_${fieldId}`, errorLabel);
    }

    _setupActions() {
        // Add dialog buttons
        this.widget.add_response('cancel', this.config.cancelLabel);
        this.widget.add_response('submit', this.config.submitLabel);
        
        // Style submit button
        this.widget.set_response_appearance('submit', Adw.ResponseAppearance.SUGGESTED);
        
        // Initially disable submit if required fields are empty
        this._validateForm();
    }

    _setupEventHandlers() {
        this.widget.connect('response', (dialog, response) => {
            if (response === 'submit') {
                this._handleSubmit();
            } else if (response === 'cancel') {
                this._handleCancel();
            }
        });

        // Listen to field changes for validation
        this.fieldComponents.forEach((component, fieldName) => {
            if (component.subscribe) {
                component.subscribe((event, value) => {
                    this._validateField(fieldName);
                    this._validateForm();
                    this._emit('fieldChanged', { field: fieldName, value });
                });
            }
        });
    }

    _validateField(fieldName) {
        const fieldConfig = this.config.fields.find(f => (f.name || `field_${this.config.fields.indexOf(f)}`) === fieldName);
        if (!fieldConfig || !fieldConfig.validator) return true;

        const component = this.fieldComponents.get(fieldName);
        const value = component.getValue ? component.getValue() : '';
        
        const validation = fieldConfig.validator(value);
        const errorLabel = this.errorLabels.get(`error_${fieldName}`);

        if (errorLabel) {
            if (!validation.valid) {
                errorLabel.setText(validation.error);
                errorLabel.show();
            } else {
                errorLabel.hide();
            }
        }

        return validation.valid;
    }

    _validateForm() {
        let isValid = true;

        this.config.fields.forEach((fieldConfig, index) => {
            const fieldName = fieldConfig.name || `field_${index}`;
            
            // Check required fields
            if (fieldConfig.required) {
                const component = this.fieldComponents.get(fieldName);
                const value = component.getValue ? component.getValue() : '';
                
                if (!value || value.toString().trim() === '') {
                    isValid = false;
                }
            }

            // Check validation
            if (fieldConfig.validator) {
                if (!this._validateField(fieldName)) {
                    isValid = false;
                }
            }
        });

        // Enable/disable submit button
        this.widget.set_response_enabled('submit', isValid && !this.isSubmitting);
        return isValid;
    }

    _handleSubmit() {
        if (!this._validateForm()) return;

        this.isSubmitting = true;
        this.widget.set_response_enabled('submit', false);

        // Collect form data
        const formData = {};
        this.fieldComponents.forEach((component, fieldName) => {
            formData[fieldName] = component.getValue ? component.getValue() : '';
        });

        // Call submit handler
        if (this.config.onSubmit) {
            const result = this.config.onSubmit(formData, this);
            
            // If submit handler returns false, keep dialog open
            if (result === false) {
                this.isSubmitting = false;
                this.widget.set_response_enabled('submit', true);
                return;
            }
        }

        this._emit('submit', formData);
        this.widget.close();
    }

    _handleCancel() {
        if (this.config.onCancel) {
            this.config.onCancel(this);
        }
        
        this._emit('cancel');
        this.widget.close();
    }

    /**
     * Show the dialog
     */
    present(parentWindow = null) {
        const parent = parentWindow || this.config.parentWindow;
        if (parent) {
            this.widget.present(parent);
        } else {
            this.widget.present();
        }
    }

    /**
     * Get form data
     */
    getFormData() {
        const formData = {};
        this.fieldComponents.forEach((component, fieldName) => {
            formData[fieldName] = component.getValue ? component.getValue() : '';
        });
        return formData;
    }

    /**
     * Set form data
     */
    setFormData(data) {
        Object.entries(data).forEach(([fieldName, value]) => {
            const component = this.fieldComponents.get(fieldName);
            if (component && component.setValue) {
                component.setValue(value);
            }
        });
    }

    /**
     * Show validation error for a field
     */
    showFieldError(fieldName, error) {
        const errorLabel = this.errorLabels.get(`error_${fieldName}`);
        if (errorLabel) {
            errorLabel.setText(error);
            errorLabel.show();
        }
    }

    /**
     * Clear all validation errors
     */
    clearErrors() {
        this.fieldComponents.forEach((component, fieldName) => {
            const errorLabel = this.errorLabels.get(`error_${fieldName}`);
            if (errorLabel) {
                errorLabel.hide();
            }
        });
    }

    /**
     * Close the dialog
     */
    close() {
        // Clear event listeners to prevent memory leaks
        this.eventListeners.clear();
        this.widget.close();
    }

    /**
     * Subscribe to dialog events
     */
    subscribe(callback) {
        const listenerId = `listener_${Date.now()}_${Math.random()}`;
        this.eventListeners.set(listenerId, callback);
        
        // Return unsubscribe function
        return () => {
            this.eventListeners.delete(listenerId);
        };
    }

    /**
     * Emit an event to all subscribers
     */
    _emit(event, data) {
        this.eventListeners.forEach(callback => {
            try {
                callback(event, data);
            } catch (error) {
                // Error in event listener
            }
        });
    }
}