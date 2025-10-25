import Gtk from 'gi://Gtk';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import { FormDialog } from './FormDialog.js';
// TODO: Restore when migrated
// import { InputValidator } from '../../../func/global/inputValidation.js';
import { ValidationUtils } from 'resource:///com/odnoyko/valot/ui/utils/CoreImports.js';
import { getAllCurrencies, getCurrencySymbol } from 'resource:///com/odnoyko/valot/data/currencies.js';

/**
 * Client creation/editing dialog using the modular form system
 */
export class ClientDialog extends FormDialog {
    constructor(config = {}) {
        const {
            mode = 'create',
            client = null,
            onClientSave = null,
            ...formConfig
        } = config;

        const isEdit = mode === 'edit' && client;
        
        const dialogConfig = {
            title: isEdit ? 'Edit Client' : 'Create New Client',
            subtitle: isEdit ? 'Update client information' : 'Add a new client with billing rates',
            width: 400,
            submitLabel: isEdit ? 'Save Changes' : 'Create Client',
            fields: [
                // Dummy field to ensure form container is created
                {
                    type: 'entry',
                    name: 'dummy',
                    label: 'Dummy',
                    value: ''
                }
            ],
            onSubmit: (formData, dialog) => {
                return this._handleClientSave(formData, dialog);
            },
            ...formConfig
        };

        super(dialogConfig);
        
        this.mode = mode;
        this.client = client;
        this.onClientSave = onClientSave;
        
        // Load available currencies
        this.availableCurrencies = this._getAvailableCurrencies();
        
        // Create custom layout after form is ready
        setTimeout(() => {
            this._setupCustomLayout(isEdit, client);
        }, 0);
    }

    _setupCustomLayout(isEdit, client) {
        // Create the custom content and add it to the existing form container
        const customContent = this._createCustomContent(isEdit, client);
        
        // The FormDialog creates a vertical box container as extra_child
        const formContainer = this.widget.get_extra_child();
        if (formContainer) {
            // Clear any existing children and add our custom content
            let child = formContainer.get_first_child();
            while (child) {
                const next = child.get_next_sibling();
                formContainer.remove(child);
                child = next;
            }
            formContainer.append(customContent);
        }
    }

