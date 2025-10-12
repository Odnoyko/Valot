import Gtk from 'gi://Gtk';
import Adw from 'gi://Adw?version=1';
import Gdk from 'gi://Gdk';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import { getAllCurrencies, getCurrencySymbol } from 'resource:///com/odnoyko/valot/data/currencies.js';

/**
 * Clients management page
 * Recreates the old UI from window.blp programmatically
 */
export class ClientsPage {
    constructor(config = {}) {
        this.app = config.app;
        this.parentWindow = config.parentWindow;
        this.coreBridge = config.coreBridge;

        // Client-specific state
        this.clients = [];
        this.filteredClients = [];
    }

    /**
     * Create and return the main widget for this page
     */
    getWidget() {
        // Main page container
        const page = new Adw.ToolbarView();

        // Create header bar
        const headerBar = this._createHeaderBar();
        page.add_top_bar(headerBar);

        // Create content
        const content = this._createContent();
        page.set_content(content);

        return page;
    }

    _createHeaderBar() {
        const headerBar = new Adw.HeaderBar();

        // Show sidebar button (start)
        const showSidebarBtn = new Gtk.Button({
            icon_name: 'sidebar-show-symbolic',
            tooltip_text: _('Show Sidebar'),
        });
        showSidebarBtn.connect('clicked', () => {
            if (this.parentWindow && this.parentWindow.splitView) {
                this.parentWindow.splitView.set_show_sidebar(true);
            }
        });
        headerBar.pack_start(showSidebarBtn);

        // Tracking widget (title area)
        const trackingWidget = this._createTrackingWidget();
        headerBar.set_title_widget(trackingWidget);

        // Compact tracker button (end)
        const compactTrackerBtn = new Gtk.Button({
            icon_name: 'view-restore-symbolic',
            css_classes: ['flat', 'circular'],
            tooltip_text: _('Open Compact Tracker'),
        });
        headerBar.pack_end(compactTrackerBtn);

        return headerBar;
    }

