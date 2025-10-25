import Gtk from 'gi://Gtk';
import { Button } from './Button.js';
import { Entry } from './Entry.js';
import { getAllIcons } from '../../../data/icons.js';

/**
 * Icon picker component with search and categorized icons
 */
export class IconPicker {
    constructor(config = {}) {
        const defaultConfig = {
            selectedIcon: 'folder-symbolic',
            icons: getAllIcons(),
            columnsPerRow: 8,
            showSearch: true,
            showCategories: true,
            onIconChanged: null,
            cssClasses: ['icon-picker'],
            maxHeight: 300
        };

        this.config = { ...defaultConfig, ...config };
        this.filteredIcons = [...this.config.icons];
        this.selectedButton = null;
        this.currentCategory = 'all';
        this.categoryButtons = new Map();
        
        this.widget = this._createWidget();
        
        if (this.config.showSearch) {
            this._createSearchBar();
        }
        
        if (this.config.showCategories) {
            this._createCategoryBar();
        }
        
        this._createIconGrid();
    }

    _createWidget() {
        const container = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 12
        });

        return container;
    }


    _createSearchBar() {
        this.searchEntry = new Entry({
            placeholderText: _('Search icons...'),
            onChanged: (text) => this._filterIcons(text)
        });

        this.widget.append(this.searchEntry.widget);
    }

    _createCategoryBar() {
        const categoryBox = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 6,
            css_classes: ['category-bar']
        });

        const categories = [
            { id: 'all', label: _('All'), count: this.config.icons.length },
            { id: 'actions', label: _('Actions') },
            { id: 'apps', label: _('Apps') },
            { id: 'devices', label: _('Devices') },
            { id: 'emblems', label: _('Emblems') },
            { id: 'mimetypes', label: _('Files') },
            { id: 'places', label: _('Places') },
            { id: 'status', label: _('Status') }
        ];

        categories.forEach(category => {
            const button = new Button({
                label: category.label,
                cssClasses: category.id === 'all' ? ['category-button', 'suggested-action'] : ['category-button', 'flat'],
                onClick: () => this._selectCategory(category.id)
            });

            this.categoryButtons.set(`category-${category.id}`, button);
            categoryBox.append(button.widget);
        });

        this.widget.append(categoryBox);
    }

    _createIconGrid() {
        // Scrollable container for icons
        const scrolled = new Gtk.ScrolledWindow({
            hexpand: true,
            vexpand: true,
            height_request: this.config.maxHeight,
            css_classes: ['icon-grid-scroll']
        });

        this.iconGrid = new Gtk.FlowBox({
            column_spacing: 6,
            row_spacing: 6,
            homogeneous: true,
            max_children_per_line: this.config.columnsPerRow,
            selection_mode: Gtk.SelectionMode.NONE
        });

        scrolled.set_child(this.iconGrid);
        this.widget.append(scrolled);

        this._populateIconGrid();
    }

    _populateIconGrid() {
        // Clear existing icons
        let child = this.iconGrid.get_first_child();
        while (child) {
            const next = child.get_next_sibling();
            this.iconGrid.remove(child);
            child = next;
        }

        // Add filtered icons
        this.filteredIcons.forEach(iconName => {
            const button = new Button({
                iconName: iconName,
                cssClasses: ['flat', 'icon-button'],
                tooltipText: iconName,
                widthRequest: 40,
                heightRequest: 40,
                onClick: () => this._selectIcon(iconName, button)
            });

            // Mark as selected if it matches current selection
            if (iconName === this.config.selectedIcon) {
                button.addClass('selected');
                this.selectedButton = button;
            }

            this.iconGrid.append(button.getWidget());
        });

        // Show empty state if no icons
        if (this.filteredIcons.length === 0) {
            this._showEmptyState();
        }
    }

    _showEmptyState() {
        const emptyBox = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 12,
            halign: Gtk.Align.CENTER,
            valign: Gtk.Align.CENTER,
            margin_top: 40,
            margin_bottom: 40
        });

        const emptyIcon = new Gtk.Image({
            icon_name: 'edit-find-symbolic',
            pixel_size: 48,
            css_classes: ['dim-label']
        });

        const emptyLabel = new Gtk.Label({
            label: _('No icons found'),
            css_classes: ['heading']
        });

        const emptyHint = new Gtk.Label({
            label: _('Try adjusting your search or category filter'),
            css_classes: ['dim-label']
        });

        emptyBox.append(emptyIcon);
        emptyBox.append(emptyLabel);
        emptyBox.append(emptyHint);
        
        this.iconGrid.append(emptyBox);
    }

    _filterIcons(searchText) {
        const query = searchText.toLowerCase().trim();
        
        if (!query) {
            this.filteredIcons = this._getIconsForCategory(this.currentCategory);
        } else {
            const categoryIcons = this._getIconsForCategory(this.currentCategory);
            this.filteredIcons = categoryIcons.filter(icon => 
                icon.toLowerCase().includes(query)
            );
        }

        this._populateIconGrid();
        this._emit('iconsFiltered', {
            query: searchText,
            category: this.currentCategory,
            count: this.filteredIcons.length
        });
    }

    _selectCategory(categoryId) {
        this.currentCategory = categoryId;

        // Update category button states
        const categories = ['all', 'actions', 'apps', 'devices', 'emblems', 'mimetypes', 'places', 'status'];
        categories.forEach(cat => {
            const button = this.categoryButtons.get(`category-${cat}`);
            if (button) {
                if (cat === categoryId) {
                    button.addClass('suggested-action');
                    button.removeClass('flat');
                } else {
                    button.removeClass('suggested-action');
                    button.addClass('flat');
                }
            }
        });

        // Filter icons by category
        const searchText = this.searchEntry ? this.searchEntry.getText() : '';
        this._filterIcons(searchText);
    }

    _getIconsForCategory(categoryId) {
        if (categoryId === 'all') {
            return [...this.config.icons];
        }

        return this.config.icons.filter(icon => {
            const iconLower = icon.toLowerCase();
            switch (categoryId) {
                case 'actions':
                    return iconLower.includes('edit-') || 
                           iconLower.includes('list-') || 
                           iconLower.includes('view-') ||
                           iconLower.includes('media-') ||
                           iconLower.includes('process-');
                case 'apps':
                    return iconLower.includes('applications-') ||
                           iconLower.includes('internet-') ||
                           iconLower.includes('office-') ||
                           iconLower.includes('utilities-');
                case 'devices':
                    return iconLower.includes('computer') ||
                           iconLower.includes('drive-') ||
                           iconLower.includes('input-') ||
                           iconLower.includes('network-') ||
                           iconLower.includes('printer');
                case 'emblems':
                    return iconLower.includes('emblem-');
                case 'mimetypes':
                    return iconLower.includes('application-') ||
                           iconLower.includes('audio-') ||
                           iconLower.includes('image-') ||
                           iconLower.includes('text-') ||
                           iconLower.includes('video-');
                case 'places':
                    return iconLower.includes('folder') ||
                           iconLower.includes('user-') ||
                           iconLower.includes('go-');
                case 'status':
                    return iconLower.includes('dialog-') ||
                           iconLower.includes('security-') ||
                           iconLower.includes('weather-') ||
                           iconLower.includes('battery-') ||
                           iconLower.includes('network-');
                default:
                    return true;
            }
        });
    }

    _selectIcon(iconName, button) {
        // Remove selection from previous button
        if (this.selectedButton) {
            this.selectedButton.removeClass('selected');
        }

        // Mark new button as selected
        button.addClass('selected');
        this.selectedButton = button;

        this.config.selectedIcon = iconName;

        if (this.config.onIconChanged) {
            this.config.onIconChanged(iconName, this);
        }

        this._emit('iconChanged', iconName);
    }

    /**
     * Get selected icon
     */
    getSelectedIcon() {
        return this.config.selectedIcon;
    }

    /**
     * Set selected icon
     */
    setSelectedIcon(iconName) {
        this.config.selectedIcon = iconName;
        this._populateIconGrid();
        this._emit('iconChanged', iconName);
    }

    /**
     * Set available icons
     */
    setIcons(icons) {
        this.config.icons = icons;
        this.filteredIcons = [...icons];
        this._populateIconGrid();
    }

    /**
     * Clear search and reset filters
     */
    clearFilters() {
        if (this.searchEntry) {
            this.searchEntry.clear();
        }
        this._selectCategory('all');
    }

    /**
     * Focus search field
     */
    focusSearch() {
        if (this.searchEntry) {
            this.searchEntry.focus();
        }
    }
}