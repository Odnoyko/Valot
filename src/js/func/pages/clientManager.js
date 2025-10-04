// clientManager.js loaded

import Gtk from 'gi://Gtk';
import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import { executeNonSelectCommand } from 'resource:///com/odnoyko/valot/js/func/global/dbinitialisation.js';
import { InputValidator } from 'resource:///com/odnoyko/valot/js/func/global/inputValidation.js';
import { getAllCurrencies, getCurrencySymbol } from 'resource:///com/odnoyko/valot/js/data/currencies.js';

export class ClientManager {
    constructor(dbConnection, executeQuery, executeNonSelectCommand, currencies) {
        this.dbConnection = dbConnection;
        this.executeQuery = executeQuery;
        this.executeNonSelectCommand = executeNonSelectCommand;
        this.currencies = currencies || getAllCurrencies();
        this.parentWindow = null;
        // ClientManager initialized
    }

    setParentWindow(parentWindow) {
        this.parentWindow = parentWindow;
    }

    createClient(name, email, rate, currency, parentWindow) {
        try {
            
            // Validate inputs
            const nameValidation = InputValidator.validateClientName(name);
            if (!nameValidation.valid) {
                //('Client validation failed:', nameValidation.error);
                this._showError(parentWindow, 'Validation Error', nameValidation.error);
                return false;
            }

            const safeName = InputValidator.sanitizeForSQL(nameValidation.sanitized);
            const safeEmail = email ? InputValidator.sanitizeForSQL(email) : '';
            const safeRate = rate || 0;
            const safeCurrency = currency || 'USD';
            
            // Ensure currency column exists
            this.ensureCurrencyColumn();
            
            // Check for duplicate client names
            if (this._clientNameExists(safeName)) {
                this._showError(parentWindow, 'Duplicate Client', 'A client with this name already exists');
                return false;
            }
            
            const sql = `INSERT INTO Client (name, email, rate, currency) VALUES ('${safeName}', '${safeEmail}', ${safeRate}, '${safeCurrency}')`;
            
            this.executeNonSelectCommand(this.dbConnection, sql);
            
            // Reload clients
            if (parentWindow && parentWindow.clientsPageComponent) {
                parentWindow.clientsPageComponent.loadClients();
            } else {
            }
            return true;
            
        } catch (error) {
            //('Error creating client:', error);
            this._showError(parentWindow, 'Database Error', 'Failed to create client. Please try again.');
            return false;
        }
    }

    updateClient(clientId, name, email, rate, currency, parentWindow) {
        try {
            
            const nameValidation = InputValidator.validateClientName(name);
            if (!nameValidation.valid) {
                this._showError(parentWindow, 'Validation Error', nameValidation.error);
                return false;
            }

            const safeName = InputValidator.sanitizeForSQL(nameValidation.sanitized);
            const safeEmail = email ? InputValidator.sanitizeForSQL(email) : '';
            const safeRate = rate || 0;
            const safeCurrency = currency || 'USD';
            
            this.ensureCurrencyColumn();
            
            const sql = `UPDATE Client SET name = '${safeName}', email = '${safeEmail}', rate = ${safeRate}, currency = '${safeCurrency}' WHERE id = ${clientId}`;
            
            this.executeNonSelectCommand(this.dbConnection, sql);
            
            // Reload clients
            if (parentWindow && parentWindow.clientsPageComponent) {
                parentWindow.clientsPageComponent.loadClients();
            }
            return true;
            
        } catch (error) {
            //('Error updating client:', error);
            this._showError(parentWindow, 'Database Error', 'Failed to update client. Please try again.');
            return false;
        }
    }

    deleteClient(clientId, parentWindow) {
        try {
            
            // Prevent deletion of default client
            if (clientId === 1) {
                this._showError(parentWindow, 'Cannot Delete Default Client', 'The default client cannot be deleted.');
                return false;
            }
            
            const sql = `DELETE FROM Client WHERE id = ${clientId}`;
            
            this.executeNonSelectCommand(this.dbConnection, sql);
            
            // Reload clients
            if (parentWindow && parentWindow.clientsPageComponent) {
                parentWindow.clientsPageComponent.loadClients();
            }
            return true;
            
        } catch (error) {
            //('Error deleting client:', error);
            this._showError(parentWindow, 'Database Error', 'Failed to delete client. Please try again.');
            return false;
        }
    }

