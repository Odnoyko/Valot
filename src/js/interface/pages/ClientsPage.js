import Gtk from 'gi://Gtk';
import Adw from 'gi://Adw';
import Gdk from 'gi://Gdk';
import { getCurrencySymbol } from 'resource:///com/odnoyko/valot/js/data/currencies.js';

/**
 * Clients management page - extracted from window.js
 * Handles all client-related functionality
 */
export class ClientsPage {
    constructor(config = {}) {
        this.config = {
            title: 'Clients',
            subtitle: 'Manage your clients',
            showTrackingWidget: true,
            showSearchButton: true,
            actions: [
                {
                    icon: 'list-add-symbolic',
                    tooltip: 'Add Client',
                    cssClasses: ['suggested-action'],
                    onClick: (page) => page.showAddClientDialog()
                }
            ],
            ...config
        };

        // Base page properties
        this.app = config.app;
        this.parentWindow = config.parentWindow;
        this.isLoading = false;
        this.currentPage = 0;
        this.itemsPerPage = 10;
        
        // Client-specific state
        this.clients = [];
        this.filteredClients = [];
        this.selectedClients = new Set();
        this.currentClientsPage = 0;
        this.clientsPerPage = 10;
        
        // Get managers from parent window
        this.clientManager = config.clientManager;
        this.modularDialogManager = config.modularDialogManager;
        
        // Connect to existing template UI instead of creating new widgets
        this._connectToExistingUI();
        this._setupEventHandlers();
        this.setupKeyboardShortcuts();
    }

    /**
     * Connect to existing UI elements from window template
     */
    _connectToExistingUI() {
        if (!this.parentWindow) {
            console.error('ClientsPage: No parent window provided');
            return;
        }
        
        // Get references to existing UI elements from the template
        this.clientSearch = this.parentWindow._client_search;
        this.addClientBtn = this.parentWindow._add_client_btn;
        this.clientList = this.parentWindow._client_list;
        
        // Debug: check what we found
        // ClientsPage init - elements found
        
    }

    /**
     * Setup event handlers for UI elements
     */
    _setupEventHandlers() {
        // Connect search functionality
        if (this.clientSearch) {
            this.clientSearch.connect('search-changed', () => {
                const query = this.clientSearch.get_text();
                this._filterClients(query);
            });
        }

        // Connect add client button
        if (this.addClientBtn) {
            // Connecting Add Client button
            this.addClientBtn.connect('clicked', () => {
                this.showAddClientDialogNEW();
            });
            // Add Client button connected
        } else {
        }

    }

    /**
     * Get the main widget for this page - returns null since we use template
     */
    getWidget() {
        return null; // We use the existing template UI
    }

    /**
     * Show add client dialog - copied from ProjectsPage pattern
     */
    showAddClientDialogNEW() {
        try {
            
            // Get text from search input directly - simple way
            const searchText = this.clientSearch ? this.clientSearch.get_text().trim() : '';
            
            if (this.clientManager) {
                this.clientManager.showCreateClientDialog(this.parentWindow, searchText);
            } else {
                console.error('❌ ClientManager not available');
            }
        } catch (error) {
            console.error('❌ Error in showAddClientDialogNEW():', error);
        }
    }

    // Legacy method for compatibility
    showAddClientDialog() {
        this.showAddClientDialogNEW();
    }

