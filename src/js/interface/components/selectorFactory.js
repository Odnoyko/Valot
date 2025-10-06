import Gtk from 'gi://Gtk';
import Adw from 'gi://Adw';
import { WidgetFactory } from './widgetFactory.js';
import { BUTTON } from 'resource:///com/odnoyko/valot/js/func/global/commonStrings.js';

/**
 * Factory for creating reusable selector dialogs and components
 */
export class SelectorFactory {

    /**
     * Creates a standardized enhanced selector dialog
     * Used for both project and client selection
     */
    static createEnhancedSelector(config = {}) {
        const {
            title = 'Select Item',
            subtitle = 'Choose an item',
            searchPlaceholder = 'Search...',
            items = [],
            currentItemId = null,
            onItemSelected = null,
            renderItem = null,
            filterItems = null
        } = config;

        const dialog = new Adw.AlertDialog({
            heading: title,
            body: subtitle
        });

        // Create search container
        const searchBox = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 12
        });

        const searchEntry = new Gtk.SearchEntry({
            placeholder_text: searchPlaceholder,
            width_request: 300
        });

        // Create scrolled list
        const scrolled = new Gtk.ScrolledWindow({
            width_request: 300,
            height_request: 250
        });

        const listBox = new Gtk.ListBox({
            css_classes: ['boxed-list']
        });

        // Function to populate list
        const populateList = (searchTerm = '') => {
            // Clear existing rows
            this._clearListBox(listBox);

            if (items.length === 0) {
                const noItemsRow = new Adw.ActionRow({
                    title: _('No items available'),
                    subtitle: _('Go to the appropriate page to add items'),
                    sensitive: false
                });
                listBox.append(noItemsRow);
                return;
            }

            // Filter items
            const filteredItems = filterItems ? 
                filterItems(items, searchTerm) : 
                items.filter(item => 
                    (item.name && item.name.toLowerCase().includes(searchTerm.toLowerCase())) ||
                    (item.email && item.email.toLowerCase().includes(searchTerm.toLowerCase()))
                );

            filteredItems.forEach(item => {
                const row = renderItem ? renderItem(item, currentItemId) : this._renderDefaultItem(item, currentItemId);
                
                row.connect('activated', () => {
                    if (onItemSelected) {
                        onItemSelected(item);
                    }
                    dialog.close();
                });

                listBox.append(row);
            });
        };

        // Initial populate
        populateList();

        // Search functionality
        searchEntry.connect('search-changed', () => {
            populateList(searchEntry.get_text());
        });

        searchBox.append(searchEntry);
        scrolled.set_child(listBox);
        searchBox.append(scrolled);

        dialog.set_extra_child(searchBox);
        dialog.add_response('cancel', BUTTON.CANCEL);

        return dialog;
    }

    /**
     * Creates project selector dialog
     */
    static createProjectSelector(projects, currentProjectId, onProjectSelected) {
        return this.createEnhancedSelector({
            title: _('Select Project'),
            subtitle: _('Choose a project for time tracking'),
            searchPlaceholder: 'Search projects...',
            items: projects,
            currentItemId: currentProjectId,
            onItemSelected: onProjectSelected,
            renderItem: (project, currentId) => this._renderProjectItem(project, currentId),
            filterItems: (items, searchTerm) => items.filter(project =>
                project.name.toLowerCase().includes(searchTerm.toLowerCase())
            )
        });
    }

    /**
     * Creates client selector dialog
     */
    static createClientSelector(clients, currentClientId, onClientSelected) {
        return this.createEnhancedSelector({
            title: _('Select Client'),
            subtitle: _('Choose a client for time tracking'),
            searchPlaceholder: 'Search clients...',
            items: clients,
            currentItemId: currentClientId,
            onItemSelected: onClientSelected,
            renderItem: (client, currentId) => this._renderClientItem(client, currentId),
            filterItems: (items, searchTerm) => items.filter(client =>
                client.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                (client.email && client.email.toLowerCase().includes(searchTerm.toLowerCase()))
            )
        });
    }

    /**
     * Creates icon/color selection grid
     */
    static createSelectionGrid(config = {}) {
        const {
            items = [],
            selectedItem = null,
            columns = 6,
            onItemSelected = null,
            renderItem = null
        } = config;

        const grid = new Gtk.Grid({
            column_spacing: 6,
            row_spacing: 6,
            margin_bottom: 12
        });

        let selection = selectedItem;

        items.forEach((item, index) => {
            const button = renderItem ? renderItem(item, selectedItem) : this._renderDefaultGridItem(item, selectedItem);
            
            button.connect('clicked', () => {
                selection = item;
                if (onItemSelected) {
                    onItemSelected(item);
                }
                
                // Update visual selection
                this._updateGridSelection(grid, index, items.length, columns);
            });

            const row = Math.floor(index / columns);
            const col = index % columns;
            grid.attach(button, col, row, 1, 1);
        });

        return { grid, selection };
    }

    /**
     * Creates icon selection dialog with tabs
     */
    static createIconSelector(config = {}) {
        const {
            project = null,
            icons = [],
            emojis = [],
            onIconSelected = null
        } = config;

        const dialog = new Adw.AlertDialog({
            heading: _('Select Icon'),
            body: _('Choose an appropriate icon or emoji')
        });

        // Main container
        const mainContainer = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 12,
            margin_top: 16,
            margin_bottom: 16,
            margin_start: 16,
            margin_end: 16
        });

        // Icon type selector
        const typeSelector = this._createIconTypeSelector();
        mainContainer.append(typeSelector.widget);

        // Content area
        const contentArea = new Gtk.Stack({
            transition_type: Gtk.StackTransitionType.SLIDE_LEFT_RIGHT
        });

        // Icons page
        const iconsPage = this._createIconsPage(icons, (iconName) => {
            if (onIconSelected) {
                onIconSelected(iconName);
            }
            dialog.close();
        });

        // Emojis page  
        const emojisPage = this._createEmojisPage(emojis, (emoji) => {
            if (onIconSelected) {
                onIconSelected(`emoji:${emoji}`);
            }
            dialog.close();
        });

        contentArea.add_titled(iconsPage, 'icons', 'Icons');
        contentArea.add_titled(emojisPage, 'emojis', 'Emojis');
        
        // Connect type selector to stack
        typeSelector.iconsButton.connect('toggled', () => {
            if (typeSelector.iconsButton.get_active()) {
                contentArea.set_visible_child_name('icons');
            }
        });

        typeSelector.emojiButton.connect('toggled', () => {
            if (typeSelector.emojiButton.get_active()) {
                contentArea.set_visible_child_name('emojis');
            }
        });

        mainContainer.append(contentArea);

        dialog.set_extra_child(mainContainer);
        dialog.add_response('cancel', BUTTON.CANCEL);

        return dialog;
    }

    // Private helper methods

    static _clearListBox(listBox) {
        let child = listBox.get_first_child();
        while (child) {
            const next = child.get_next_sibling();
            listBox.remove(child);
            child = next;
        }
    }

    static _renderProjectItem(project, currentProjectId) {
        const row = new Adw.ActionRow({
            title: project.name,
            subtitle: `Total time: ${this._formatDuration(project.totalTime)}`,
            activatable: true
        });

        // Project color circle with icon
        const circleContainer = this._createProjectCircle(project);
        row.add_prefix(circleContainer);

        // Selected indicator
        if (project.id === currentProjectId) {
            row.add_css_class('selected-project');
            const checkIcon = new Gtk.Image({
                icon_name: 'emblem-ok-symbolic',
                pixel_size: 16,
                css_classes: ['accent']
            });
            row.add_suffix(checkIcon);
        }

        return row;
    }

    static _renderClientItem(client, currentClientId) {
        const currencySymbol = WidgetFactory.getCurrencySymbol(client.currency || 'EUR');

        const row = new Adw.ActionRow({
            title: client.name,
            subtitle: `${client.email || ''} • ${currencySymbol}${client.rate || 0}/hour`,
            activatable: true
        });

        // Currency indicator
        const currencyLabel = new Gtk.Label({
            label: currencySymbol,
            css_classes: ['title-4', 'currency-indicator'],
            width_request: 32,
            halign: Gtk.Align.CENTER
        });

        this._applyCurrencyStyle(currencyLabel);
        row.add_prefix(currencyLabel);

        // Selected indicator
        if (client.id === currentClientId) {
            row.add_css_class('selected-client');
            const checkIcon = new Gtk.Image({
                icon_name: 'emblem-ok-symbolic',
                pixel_size: 16,
                css_classes: ['accent']
            });
            row.add_suffix(checkIcon);
        }

        return row;
    }

    static _createProjectCircle(project) {
        const circleContainer = new Gtk.Box({
            width_request: 32,
            height_request: 32,
            halign: Gtk.Align.CENTER,
            valign: Gtk.Align.CENTER
        });
        
        const overlay = new Gtk.Overlay();

        // Background circle
        const colorCircle = new Gtk.DrawingArea({
            width_request: 28,
            height_request: 28
        });

        const circleColor = project.color || '#6b7280';
        this._drawProjectCircle(colorCircle, circleColor);

        // Icon
        const iconWidget = WidgetFactory.createProjectIconWidget(project);
        
        overlay.set_child(colorCircle);
        overlay.add_overlay(iconWidget);
        circleContainer.append(overlay);

        return circleContainer;
    }

    static _drawProjectCircle(drawingArea, color) {
        drawingArea.set_draw_func((area, cr, width, height) => {
            // Parse color
            let r, g, b;
            if (color.startsWith('#')) {
                const hex = color.slice(1);
                r = parseInt(hex.substr(0, 2), 16) / 255;
                g = parseInt(hex.substr(2, 2), 16) / 255;
                b = parseInt(hex.substr(4, 2), 16) / 255;
            } else {
                r = g = b = 0.42; // Fallback gray
            }

            // Draw circle
            const centerX = width / 2;
            const centerY = height / 2;
            const radius = Math.min(width, height) / 2 - 1;

            cr.arc(centerX, centerY, radius, 0, 2 * Math.PI);
            cr.setSourceRGBA(r, g, b, 1.0);
            cr.fill();

            // Add border
            cr.arc(centerX, centerY, radius, 0, 2 * Math.PI);
            cr.setSourceRGBA(0, 0, 0, 0.2);
            cr.setLineWidth(1);
            cr.stroke();
        });
    }

    static _applyCurrencyStyle(label) {
        const css = `
            .currency-indicator {
                background: alpha(@accent_color, 0.1);
                border: 1px solid alpha(@accent_color, 0.3);
                border-radius: 4px;
                padding: 2px 4px;
                min-height: 20px;
            }
        `;
        // Reuse shared provider for currency styles
        if (!this._sharedCurrencyProvider) {
            this._sharedCurrencyProvider = new Gtk.CssProvider();
            this._sharedCurrencyProvider.load_from_string(css);
        }
        label.get_style_context().add_provider(this._sharedCurrencyProvider, Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION);
    }

    static _createIconTypeSelector() {
        const typeBox = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 0,
            css_classes: ['linked'],
            halign: Gtk.Align.CENTER,
            margin_bottom: 12
        });

        const iconsButton = new Gtk.ToggleButton({
            label: _('Icons'),
            active: true
        });

        const emojiButton = new Gtk.ToggleButton({
            label: _('Emoji')
        });

        // Group toggle buttons
        iconsButton.connect('toggled', () => {
            if (iconsButton.get_active()) {
                emojiButton.set_active(false);
            }
        });

        emojiButton.connect('toggled', () => {
            if (emojiButton.get_active()) {
                iconsButton.set_active(false);
            }
        });

        typeBox.append(iconsButton);
        typeBox.append(emojiButton);

        return {
            widget: typeBox,
            iconsButton,
            emojiButton
        };
    }

    static _createIconsPage(icons, onIconSelected) {
        const scrolled = new Gtk.ScrolledWindow({
            hscrollbar_policy: Gtk.PolicyType.NEVER,
            vscrollbar_policy: Gtk.PolicyType.AUTOMATIC,
            min_content_width: 400,
            min_content_height: 300
        });

        const grid = new Gtk.Grid({
            column_spacing: 4,
            row_spacing: 4,
            margin_top: 8,
            margin_bottom: 8,
            margin_start: 8,
            margin_end: 8,
            column_homogeneous: true
        });

        icons.forEach((iconName, index) => {
            const button = new Gtk.Button({
                width_request: 48,
                height_request: 48,
                css_classes: ['flat']
            });
            
            const icon = new Gtk.Image({
                icon_name: iconName,
                pixel_size: 24
            });
            button.set_child(icon);
            
            button.connect('clicked', () => onIconSelected(iconName));
            
            grid.attach(button, index % 8, Math.floor(index / 8), 1, 1);
        });

        scrolled.set_child(grid);
        return scrolled;
    }

    static _createEmojisPage(emojis, onEmojiSelected) {
        const scrolled = new Gtk.ScrolledWindow({
            hscrollbar_policy: Gtk.PolicyType.NEVER,
            vscrollbar_policy: Gtk.PolicyType.AUTOMATIC,
            min_content_width: 400,
            min_content_height: 300
        });

        const grid = new Gtk.Grid({
            column_spacing: 4,
            row_spacing: 4,
            margin_top: 8,
            margin_bottom: 8,
            margin_start: 8,
            margin_end: 8,
            column_homogeneous: true
        });

        emojis.forEach((emoji, index) => {
            const button = new Gtk.Button({
                label: emoji,
                width_request: 48,
                height_request: 48,
                css_classes: ['flat']
            });
            
            button.connect('clicked', () => onEmojiSelected(emoji));
            
            grid.attach(button, index % 8, Math.floor(index / 8), 1, 1);
        });

        scrolled.set_child(grid);
        return scrolled;
    }

    static _formatDuration(seconds) {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;
        return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }

    static _updateGridSelection(grid, selectedIndex, totalItems, columns) {
        // Update visual selection for grid items
        for (let i = 0; i < totalItems; i++) {
            const row = Math.floor(i / columns);
            const col = i % columns;
            const button = grid.get_child_at(col, row);
            
            if (button) {
                button.remove_css_class('selected');
                if (i === selectedIndex) {
                    button.add_css_class('selected');
                }
            }
        }
    }

    static _renderDefaultItem(item, currentId) {
        return new Adw.ActionRow({
            title: item.name || 'Unknown',
            subtitle: item.description || '',
            activatable: true
        });
    }

    static _renderDefaultGridItem(item, selectedItem) {
        return new Gtk.Button({
            label: item.toString(),
            css_classes: selectedItem === item ? ['suggested-action'] : ['flat']
        });
    }
}