    ensureCurrencyColumn() {
        try {
            const alterSql = `ALTER TABLE Client ADD COLUMN currency TEXT DEFAULT 'USD'`;
            this.executeNonSelectCommand(this.dbConnection, alterSql);
            // Added currency column to Client table
        } catch (error) {
            if (error.message && error.message.includes('duplicate column name')) {
                // currency column already exists
            } else {
            }
        }
    }

    _clientNameExists(name) {
        try {
            const sql = `SELECT COUNT(*) as count FROM Client WHERE name = '${InputValidator.sanitizeForSQL(name)}'`;
            const result = this.executeQuery(this.dbConnection, sql);
            return result.length > 0 && result[0].count > 0;
        } catch (error) {
            //('Error checking client name:', error);
            return false;
        }
    }

    _showError(parentWindow, title, message) {
        if (!parentWindow) {
            //(`${title}: ${message}`);
            return;
        }

        try {
            const errorDialog = new Adw.AlertDialog({
                heading: title,
                body: message
            });
            
            errorDialog.add_response('ok', 'OK');
            errorDialog.set_response_appearance('ok', Adw.ResponseAppearance.SUGGESTED);
            errorDialog.present(parentWindow);
        } catch (error) {
            //('Failed to show error dialog:', error);
            //('Original error:', title, '-', message);
        }
    }