    _createTrackingWidget() {
        // Original design adapted to Core architecture
        const box = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 8,
            hexpand: true,
            hexpand_set: true,
        });

        // Task name entry
        this.taskNameEntry = new Gtk.Entry({
            placeholder_text: _('Task name'),
            hexpand: true,
            hexpand_set: true,
        });
        box.append(this.taskNameEntry);

        // Project context button
        this.projectBtn = new Gtk.Button({
            icon_name: 'folder-symbolic',
            css_classes: ['flat'],
            tooltip_text: _('Project'),
            width_request: 36,
            height_request: 36,
        });
        this.projectBtn.connect('clicked', () => this._selectProject());
        box.append(this.projectBtn);

        // Client context button
        this.clientBtn = new Gtk.Button({
            icon_name: 'contact-new-symbolic',
            css_classes: ['flat'],
            tooltip_text: _('Client'),
            width_request: 36,
            height_request: 36,
        });
        this.clientBtn.connect('clicked', () => this._selectClient());
        box.append(this.clientBtn);

        // Actual time label
        this.actualTimeLabel = new Gtk.Label({
            label: '00:00:00',
            css_classes: ['title-4'],
            margin_start: 8,
        });
        box.append(this.actualTimeLabel);

        // Track button
        this.trackButton = new Gtk.Button({
            icon_name: 'media-playback-start-symbolic',
            css_classes: ['suggested-action', 'circular'],
            tooltip_text: _('Start tracking'),
        });
        this.trackButton.connect('clicked', () => this._toggleTracking());
        box.append(this.trackButton);

        // Connect to Core for synchronization
        this._connectTrackingToCore();

        return box;
    }

    /**
     * Connect tracking widget to Core for state synchronization
     */
    _connectTrackingToCore() {
        if (!this.coreBridge) {
            console.warn('⚠️ CoreBridge not available - tracking disabled');
            return;
        }

        // Subscribe to Core events
        this.coreBridge.onUIEvent('tracking-started', (data) => {
            this._onTrackingStarted(data);
        });

        this.coreBridge.onUIEvent('tracking-stopped', (data) => {
            this._onTrackingStopped(data);
        });

        this.coreBridge.onUIEvent('tracking-updated', (data) => {
            this._onTrackingUpdated(data);
        });

        // Load initial state
        this._updateTrackingUIFromCore();

        console.log('✅ ClientsPage tracking widget connected to Core');
    }

    /**
     * Update UI from Core state (no local state!)
     */
    _updateTrackingUIFromCore() {
        if (!this.coreBridge) return;

        const state = this.coreBridge.getTrackingState();

        if (state.isTracking) {
            // Tracking active
            this.taskNameEntry.set_text(state.currentTaskName || '');
            this.taskNameEntry.set_sensitive(false);
            this.projectBtn.set_sensitive(false);
            this.clientBtn.set_sensitive(false);

            this.trackButton.set_icon_name('media-playback-stop-symbolic');
            this.trackButton.set_tooltip_text(_('Stop tracking'));
            this.trackButton.remove_css_class('suggested-action');
            this.trackButton.add_css_class('destructive-action');

            this.actualTimeLabel.set_label(this._formatDuration(state.elapsedSeconds));

            // Start UI update timer
            this._startTrackingUITimer();
        } else {
            // Tracking idle
            this.taskNameEntry.set_text('');
            this.taskNameEntry.set_sensitive(true);
            this.projectBtn.set_sensitive(true);
            this.clientBtn.set_sensitive(true);

            this.trackButton.set_icon_name('media-playback-start-symbolic');
            this.trackButton.set_tooltip_text(_('Start tracking'));
            this.trackButton.remove_css_class('destructive-action');
            this.trackButton.add_css_class('suggested-action');

            this.actualTimeLabel.set_label('00:00:00');

            // Stop UI update timer
            this._stopTrackingUITimer();
        }
    }

    /**
     * Core event: tracking started
     */
    _onTrackingStarted(data) {
        console.log('📡 ClientsPage: Tracking started');
        this._updateTrackingUIFromCore();
    }

    /**
     * Core event: tracking stopped
     */
    _onTrackingStopped(data) {
        console.log('📡 ClientsPage: Tracking stopped');
        this._updateTrackingUIFromCore();
    }

    /**
     * Core event: tracking updated (every second)
     */
    _onTrackingUpdated(data) {
        const state = this.coreBridge.getTrackingState();
        this.actualTimeLabel.set_label(this._formatDuration(state.elapsedSeconds));
    }

    /**
     * User clicked track button
     */
    async _toggleTracking() {
        if (!this.coreBridge) return;

        const state = this.coreBridge.getTrackingState();

        if (state.isTracking) {
            // Stop tracking
            try {
                await this.coreBridge.stopTracking();
            } catch (error) {
                console.error('Error stopping tracking:', error);
            }
        } else {
            // Start tracking - create or find task (ALL LOGIC IN CORE!)
            try {
                const taskName = this.taskNameEntry.get_text().trim();
                let task;

                if (taskName === '' || taskName.length === 0) {
                    // Empty input - create auto-indexed task via Core
                    task = await this.coreBridge.createAutoIndexedTask();
                    console.log(`Created auto-indexed task: ${task.name}`);
                } else {
                    // Has text - find or create task via Core
                    task = await this.coreBridge.findOrCreateTask(taskName);
                    console.log(`Using task: ${task.name}`);
                }

                // Start tracking with task ID
                await this.coreBridge.startTracking(task.id, null, null);
            } catch (error) {
                console.error('Error starting tracking:', error);
            }
        }
    }

    /**
     * UI update timer - refreshes time display from Core
     */
    _startTrackingUITimer() {
        if (this.trackingTimerId) return;

        this.trackingTimerId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1000, () => {
            const state = this.coreBridge.getTrackingState();
            if (state.isTracking) {
                this.actualTimeLabel.set_label(this._formatDuration(state.elapsedSeconds));
                return true; // Continue
            } else {
                this.trackingTimerId = null;
                return false; // Stop
            }
        });
    }

    _stopTrackingUITimer() {
        if (this.trackingTimerId) {
            GLib.Source.remove(this.trackingTimerId);
            this.trackingTimerId = null;
        }
    }

    _formatDuration(seconds) {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;
        return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }

    _selectProject() {
        // TODO: Open project selector
        console.log('TODO: Select project');
    }

    _selectClient() {
        // TODO: Open client selector
        console.log('TODO: Select client');
    }

    _createContent() {
        const contentBox = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 12,
            margin_top: 12,
            margin_bottom: 12,
            margin_start: 12,
            margin_end: 12,
        });

        // Search and add box
        const searchAddBox = this._createSearchAddBox();
        contentBox.append(searchAddBox);

        // Clients list
        const scrolledWindow = this._createClientsList();
        contentBox.append(scrolledWindow);

        return contentBox;
    }

    _createSearchAddBox() {
        const box = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 0,
            margin_bottom: 12,
            css_classes: ['search-button-box'],
        });

        // Search entry
        this.clientSearch = new Gtk.SearchEntry({
            placeholder_text: _('Search clients...'),
            hexpand: true,
        });

        this.clientSearch.connect('search-changed', () => {
            const query = this.clientSearch.get_text();
            this._filterClients(query);
        });

        box.append(this.clientSearch);

        // Add client button
        this.addClientBtn = new Gtk.Button({
            tooltip_text: _('Add Client'),
            css_classes: ['flat'],
        });

        const btnBox = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 6,
            halign: Gtk.Align.CENTER,
        });

        const btnLabel = new Gtk.Label({
            label: _('Add client'),
        });
        btnBox.append(btnLabel);

        const btnIcon = new Gtk.Image({
            icon_name: 'list-add-symbolic',
        });
        btnBox.append(btnIcon);

        this.addClientBtn.set_child(btnBox);

        this.addClientBtn.connect('clicked', () => {
            this.showAddClientDialog();
        });

        box.append(this.addClientBtn);

        return box;
    }

    _createClientsList() {
        const scrolledWindow = new Gtk.ScrolledWindow({
            vexpand: true,
            hscrollbar_policy: Gtk.PolicyType.NEVER,
        });

        this.clientList = new Gtk.ListBox({
            css_classes: ['content-box'],
            selection_mode: Gtk.SelectionMode.SINGLE,
        });

        scrolledWindow.set_child(this.clientList);

        return scrolledWindow;
    }

    /**
     * Load clients from Core
     */
    async loadClients() {
        if (!this.coreBridge) {
            console.error('No coreBridge available');
            return;
        }

        try {
            // Get clients from Core
            const clients = await this.coreBridge.getAllClients();
            this.clients = clients || [];
            this.filteredClients = [...this.clients];
            this._updateClientsDisplay();
        } catch (error) {
            console.error('Error loading clients:', error);
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
        this._updateClientsDisplay();
    }

    /**
     * Update clients display
     */
    _updateClientsDisplay() {
        // Clear existing clients
        let child = this.clientList.get_first_child();
        while (child) {
            const next = child.get_next_sibling();
            this.clientList.remove(child);
            child = next;
        }

        if (!this.filteredClients || this.filteredClients.length === 0) {
            // Show empty state
            const emptyRow = new Adw.ActionRow({
                title: _('No clients found'),
                subtitle: _('Create your first client to get started'),
                sensitive: false,
            });
            this.clientList.append(emptyRow);
            return;
        }

        // Add clients to list
        this.filteredClients.forEach(client => {
            const row = this._createClientRow(client);
            this.clientList.append(row);
        });
    }

    /**
     * Create a client row
     */
    _createClientRow(client) {
        const row = new Gtk.ListBoxRow({
            activatable: false,
            selectable: false,
        });

        const mainBox = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 12,
            margin_start: 16,
            margin_end: 16,
            margin_top: 12,
            margin_bottom: 12,
            hexpand: true,
        });

        // Client name (double-click to edit)
        const nameLabel = new Gtk.Label({
            label: client.name,
            hexpand: true,
            halign: Gtk.Align.START,
            valign: Gtk.Align.CENTER,
            css_classes: ['client-name-label'],
        });

        // Add double-click gesture for name editing
        const nameGesture = new Gtk.GestureClick({
            button: 1,
        });
        nameGesture.connect('pressed', (gesture, n_press, x, y) => {
            if (n_press === 2) { // Double-click
                this._showEditNameDialog(client);
            }
        });
        nameLabel.add_controller(nameGesture);

        mainBox.append(nameLabel);

        // Rate display (click to edit)
        const currencySymbol = this._getCurrencySymbol(client.currency || 'USD');
        const rateLabel = new Gtk.Label({
            label: `${currencySymbol}${(client.rate || 0).toFixed(2)}/hr`,
            css_classes: ['rate-display', 'monospace', 'dim-label', 'clickable'],
            valign: Gtk.Align.CENTER,
            halign: Gtk.Align.END,
            width_request: 100,
        });

        // Add single-click gesture for rate editing
        const rateGesture = new Gtk.GestureClick({
            button: 1,
        });
        rateGesture.connect('released', (gesture, n_press, x, y) => {
            this._showEditRateDialog(client);
        });
        rateLabel.add_controller(rateGesture);

        mainBox.append(rateLabel);

        row.set_child(mainBox);
        return row;
    }

    /**
     * Show add client dialog
     */
    async showAddClientDialog() {
        try {
            // Get client name from search or generate indexed name
            const searchText = this.clientSearch.get_text().trim();
            let clientName;

            if (searchText === '') {
                // Generate auto-indexed name - find first available index
                const existingClients = await this.coreBridge.getAllClients();
                const existingNames = new Set(existingClients.map(c => c.name));

                let nextIndex = 1;
                while (existingNames.has(`Client - ${nextIndex}`)) {
                    nextIndex++;
                }

                clientName = `Client - ${nextIndex}`;
            } else {
                clientName = searchText;
            }

            // Create client immediately in DB (Core will ensure unique name)
            const createdClient = await this.coreBridge.createClient(clientName, 0, 'USD');

            // Clear search
            this.clientSearch.set_text('');

            // Reload list
            await this.loadClients();

            let wasSaved = false;

            // Open edit dialog
            this._showCreateClientDialog(createdClient, async (updatedData) => {
                try {
                    await this.coreBridge.updateClient(createdClient.id, updatedData);
                    await this.loadClients();
                    wasSaved = true;
                    return true;
                } catch (error) {
                    console.error('Error updating client:', error);
                    return false;
                }
            }, async () => {
                // On cancel - delete client if not saved
                if (!wasSaved) {
                    try {
                        await this.coreBridge.deleteClient(createdClient.id);
                        await this.loadClients();
                    } catch (error) {
                        console.error('Error deleting cancelled client:', error);
                    }
                }
            });

        } catch (error) {
            console.error('Error in add client flow:', error);
        }
    }

    _showCreateClientDialog(client, onSave, onCancel) {
        const dialog = new Adw.AlertDialog({
            heading: _('Kunde erstellen'),
            body: _('Neuen Kunden mit Name und Währung hinzufügen'),
        });

        // Form layout
        const form = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 12,
            width_request: 400,
            margin_top: 12,
            margin_bottom: 12,
            margin_start: 12,
            margin_end: 12,
        });

        // Name entry
        const nameEntry = new Gtk.Entry({
            placeholder_text: _('Kundenname'),
            text: client.name || '',
            hexpand: true,
        });

        // Rate row with +/- and currency button
        const rateRow = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 12,
        });

        // Rate box with +/- buttons
        const rateBox = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 0,
            css_classes: ['hour-price-input'],
            width_request: 120,
        });

        const rateMinusBtn = new Gtk.Button({
            label: '−',
            css_classes: ['flat'],
            width_request: 30,
        });

        const rateEntry = new Gtk.Entry({
            text: (client.rate || 0).toString(),
            width_request: 60,
            halign: Gtk.Align.CENTER,
            css_classes: ['monospace'],
        });

        const ratePlusBtn = new Gtk.Button({
            label: '+',
            css_classes: ['flat'],
            width_request: 30,
        });

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

        // Currency button
        let selectedCurrency = client.currency || 'USD';
        const currencyBtn = new Gtk.Button({
            label: `${this._getCurrencySymbol(selectedCurrency)} ${selectedCurrency}`,
            css_classes: ['flat'],
            width_request: 100,
        });

        currencyBtn.connect('clicked', () => {
            this._showCurrencySelector(selectedCurrency, (newCurrency) => {
                selectedCurrency = newCurrency.code;
                currencyBtn.set_label(`${newCurrency.symbol} ${newCurrency.code}`);
            });
        });

        rateRow.append(rateBox);
        rateRow.append(currencyBtn);

        form.append(nameEntry);
        form.append(rateRow);

        dialog.set_extra_child(form);
        dialog.add_response('cancel', _('Cancel'));
        dialog.add_response('create', _('Create Client'));
        dialog.set_response_appearance('create', Adw.ResponseAppearance.SUGGESTED);

        dialog.connect('response', async (dialog, response) => {
            if (response === 'create') {
                const success = await onSave({
                    name: nameEntry.get_text().trim(),
                    rate: parseFloat(rateEntry.get_text()) || 0,
                    currency: selectedCurrency,
                });
                if (!success) return;
            } else if (onCancel) {
                await onCancel();
            }
            dialog.close();
        });

        dialog.present(this.parentWindow);
    }

    _showEditNameDialog(client) {
        const dialog = new Adw.AlertDialog({
            heading: _('Kundenname bearbeiten'),
            body: _('Geben Sie einen neuen Namen für diesen Kunden ein'),
        });

        const nameEntry = new Gtk.Entry({
            text: client.name,
            hexpand: true,
            margin_top: 12,
            margin_bottom: 12,
            margin_start: 12,
            margin_end: 12,
        });

        dialog.set_extra_child(nameEntry);
        dialog.add_response('cancel', _('Cancel'));
        dialog.add_response('save', _('Save'));
        dialog.set_response_appearance('save', Adw.ResponseAppearance.SUGGESTED);

        dialog.connect('response', async (dialog, response) => {
            if (response === 'save') {
                const newName = nameEntry.get_text().trim();
                if (!newName || newName === client.name) {
                    dialog.close();
                    return;
                }

                try {
                    await this.coreBridge.updateClient(client.id, { name: newName });
                    await this.loadClients();
                } catch (error) {
                    console.error('Error updating client name:', error);
                }
            }
            dialog.close();
        });

        dialog.present(this.parentWindow);
    }

    _showEditRateDialog(client) {
        const dialog = new Adw.AlertDialog({
            heading: _('Satz bearbeiten - {name}').replace('{name}', client.name),
            body: _('Stundensatz und Währung für diesen Kunden ändern'),
        });

        const form = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 12,
            margin_top: 12,
            margin_bottom: 12,
            margin_start: 12,
            margin_end: 12,
        });

        // Rate box with +/- buttons
        const rateBox = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 0,
            css_classes: ['hour-price-input'],
            width_request: 120,
        });

        const rateMinusBtn = new Gtk.Button({
            label: '−',
            css_classes: ['flat'],
            width_request: 30,
        });

        const rateEntry = new Gtk.Entry({
            text: (client.rate || 0).toString(),
            width_request: 60,
            halign: Gtk.Align.CENTER,
            css_classes: ['monospace'],
        });

        const ratePlusBtn = new Gtk.Button({
            label: '+',
            css_classes: ['flat'],
            width_request: 30,
        });

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

        // Currency button
        let selectedCurrency = client.currency || 'USD';
        const currencyBtn = new Gtk.Button({
            label: `${this._getCurrencySymbol(selectedCurrency)} ${selectedCurrency}`,
            css_classes: ['flat'],
            width_request: 100,
        });

        currencyBtn.connect('clicked', () => {
            this._showCurrencySelector(selectedCurrency, (newCurrency) => {
                selectedCurrency = newCurrency.code;
                currencyBtn.set_label(`${newCurrency.symbol} ${newCurrency.code}`);
            });
        });

        form.append(rateBox);
        form.append(currencyBtn);

        dialog.set_extra_child(form);
        dialog.add_response('cancel', _('Cancel'));
        dialog.add_response('save', _('Save Changes'));
        dialog.set_response_appearance('save', Adw.ResponseAppearance.SUGGESTED);

        dialog.connect('response', async (dialog, response) => {
            if (response === 'save') {
                try {
                    await this.coreBridge.updateClient(client.id, {
                        rate: parseFloat(rateEntry.get_text()) || 0,
                        currency: selectedCurrency,
                    });
                    await this.loadClients();
                } catch (error) {
                    console.error('Error updating client rate:', error);
                }
            }
            dialog.close();
        });

        dialog.present(this.parentWindow);
    }

    _showCurrencySelector(currentCurrencyCode, onSelect) {
        const dialog = new Adw.AlertDialog({
            heading: _('Select Currency'),
            body: _('Choose a currency for this client'),
        });

        const scrolled = new Gtk.ScrolledWindow({
            hscrollbar_policy: Gtk.PolicyType.NEVER,
            vscrollbar_policy: Gtk.PolicyType.AUTOMATIC,
            min_content_height: 200,
            max_content_height: 300,
            margin_top: 12,
            margin_bottom: 12,
            margin_start: 12,
            margin_end: 12,
        });

        const listBox = new Gtk.ListBox({
            css_classes: ['boxed-list'],
        });

        const currencies = this._getAvailableCurrencies();

        currencies.forEach(currency => {
            const row = new Gtk.ListBoxRow();
            const box = new Gtk.Box({
                orientation: Gtk.Orientation.HORIZONTAL,
                spacing: 12,
                margin_start: 12,
                margin_end: 12,
                margin_top: 8,
                margin_bottom: 8,
            });

            const symbolLabel = new Gtk.Label({
                label: currency.symbol,
                css_classes: ['title-3'],
                width_request: 30,
            });

            const infoBox = new Gtk.Box({
                orientation: Gtk.Orientation.VERTICAL,
                hexpand: true,
            });

            const nameLabel = new Gtk.Label({
                label: currency.name,
                halign: Gtk.Align.START,
                css_classes: ['body'],
            });

            const codeLabel = new Gtk.Label({
                label: currency.code,
                halign: Gtk.Align.START,
                css_classes: ['caption', 'dim-label'],
            });

            infoBox.append(nameLabel);
            infoBox.append(codeLabel);

            box.append(symbolLabel);
            box.append(infoBox);

            if (currency.code === currentCurrencyCode) {
                const checkIcon = new Gtk.Image({
                    icon_name: 'object-select-symbolic',
                });
                box.append(checkIcon);
            }

            row.set_child(box);
            listBox.append(row);
        });

        listBox.connect('row-activated', (listBox, row) => {
            const index = row.get_index();
            const selectedCurrency = currencies[index];
            if (onSelect) {
                onSelect(selectedCurrency);
            }
            dialog.close();
        });

        scrolled.set_child(listBox);
        dialog.set_extra_child(scrolled);
        dialog.add_response('cancel', _('Cancel'));

        dialog.present(this.parentWindow);
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
            console.log('Error loading currency settings:', error);
        }

        // Default to all currencies if no settings found
        if (!currencySettings) {
            const allCurrencies = getAllCurrencies();
            return allCurrencies;
        }

        const allCurrencies = getAllCurrencies();
        const availableCurrencies = [];

        // Add visible currencies
        currencySettings.visible.forEach(code => {
            const currency = allCurrencies.find(c => c.code === code);
            if (currency) {
                availableCurrencies.push(currency);
            }
        });

        // Add custom currencies
        if (currencySettings.custom) {
            availableCurrencies.push(...currencySettings.custom);
        }

        return availableCurrencies;
    }

    _getCurrencySymbol(code) {
        return getCurrencySymbol(code) || '$';
    }

    /**
     * Refresh page data
     */
    async refresh() {
        await this.loadClients();
    }
}
