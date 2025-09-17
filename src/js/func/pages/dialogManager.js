import Gtk from 'gi://Gtk';
import Adw from 'gi://Adw';
import { InputValidator } from 'resource:///com/odnoyko/valot/js/func/global/inputValidation.js';
import { WindowConfig } from './windowManagers.js';

/**
 * Manages standardized dialog creation and entity forms
 */
export class DialogManager {
    constructor(parentWindow) {
        this.parentWindow = parentWindow;
    }

    /**
     * Creates a standardized entity dialog (Project/Client)
     */
    createEntityDialog(config = {}) {
        const {
            title = 'Add Item',
            subtitle = 'Create a new item',
            entity = 'item',
            fields = [],
            onSubmit = null,
            onValidate = null,
            submitLabel = 'Create',
            width = 400
        } = config;

        const dialog = new Adw.AlertDialog({
            heading: title,
            body: subtitle
        });

        // Create form container
        const form = this._createFormContainer();

        // Store field references for validation
        const fieldRefs = {};

        // Create form fields
        fields.forEach(fieldConfig => {
            const fieldContainer = this._createFormField(fieldConfig, fieldRefs);
            form.append(fieldContainer);
        });

        // Setup dialog
        dialog.set_extra_child(form);
        dialog.add_response('cancel', 'Cancel');
        dialog.add_response('submit', submitLabel);
        dialog.set_response_appearance('submit', Adw.ResponseAppearance.SUGGESTED);

        // Handle dialog response
        dialog.connect('response', (dialog, response) => {
            if (response === 'submit') {
                const formData = this._extractFormData(fieldRefs);
                
                // Validate if validator provided
                if (onValidate) {
                    const validation = onValidate(formData);
                    if (!validation.isValid) {
                        this._showFieldError(fieldRefs[validation.field], validation.error);
                        return; // Keep dialog open
                    }
                }

                // Submit if handler provided
                if (onSubmit) {
                    const success = onSubmit(formData);
                    if (!success) {
                        return; // Keep dialog open on failure
                    }
                }
            }
            dialog.close();
        });

        return dialog;
    }

    /**
     * Creates a project dialog with icon and color selection
     */
    createProjectDialog(config = {}) {
        const {
            mode = 'create', // 'create' or 'edit'
            project = null,
            onSubmit = null
        } = config;

        const isEdit = mode === 'edit' && project;
        const title = isEdit ? 'Edit Project' : 'Create New Project';
        const submitLabel = isEdit ? 'Save Changes' : 'Create Project';

        const dialog = new Adw.AlertDialog({
            heading: title,
            body: `${isEdit ? 'Update' : 'Create'} a project with name, icon, and color.`
        });

        // Create main container
        const mainBox = this._createDialogMainContainer();

        // Icon color mode selector
        const iconColorSelector = this._createIconColorSelector(project?.icon_color_mode || 'auto');
        mainBox.append(iconColorSelector.container);

        // Form fields
        const form = this._createFormContainer();

        // Project name field
        const nameEntry = new Gtk.Entry({
            placeholder_text: 'Project name',
            text: isEdit ? project.name : ''
        });

        this._setupRealTimeValidation(nameEntry, InputValidator.validateProjectName);
        
        form.append(new Gtk.Label({label: 'Project Name:', halign: Gtk.Align.START}));
        form.append(nameEntry);

        // Icon selection
        const iconSelector = this._createIconSelector(isEdit ? project.icon : null);
        form.append(new Gtk.Label({label: 'Project Icon:', halign: Gtk.Align.START}));
        form.append(iconSelector.container);

        // Color selection
        const colorSelector = this._createColorSelector(isEdit ? project.color : null);
        form.append(new Gtk.Label({label: 'Project Color:', halign: Gtk.Align.START}));
        form.append(colorSelector.container);

        mainBox.append(form);

        // Setup dialog
        dialog.set_extra_child(mainBox);
        dialog.add_response('cancel', 'Cancel');
        dialog.add_response('submit', submitLabel);
        dialog.set_response_appearance('submit', Adw.ResponseAppearance.SUGGESTED);

        // Handle submission
        dialog.connect('response', (dialog, response) => {
            if (response === 'submit') {
                const formData = {
                    name: nameEntry.get_text().trim(),
                    color: colorSelector.selectedColor,
                    icon: iconSelector.selectedIcon,
                    iconColorMode: iconColorSelector.selectedMode
                };

                // Validate project name
                const nameValidation = InputValidator.validateProjectName(formData.name);
                if (!nameValidation.valid) {
                    this._showFieldError(nameEntry, nameValidation.error);
                    return;
                }

                // Validate color
                const colorValidation = InputValidator.validateColor(formData.color);
                if (!colorValidation.valid) {
                    this._showFieldError(nameEntry, colorValidation.error);
                    return;
                }

                // Submit
                if (onSubmit) {
                    const success = onSubmit({
                        ...formData,
                        name: nameValidation.sanitized,
                        color: colorValidation.sanitized
                    });
                    if (!success) {
                        return;
                    }
                }
            }
            dialog.close();
        });

        return dialog;
    }