    // Create client dialog - inline layout like projects
    showCreateClientDialog(parentWindow, prefillName = '') {
        
        const dialog = new Adw.AlertDialog({
            heading: 'Create Client',
            body: 'Add a new client with name and currency'
        });

        // Create inline form layout (2 rows vertical)
        const form = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 12,
            width_request: 400,
            margin_top: 12,
            margin_bottom: 12,
            margin_start: 12,
            margin_end: 12
        });

        // ROW 1: Client name input only
        const nameEntry = new Gtk.Entry({
            placeholder_text: _('Client name'),
            text: prefillName,
            hexpand: true
        });
        
        // Simple validation - just clear errors when typing
        nameEntry.connect('changed', () => {
            // Always clear error state when user is typing
            nameEntry.remove_css_class('error');
            nameEntry.set_tooltip_text('');
        });

        // ROW 2: Rate input with +/- buttons + Currency
        const rateRow = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 12
        });

        // Rate input with +/- buttons
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

        const rateEntry = new Gtk.Entry({
            text: '0',
            width_request: 60,
            halign: Gtk.Align.CENTER,
            css_classes: ['monospace']
        });

        const ratePlusBtn = new Gtk.Button({
            label: '+',
            css_classes: ['flat'],
            width_request: 30
        });

        // Rate adjustment logic
        const adjustRate = (delta) => {
            let currentRate = parseFloat(rateEntry.get_text()) || 0;
            currentRate = Math.max(0, currentRate + delta);
            rateEntry.set_text(currentRate.toFixed(0));
        };

        rateMinusBtn.connect('clicked', () => adjustRate(-1));
        ratePlusBtn.connect('clicked', () => adjustRate(1));

        rateBox.append(rateMinusBtn);
        rateBox.append(rateEntry);
        rateBox.append(ratePlusBtn);

        // Currency dropdown with search (right side, fixed width)
        const currencyDropdown = new Gtk.DropDown({
            width_request: 120,
            tooltip_text: 'Select currency',
            css_classes: ['currency-button']
        });

        // Get available currencies based on settings
        const availableCurrencies = this._getAvailableCurrencies();
        const currencyModel = new Gtk.StringList();
        
        availableCurrencies.forEach(currency => {
            currencyModel.append(`${currency.symbol} ${currency.code}`);
        });
        
        currencyDropdown.set_model(currencyModel);
        currencyDropdown.set_enable_search(true); // Enable search functionality

        // Default to EUR (find EUR in the list)
        const defaultCurrencyIndex = availableCurrencies.findIndex(c => c.code === 'EUR');
        currencyDropdown.set_selected(defaultCurrencyIndex >= 0 ? defaultCurrencyIndex : 0);
        
        let selectedCurrency = availableCurrencies[defaultCurrencyIndex >= 0 ? defaultCurrencyIndex : 0];

        // Handle currency selection change
        currencyDropdown.connect('notify::selected', () => {
            const selectedIndex = currencyDropdown.get_selected();
            selectedCurrency = availableCurrencies[selectedIndex];
        });

        // Assemble the rate row
        rateRow.append(rateBox);
        rateRow.append(currencyDropdown);

        // Add both rows to form
        form.append(nameEntry);
        form.append(rateRow);

        dialog.set_extra_child(form);
        dialog.add_response('cancel', 'Cancel');
        dialog.add_response('create', 'Create Client');
        dialog.set_response_appearance('create', Adw.ResponseAppearance.SUGGESTED);
        dialog.set_default_response('create');

        // Focus name entry and select text (same as projects)
        nameEntry.grab_focus();
        if (prefillName) {
            nameEntry.select_region(0, -1);
        }

        dialog.connect('response', (dialog, response) => {
            if (response === 'create') {
                const name = nameEntry.get_text().trim();
                const rate = parseFloat(rateEntry.get_text()) || 0;
                
                // Client name validation with visual feedback
                if (!name) {
                    nameEntry.add_css_class('error');
                    nameEntry.set_tooltip_text('Client name is required');
                    return;
                }
                
                if (name.length < 2) {
                    nameEntry.add_css_class('error');
                    nameEntry.set_tooltip_text('Client name must contain at least 2 characters');
                    return;
                }
                
                if (name.length > 100) {
                    nameEntry.add_css_class('error');
                    nameEntry.set_tooltip_text('Client name must not exceed 100 characters');
                    return;
                }
                
                // Remove error class if validation passed
                nameEntry.remove_css_class('error');
                nameEntry.set_tooltip_text('');
                
                // Create client
                const success = this.createClient(
                    name,
                    '', // email
                    rate,  // rate from input
                    selectedCurrency.code,
                    parentWindow
                );

                if (success) {
                    
                    // Refresh clients data in main window and update dropdowns
                    if (parentWindow._loadClients) {
                        parentWindow._loadClients();
                    }
                    
                    // Update clients page
                    if (parentWindow.clientsPageComponent && parentWindow.clientsPageComponent.refresh) {
                        parentWindow.clientsPageComponent.refresh();
                    } else if (parentWindow.pageComponents && parentWindow.pageComponents.clients) {
                        parentWindow.pageComponents.clients.refresh();
                    }
                    
                    // Update all client dropdowns in tracking widgets after a short delay to ensure data is loaded
                    setTimeout(() => {
                        if (parentWindow.trackingWidgets && parentWindow.allClients) {
                            parentWindow.trackingWidgets.forEach(({ widget }) => {
                                if (widget.updateClientDisplay) {
                                    widget.updateClientDisplay();
                                } else {
                                }
                            });
                        } else {
                        }
                    }, 200);
                    
                    // Clear search field if there was prefill
                    if (prefillName) {
                        setTimeout(() => {
                            if (parentWindow.clientsPageComponent && parentWindow.clientsPageComponent.clientSearch) {
                                parentWindow.clientsPageComponent.clientSearch.set_text('');
                            }
                        }, 100);
                    }
                } else {
                    return; // Don't close dialog on error
                }
            }
            dialog.close();
        });

        dialog.present(parentWindow);
    }


    // Legacy create client method - removed (use the 5-parameter version above)

    // Edit client dialog
    showEditClientDialog(clientId, parentWindow) {
        if (!this.dbConnection) {
            //('No database connection to edit client');
            return;
        }

        try {
            // Get client data
            const query = `SELECT name, email, rate, currency FROM Client WHERE id = ${clientId}`;
            const result = this.dbConnection.execute_select_command(query);
            
            if (result.get_n_rows() === 0) {
                //('Client not found');
                return;
            }

            const currentName = result.get_value_at(0, 0);
            const currentEmail = result.get_value_at(1, 0);
            const currentRate = result.get_value_at(2, 0);
            const currentCurrency = result.get_value_at(3, 0) || 'USD';

            
            const dialog = new Adw.AlertDialog({
                heading: 'Edit Client',
                body: 'Modify client details'
            });

            const form = new Gtk.Box({
                orientation: Gtk.Orientation.VERTICAL,
                spacing: 12,
                margin_top: 12,
                margin_bottom: 12,
                margin_start: 12,
                margin_end: 12
            });

            // Name entry
            const nameRow = new Adw.EntryRow({
                title: 'Client Name'
            });
            const nameEntry = nameRow.get_delegate();
            nameEntry.set_text(currentName || '');
            form.append(nameRow);

            // Email entry
            const emailRow = new Adw.EntryRow({
                title: 'Email'
            });
            const emailEntry = emailRow.get_delegate();
            emailEntry.set_text(currentEmail || '');
            form.append(emailRow);

            // Rate entry
            const rateRow = new Adw.EntryRow({
                title: 'Hourly Rate'
            });
            const rateEntry = rateRow.get_delegate();
            rateEntry.set_text(currentRate ? currentRate.toString() : '0');
            form.append(rateRow);

            // Real-time validation for name entry
            nameEntry.connect('changed', () => {
                const text = nameEntry.get_text().trim();
                if (text.length > 0) {
                    const validation = InputValidator.validateClientName(text);
                    if (!validation.valid) {
                        InputValidator.showValidationTooltip(nameEntry, validation.error, true);
                    } else {
                        InputValidator.showValidationTooltip(nameEntry, null, false);
                    }
                } else {
                    InputValidator.showValidationTooltip(nameEntry, null, false);
                }
            });

            dialog.set_extra_child(form);
            dialog.add_response('cancel', 'Cancel');
            dialog.add_response('save', 'Save Changes');
            dialog.set_response_appearance('save', Adw.ResponseAppearance.SUGGESTED);

            dialog.connect('response', (dialog, response) => {
                if (response === 'save') {
                    const name = nameEntry.get_text().trim();
                    const email = emailEntry.get_text().trim();
                    const rate = parseFloat(rateEntry.get_text().trim()) || 0;
                    
                    // Validate client name
                    const nameValidation = InputValidator.validateClientName(name);
                    if (!nameValidation.valid) {
                        InputValidator.showValidationTooltip(nameEntry, nameValidation.error, true);
                        return; // Don't close dialog
                    }
                    
                    if (nameValidation.sanitized) {
                        this.updateClient(clientId, nameValidation.sanitized, email, rate, parentWindow);
                    }
                }
                dialog.close();
            });

            dialog.present(parentWindow);
            
        } catch (error) {
            //('Error showing edit client dialog:', error);
        }
    }


    // Delete client dialog
    showDeleteClientDialog(clientId, parentWindow) {
        const dialog = new Adw.AlertDialog({
            heading: 'Delete Client',
            body: 'Are you sure you want to delete this client? This action cannot be undone.'
        });

        dialog.add_response('cancel', 'Cancel');
        dialog.add_response('delete', 'Delete');
        dialog.set_response_appearance('delete', Adw.ResponseAppearance.DESTRUCTIVE);

        dialog.connect('response', (dialog, response) => {
            if (response === 'delete') {
                this.deleteClient(clientId, parentWindow);
            }
            dialog.close();
        });

        dialog.present(parentWindow);
    }

    // Delete client from database
    deleteClient(clientId, parentWindow) {
        if (!this.dbConnection) {
            //('No database connection to delete client');
            return;
        }

        try {
            const safeClientId = parseInt(clientId);
            const sql = `DELETE FROM Client WHERE id = ${safeClientId}`;
            
            executeNonSelectCommand(this.dbConnection, sql);
            
            // Reload clients in parent window
            if (parentWindow && typeof parentWindow._loadClients === 'function') {
                parentWindow._loadClients();
            }
            
        } catch (error) {
            //('Error deleting client:', error);
        }
    }

    // Load all clients
    loadClients() {
        if (!this.dbConnection) {
            //('No database connection to load clients');
            return [];
        }

        try {
            const query = 'SELECT id, name, email, rate, currency FROM Client ORDER BY name';
            const result = this.dbConnection.execute_select_command(query);
            const clients = [];

            for (let i = 0; i < result.get_n_rows(); i++) {
                clients.push({
                    id: result.get_value_at(0, i),
                    name: result.get_value_at(1, i),
                    email: result.get_value_at(2, i),
                    rate: result.get_value_at(3, i),
                    currency: result.get_value_at(4, i) || 'USD'
                });
            }

            return clients;
            
        } catch (error) {
            //('Error loading clients:', error);
            return [];
        }
    }

    // Create an inline editable client name row
    createEditableClientRow(client, parentWindow) {
        const row = new Adw.ActionRow({
            subtitle: `Rate: €${client.rate || 0}/hour • Email: ${client.email || 'No email'}`,
            css_classes: ['bright-subtitle']
        });

        // Create title container with inline editable entry
        const titleBox = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 6,
            hexpand: true
        });

        // Create editable entry instead of fixed title
        const nameEntry = new Gtk.Entry({
            text: client.name,
            css_classes: ['inline-editable'],
            hexpand: true,
            valign: Gtk.Align.CENTER
        });

        // Add real-time validation
        nameEntry.connect('changed', () => {
            const text = nameEntry.get_text().trim();
            if (text.length > 0 && text !== client.name) {
                const validation = InputValidator.validateClientName(text);
                if (!validation.valid) {
                    InputValidator.showValidationTooltip(nameEntry, validation.error, true);
                } else {
                    InputValidator.showValidationTooltip(nameEntry, null, false);
                }
            } else {
                InputValidator.showValidationTooltip(nameEntry, null, false);
            }
        });

        // Handle Enter key or focus loss to save changes
        const saveEdit = () => {
            const newName = nameEntry.get_text().trim();
            
            // If name unchanged, just clear validation
            if (newName === client.name) {
                InputValidator.showValidationTooltip(nameEntry, null, false);
                return;
            }

            // Validate before saving
            const validation = InputValidator.validateClientName(newName);
            if (!validation.valid) {
                InputValidator.showValidationTooltip(nameEntry, validation.error, true);
                // Revert to original name
                nameEntry.set_text(client.name);
                return;
            }

            // Save the change
            this.updateClient(client.id, validation.sanitized, client.email, client.rate, parentWindow);
            InputValidator.showValidationTooltip(nameEntry, null, false);
        };

        nameEntry.connect('activate', saveEdit);
        
        // Use GTK4 focus-leave signal (not focus-out-event)
        const focusController = new Gtk.EventControllerFocus();
        focusController.connect('leave', saveEdit);
        nameEntry.add_controller(focusController);

        // Handle Escape key to cancel edit (GTK4 way)
        const keyController = new Gtk.EventControllerKey();
        keyController.connect('key-pressed', (controller, keyval, keycode, state) => {
            if (keyval === 65307) { // Escape key
                nameEntry.set_text(client.name); // Revert
                InputValidator.showValidationTooltip(nameEntry, null, false);
                nameEntry.get_root().grab_focus(); // Remove focus
                return true;
            }
            return false;
        });
        nameEntry.add_controller(keyController);

        // Add entry to title box and set as prefix
        titleBox.append(nameEntry);
        row.add_prefix(titleBox);

        return { row, nameEntry };
    }

    // =====================================
    // MODULAR DIALOG SYSTEM METHODS
    // =====================================

    /**
     * Show create client dialog using modular system
     */
    showCreateClientDialogModular(parentWindow = null) {
        
        const dialog = new ClientDialog({
            mode: 'create',
            parentWindow,
            onClientSave: (clientData, mode, dialog) => {
                
                const success = this.createClient(clientData, parentWindow);
                
                if (!success) {
                    dialog.showFieldError('name', 'Failed to create client. Please try again.');
                    return false; // Keep dialog open
                }
                
                return true; // Close dialog
            }
        });
        
        dialog.present(parentWindow);
        return dialog;
    }

    /**
     * Show edit client dialog using modular system
     */
    showEditClientDialogModular(client, parentWindow = null) {
        
        const dialog = new ClientDialog({
            mode: 'edit',
            client,
            parentWindow,
            onClientSave: (clientData, mode, dialog) => {
                
                const success = this.updateClient(clientData, parentWindow);
                
                if (!success) {
                    dialog.showFieldError('name', 'Failed to update client. Please try again.');
                    return false; // Keep dialog open
                }
                
                return true; // Close dialog
            }
        });
        
        dialog.present(parentWindow);
        return dialog;
    }

    /**
     * Factory method to create a client dialog with callback
     */
    createClientDialog(config = {}) {
        const {
            mode = 'create',
            client = null,
            onSave = null,
            parentWindow = null,
            ...dialogConfig
        } = config;

        const dialog = new ClientDialog({
            mode,
            client,
            parentWindow,
            onClientSave: (clientData, mode, dialog) => {
                // Use custom callback if provided, otherwise use default logic
                if (onSave) {
                    return onSave(clientData, mode, dialog);
                }

                // Default behavior
                let success;
                if (mode === 'create') {
                    success = this.createClient(clientData, parentWindow);
                } else if (mode === 'edit') {
                    success = this.updateClient(clientData, parentWindow);
                }

                if (!success) {
                    const action = mode === 'create' ? 'create' : 'update';
                    dialog.showFieldError('name', `Failed to ${action} client. Please try again.`);
                    return false;
                }

                return true;
            },
            ...dialogConfig
        });

        return dialog;
    }

    /**
     * Show task creation dialog for client - styled like client creation dialog but without name input
     */
    showCreateTaskDialog(client, parentWindow) {
        const dialog = new Adw.AlertDialog({
            heading: `Track Time - ${client.name}`,
            body: `Create a new time entry for ${client.name}`
        });

        const form = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 12,
            margin_top: 12,
            margin_bottom: 12,
            margin_start: 12,
            margin_end: 12
        });

        // Task description (using EntryRow like client creation)
        const descRow = new Adw.EntryRow({
            title: 'Task Description'
        });
        const descEntry = descRow.get_delegate();
        descEntry.set_placeholder_text('Describe what you worked on...');
        form.append(descRow);

        // Project selection using ComboRow
        let projectRow = null;
        if (parentWindow.projectManager) {
            projectRow = new Adw.ComboRow({
                title: 'Project'
            });
            
            const projectModel = new Gtk.StringList();
            try {
                const projects = parentWindow.projectManager.getAllProjects();
                projects.forEach(project => {
                    projectModel.append(project.name);
                });
                
                projectRow.set_model(projectModel);
                
                // Set current project as default
                if (parentWindow.currentProjectId) {
                    const currentProject = projects.find(p => p.id === parentWindow.currentProjectId);
                    if (currentProject) {
                        const index = projects.indexOf(currentProject);
                        projectRow.set_selected(index);
                    }
                }
            } catch (error) {
                //('Error loading projects for task dialog:', error);
            }

            form.append(projectRow);
        }

        // Time input using SpinRows
        const hoursRow = new Adw.SpinRow({
            title: 'Hours',
            adjustment: new Gtk.Adjustment({
                lower: 0,
                upper: 24,
                step_increment: 1,
                page_increment: 1
            })
        });

        const minutesRow = new Adw.SpinRow({
            title: 'Minutes', 
            adjustment: new Gtk.Adjustment({
                lower: 0,
                upper: 59,
                step_increment: 1,
                page_increment: 15
            })
        });

        form.append(hoursRow);
        form.append(minutesRow);

        // Cost calculation display using ActionRow
        const currencySymbol = getCurrencySymbol(client.currency || 'USD');
        const costRow = new Adw.ActionRow({
            title: 'Estimated Cost',
            subtitle: `${currencySymbol}0.00`
        });

        // Update cost when time changes
        const updateCost = () => {
            const hours = hoursRow.get_value();
            const minutes = minutesRow.get_value();
            const totalHours = hours + (minutes / 60);
            const cost = totalHours * (client.rate || 0);
            costRow.set_subtitle(`${currencySymbol}${cost.toFixed(2)}`);
        };

        hoursRow.connect('notify::value', updateCost);
        minutesRow.connect('notify::value', updateCost);

        form.append(costRow);

        dialog.set_extra_child(form);
        dialog.add_response('cancel', 'Cancel');
        dialog.add_response('create', 'Create Entry');
        dialog.set_response_appearance('create', Adw.ResponseAppearance.SUGGESTED);

        dialog.connect('response', (dialog, response) => {
            if (response === 'create') {
                const description = descEntry.get_text().trim();
                const hours = hoursRow.get_value();
                const minutes = minutesRow.get_value();
                const totalSeconds = (hours * 3600) + (minutes * 60);
                
                if (totalSeconds === 0) {
                    const errorDialog = new Adw.AlertDialog({
                        heading: 'Invalid Input',
                        body: 'Please enter a time duration'
                    });
                    errorDialog.add_response('ok', 'OK');
                    errorDialog.present(parentWindow);
                    return;
                }

                // Get selected project ID
                let selectedProjectId = parentWindow.currentProjectId || 1;
                if (projectRow) {
                    try {
                        const projects = parentWindow.projectManager.getAllProjects();
                        const selectedIndex = projectRow.get_selected();
                        if (selectedIndex < projects.length) {
                            selectedProjectId = projects[selectedIndex].id;
                        }
                    } catch (error) {
                        //('Error getting selected project:', error);
                    }
                }

                // Create the time entry
                this._createTimeEntry(client, description, selectedProjectId, totalSeconds, parentWindow);
            }
            dialog.close();
        });

        dialog.present(parentWindow);
    }

    /**
     * Create a time entry for the client
     */
    _createTimeEntry(client, description, projectId, durationSeconds, parentWindow) {
        try {
            // Use the task creation system to create a time entry
            if (parentWindow.taskManager) {
                const taskName = description || `Work for ${client.name}`;
                const endTime = new Date();
                const startTime = new Date(endTime.getTime() - (durationSeconds * 1000));
                
                // Create task with the specified time duration
                parentWindow.taskManager.createTask(
                    taskName,
                    projectId,
                    client.id,
                    startTime.toISOString(),
                    endTime.toISOString(),
                    durationSeconds
                );

                // Show success message
                const successDialog = new Adw.AlertDialog({
                    heading: 'Time Entry Created',
                    body: `Successfully created ${Math.floor(durationSeconds / 3600)}h ${Math.floor((durationSeconds % 3600) / 60)}m time entry for ${client.name}`
                });
                successDialog.add_response('ok', 'OK');
                successDialog.present(parentWindow);

                // Refresh tasks page if available
                if (parentWindow.pageComponents?.tasks) {
                    parentWindow.pageComponents.tasks.loadTasks();
                }
            } else {
                //('TaskManager not available');
            }
        } catch (error) {
            //('Error creating time entry:', error);
            const errorDialog = new Adw.AlertDialog({
                heading: 'Error',
                body: 'Failed to create time entry. Please try again.'
            });
            errorDialog.add_response('ok', 'OK');
            errorDialog.present(parentWindow);
        }
    }

    /**
     * Show edit rate dialog for client - styled like client creation but only rate and currency
     */
    showEditRateDialog(client, parentWindow) {
        
        const dialog = new Adw.AlertDialog({
            heading: `Edit Rate - ${client.name}`,
            body: 'Change hourly rate and currency for this client'
        });

        // Create inline form layout (horizontal) - same as client creation
        const form = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 12,
            width_request: 400,
            margin_top: 12,
            margin_bottom: 12,
            margin_start: 12,
            margin_end: 12
        });

        // Rate input with +/- buttons (left side)
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

        const rateEntry = new Gtk.Entry({
            text: (client.rate || 0).toString(),
            width_request: 60,
            halign: Gtk.Align.CENTER,
            css_classes: ['monospace']
        });

        const ratePlusBtn = new Gtk.Button({
            label: '+',
            css_classes: ['flat'],
            width_request: 30
        });

        // Rate adjustment logic
        const adjustRate = (delta) => {
            let currentRate = parseFloat(rateEntry.get_text()) || 0;
            currentRate = Math.max(0, currentRate + delta);
            rateEntry.set_text(currentRate.toFixed(0));
        };

        rateMinusBtn.connect('clicked', () => adjustRate(-1));
        ratePlusBtn.connect('clicked', () => adjustRate(1));

        rateBox.append(rateMinusBtn);
        rateBox.append(rateEntry);
        rateBox.append(ratePlusBtn);

        // Currency dropdown with search (right side)
        const currencyDropdown = new Gtk.DropDown({
            width_request: 120,
            tooltip_text: 'Select currency',
            css_classes: ['currency-button']
        });

        // Get available currencies (only visible ones)
        const availableCurrencies = this._getAvailableCurrencies();
        const currencyModel = new Gtk.StringList();
        
        availableCurrencies.forEach(currency => {
            currencyModel.append(`${currency.symbol} ${currency.code}`);
        });
        
        currencyDropdown.set_model(currencyModel);
        currencyDropdown.set_enable_search(true);

        // Set current currency as selected
        const currentCurrencyIndex = availableCurrencies.findIndex(c => c.code === (client.currency || 'USD'));
        currencyDropdown.set_selected(currentCurrencyIndex >= 0 ? currentCurrencyIndex : 0);
        
        let selectedCurrency = availableCurrencies[currentCurrencyIndex >= 0 ? currentCurrencyIndex : 0];

        // Handle currency selection change
        currencyDropdown.connect('notify::selected', () => {
            const selectedIndex = currencyDropdown.get_selected();
            selectedCurrency = availableCurrencies[selectedIndex];
        });

        form.append(rateBox);
        form.append(currencyDropdown);

        dialog.set_extra_child(form);
        dialog.add_response('cancel', 'Cancel');
        dialog.add_response('save', 'Save Changes');
        dialog.set_response_appearance('save', Adw.ResponseAppearance.SUGGESTED);
        dialog.set_default_response('save');

        // Focus rate entry
        rateEntry.grab_focus();
        rateEntry.select_region(0, -1);

        dialog.connect('response', (dialog, response) => {
            if (response === 'save') {
                const rate = parseFloat(rateEntry.get_text()) || 0;
                
                // Update client rate and currency
                const success = this.updateClient(
                    client.id,
                    client.name,
                    client.email || '',
                    rate,
                    selectedCurrency.code,
                    parentWindow
                );

                if (success) {
                    
                    // Refresh clients page to update the display
                    if (parentWindow && parentWindow.clientsPageComponent) {
                        parentWindow.clientsPageComponent.loadClients();
                    }
                    
                    // Also update main window client data if available
                    if (parentWindow._loadClients) {
                        parentWindow._loadClients();
                    }
                } else {
                    return; // Don't close dialog on error
                }
            }
            dialog.close();
        });

        dialog.present(parentWindow);
    }

    /**
     * Migrate method - gradually replace old dialog calls with new ones
     * This allows for progressive migration without breaking existing code
     */
    useModularDialogs(enabled = true) {
        this.modularDialogsEnabled = enabled;
        
        if (enabled) {
            // Replace old dialog methods with new ones
            this.showCreateClientDialog = this.showCreateClientDialogModular.bind(this);
            this.showEditClientDialog = this.showEditClientDialogModular.bind(this);
        } else {
        }
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
}