    /**
     * Show inline client creation dialog
     */
    _showInlineClientDialog(initialName = '') {
        const dialog = new Adw.AlertDialog({
            heading: 'Create Client',
            body: 'Add a new client with name and currency'
        });

        // Create inline form layout with 2 rows
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
            text: initialName,
            hexpand: true
        });

        // ROW 2: Rate input with +/- buttons + Currency
        const rateRow = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 12
        });

        // Rate box with +/- buttons
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
            input_purpose: Gtk.InputPurpose.NUMBER
        });

        const ratePlusBtn = new Gtk.Button({
            label: '+',
            css_classes: ['flat'],
            width_request: 30
        });

        // Rate adjustment handlers
        rateMinusBtn.connect('clicked', () => {
            const currentValue = parseFloat(rateEntry.get_text()) || 0;
            const newValue = Math.max(0, currentValue - 1);
            rateEntry.set_text(newValue.toString());
        });

        ratePlusBtn.connect('clicked', () => {
            const currentValue = parseFloat(rateEntry.get_text()) || 0;
            const newValue = currentValue + 1;
            rateEntry.set_text(newValue.toString());
        });

        rateBox.append(rateMinusBtn);
        rateBox.append(rateEntry);
        rateBox.append(ratePlusBtn);

        // Currency dropdown
        const currencyButton = new Gtk.Button({
            css_classes: ['flat', 'currency-button'],
            width_request: 100,
            tooltip_text: 'Select currency'
        });

        // Default currency
        let selectedCurrency = this.clientManager?.currencies?.[1] || { code: 'EUR', symbol: '€' }; // Default to EUR
        
        const updateCurrencyButton = () => {
            const currencyLabel = new Gtk.Label({
                label: `${selectedCurrency.symbol} ${selectedCurrency.code}`,
                css_classes: ['currency-display', 'monospace']
            });
            currencyButton.set_child(currencyLabel);
        };
        updateCurrencyButton();

        // Currency selection click
        currencyButton.connect('clicked', () => {
            this._showCurrencySelector(selectedCurrency, (newCurrency) => {
                selectedCurrency = newCurrency;
                updateCurrencyButton();
            });
        });

        // Assemble the rate row
        rateRow.append(rateBox);
        rateRow.append(currencyButton);

        // Add both rows to form
        form.append(nameEntry);
        form.append(rateRow);

        dialog.set_extra_child(form);
        dialog.add_response('cancel', 'Cancel');
        dialog.add_response('create', 'Create Client');
        dialog.set_response_appearance('create', Adw.ResponseAppearance.SUGGESTED);
        dialog.set_default_response('create');

        // Focus name entry and select text
        nameEntry.grab_focus();
        if (initialName) {
            nameEntry.select_region(0, -1);
        }

        dialog.connect('response', (dialog, response) => {
            if (response === 'create') {
                const clientName = nameEntry.get_text().trim();
                const clientRate = parseFloat(rateEntry.get_text()) || 0;
                if (clientName && this.clientManager) {
                    // Use clientManager to create client with name, rate and currency
                    const success = this.clientManager.createClient(
                        clientName,
                        '', // email
                        clientRate, // rate from input
                        selectedCurrency.code,
                        this.parentWindow
                    );

                    if (success) {
                        // Clear search text after creation
                        if (this.clientSearch) {
                            this.clientSearch.set_text('');
                        }
                    }
                }
            }
            dialog.close();
        });

        dialog.present(this.parentWindow);
    }

    /**
     * Show compact currency selector
     */
    _showCurrencySelector(currentCurrency, onSelect) {
        const dialog = new Adw.AlertDialog({
            heading: 'Select Currency',
            body: 'Choose a currency for this client'
        });

        const scrolled = new Gtk.ScrolledWindow({
            hscrollbar_policy: Gtk.PolicyType.NEVER,
            vscrollbar_policy: Gtk.PolicyType.AUTOMATIC,
            min_content_height: 200,
            max_content_height: 300,
            margin_top: 12,
            margin_bottom: 12,
            margin_start: 12,
            margin_end: 12
        });

        const listBox = new Gtk.ListBox({
            css_classes: ['boxed-list']
        });

        // Show common currencies
        const currencies = this.clientManager?.currencies || [
            { code: 'USD', symbol: '$', name: 'US Dollar' },
            { code: 'EUR', symbol: '€', name: 'Euro' },
            { code: 'GBP', symbol: '£', name: 'British Pound' },
            { code: 'JPY', symbol: '¥', name: 'Japanese Yen' },
            { code: 'CAD', symbol: 'C$', name: 'Canadian Dollar' },
            { code: 'AUD', symbol: 'A$', name: 'Australian Dollar' }
        ];

        let selectedCurrency = currentCurrency;

        currencies.forEach(currency => {
            const row = new Gtk.ListBoxRow();
            const box = new Gtk.Box({
                orientation: Gtk.Orientation.HORIZONTAL,
                spacing: 12,
                margin_start: 12,
                margin_end: 12,
                margin_top: 8,
                margin_bottom: 8
            });

            const symbolLabel = new Gtk.Label({
                label: currency.symbol,
                css_classes: ['title-3'],
                width_request: 30
            });

            const infoBox = new Gtk.Box({
                orientation: Gtk.Orientation.VERTICAL,
                hexpand: true
            });

            const nameLabel = new Gtk.Label({
                label: currency.name,
                halign: Gtk.Align.START,
                css_classes: ['body']
            });

            const codeLabel = new Gtk.Label({
                label: currency.code,
                halign: Gtk.Align.START,
                css_classes: ['caption', 'dim-label']
            });

            infoBox.append(nameLabel);
            infoBox.append(codeLabel);

            box.append(symbolLabel);
            box.append(infoBox);

            // Highlight current selection
            if (currency.code === currentCurrency.code) {
                row.add_css_class('selected');
            }

            row.set_child(box);
            listBox.append(row);
        });

        listBox.connect('row-activated', (listBox, row) => {
            const index = row.get_index();
            selectedCurrency = currencies[index];
            
            // Update selection styling
            let child = listBox.get_first_child();
            let i = 0;
            while (child) {
                if (i === index) {
                    child.add_css_class('selected');
                } else {
                    child.remove_css_class('selected');
                }
                child = child.get_next_sibling();
                i++;
            }
        });

        scrolled.set_child(listBox);
        dialog.set_extra_child(scrolled);
        dialog.add_response('cancel', 'Cancel');
        dialog.add_response('select', 'Select');
        dialog.set_response_appearance('select', Adw.ResponseAppearance.SUGGESTED);

        dialog.connect('response', (dialog, response) => {
            if (response === 'select' && onSelect) {
                onSelect(selectedCurrency);
            }
            dialog.close();
        });

        dialog.present(this.parentWindow);
    }

    /**
     * Load clients from database
     */
    async loadClients() {
        this.showLoading('Loading clients...');
        
        try {
            this.clients = await this._fetchClients();
            this.filteredClients = [...this.clients];
            this._updateClientsDisplay();
            // Clients loaded successfully
        } catch (error) {
            console.error('Error loading clients:', error);
            this.showError('Load Error', 'Failed to load clients');
        } finally {
            this.hideLoading();
        }
    }

    /**
     * Filter clients based on search query
     */
    _filterClients(query = '') {
        if (!query.trim()) {
            this.filteredClients = [...this.clients];
        } else {
            const lowerQuery = query.toLowerCase();
            this.filteredClients = this.clients.filter(client => 
                client.name.toLowerCase().includes(lowerQuery) ||
                (client.email && client.email.toLowerCase().includes(lowerQuery))
            );
        }

        this.currentClientsPage = 0;
        this._updateClientsDisplay();
    }

    /**
     * Update clients display
     */
    _updateClientsDisplay() {
        // Clear existing clients from template UI
        if (this.clientList) {
            let child = this.clientList.get_first_child();
            while (child) {
                const next = child.get_next_sibling();
                this.clientList.remove(child);
                child = next;
            }
        }

        if (!this.filteredClients || this.filteredClients.length === 0) {
            return;
        }

        // Displaying filtered clients

        // Add clients using your specific requirements
        this.filteredClients.forEach(client => {
            if (this.clientList) {
                // Create ListBoxRow with custom content
                const row = new Gtk.ListBoxRow({
                    activatable: false,
                    selectable: false
                });
                
                // Create main horizontal box
                const mainBox = new Gtk.Box({
                    orientation: Gtk.Orientation.HORIZONTAL,
                    spacing: 12,
                    margin_start: 16,
                    margin_end: 16,
                    margin_top: 12,
                    margin_bottom: 12,
                    hexpand: true
                });
                
                // Left: Client name (double-click to edit)
                const nameLabel = new Gtk.Label({
                    label: client.name,
                    hexpand: true,
                    valign: Gtk.Align.CENTER,
                    halign: Gtk.Align.START,
                    css_classes: ['client-name-label'],
                    ellipsize: 3, // End ellipsize
                    selectable: false // Prevent text selection
                });
                
                // Add double-click to edit functionality
                const doubleClick = new Gtk.GestureClick({
                    button: 1 // Left mouse button
                });
                doubleClick.connect('pressed', (gesture, n_press, x, y) => {
                    if (n_press === 2) { // Double click
                        this._editClientName(client, nameLabel);
                        gesture.set_state(Gtk.EventSequenceState.CLAIMED);
                    }
                });
                nameLabel.add_controller(doubleClick);
                
                // Middle: Hourly rate (double-click to edit)
                const rateLabel = new Gtk.Label({
                    label: `${client.rate || 0}/hr`,
                    css_classes: ['rate-display', 'monospace'],
                    halign: Gtk.Align.END,
                    valign: Gtk.Align.CENTER,
                    width_request: 80
                });
                
                // Add double-click to edit rate functionality
                const rateDoubleClick = new Gtk.GestureClick({
                    button: 1 // Left mouse button
                });
                rateDoubleClick.connect('pressed', (gesture, n_press, x, y) => {
                    if (n_press === 2) { // Double click
                        this._editClientRate(client, rateLabel);
                        gesture.set_state(Gtk.EventSequenceState.CLAIMED);
                    }
                });
                rateLabel.add_controller(rateDoubleClick);
                
                // Combined price/currency button
                const currencySymbol = getCurrencySymbol(client.currency || 'USD');
                const priceValueButton = new Gtk.Button({
                    css_classes: ['flat', 'price-value-button'],
                    halign: Gtk.Align.END,
                    valign: Gtk.Align.CENTER,
                    width_request: 120,
                    tooltip_text: 'Click to change rate and currency'
                });
                
                const priceValueLabel = new Gtk.Label({
                    label: `${currencySymbol}${(client.rate || 0).toFixed(2)}`,
                    css_classes: ['price-value-display', 'monospace'],
                    halign: Gtk.Align.CENTER,
                    valign: Gtk.Align.CENTER
                });
                
                priceValueButton.set_child(priceValueLabel);
                
                // Connect to edit client rate and currency
                priceValueButton.connect('clicked', () => {
                    this._showPriceValueDialog(client);
                });
                
                // Add right-click selection handlers
                this._addClientSelectionHandlers(row, client);
                
                // Assemble the row
                mainBox.append(nameLabel);
                mainBox.append(priceValueButton);
                
                row.set_child(mainBox);
                
                // Apply selection styling if selected
                if (this.selectedClients.has(client.id)) {
                    row.add_css_class('selected-client');
                }
                
                this.clientList.append(row);
            }
        });

    }

    /**
     * Handle client name changes with validation
     */
    _handleClientNameChange(clientId, newName, nameLabel) {
        if (!this.clientManager) {
            console.error('No client manager available');
            return;
        }

        // Find the client
        const client = this.clients.find(c => c.id === clientId);
        if (!client) {
            console.error('Client not found:', clientId);
            return;
        }

        // Validate new name
        if (newName.length < 1 || newName.length > 100) {
            nameLabel.set_text(client.name);
            return;
        }

        // Update client via manager
        const success = this.clientManager.updateClient(
            clientId,
            newName,
            client.email,
            client.rate,
            client.currency,
            this.parentWindow
        );

        if (!success) {
            nameLabel.set_text(client.name);
        }
    }

    /**
     * Edit client name with a simple dialog
     */
    _editClientName(client, nameLabel) {
        const dialog = new Adw.AlertDialog({
            heading: 'Edit Client Name',
            body: 'Enter a new name for this client'
        });

        const entry = new Gtk.Entry({
            text: client.name,
            margin_top: 12,
            margin_bottom: 12,
            margin_start: 12,
            margin_end: 12
        });

        // Select all text for easy editing
        entry.grab_focus();
        entry.select_region(0, -1);

        dialog.set_extra_child(entry);
        dialog.add_response('cancel', 'Cancel');
        dialog.add_response('save', 'Save');
        dialog.set_response_appearance('save', Adw.ResponseAppearance.SUGGESTED);

        dialog.connect('response', (dialog, response) => {
            if (response === 'save') {
                const newName = entry.get_text().trim();
                if (newName && newName !== client.name) {
                    const success = this.clientManager.updateClient(
                        client.id,
                        newName,
                        client.email,
                        client.rate,
                        client.currency,
                        this.parentWindow
                    );
                    
                    if (success) {
                        // Update the label immediately
                        nameLabel.set_label(newName);
                        client.name = newName; // Update local reference
                    }
                }
            }
            dialog.close();
        });

        dialog.present(this.parentWindow);
    }

    /**
     * Show currency change dialog for a client
     */
    _showCurrencyChangeDialog(client) {
        if (!this.clientManager) {
            console.error('No client manager available');
            return;
        }

        const dialog = new Adw.AlertDialog({
            heading: 'Change Currency',
            body: `Select a new currency for ${client.name}`
        });

        const form = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 12,
            margin_top: 12,
            margin_bottom: 12,
            margin_start: 12,
            margin_end: 12
        });

        // Currency selection grid
        let selectedCurrency = this.clientManager.currencies.find(c => c.code === client.currency) || this.clientManager.currencies[0];
        form.append(new Gtk.Label({label: 'Select Currency:', halign: Gtk.Align.START}));
        
        const currencyGrid = new Gtk.Grid({
            column_spacing: 6,
            row_spacing: 6,
            margin_bottom: 12
        });
        
        // Show first 12 most common currencies in a grid
        const commonCurrencies = this.clientManager.currencies.slice(0, 12);
        for (let i = 0; i < commonCurrencies.length; i++) {
            const currency = commonCurrencies[i];
            const currencyButton = new Gtk.Button({
                width_request: 70,
                height_request: 40,
                css_classes: ['flat', 'currency-button'],
                tooltip_text: currency.name
            });
            
            const currencyLabel = new Gtk.Label({
                label: `${currency.symbol}\n${currency.code}`,
                css_classes: ['currency-button-label'],
                halign: Gtk.Align.CENTER,
                valign: Gtk.Align.CENTER
            });
            currencyButton.set_child(currencyLabel);
            
            // Highlight current currency
            if (currency.code === selectedCurrency.code) {
                currencyButton.add_css_class('suggested-action');
            }
            
            currencyButton.connect('clicked', () => {
                selectedCurrency = currency;
                
                // Update visual selection
                for (let j = 0; j < commonCurrencies.length; j++) {
                    const row = Math.floor(j / 6);
                    const col = j % 6;
                    const btn = currencyGrid.get_child_at(col, row);
                    if (btn) {
                        btn.remove_css_class('suggested-action');
                    }
                }
                currencyButton.add_css_class('suggested-action');
            });
            
            const row = Math.floor(i / 6);
            const col = i % 6;
            currencyGrid.attach(currencyButton, col, row, 1, 1);
        }
        
        form.append(currencyGrid);

        dialog.set_extra_child(form);
        dialog.add_response('cancel', 'Cancel');
        dialog.add_response('change', 'Change Currency');
        dialog.set_response_appearance('change', Adw.ResponseAppearance.SUGGESTED);

        dialog.connect('response', (dialog, response) => {
            if (response === 'change') {
                // Update client currency
                const success = this.clientManager.updateClient(
                    client.id,
                    client.name,
                    client.email,
                    client.rate,
                    selectedCurrency.code,
                    this.parentWindow
                );
                
                if (success) {
                }
            }
            dialog.close();
        });

        dialog.present(this.parentWindow);
    }

    /**
     * Add right-click selection handlers for multiple selection
     */
    _addClientSelectionHandlers(row, client) {
        // Add right-click gesture for selection
        const rightClick = new Gtk.GestureClick({
            button: 3 // Right mouse button
        });

        rightClick.connect('pressed', (gesture, n_press, x, y) => {
            this._toggleClientSelection(client.id, row);
            gesture.set_state(Gtk.EventSequenceState.CLAIMED);
        });

        row.add_controller(rightClick);

        // Also handle keyboard shortcuts
        const keyController = new Gtk.EventControllerKey();
        keyController.connect('key-pressed', (controller, keyval, keycode, state) => {
            if (keyval === 65535) { // Delete key
                if (this.selectedClients.size > 0) {
                    this._deleteSelectedClients();
                    return true;
                }
            }
            return false;
        });

        row.add_controller(keyController);
    }

    /**
     * Toggle client selection
     */
    _toggleClientSelection(clientId, row) {
        if (this.selectedClients.has(clientId)) {
            this.selectedClients.delete(clientId);
            row.remove_css_class('selected-client');
        } else {
            this.selectedClients.add(clientId);
            row.add_css_class('selected-client');
        }

        this._updateSelectionUI();
    }

    /**
     * Delete selected clients
     */
    _deleteSelectedClients() {
        if (this.selectedClients.size === 0) return;

        // Create simple confirmation dialog
        const dialog = new Adw.AlertDialog({
            heading: 'Delete Clients',
            body: `Are you sure you want to delete ${this.selectedClients.size} selected client(s)? This cannot be undone.`
        });

        dialog.add_response('cancel', 'Cancel');
        dialog.add_response('delete', 'Delete');
        dialog.set_response_appearance('delete', Adw.ResponseAppearance.DESTRUCTIVE);

        dialog.connect('response', (dialog, response) => {
            if (response === 'delete') {
                // Delete all selected clients
                this.selectedClients.forEach(clientId => {
                    if (this.clientManager) {
                        this.clientManager.deleteClient(clientId, this.parentWindow);
                    }
                });

                this.selectedClients.clear();
                this._updateSelectionUI();
                this.loadClients();
            }
            dialog.close();
        });

        dialog.present(this.parentWindow);
    }

    /**
     * Update selection UI
     */
    _updateSelectionUI() {
        const selectedCount = this.selectedClients.size;
        
        // For now, just log the selection since we're using the template UI
        if (selectedCount > 0) {
        } else {
        }
    }

    _createClientsList(container) {
        // Clients container
        this.clientsContainer = WidgetFactory.createScrollableList({
            height_request: 400,
            cssClasses: ['clients-list']
        });

        // Empty state
        this.emptyState = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 12,
            halign: Gtk.Align.CENTER,
            valign: Gtk.Align.CENTER,
            css_classes: ['empty-state']
        });

        const emptyIcon = new Gtk.Image({
            icon_name: 'avatar-default-symbolic',
            pixel_size: 64,
            css_classes: ['dim-label']
        });

        const emptyLabel = new Gtk.Label({
            label: 'No clients found',
            css_classes: ['title-2'],
            halign: Gtk.Align.CENTER
        });

        const emptySubLabel = new Gtk.Label({
            label: 'Create your first client to get started',
            css_classes: ['dim-label'],
            halign: Gtk.Align.CENTER
        });

        this.emptyState.append(emptyIcon);
        this.emptyState.append(emptyLabel);
        this.emptyState.append(emptySubLabel);

        // Stack to switch between list and empty state
        this.listStack = new Gtk.Stack();
        this.listStack.add_named(this.clientsContainer.widget, 'list');
        this.listStack.add_named(this.emptyState, 'empty');

        container.append(this.listStack);
    }

    _createPagination(container) {
        const paginationBox = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 12,
            halign: Gtk.Align.CENTER,
            margin_top: 12
        });

        this.prevClientsButton = new Button({
            iconName: 'go-previous-symbolic',
            tooltipText: 'Previous page',
            cssClasses: ['circular'],
            onClick: () => this._previousPage()
        });

        this.clientsPageInfo = new Label({
            text: 'Page 1 of 1',
            cssClasses: ['monospace']
        });

        this.nextClientsButton = new Button({
            iconName: 'go-next-symbolic',
            tooltipText: 'Next page',
            cssClasses: ['circular'],
            onClick: () => this._nextPage()
        });

        paginationBox.append(this.prevClientsButton.widget);
        paginationBox.append(this.clientsPageInfo.widget);
        paginationBox.append(this.nextClientsButton.widget);

        container.append(paginationBox);
    }

    /**
     * Load clients from database
     */
    async loadClients() {
        this.showLoading('Loading clients...');
        
        try {
            this.clients = await this._fetchClients();
            this.filteredClients = [...this.clients];
            this._updateClientsDisplay();
            // Clients loaded successfully
        } catch (error) {
            console.error('Error loading clients:', error);
            this.showError('Load Error', 'Failed to load clients');
        } finally {
            this.hideLoading();
        }
    }

    /**
     * Filter clients based on search query
     */
    _filterClients(query = '') {
        if (!query.trim()) {
            this.filteredClients = [...this.clients];
        } else {
            const lowerQuery = query.toLowerCase();
            this.filteredClients = this.clients.filter(client => 
                client.name.toLowerCase().includes(lowerQuery) ||
                (client.email && client.email.toLowerCase().includes(lowerQuery))
            );
        }

        this.currentClientsPage = 0;
        this._updateClientsDisplay();
    }

    /**
     * Refresh page data
     */
    async refresh() {
        try {
            await this.loadClients();
        } catch (error) {
            console.error('ClientsPage refresh failed:', error);
        }
    }

    /**
     * Show loading state
     */
    showLoading(message = 'Loading...') {
        // ClientsPage loading message
    }

    /**
     * Hide loading state
     */
    hideLoading() {
        // ClientsPage loading finished
    }

    /**
     * Show error message
     */
    showError(message) {
        console.error(`ClientsPage Error: ${message}`);
    }

    /**
     * Add selection handlers to client row
     */
    _addSelectionHandlers(row, client) {
        // Right-click for selection
        const rightClickGesture = new Gtk.GestureClick({
            button: 3
        });

        rightClickGesture.connect('pressed', () => {
            this._selectClient(client);
        });

        row.add_controller(rightClickGesture);
    }

    /**
     * Show add client dialog
     */
    showAddClientDialog() {
        if (this.clientManager) {
            // Use the client manager's create dialog method
            this.clientManager.showCreateClientDialog(this.parentWindow);
        } else {
            console.error('ClientManager not available');
        }
    }

    /**
     * Edit client
     */
    _editClient(client) {
        if (this.modularDialogManager) {
            this.modularDialogManager.editClient(client, () => {
                this.loadClients();
                return true;
            });
        }
    }

    /**
     * Show price/value dialog to edit client rate and currency
     */
    _showPriceValueDialog(client) {
        if (this.clientManager) {
            this.clientManager.showEditRateDialog(client, this.parentWindow);
        } else {
            console.error('ClientManager not available for price/value dialog');
        }
    }




    /**
     * Toggle search bar visibility
     */
    toggleSearch() {
        const isVisible = this.searchBar.get_search_mode();
        this.searchBar.set_search_mode(!isVisible);
    }

    /**
     * Refresh page data
     */
    async refresh() {
        try {
            await this.loadClients();
        } catch (error) {
            console.error('ClientsPage refresh failed:', error);
        }
    }

    /**
     * Show loading state
     */
    showLoading(message = 'Loading...') {
        // ClientsPage loading message
        // Could show spinner in UI if needed
    }

    /**
     * Hide loading state
     */
    hideLoading() {
        // ClientsPage loading finished
        // Could hide spinner in UI if needed
    }

    /**
     * Show error message
     */
    showError(message) {
        console.error(`ClientsPage Error: ${message}`);
        // Could show error dialog in UI if needed
    }

    /**
     * Navigate to previous page
     */
    _previousPage() {
        if (this.currentClientsPage > 0) {
            this.currentClientsPage--;
            this._updateClientsDisplay();
        }
    }

    /**
     * Navigate to next page
     */
    _nextPage() {
        const totalPages = Math.ceil(this.filteredClients.length / this.clientsPerPage);
        if (this.currentClientsPage < totalPages - 1) {
            this.currentClientsPage++;
            this._updateClientsDisplay();
        }
    }

    /**
     * Update pagination info
     */
    _updatePaginationInfo(totalPages) {
        if (this.clientsPageInfo) {
            this.clientsPageInfo.setText(`Page ${this.currentClientsPage + 1} of ${totalPages}`);
        }

        // Enable/disable pagination buttons
        if (this.prevClientsButton) {
            this.prevClientsButton.setEnabled(this.currentClientsPage > 0);
        }
        if (this.nextClientsButton) {
            this.nextClientsButton.setEnabled(this.currentClientsPage < totalPages - 1);
        }
    }

    // Helper methods
    _getSearchText() {
        const searchEntry = this.searchBar?.get_child();
        return searchEntry ? searchEntry.get_text().trim() : '';
    }

    _clearSearch() {
        const searchEntry = this.searchBar?.get_child();
        if (searchEntry) {
            searchEntry.set_text('');
        }
    }

    /**
     * Setup keyboard shortcuts for the page
     */
    setupKeyboardShortcuts() {
        if (!this.parentWindow) return;

        const keyController = new Gtk.EventControllerKey();
        keyController.connect('key-pressed', (controller, keyval, keycode, state) => {
            // Delete key - delete selected clients
            if (keyval === 65535 && this.selectedClients.size > 0) { // Delete key
                this._deleteSelectedClients();
                return true;
            }
            
            // Ctrl+A - select all clients
            if ((state & Gdk.ModifierType.CONTROL_MASK) && keyval === 97) { // Ctrl+A
                this._selectAllClients();
                return true;
            }
            
            // Escape - clear selection
            if (keyval === 65307) { // Escape
                this._clearSelection();
                return true;
            }

            return false;
        });

        this.parentWindow.add_controller(keyController);
    }

    /**
     * Select all clients
     */
    _selectAllClients() {
        this.selectedClients.clear();
        this.filteredClients.forEach(client => {
            this.selectedClients.add(client.id);
        });
        this._updateClientsDisplay(); // Refresh to show selection
        this._updateSelectionUI();
    }

    /**
     * Clear all selection
     */
    _clearSelection() {
        this.selectedClients.clear();
        this._updateClientsDisplay(); // Refresh to remove selection styling
        this._updateSelectionUI();
    }

    // Data fetching methods
    async _fetchClients() {
        if (!this.clientManager || !this.clientManager.dbConnection) {
            return [];
        }

        try {
            // First ensure the currency column exists
            if (this.clientManager.ensureCurrencyColumn) {
                this.clientManager.ensureCurrencyColumn();
            }

            // Try to select with currency column, fallback if it doesn't exist
            let sql = `SELECT id, name, email, rate, currency FROM Client ORDER BY name`;
            let result;
            
            try {
                result = this.clientManager.dbConnection.execute_select_command(sql);
            } catch (currencyColumnError) {
                // Fallback to basic columns
                sql = `SELECT id, name, email, rate FROM Client ORDER BY name`;
                result = this.clientManager.dbConnection.execute_select_command(sql);
            }

            const clients = [];

            if (result && result.get_n_rows() > 0) {
                const hasCurrency = result.get_n_columns() > 4;
                
                for (let i = 0; i < result.get_n_rows(); i++) {
                    const client = {
                        id: result.get_value_at(0, i),
                        name: result.get_value_at(1, i),
                        email: result.get_value_at(2, i) || '',
                        rate: result.get_value_at(3, i) || 0,
                        currency: hasCurrency ? (result.get_value_at(4, i) || 'USD') : 'USD'
                    };
                    clients.push(client);
                }
            }

            // Loaded clients from database
            return clients;
        } catch (error) {
            console.error('Error loading clients:', error);
            return [];
        }
    }
}