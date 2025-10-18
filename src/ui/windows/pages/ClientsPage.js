import Gtk from 'gi://Gtk';
import Adw from 'gi://Adw?version=1';
import Gdk from 'gi://Gdk';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import { getAllCurrencies, getCurrencySymbol } from 'resource:///com/odnoyko/valot/data/currencies.js';
import { AdvancedTrackingWidget } from 'resource:///com/odnoyko/valot/ui/components/complex/AdvancedTrackingWidget.js';

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
        this.selectedClients = new Set();
        this.currentClientsPage = 0;
        this.clientsPerPage = 10;

        // Subscribe to Core events for automatic updates
        this._subscribeToCore();
    }

    /**
     * Subscribe to Core events to auto-update client list
     */
    _subscribeToCore() {
        if (!this.coreBridge) return;

        // Reload when clients are created/updated/deleted
        this.coreBridge.onUIEvent('client-created', () => {
            this.loadClients();
        });

        this.coreBridge.onUIEvent('client-updated', () => {
            this.loadClients();
        });

        this.coreBridge.onUIEvent('client-deleted', () => {
            this.loadClients();
        });

        this.coreBridge.onUIEvent('clients-deleted', () => {
            this.loadClients();
        });
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

        // Load clients on initialization
        this.loadClients();

        // Prevent search input from auto-focusing on startup
        if (this.clientList) {
            // Set focus to the client list instead of search
            this.clientList.set_can_focus(true);
            this.clientList.grab_focus();
        }

        return page;
    }

    _createHeaderBar() {
        const headerBar = new Adw.HeaderBar();

        // Show sidebar button (start)
        this.showSidebarBtn = new Gtk.Button({
            icon_name: 'sidebar-show-symbolic',
            tooltip_text: _('Show Sidebar'),
        });
        this.showSidebarBtn.connect('clicked', () => {
            if (this.parentWindow && this.parentWindow.splitView) {
                this.parentWindow.splitView.set_show_sidebar(true);
            }
        });
        headerBar.pack_start(this.showSidebarBtn);

        // Update button visibility based on sidebar state
        if (this.parentWindow && this.parentWindow.splitView) {
            const updateSidebarButtonVisibility = () => {
                const sidebarVisible = this.parentWindow.splitView.get_show_sidebar();
                this.showSidebarBtn.set_visible(!sidebarVisible);
            };

            // Initial state
            updateSidebarButtonVisibility();

            // Listen for sidebar visibility changes
            this.parentWindow.splitView.connect('notify::show-sidebar', updateSidebarButtonVisibility);
        }

        // Tracking widget (title area)
        this.trackingWidget = new AdvancedTrackingWidget(this.coreBridge, this.parentWindow);
        headerBar.set_title_widget(this.trackingWidget.getWidget());

        // Compact tracker button (end)
        const compactTrackerBtn = new Gtk.Button({
            icon_name: 'view-restore-symbolic',
            css_classes: ['flat', 'circular'],
            tooltip_text: _('Open Compact Tracker (Shift: keep main window)'),
        });

        compactTrackerBtn.connect('clicked', () => {

            const display = Gdk.Display.get_default();
            const seat = display?.get_default_seat();
            const keyboard = seat?.get_keyboard();

            let shiftPressed = false;
            if (keyboard) {
                const state = keyboard.get_modifier_state();
                shiftPressed = !!(state & Gdk.ModifierType.SHIFT_MASK);
            }


            if (this.parentWindow?.application) {
                this.parentWindow.application._launchCompactTracker(shiftPressed);
            } else {
                console.error('❌ No application reference!');
            }
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
        this._updateTrackingUIFromCore();
    }

    /**
     * Core event: tracking stopped
     */
    _onTrackingStopped(data) {
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
                } else {
                    // Has text - find or create task via Core
                    task = await this.coreBridge.findOrCreateTask(taskName);
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
    }

    _selectClient() {
        // TODO: Open client selector
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

        // Pagination/context bar
        const contextBar = this._createContextBar();
        contentBox.append(contextBar);

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
     * Create context bar (pagination or selection mode)
     */
    _createContextBar() {
        this.contextBar = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 12,
            halign: Gtk.Align.CENTER,
            margin_top: 12,
            visible: false, // Hidden by default
        });

        // Pagination mode widgets
        this.paginationBox = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 12,
            halign: Gtk.Align.CENTER,
        });

        this.prevPageBtn = new Gtk.Button({
            label: _('Back'),
            css_classes: ['flat'],
        });
        this.prevPageBtn.connect('clicked', () => this._previousPage());
        this.paginationBox.append(this.prevPageBtn);

        this.pageInfoLabel = new Gtk.Label({
            label: 'Page 0 of 0',
            css_classes: ['dim-label'],
        });
        this.paginationBox.append(this.pageInfoLabel);

        this.nextPageBtn = new Gtk.Button({
            label: _('Next'),
            css_classes: ['flat'],
        });
        this.nextPageBtn.connect('clicked', () => this._nextPage());
        this.paginationBox.append(this.nextPageBtn);

        // Selection mode widgets
        this.selectionBox = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 12,
            halign: Gtk.Align.CENTER,
            visible: false,
        });

        const cancelBtn = new Gtk.Button({
            label: _('Cancel'),
            css_classes: ['flat'],
        });
        cancelBtn.connect('clicked', () => this._clearSelection());
        this.selectionBox.append(cancelBtn);

        this.selectionLabel = new Gtk.Label({
            label: '0 selected',
            css_classes: ['dim-label'],
        });
        this.selectionBox.append(this.selectionLabel);

        const deleteBtn = new Gtk.Button({
            label: _('Delete'),
            css_classes: ['destructive-action'],
        });
        deleteBtn.connect('clicked', () => this._deleteSelectedClients());
        this.selectionBox.append(deleteBtn);

        // Add both to context bar
        this.contextBar.append(this.paginationBox);
        this.contextBar.append(this.selectionBox);

        return this.contextBar;
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
     * Update clients display with pagination
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
            this._updatePaginationInfo();
            return;
        }

        // Calculate pagination
        const totalPages = Math.ceil(this.filteredClients.length / this.clientsPerPage);

        // Adjust current page if needed
        if (this.currentClientsPage >= totalPages && totalPages > 0) {
            this.currentClientsPage = totalPages - 1;
        }

        const start = this.currentClientsPage * this.clientsPerPage;
        const end = Math.min(start + this.clientsPerPage, this.filteredClients.length);
        const clientsToShow = this.filteredClients.slice(start, end);

        // Add paginated clients to list
        clientsToShow.forEach(client => {
            const row = this._createClientRow(client);
            this.clientList.append(row);
        });

        // Update pagination info
        this._updatePaginationInfo();
        this._updateSelectionUI();
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
            ellipsize: 3, // End ellipsize
            selectable: false, // Prevent text selection
        });

        // Add double-click gesture for name editing
        const nameGesture = new Gtk.GestureClick({
            button: 1,
        });
        nameGesture.connect('pressed', (gesture, n_press, x, y) => {
            if (n_press === 2) { // Double-click
                this._showEditNameDialog(client);
                gesture.set_state(Gtk.EventSequenceState.CLAIMED);
            }
        });
        nameLabel.add_controller(nameGesture);

        mainBox.append(nameLabel);

        // Combined price/currency button (click to edit)
        const currencySymbol = this._getCurrencySymbol(client.currency || 'USD');
        const priceValueButton = new Gtk.Button({
            css_classes: ['flat', 'price-value-button'],
            halign: Gtk.Align.END,
            valign: Gtk.Align.CENTER,
            width_request: 120,
            tooltip_text: _('Click to change rate and currency'),
        });

        const priceValueLabel = new Gtk.Label({
            label: `${currencySymbol}${(client.rate || 0).toFixed(2)}`,
            css_classes: ['price-value-display', 'monospace'],
            halign: Gtk.Align.CENTER,
            valign: Gtk.Align.CENTER,
        });

        priceValueButton.set_child(priceValueLabel);

        // Connect to edit client rate and currency
        priceValueButton.connect('clicked', () => {
            this._showEditRateDialog(client);
        });

        mainBox.append(priceValueButton);

        row.set_child(mainBox);

        // Add right-click selection handler
        this._addClientSelectionHandlers(row, client);

        // Apply selection styling if selected
        if (this.selectedClients.has(client.id)) {
            row.add_css_class('selected-client');
        }

        return row;
    }

    /**
     * Add right-click selection handlers
     */
    _addClientSelectionHandlers(row, client) {
        const rightClick = new Gtk.GestureClick({
            button: 3, // Right mouse button
        });

        rightClick.connect('pressed', (gesture, n_press, x, y) => {
            this._toggleClientSelection(client.id, row);
            gesture.set_state(Gtk.EventSequenceState.CLAIMED);
        });

        row.add_controller(rightClick);
    }

    /**
     * Toggle client selection
     */
    _toggleClientSelection(clientId, row) {
        // Prevent selection of default client (ID = 1)
        if (clientId === 1) {
            // Show toast notification
            if (this.parentWindow && this.parentWindow.showToast) {
                this.parentWindow.showToast(_('Default Client cannot be selected'));
            }
            return;
        }

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
            heading: _('Create Client'),
            body: _('Add a new client with name and currency'),
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
            placeholder_text: _('Client name'),
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
            heading: _('Edit Client Name'),
            body: _('Enter a new name for this client'),
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
                    // Save old name for undo
                    const oldName = client.name;

                    // Update client
                    await this.coreBridge.updateClient(client.id, { name: newName });
                    await this.loadClients();

                    // Show toast with Undo
                    if (this.parentWindow && this.parentWindow.showToastWithAction) {
                        this.parentWindow.showToastWithAction(
                            _('Client name updated'),
                            _('Undo'),
                            async () => {
                                // Restore old name
                                await this.coreBridge.updateClient(client.id, { name: oldName });
                                await this.loadClients();
                            }
                        );
                    }
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
            heading: _('Edit Rate - {name}').replace('{name}', client.name),
            body: _('Change hourly rate and currency for this client'),
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
                    // Save old values for undo
                    const oldRate = client.rate;
                    const oldCurrency = client.currency;
                    const newRate = parseFloat(rateEntry.get_text()) || 0;

                    // Update client
                    await this.coreBridge.updateClient(client.id, {
                        rate: newRate,
                        currency: selectedCurrency,
                    });
                    await this.loadClients();

                    // Show toast with Undo
                    if (this.parentWindow && this.parentWindow.showToastWithAction) {
                        this.parentWindow.showToastWithAction(
                            _('Client rate updated'),
                            _('Undo'),
                            async () => {
                                // Restore old values
                                await this.coreBridge.updateClient(client.id, {
                                    rate: oldRate,
                                    currency: oldCurrency,
                                });
                                await this.loadClients();
                            }
                        );
                    }
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
     * Previous page
     */
    _previousPage() {
        if (this.currentClientsPage > 0) {
            this.currentClientsPage--;
            this._updateClientsDisplay();
        }
    }

    /**
     * Next page
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
    _updatePaginationInfo() {
        const totalPages = Math.max(1, Math.ceil(this.filteredClients.length / this.clientsPerPage));
        const currentPage = Math.min(this.currentClientsPage + 1, totalPages);

        this.pageInfoLabel.set_label(`Page ${currentPage} of ${totalPages}`);
        this.prevPageBtn.set_sensitive(this.currentClientsPage > 0);
        this.nextPageBtn.set_sensitive(this.currentClientsPage < totalPages - 1);
    }

    /**
     * Update selection UI
     */
    _updateSelectionUI() {
        const selectedCount = this.selectedClients.size;
        const totalPages = Math.ceil(this.filteredClients.length / this.clientsPerPage);

        if (selectedCount > 0) {
            // Show selection mode
            this.contextBar.set_visible(true);
            this.paginationBox.set_visible(false);
            this.selectionBox.set_visible(true);
            this.selectionLabel.set_label(`${selectedCount} selected`);
        } else {
            // Show pagination mode only if more than 1 page
            if (totalPages > 1) {
                this.contextBar.set_visible(true);
                this.paginationBox.set_visible(true);
                this.selectionBox.set_visible(false);
            } else {
                // Hide context bar when 1 page and no selection
                this.contextBar.set_visible(false);
            }
        }
    }

    /**
     * Clear selection
     */
    _clearSelection() {
        this.selectedClients.clear();
        this._updateClientsDisplay();
    }

    /**
     * Select all clients on current page (except default client ID=1)
     */
    _selectAllOnPage() {
        const start = this.currentClientsPage * this.clientsPerPage;
        const end = Math.min(start + this.clientsPerPage, this.filteredClients.length);
        const clientsOnPage = this.filteredClients.slice(start, end);

        // Select all clients except default (ID=1)
        clientsOnPage.forEach(client => {
            if (client.id !== 1) {
                this.selectedClients.add(client.id);
            }
        });

        // Update display
        this._updateClientsDisplay();
    }

    /**
     * Delete selected clients
     */
    async _deleteSelectedClients() {
        if (this.selectedClients.size === 0) return;

        // Filter out default client (should never be selected, but double-check)
        const idsToDelete = Array.from(this.selectedClients).filter(id => id !== 1);

        if (idsToDelete.length === 0) {
            return;
        }

        // Show confirmation dialog
        const dialog = new Adw.AlertDialog({
            heading: _('Delete Clients'),
            body: `Are you sure you want to delete ${idsToDelete.length} selected client(s)?`,
        });

        dialog.add_response('cancel', _('Cancel'));
        dialog.add_response('delete', _('Delete'));
        dialog.set_response_appearance('delete', Adw.ResponseAppearance.DESTRUCTIVE);

        dialog.connect('response', async (dialog, response) => {
            if (response === 'delete') {
                try {
                    // Save client data for undo
                    const deletedClients = this.clients.filter(c => idsToDelete.includes(c.id));

                    // Delete via Core
                    await this.coreBridge.deleteMultipleClients(idsToDelete);

                    // Clear selection
                    this.selectedClients.clear();

                    // Reload clients
                    await this.loadClients();

                    // Show toast with Undo
                    const message = idsToDelete.length === 1
                        ? _('Client deleted')
                        : _(`${idsToDelete.length} clients deleted`);

                    if (this.parentWindow && this.parentWindow.showToastWithAction) {
                        this.parentWindow.showToastWithAction(message, _('Undo'), async () => {
                            // Restore deleted clients
                            for (const client of deletedClients) {
                                await this.coreBridge.createClient(client.name, client.rate, client.currency);
                            }
                            await this.loadClients();
                        });
                    }
                } catch (error) {
                    console.error('Error deleting clients:', error);
                }
            }
            dialog.close();
        });

        dialog.present(this.parentWindow);
    }

    /**
     * Refresh page data
     */
    async refresh() {
        await this.loadClients();
    }
}
