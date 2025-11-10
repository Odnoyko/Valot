import Gtk from 'gi://Gtk';
import { getCurrencySymbol } from 'resource:///com/odnoyko/valot/data/currencies.js';
import { PLACEHOLDER } from 'resource:///com/odnoyko/valot/ui/utils/commonStrings.js';

/**
 * Custom client dropdown with search functionality
 */
export class ClientDropdown {
    constructor(coreBridge, currentClientId = 1, onClientSelected = null) {
        this.coreBridge = coreBridge;
        this.clients = [];
        this.currentClientId = currentClientId;
        this.onClientSelected = onClientSelected;
        this.isUpdatingSelection = false;

        // Store event handlers for cleanup
        this._eventHandlers = {};

        this.dropdown = this._createSearchableDropdown();

        // Load clients from Core
        this._loadClients();

        // Subscribe to Core events for updates
        this._subscribeToCore();
    }

    async _loadClients() {
        try {
            this.clients = await this.coreBridge.getAllClients();
            this._updateTooltip(this.dropdownButton);
            this._populateClientList();
        } catch (error) {
            console.error('Error loading clients:', error);
            this.clients = [];
        }
    }

    _subscribeToCore() {
        if (!this.coreBridge) return;

        // Store handlers for cleanup
        this._eventHandlers['client-created'] = () => this._loadClients();
        this._eventHandlers['client-updated'] = () => this._loadClients();
        this._eventHandlers['client-deleted'] = () => this._loadClients();

        // Subscribe with stored handlers
        Object.keys(this._eventHandlers).forEach(event => {
            this.coreBridge.onUIEvent(event, this._eventHandlers[event]);
        });
    }

    /**
     * Cleanup: unsubscribe from events
     * CRITICAL: Must unparent popover BEFORE button is finalized
     */
    destroy() {
        // FIRST: Close and unparent popover from button (prevents GTK warnings)
        if (this.popover) {
            try {
                if (!this.popover.is_destroyed?.()) {
                    this.popover.popdown();
                    // CRITICAL: Unparent FIRST to detach from button before any destruction
                    this.popover.unparent();
                }
            } catch (e) {
                // Popover may already be destroyed or unparented
            }
        }
        
        // SECOND: Destroy button (now safe, popover is detached)
        if (this.dropdownButton) {
            try {
                if (!this.dropdownButton.is_destroyed?.()) {
                    this.dropdownButton.destroy();
                }
            } catch (e) {
                // Button may already be destroyed
            }
            this.dropdownButton = null;
        }
        
        // THIRD: Now destroy popover widget itself
        if (this.popover) {
            try {
                if (!this.popover.is_destroyed?.()) {
                    this.popover.destroy();
                }
            } catch (e) {
                // Popover may already be destroyed
            }
            this.popover = null;
        }
        
        // Unsubscribe from events
        if (this.coreBridge && this._eventHandlers) {
            Object.keys(this._eventHandlers).forEach(event => {
                this.coreBridge.offUIEvent(event, this._eventHandlers[event]);
            });
            this._eventHandlers = {};
        }
        
        // Clear data
        this.clients = [];
    }