    /**
     * Creates a client dialog
     */
    createClientDialog(config = {}) {
        const {
            mode = 'create',
            client = null,
            onSubmit = null
        } = config;

        const isEdit = mode === 'edit' && client;
        const title = isEdit ? 'Edit Client' : 'Create New Client';
        const submitLabel = isEdit ? 'Save Changes' : 'Create Client';

        const fields = [
            {
                id: 'name',
                label: 'Client Name:',
                type: 'entry',
                placeholder: 'Client name',
                value: isEdit ? client.name : '',
                required: true,
                validator: InputValidator.validateClientName
            },
            {
                id: 'email',
                label: 'Email Address:',
                type: 'entry',
                placeholder: 'client@example.com',
                value: isEdit ? client.email : '',
                validator: InputValidator.validateEmail
            },
            {
                id: 'rate',
                label: 'Hourly Rate:',
                type: 'spinbutton',
                min: 0,
                max: 1000,
                step: 1,
                value: isEdit ? client.rate : 0,
                validator: InputValidator.validateRate
            },
            {
                id: 'currency',
                label: 'Currency:',
                type: 'dropdown',
                options: ['USD', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD'],
                value: isEdit ? client.currency : 'EUR'
            }
        ];

        return this.createEntityDialog({
            title,
            subtitle: `${isEdit ? 'Update' : 'Create'} a client with contact information and rates.`,
            entity: 'client',
            fields,
            onSubmit,
            onValidate: (formData) => this._validateClientForm(formData),
            submitLabel
        });
    }

    // Private helper methods

    _createFormContainer() {
        return new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 12,
            margin_top: 12,
            margin_bottom: 12,
            margin_start: 12,
            margin_end: 12
        });
    }

    _createDialogMainContainer() {
        return new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 0,
            margin_top: 12
        });
    }

    _createFormField(fieldConfig, fieldRefs) {
        const { id, label, type, placeholder, value, min, max, step, options, required, validator } = fieldConfig;

        const container = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 6
        });

        // Label
        if (label) {
            const labelWidget = new Gtk.Label({
                label: required ? `${label} *` : label,
                halign: Gtk.Align.START
            });
            container.append(labelWidget);
        }

        // Input widget based on type
        let inputWidget;
        switch (type) {
            case 'entry':
                inputWidget = new Gtk.Entry({
                    placeholder_text: placeholder || '',
                    text: value || ''
                });
                if (validator) {
                    this._setupRealTimeValidation(inputWidget, validator);
                }
                break;

            case 'spinbutton':
                inputWidget = new Gtk.SpinButton({
                    adjustment: new Gtk.Adjustment({
                        lower: min || 0,
                        upper: max || 100,
                        step_increment: step || 1
                    }),
                    value: value || 0
                });
                break;

            case 'dropdown':
                const stringList = new Gtk.StringList();
                options.forEach(option => stringList.append(option));
                inputWidget = new Gtk.DropDown({
                    model: stringList,
                    selected: options.indexOf(value) || 0
                });
                break;

            default:
                inputWidget = new Gtk.Entry({
                    placeholder_text: placeholder || '',
                    text: value || ''
                });
        }

        container.append(inputWidget);
        fieldRefs[id] = inputWidget;

        return container;
    }

    _createIconColorSelector(initialMode = 'auto') {
        const container = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 8,
            margin_bottom: 20
        });

        const label = new Gtk.Label({
            label: 'Icon Color Mode:',
            halign: Gtk.Align.CENTER,
            css_classes: ['heading']
        });

        const buttonBox = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 4,
            halign: Gtk.Align.CENTER,
            css_classes: ['linked']
        });

        const buttons = {
            auto: new Gtk.ToggleButton({ label: 'Auto', active: initialMode === 'auto' }),
            light: new Gtk.ToggleButton({ label: 'Light', active: initialMode === 'light' }),
            dark: new Gtk.ToggleButton({ label: 'Dark', active: initialMode === 'dark' })
        };

        let selectedMode = initialMode;

        // Group toggle buttons
        Object.entries(buttons).forEach(([mode, button]) => {
            button.connect('toggled', () => {
                if (button.get_active()) {
                    selectedMode = mode;
                    // Deactivate others
                    Object.entries(buttons).forEach(([otherMode, otherButton]) => {
                        if (otherMode !== mode) {
                            otherButton.set_active(false);
                        }
                    });
                }
            });
            buttonBox.append(button);
        });

        container.append(label);
        container.append(buttonBox);

        return {
            container,
            get selectedMode() { return selectedMode; }
        };
    }

    _createIconSelector(initialIcon = null) {
        const container = new Gtk.Grid({
            column_spacing: 6,
            row_spacing: 6,
            margin_bottom: 12
        });

        const icons = WindowConfig.PROJECT_ICONS.slice(0, 12); // First 12 icons
        let selectedIcon = initialIcon || icons[0];

        icons.forEach((iconName, index) => {
            const button = new Gtk.Button({
                width_request: 40,
                height_request: 40,
                css_classes: ['flat']
            });

            const icon = new Gtk.Image({
                icon_name: iconName,
                pixel_size: 24
            });
            button.set_child(icon);

            // Selection styling
            if (iconName === selectedIcon) {
                button.add_css_class('suggested-action');
            }

            button.connect('clicked', () => {
                selectedIcon = iconName;
                // Update visual selection
                this._updateIconSelection(container, index, icons.length);
            });

            const row = Math.floor(index / 6);
            const col = index % 6;
            container.attach(button, col, row, 1, 1);
        });

        return {
            container,
            get selectedIcon() { return selectedIcon; }
        };
    }

    _createColorSelector(initialColor = null) {
        const container = new Gtk.Grid({
            column_spacing: 6,
            row_spacing: 6,
            margin_bottom: 12
        });

        const colors = WindowConfig.PROJECT_COLORS.slice(0, 16); // First 16 colors
        let selectedColor = initialColor || colors[0].value;

        colors.forEach((color, index) => {
            const button = new Gtk.Button({
                width_request: 30,
                height_request: 30,
                css_classes: ['flat'],
                tooltip_text: color.name
            });

            // Apply color styling
            this._applyColorButtonStyle(button, color, color.value === selectedColor);

            button.connect('clicked', () => {
                selectedColor = color.value;
                // Update visual selection
                this._updateColorSelection(container, colors, selectedColor);
            });

            const row = Math.floor(index / 8);
            const col = index % 8;
            container.attach(button, col, row, 1, 1);
        });

        return {
            container,
            get selectedColor() { return selectedColor; }
        };
    }

    _setupRealTimeValidation(entry, validator) {
        entry.connect('changed', () => {
            const text = entry.get_text().trim();
            if (text.length > 0) {
                const validation = validator(text);
                if (!validation.valid) {
                    this._showFieldError(entry, validation.error);
                } else {
                    this._clearFieldError(entry);
                }
            } else {
                this._clearFieldError(entry);
            }
        });
    }

    _showFieldError(field, message) {
        InputValidator.showValidationTooltip(field, message, true);
    }

    _clearFieldError(field) {
        InputValidator.showValidationTooltip(field, null, false);
    }

    _extractFormData(fieldRefs) {
        const data = {};
        Object.entries(fieldRefs).forEach(([id, widget]) => {
            if (widget instanceof Gtk.Entry) {
                data[id] = widget.get_text().trim();
            } else if (widget instanceof Gtk.SpinButton) {
                data[id] = widget.get_value();
            } else if (widget instanceof Gtk.DropDown) {
                const selected = widget.get_selected();
                const model = widget.get_model();
                data[id] = model.get_string(selected);
            }
        });
        return data;
    }

    _validateClientForm(formData) {
        // Validate name
        const nameValidation = InputValidator.validateClientName(formData.name);
        if (!nameValidation.valid) {
            return { isValid: false, field: 'name', error: nameValidation.error };
        }

        // Validate email if provided
        if (formData.email) {
            const emailValidation = InputValidator.validateEmail(formData.email);
            if (!emailValidation.valid) {
                return { isValid: false, field: 'email', error: emailValidation.error };
            }
        }

        // Validate rate
        const rateValidation = InputValidator.validateRate(formData.rate);
        if (!rateValidation.valid) {
            return { isValid: false, field: 'rate', error: rateValidation.error };
        }

        return { isValid: true };
    }

    _applyColorButtonStyle(button, color, isSelected) {
        const borderStyle = isSelected ? '3px solid #000000' : '2px solid rgba(0,0,0,0.1)';
        const css = `button { 
            background: ${color.value}; 
            border-radius: 15px; 
            border: ${borderStyle}; 
        }`;
        
        const provider = new Gtk.CssProvider();
        provider.load_from_data(css, -1);
        button.get_style_context().add_provider(provider, Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION);
    }

    _updateIconSelection(container, selectedIndex, totalIcons) {
        for (let i = 0; i < totalIcons; i++) {
            const row = Math.floor(i / 6);
            const col = i % 6;
            const button = container.get_child_at(col, row);
            if (button) {
                button.remove_css_class('suggested-action');
                if (i === selectedIndex) {
                    button.add_css_class('suggested-action');
                }
            }
        }
    }

    _updateColorSelection(container, colors, selectedColor) {
        colors.forEach((color, index) => {
            const row = Math.floor(index / 8);
            const col = index % 8;
            const button = container.get_child_at(col, row);
            if (button) {
                this._applyColorButtonStyle(button, color, color.value === selectedColor);
            }
        });
    }
}