    _createCustomContent(isEdit, client) {
        // Main vertical container
        const mainBox = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 16,
            margin_top: 16,
            margin_bottom: 16,
            margin_start: 16,
            margin_end: 16
        });

        // ROW 1: Client Name only
        const nameLabel = new Gtk.Label({
            label: _('Client Name'),
            halign: Gtk.Align.START,
            css_classes: ['heading']
        });

        this.nameEntry = new Gtk.Entry({
            placeholder_text: _('Enter client name...'),
            text: isEdit ? (client.name || '') : '',
            hexpand: true
        });
        
        const nameRow = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 6
        });
        nameRow.append(nameLabel);
        nameRow.append(this.nameEntry);

        // ROW 2: Rate input with +/- buttons + Currency
        const rateLabel = new Gtk.Label({
            label: _('Hourly Rate & Currency'),
            halign: Gtk.Align.START,
            css_classes: ['heading']
        });

        const rateControlsBox = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 6
        });

        // Rate box with +/- buttons (similar to clientManager)
        const rateBox = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 0,
            css_classes: ['hour-price-input'],
            width_request: 120
        });

        const rateMinusBtn = new Gtk.Button({
            label: '−',
            css_classes: ['flat'],
            width_request: 30
        });

        this.rateEntry = new Gtk.Entry({
            text: isEdit ? (client.rate || 0).toString() : '0',
            width_request: 60,
            input_purpose: Gtk.InputPurpose.NUMBER
        });

        const ratePlusBtn = new Gtk.Button({
            label: '+',
            css_classes: ['flat'],
            width_request: 30
        });

        // Rate adjustment handlers
        rateMinusBtn.connect('clicked', () => {
            const currentValue = parseFloat(this.rateEntry.get_text()) || 0;
            const newValue = Math.max(0, currentValue - 1);
            this.rateEntry.set_text(newValue.toString());
        });

        ratePlusBtn.connect('clicked', () => {
            const currentValue = parseFloat(this.rateEntry.get_text()) || 0;
            const newValue = currentValue + 1;
            this.rateEntry.set_text(newValue.toString());
        });

        rateBox.append(rateMinusBtn);
        rateBox.append(this.rateEntry);
        rateBox.append(ratePlusBtn);

        // Currency dropdown with available currencies
        const currencyStrings = this.availableCurrencies.map(currency => 
            `${currency.code} (${currency.symbol})`
        );
        
        this.currencyDropdown = new Gtk.DropDown({
            model: new Gtk.StringList({
                strings: currencyStrings
            }),
            selected: this._getCurrencyIndex(isEdit ? (client.currency || 'USD') : 'USD')
        });

        rateControlsBox.append(rateBox);
        rateControlsBox.append(this.currencyDropdown);

        const rateRow = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 6
        });
        rateRow.append(rateLabel);
        rateRow.append(rateControlsBox);

        // Add both rows to main container
        mainBox.append(nameRow);
        mainBox.append(rateRow);

        return mainBox;
    }

    _getAvailableCurrencies() {
        // Load currency settings from preferences
        let currencySettings;
        try {
            const configDir = GLib.get_user_config_dir() + '/valot';
            const configPath = configDir + '/currency-settings.json';
            const file = Gio.File.new_for_path(configPath);
            
            if (file.query_exists(null)) {
                const [success, contents] = file.load_contents(null);
                if (success) {
                    const configText = new TextDecoder().decode(contents);
                    currencySettings = JSON.parse(configText);
                }
            }
        } catch (error) {
            // Continue with defaults
        }
        
        // Default to all currencies if no settings found
        if (!currencySettings) {
            const allCurrencies = getAllCurrencies();
            currencySettings = {
                visible: allCurrencies.map(c => c.code),
                hidden: [],
                custom: []
            };
        }
        
        const allCurrencies = getAllCurrencies();
        const availableCurrencies = [];
        
        // Add visible default currencies
        currencySettings.visible.forEach(code => {
            const currency = allCurrencies.find(c => c.code === code);
            if (currency) {
                availableCurrencies.push(currency);
            }
        });
        
        // Add visible custom currencies
        currencySettings.custom.forEach(currency => {
            if (!currency.hidden) {
                availableCurrencies.push(currency);
            }
        });
        
        return availableCurrencies;
    }

    _getCurrencyIndex(currency) {
        const currencies = this.availableCurrencies.map(c => c.code);
        const index = currencies.indexOf(currency);
        return index >= 0 ? index : 0;
    }

    _getCurrencyFromIndex(index) {
        const currencies = this.availableCurrencies.map(c => c.code);
        return currencies[index] || 'USD';
    }

    _handleClientSave(formData, dialog) {
        // Get data from custom inputs
        const customData = {
            name: this.nameEntry ? this.nameEntry.get_text() : '',
            rate: this.rateEntry ? parseFloat(this.rateEntry.get_text()) || 0 : 0,
            currency: this.currencyDropdown ? this._getCurrencyFromIndex(this.currencyDropdown.get_selected()) : 'USD'
        };
        
        // Additional validation
        if (!this._validateClientData(customData)) {
            return false; // Keep dialog open
        }

        // Prepare client data
        const clientData = {
            name: customData.name.trim(),
            email: '', // Not included in simplified dialog
            phone: '', // Not included in simplified dialog
            company: '', // Not included in simplified dialog
            address: '', // Not included in simplified dialog
            rate: customData.rate,
            currency: customData.currency,
            active: true // Default to true for simplified dialog
        };

        // Add ID for edit mode
        if (this.mode === 'edit' && this.client) {
            clientData.id = this.client.id;
        }

        // Call the save handler
        if (this.onClientSave) {
            try {
                const result = this.onClientSave(clientData, this.mode, this);
                
                // If save handler returns false, keep dialog open
                if (result === false) {
                    return false;
                }
                
                // Emit success event
                this._emit('clientSaved', { data: clientData, mode: this.mode });
                return true; // Close dialog
                
            } catch (error) {
                // Error saving client
                this.showFieldError('name', 'Failed to save client. Please try again.');
                return false;
            }
        }

        return true; // Close dialog if no handler
    }

    _validateClientData(formData) {
        // Client name validation
        const nameValidation = InputValidator.validateClientName(formData.name);
        if (!nameValidation.valid) {
            this.showFieldError('name', nameValidation.error);
            return false;
        }

        // Email validation (if provided)
        if (formData.email && formData.email.trim()) {
            const emailValidation = InputValidator.validateEmail(formData.email);
            if (!emailValidation.valid) {
                this.showFieldError('email', emailValidation.error);
                return false;
            }
        }

        // Rate validation
        const rateValidation = InputValidator.validateRate(formData.rate);
        if (!rateValidation.valid) {
            this.showFieldError('rate', rateValidation.error);
            return false;
        }

        // Phone validation (basic)
        if (formData.phone && formData.phone.trim()) {
            const phone = formData.phone.trim();
            if (phone.length > 50) {
                this.showFieldError('phone', 'Phone number too long');
                return false;
            }
        }

        return true;
    }

    /**
     * Update client data for edit mode
     */
    setClient(client) {
        this.client = client;
        this.mode = 'edit';
        
        // Update dialog title
        this.config.title = _('Edit Client');
        this.config.subtitle = _('Update client information');
        this.config.submitLabel = _('Save Changes');
        
        // Update form data
        this.setFormData({
            name: client.name || '',
            email: client.email || '',
            phone: client.phone || '',
            company: client.company || '',
            address: client.address || '',
            rate: client.rate || 0,
            currency: client.currency || 'USD',
            active: client.active !== false
        });
    }

    /**
     * Reset dialog for creating new client
     */
    resetForNew() {
        this.client = null;
        this.mode = 'create';
        
        // Update dialog title
        this.config.title = _('Create New Client');
        this.config.subtitle = _('Add a new client with contact details and billing rates');
        this.config.submitLabel = _('Create Client');
        
        // Clear form data
        this.setFormData({
            name: '',
            email: '',
            phone: '',
            company: '',
            address: '',
            rate: 0,
            currency: 'USD',
            active: true
        });
        
        this.clearErrors();
    }

    /**
     * Show client duplicate error
     */
    showDuplicateError() {
        this.showFieldError('name', 'A client with this name already exists');
    }

    /**
     * Get client data preview
     */
    getClientPreview() {
        const formData = this.getFormData();
        return {
            name: formData.name || 'Untitled Client',
            email: formData.email || '',
            phone: formData.phone || '',
            company: formData.company || '',
            address: formData.address || '',
            rate: parseFloat(formData.rate) || 0,
            currency: formData.currency || 'USD',
            active: formData.active !== false
        };
    }

    /**
     * Create a client dialog factory method
     */
    static create(config = {}) {
        return new ClientDialog(config);
    }

    /**
     * Create dialog for new client
     */
    static createNew(config = {}) {
        return new ClientDialog({
            mode: 'create',
            ...config
        });
    }

    /**
     * Create dialog for editing existing client
     */
    static createEdit(client, config = {}) {
        return new ClientDialog({
            mode: 'edit',
            client,
            ...config
        });
    }
}