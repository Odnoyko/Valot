// clientManager.js loaded

import Gtk from 'gi://Gtk';
import Adw from 'gi://Adw';
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
            console.log('Creating client:', name, email, rate, currency);
            
            // Validate inputs
            const nameValidation = InputValidator.validateClientName(name);
            if (!nameValidation.valid) {
                console.error('Client validation failed:', nameValidation.error);
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
            console.log('Client created successfully');
            
            // Reload clients
            if (parentWindow && parentWindow.clientsPageComponent) {
                console.log('Reloading clients after creation...');
                parentWindow.clientsPageComponent.loadClients();
            } else {
                console.warn('Parent window or clientsPageComponent not found for reload');
            }
            return true;
            
        } catch (error) {
            console.error('Error creating client:', error);
            this._showError(parentWindow, 'Database Error', 'Failed to create client. Please try again.');
            return false;
        }
    }

    updateClient(clientId, name, email, rate, currency, parentWindow) {
        try {
            console.log('Updating client:', name, email, rate, currency);
            
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
            console.log('Client updated successfully');
            
            // Reload clients
            if (parentWindow && parentWindow.clientsPageComponent) {
                parentWindow.clientsPageComponent.loadClients();
            }
            return true;
            
        } catch (error) {
            console.error('Error updating client:', error);
            this._showError(parentWindow, 'Database Error', 'Failed to update client. Please try again.');
            return false;
        }
    }

    deleteClient(clientId, parentWindow) {
        try {
            console.log('Deleting client with ID:', clientId);
            
            // Prevent deletion of default client
            if (clientId === 1) {
                this._showError(parentWindow, 'Cannot Delete Default Client', 'The default client cannot be deleted.');
                return false;
            }
            
            const sql = `DELETE FROM Client WHERE id = ${clientId}`;
            
            this.executeNonSelectCommand(this.dbConnection, sql);
            console.log('Client deleted successfully');
            
            // Reload clients
            if (parentWindow && parentWindow.clientsPageComponent) {
                parentWindow.clientsPageComponent.loadClients();
            }
            return true;
            
        } catch (error) {
            console.error('Error deleting client:', error);
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
                console.log('Error adding currency column:', error.message);
            }
        }
    }

    _clientNameExists(name) {
        try {
            const sql = `SELECT COUNT(*) as count FROM Client WHERE name = '${InputValidator.sanitizeForSQL(name)}'`;
            const result = this.executeQuery(this.dbConnection, sql);
            return result.length > 0 && result[0].count > 0;
        } catch (error) {
            console.error('Error checking client name:', error);
            return false;
        }
    }

    _showError(parentWindow, title, message) {
        if (!parentWindow) {
            console.error(`${title}: ${message}`);
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
            console.error('Failed to show error dialog:', error);
            console.error('Original error:', title, '-', message);
        }
    }

    // Create client dialog - inline layout like projects
    showCreateClientDialog(parentWindow, prefillName = '') {
        console.log('🔥 ClientManager: Using inline client dialog with prefill:', prefillName);
        
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
            placeholder_text: 'Client name',
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

        // Get currency data from data folder
        const allCurrencies = getAllCurrencies();
        const currencyModel = new Gtk.StringList();
        
        allCurrencies.forEach(currency => {
            currencyModel.append(`${currency.symbol} ${currency.code}`);
        });
        
        currencyDropdown.set_model(currencyModel);
        currencyDropdown.set_enable_search(true); // Enable search functionality

        // Default to EUR (find EUR in the list)
        const defaultCurrencyIndex = allCurrencies.findIndex(c => c.code === 'EUR');
        currencyDropdown.set_selected(defaultCurrencyIndex >= 0 ? defaultCurrencyIndex : 0);
        
        let selectedCurrency = allCurrencies[defaultCurrencyIndex >= 0 ? defaultCurrencyIndex : 0];

        // Handle currency selection change
        currencyDropdown.connect('notify::selected', () => {
            const selectedIndex = currencyDropdown.get_selected();
            selectedCurrency = allCurrencies[selectedIndex];
            console.log('Selected currency:', selectedCurrency.code);
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
                
                // Валидация имени клиента с визуальной обратной связью
                if (!name) {
                    console.log('❌ Client name is required');
                    nameEntry.add_css_class('error');
                    nameEntry.set_tooltip_text('Имя клиента обязательно');
                    return;
                }
                
                if (name.length < 2) {
                    console.log('❌ Client name too short');
                    nameEntry.add_css_class('error');
                    nameEntry.set_tooltip_text('Имя клиента должно содержать минимум 2 символа');
                    return;
                }
                
                if (name.length > 100) {
                    console.log('❌ Client name too long');
                    nameEntry.add_css_class('error');
                    nameEntry.set_tooltip_text('Имя клиента не должно превышать 100 символов');
                    return;
                }
                
                // Убираем класс ошибки если валидация прошла
                nameEntry.remove_css_class('error');
                nameEntry.set_tooltip_text('');
                
                // Создаем клиента
                const success = this.createClient(
                    name,
                    '', // email
                    rate,  // rate from input
                    selectedCurrency.code,
                    parentWindow
                );

                if (success) {
                    console.log('✅ Client created successfully, refreshing page');
                    
                    // Refresh clients data in main window and update dropdowns
                    if (parentWindow._loadClients) {
                        parentWindow._loadClients();
                    }
                    
                    // Обновляем страницу клиентов
                    if (parentWindow.clientsPageComponent && parentWindow.clientsPageComponent.refresh) {
                        parentWindow.clientsPageComponent.refresh();
                    } else if (parentWindow.pageComponents && parentWindow.pageComponents.clients) {
                        parentWindow.pageComponents.clients.refresh();
                    }
                    
                    // Update all client dropdowns in tracking widgets after a short delay to ensure data is loaded
                    setTimeout(() => {
                        console.log('🔄 Updating client dropdowns in tracking widgets');
                        if (parentWindow.trackingWidgets && parentWindow.allClients) {
                            console.log(`Found ${parentWindow.trackingWidgets.length} tracking widgets with ${parentWindow.allClients.length} clients`);
                            parentWindow.trackingWidgets.forEach(({ widget }) => {
                                if (widget.updateClientDisplay) {
                                    console.log('✅ Updating client dropdown in widget');
                                    widget.updateClientDisplay();
                                } else {
                                    console.log('❌ Widget does not have updateClientDisplay method');
                                }
                            });
                        } else {
                            console.log('❌ No tracking widgets or clients found');
                            console.log(`trackingWidgets: ${!!parentWindow.trackingWidgets}, allClients: ${!!parentWindow.allClients}`);
                        }
                    }, 200);
                    
                    // Очищаем поле поиска если был prefill
                    if (prefillName) {
                        setTimeout(() => {
                            if (parentWindow.clientsPageComponent && parentWindow.clientsPageComponent.clientSearch) {
                                parentWindow.clientsPageComponent.clientSearch.set_text('');
                            }
                        }, 100);
                    }
                } else {
                    console.log('❌ Failed to create client');
                    return; // Не закрываем диалог при ошибке
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
            console.error('No database connection to edit client');
            return;
        }

        try {
            // Get client data
            const query = `SELECT name, email, rate FROM Client WHERE id = ${clientId}`;
            const result = this.dbConnection.execute_select_command(query);
            const iter = result.create_iter();
            
            if (!result.iter_move_next(iter)) {
                console.error('Client not found');
                return;
            }

            const currentName = result.get_value_at(iter, 0);
            const currentEmail = result.get_value_at(iter, 1);
            const currentRate = result.get_value_at(iter, 2);

            console.log('Edit client dialog for:', currentName);
            
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
                console.log('Edit client dialog response:', response);
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
                    
                    console.log('Updating client:', nameValidation.sanitized, email, rate);
                    if (nameValidation.sanitized) {
                        this.updateClient(clientId, nameValidation.sanitized, email, rate, parentWindow);
                    }
                }
                dialog.close();
            });

            dialog.present(parentWindow);
            console.log('Edit client dialog presented');
            
        } catch (error) {
            console.error('Error showing edit client dialog:', error);
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
            console.error('No database connection to delete client');
            return;
        }

        try {
            const safeClientId = parseInt(clientId);
            const sql = `DELETE FROM Client WHERE id = ${safeClientId}`;
            
            executeNonSelectCommand(this.dbConnection, sql);
            console.log('Client deleted successfully');
            
            // Reload clients in parent window
            if (parentWindow && typeof parentWindow._loadClients === 'function') {
                parentWindow._loadClients();
            }
            
        } catch (error) {
            console.error('Error deleting client:', error);
        }
    }

    // Load all clients
    loadClients() {
        if (!this.dbConnection) {
            console.error('No database connection to load clients');
            return [];
        }

        try {
            const query = 'SELECT id, name, email, rate FROM Client ORDER BY name';
            const result = this.dbConnection.execute_select_command(query);
            const iter = result.create_iter();
            const clients = [];

            while (result.iter_move_next(iter)) {
                clients.push({
                    id: result.get_value_at(iter, 0),
                    name: result.get_value_at(iter, 1),
                    email: result.get_value_at(iter, 2),
                    rate: result.get_value_at(iter, 3)
                });
            }

            console.log('Loaded clients:', clients.length);
            return clients;
            
        } catch (error) {
            console.error('Error loading clients:', error);
            return [];
        }
    }

    // Create an inline editable client name row
    createEditableClientRow(client, parentWindow) {
        const row = new Adw.ActionRow({
            subtitle: `Rate: €${client.rate || 0}/hour • Email: ${client.email || 'No email'}`
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
            console.log(`Inline edit: Updating client "${client.name}" to "${validation.sanitized}"`);
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
        console.log('Opening modular create client dialog...');
        
        const dialog = new ClientDialog({
            mode: 'create',
            parentWindow,
            onClientSave: (clientData, mode, dialog) => {
                console.log('Modular client save:', clientData);
                
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
        console.log('Opening modular edit client dialog for:', client.name);
        
        const dialog = new ClientDialog({
            mode: 'edit',
            client,
            parentWindow,
            onClientSave: (clientData, mode, dialog) => {
                console.log('Modular client update:', clientData);
                
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
                console.error('Error loading projects for task dialog:', error);
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
                        console.error('Error getting selected project:', error);
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
                console.error('TaskManager not available');
            }
        } catch (error) {
            console.error('Error creating time entry:', error);
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
        console.log('Opening edit rate dialog for client:', client.name);
        
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

        // Get currency data
        const allCurrencies = getAllCurrencies();
        const currencyModel = new Gtk.StringList();
        
        allCurrencies.forEach(currency => {
            currencyModel.append(`${currency.symbol} ${currency.code}`);
        });
        
        currencyDropdown.set_model(currencyModel);
        currencyDropdown.set_enable_search(true);

        // Set current currency as selected
        const currentCurrencyIndex = allCurrencies.findIndex(c => c.code === (client.currency || 'USD'));
        currencyDropdown.set_selected(currentCurrencyIndex >= 0 ? currentCurrencyIndex : 0);
        
        let selectedCurrency = allCurrencies[currentCurrencyIndex >= 0 ? currentCurrencyIndex : 0];

        // Handle currency selection change
        currencyDropdown.connect('notify::selected', () => {
            const selectedIndex = currencyDropdown.get_selected();
            selectedCurrency = allCurrencies[selectedIndex];
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
                    console.log('✅ Client rate updated successfully');
                    
                    // Refresh clients page to update the display
                    if (parentWindow && parentWindow.clientsPageComponent) {
                        console.log('🔄 Refreshing clients page after rate update');
                        parentWindow.clientsPageComponent.loadClients();
                    }
                    
                    // Also update main window client data if available
                    if (parentWindow._loadClients) {
                        console.log('🔄 Refreshing main window client data');
                        parentWindow._loadClients();
                    }
                } else {
                    console.log('❌ Failed to update client rate');
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
}