    _createSearchableDropdown() {
        // Create container for the dropdown button + popover
        const container = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL
        });

        // Create the main button that shows just the icon
        const dropdownButton = new Gtk.Button({
            css_classes: ['flat'],
            width_request: 36,
            height_request: 36,
            halign: Gtk.Align.CENTER,
            valign: Gtk.Align.CENTER
        });

        // Always show client icon in button
        const clientIcon = new Gtk.Image({
            icon_name: 'contact-new-symbolic',
            pixel_size: 16
        });
        dropdownButton.set_child(clientIcon);

        // Update tooltip
        this._updateTooltip(dropdownButton);

        // Create popover for search dropdown
        const popover = new Gtk.Popover({
            width_request: 300,
            height_request: 250
        });

        // Create search entry
        const searchEntry = new Gtk.SearchEntry({
            placeholder_text: PLACEHOLDER.SEARCH_CLIENTS,
            margin_top: 6,
            margin_bottom: 6,
            margin_start: 6,
            margin_end: 6
        });

        // Create scrolled list
        const scrolled = new Gtk.ScrolledWindow({
            vexpand: true,
            hscrollbar_policy: Gtk.PolicyType.NEVER,
            vscrollbar_policy: Gtk.PolicyType.AUTOMATIC
        });

        // Create list box for clients
        this.clientList = new Gtk.ListBox({
            css_classes: ['content-box'],
            selection_mode: Gtk.SelectionMode.NONE
        });

        // Connect row activation signal to the ListBox
        this.clientList.connect('row-activated', (listBox, row) => {
            if (this.isUpdatingSelection) return;
            
            const client = row.clientData;
            if (client) {
                this.currentClientId = client.id;
                this._updateTooltip(this.dropdownButton);
                this._populateClientList(); // Refresh to show new selection
                
                if (this.onClientSelected) {
                    this.onClientSelected(client);
                }
                
                this.popover.popdown();
            }
        });

        scrolled.set_child(this.clientList);

        // Popover content
        const popoverContent = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL
        });
        popoverContent.append(searchEntry);
        popoverContent.append(scrolled);
        
        popover.set_child(popoverContent);
        popover.set_parent(dropdownButton);

        // Connect button to show popover
        dropdownButton.connect('clicked', () => {
            popover.popup();
            searchEntry.grab_focus();
        });

        // Connect search functionality
        searchEntry.connect('search-changed', () => {
            this._filterClients(searchEntry.get_text());
        });

        // Store references
        this.dropdownButton = dropdownButton;
        this.popover = popover;
        this.searchEntry = searchEntry;

        // Populate list
        this._populateClientList();

        container.append(dropdownButton);
        return container;
    }

    _updateTooltip(button) {
        const currentClient = this.clients.find(c => c.id === this.currentClientId);
        if (currentClient) {
            const rate = currentClient.rate || 0;
            const currency = currentClient.currency || 'EUR';
            const currencySymbol = getCurrencySymbol(currency);
            const priceText = rate > 0 ? `${currencySymbol}${rate}/hr` : 'Free';
            button.set_tooltip_text(`Client: ${currentClient.name} • ${priceText}`);
        } else {
            button.set_tooltip_text('Select client');
        }
    }

    _populateClientList() {
        // Clear existing rows
        let child = this.clientList.get_first_child();
        while (child) {
            const next = child.get_next_sibling();
            this.clientList.remove(child);
            child = next;
        }

        // Add all clients
        this.clients.forEach(client => {
            this._addClientRow(client);
        });
    }

    _addClientRow(client) {
        const row = new Gtk.ListBoxRow();
        
        const box = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 12,
            margin_top: 6,
            margin_bottom: 6,
            margin_start: 12,
            margin_end: 12
        });

        // Client info
        const infoBox = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 2,
            hexpand: true
        });

        const nameLabel = new Gtk.Label({
            label: client.name,
            halign: Gtk.Align.START
        });

        const rate = client.rate || 0;
        const currency = client.currency || 'EUR';
        const currencySymbol = getCurrencySymbol(currency);
        const priceText = rate > 0 ? `${currencySymbol}${rate}/hr` : 'Free';
        
        const priceLabel = new Gtk.Label({
            label: priceText,
            css_classes: ['caption', 'dim-label'],
            halign: Gtk.Align.START
        });

        infoBox.append(nameLabel);
        infoBox.append(priceLabel);

        box.append(infoBox);

        // Mark current selection
        if (client.id === this.currentClientId) {
            const checkIcon = new Gtk.Image({
                icon_name: 'object-select-symbolic',
                pixel_size: 16
            });
            box.append(checkIcon);
        }

        row.set_child(box);
        row.set_activatable(true);
        
        // Store client data for filtering and selection
        row.clientData = client;
        
        this.clientList.append(row);
    }

    _filterClients(searchText) {
        const lowerSearch = searchText.toLowerCase();
        
        let child = this.clientList.get_first_child();
        while (child) {
            const clientData = child.clientData;
            if (clientData) {
                const matches = clientData.name.toLowerCase().includes(lowerSearch);
                child.set_visible(matches);
            }
            child = child.get_next_sibling();
        }
    }

    /**
     * Update clients list and refresh dropdown
     */
    updateClients(clients, currentClientId = null) {
        this.clients = clients;
        if (currentClientId !== null) {
            this.currentClientId = currentClientId;
        }
        this._updateTooltip(this.dropdownButton);
        this._populateClientList();
    }

    /**
     * Update clients list and refresh dropdown without triggering selection callbacks
     */
    updateClientsQuietly(clients, currentClientId = null) {
        this.isUpdatingSelection = true;
        this.clients = clients;
        if (currentClientId !== null) {
            this.currentClientId = currentClientId;
        }
        this._updateTooltip(this.dropdownButton);
        this._populateClientList();
        this.isUpdatingSelection = false;
    }

    /**
     * Get the current selected client
     */
    getSelectedClient() {
        return this.clients.find(c => c.id === this.currentClientId) || null;
    }

    /**
     * Set selected client by ID
     */
    setSelectedClient(clientId) {
        // Only update if value actually changed to avoid unnecessary UI redraws
        if (clientId === this.currentClientId) return;

        this.isUpdatingSelection = true;
        this.currentClientId = clientId;
        this._updateTooltip(this.dropdownButton);
        // Only repopulate list if dropdown is visible (open) - otherwise just update button
        if (this.popover && this.popover.get_visible()) {
            this._populateClientList();
        }
        this.isUpdatingSelection = false;
    }

    /**
     * Get the GTK widget
     */
    getWidget() {
        return this.dropdown;
    }
}
