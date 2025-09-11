import { FormDialog } from './FormDialog.js';
import { InputValidator } from '../../../func/global/inputValidation.js';

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
            subtitle: isEdit ? 'Update client information' : 'Add a new client with contact details and billing rates',
            width: 500,
            submitLabel: isEdit ? 'Save Changes' : 'Create Client',
            fields: [
                {
                    type: 'entry',
                    name: 'name',
                    label: 'Client Name',
                    placeholder: 'Enter client name...',
                    required: true,
                    validator: InputValidator.validateClientName,
                    value: isEdit ? client.name : '',
                    maxLength: InputValidator.MAX_NAME_LENGTH
                },
                {
                    type: 'entry',
                    name: 'email',
                    label: 'Email Address',
                    placeholder: 'client@example.com',
                    validator: InputValidator.validateEmail,
                    value: isEdit ? (client.email || '') : ''
                },
                {
                    type: 'entry',
                    name: 'phone',
                    label: 'Phone Number',
                    placeholder: '+1 (555) 123-4567',
                    value: isEdit ? (client.phone || '') : ''
                },
                {
                    type: 'entry',
                    name: 'company',
                    label: 'Company',
                    placeholder: 'Company name...',
                    value: isEdit ? (client.company || '') : ''
                },
                {
                    type: 'textarea',
                    name: 'address',
                    label: 'Address',
                    placeholder: 'Client address...',
                    value: isEdit ? (client.address || '') : '',
                    height: 60
                },
                {
                    type: 'number',
                    name: 'rate',
                    label: 'Hourly Rate',
                    min: 0,
                    max: 10000,
                    step: 0.01,
                    digits: 2,
                    validator: InputValidator.validateRate,
                    value: isEdit ? (client.rate || 0) : 0
                },
                {
                    type: 'dropdown',
                    name: 'currency',
                    label: 'Currency',
                    options: [
                        { value: 'USD', label: 'USD ($)' },
                        { value: 'EUR', label: 'EUR (€)' },
                        { value: 'GBP', label: 'GBP (£)' },
                        { value: 'JPY', label: 'JPY (¥)' },
                        { value: 'CAD', label: 'CAD (C$)' },
                        { value: 'AUD', label: 'AUD (A$)' }
                    ],
                    value: isEdit ? (client.currency || 'USD') : 'USD'
                },
                {
                    type: 'toggle',
                    name: 'active',
                    label: 'Active Client',
                    value: isEdit ? (client.active !== false) : true
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
    }

    _handleClientSave(formData, dialog) {
        // Additional validation
        if (!this._validateClientData(formData)) {
            return false; // Keep dialog open
        }

        // Prepare client data
        const clientData = {
            name: formData.name.trim(),
            email: formData.email?.trim() || '',
            phone: formData.phone?.trim() || '',
            company: formData.company?.trim() || '',
            address: formData.address?.trim() || '',
            rate: parseFloat(formData.rate) || 0,
            currency: formData.currency || 'USD',
            active: formData.active !== false
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
                console.error('Error saving client:', error);
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
        this.config.title = 'Edit Client';
        this.config.subtitle = 'Update client information';
        this.config.submitLabel = 'Save Changes';
        
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
        this.config.title = 'Create New Client';
        this.config.subtitle = 'Add a new client with contact details and billing rates';
        this.config.submitLabel = 'Create Client';
        
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