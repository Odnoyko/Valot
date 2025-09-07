console.log("clientManager.js loaded");

import Gtk from 'gi://Gtk';
import Adw from 'gi://Adw';
import { executeNonSelectCommand } from 'resource:///com/odnoyko/valot/js/dbinitialisation.js';
import { InputValidator } from 'resource:///com/odnoyko/valot/js/global/inputValidation.js';

export class ClientManager {
    constructor(dbConnection) {
        this.dbConnection = dbConnection;
        console.log("ClientManager initialized");
    }

    // Create client dialog
    showCreateClientDialog(parentWindow) {
        console.log('Creating new client dialog');
        
        const dialog = new Adw.AlertDialog({
            heading: 'Create New Client',
            body: 'Enter client details'
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
        form.append(nameRow);

        // Email entry
        const emailRow = new Adw.EntryRow({
            title: 'Email (optional)'
        });
        const emailEntry = emailRow.get_delegate();
        form.append(emailRow);

        // Rate entry
        const rateRow = new Adw.SpinRow({
            title: 'Hourly Rate',
            adjustment: new Gtk.Adjustment({
                lower: 0,
                upper: 9999.99,
                step_increment: 0.01,
                page_increment: 1.0,
                value: 0
            }),
            digits: 2
        });
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
        dialog.add_response('create', 'Create Client');
        dialog.set_response_appearance('create', Adw.ResponseAppearance.SUGGESTED);

        dialog.connect('response', (dialog, response) => {
            if (response === 'create') {
                const name = nameEntry.get_text().trim();
                const email = emailEntry.get_text().trim();
                const rate = rateRow.get_value();
                
                // Validate client name
                const nameValidation = InputValidator.validateClientName(name);
                if (!nameValidation.valid) {
                    InputValidator.showValidationTooltip(nameEntry, nameValidation.error, true);
                    return; // Don't close dialog
                }
                
                if (nameValidation.sanitized) {
                    this.createClient(nameValidation.sanitized, email, rate, parentWindow);
                }
            }
            dialog.close();
        });

        dialog.present(parentWindow);
    }

    // Create client in database
    createClient(name, email, rate, parentWindow) {
        if (!this.dbConnection) {
            console.error('No database connection to create client');
            return;
        }

        try {
            const safeName = InputValidator.sanitizeForSQL(name);
            const safeEmail = InputValidator.sanitizeForSQL(email);
            const safeRate = parseFloat(rate) || 0;

            const sql = `INSERT INTO Client (name, email, rate) VALUES ('${safeName}', '${safeEmail}', ${safeRate})`;
            
            executeNonSelectCommand(this.dbConnection, sql);
            console.log('Client created successfully:', name);
            
            // Reload clients in parent window
            if (parentWindow && typeof parentWindow._loadClients === 'function') {
                parentWindow._loadClients();
            }
            
        } catch (error) {
            console.error('Error creating client:', error);
        }
    }

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

    // Update client in database
    updateClient(clientId, name, email, rate, parentWindow) {
        if (!this.dbConnection) {
            console.error('No database connection to update client');
            return;
        }

        try {
            const safeName = InputValidator.sanitizeForSQL(name);
            const safeEmail = InputValidator.sanitizeForSQL(email);
            const safeRate = parseFloat(rate) || 0;
            const safeClientId = parseInt(clientId);

            const sql = `UPDATE Client SET name = '${safeName}', email = '${safeEmail}', rate = ${safeRate} WHERE id = ${safeClientId}`;
            
            executeNonSelectCommand(this.dbConnection, sql);
            console.log('Client updated successfully');
            
            // Reload clients in parent window
            if (parentWindow && typeof parentWindow._loadClients === 'function') {
                parentWindow._loadClients();
            }
            
        } catch (error) {
            console.error('Error updating client:', error);
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
}