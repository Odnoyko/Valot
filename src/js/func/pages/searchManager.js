import Gtk from 'gi://Gtk';
import Adw from 'gi://Adw';

/**
 * Manages search and filtering functionality across different entity types
 */
export class SearchManager {
    constructor(parentWindow) {
        this.parentWindow = parentWindow;
        this.searchConfigs = new Map();
        this.activeFilters = new Map();
    }

    /**
     * Register a search configuration for an entity type
     */
    registerSearchConfig(entityType, config) {
        const {
            searchEntry,
            filterDropdown = null,
            listContainer,
            allItemsProperty,
            filteredItemsProperty,
            searchFields = ['name'],
            filterOptions = {},
            renderMethod,
            paginationUpdate = null
        } = config;

        this.searchConfigs.set(entityType, config);
        this.activeFilters.set(entityType, {
            searchTerm: '',
            selectedFilter: filterOptions.default || 'all'
        });

        // Setup search entry
        searchEntry.connect('search-changed', () => {
            const searchTerm = searchEntry.get_text().toLowerCase();
            this.updateFilter(entityType, 'searchTerm', searchTerm);
            this.applyFilters(entityType);
        });

        // Setup filter dropdown if provided
        if (filterDropdown) {
            filterDropdown.connect('notify::selected', () => {
                const selectedIndex = filterDropdown.get_selected();
                const filterKeys = Object.keys(filterOptions.filters || {});
                const selectedFilter = filterKeys[selectedIndex] || 'all';
                this.updateFilter(entityType, 'selectedFilter', selectedFilter);
                this.applyFilters(entityType);
            });
        }

    }

    /**
     * Update a specific filter for an entity type
     */
    updateFilter(entityType, filterKey, value) {
        const filters = this.activeFilters.get(entityType);
        if (filters) {
            filters[filterKey] = value;
            this.activeFilters.set(entityType, filters);
        }
    }

    /**
     * Apply all active filters for an entity type
     */
    applyFilters(entityType) {
        const config = this.searchConfigs.get(entityType);
        const filters = this.activeFilters.get(entityType);
        
        if (!config || !filters) return;

        const allItems = this.parentWindow[config.allItemsProperty] || [];
        let filteredItems = [...allItems];

        // Apply search filter
        if (filters.searchTerm) {
            filteredItems = this.applySearchFilter(filteredItems, filters.searchTerm, config.searchFields);
        }

        // Apply dropdown filter
        if (filters.selectedFilter && filters.selectedFilter !== 'all') {
            filteredItems = this.applyDropdownFilter(filteredItems, filters.selectedFilter, config.filterOptions);
        }

        // Update filtered items
        this.parentWindow[config.filteredItemsProperty] = filteredItems;

        // Re-render the list
        this.parentWindow[config.renderMethod]();

        // Update pagination if needed
        if (config.paginationUpdate && this.parentWindow.paginationManager) {
            this.parentWindow.paginationManager.updatePaginationControls(entityType);
        }

    }

    /**
     * Apply search term filtering
     */
    applySearchFilter(items, searchTerm, searchFields) {
        if (!searchTerm) return items;

        return items.filter(item => {
            return searchFields.some(field => {
                const value = this.getNestedProperty(item, field);
                return value && value.toString().toLowerCase().includes(searchTerm);
            });
        });
    }

    /**
     * Apply dropdown filtering
     */
    applyDropdownFilter(items, filterKey, filterOptions) {
        if (!filterOptions.filters || !filterOptions.filters[filterKey]) {
            return items;
        }

        const filterFunction = filterOptions.filters[filterKey];
        return items.filter(filterFunction);
    }

    /**
     * Create a standardized search bar with optional filter dropdown
     */
    createSearchBar(config = {}) {
        const {
            placeholder = 'Search...',
            hasFilter = false,
            filterOptions = [],
            onSearchChanged = null,
            onFilterChanged = null
        } = config;

        const container = new Gtk.Box({
            spacing: hasFilter ? 12 : 0,
            margin_bottom: 12
        });

        // Search entry
        const searchEntry = new Gtk.SearchEntry({
            placeholder_text: placeholder,
            hexpand: true
        });

        if (onSearchChanged) {
            searchEntry.connect('search-changed', () => {
                onSearchChanged(searchEntry.get_text());
            });
        }

        container.append(searchEntry);

        // Filter dropdown
        let filterDropdown = null;
        if (hasFilter && filterOptions.length > 0) {
            const stringList = new Gtk.StringList();
            filterOptions.forEach(option => stringList.append(option));

            filterDropdown = new Gtk.DropDown({
                model: stringList,
                selected: 0
            });

            if (onFilterChanged) {
                filterDropdown.connect('notify::selected', () => {
                    const selectedIndex = filterDropdown.get_selected();
                    onFilterChanged(filterOptions[selectedIndex], selectedIndex);
                });
            }

            container.append(filterDropdown);
        }

        return {
            container,
            searchEntry,
            filterDropdown
        };
    }

    /**
     * Reset all filters for an entity type
     */
    resetFilters(entityType) {
        const config = this.searchConfigs.get(entityType);
        if (!config) return;

        // Reset search entry
        config.searchEntry.set_text('');

        // Reset filter dropdown
        if (config.filterDropdown) {
            config.filterDropdown.set_selected(0);
        }

        // Reset active filters
        this.activeFilters.set(entityType, {
            searchTerm: '',
            selectedFilter: config.filterOptions.default || 'all'
        });

        // Apply empty filters (shows all items)
        this.applyFilters(entityType);
    }

    /**
     * Get current filter status for an entity type
     */
    getFilterStatus(entityType) {
        const filters = this.activeFilters.get(entityType);
        const config = this.searchConfigs.get(entityType);
        
        if (!filters || !config) return null;

        const allItems = this.parentWindow[config.allItemsProperty] || [];
        const filteredItems = this.parentWindow[config.filteredItemsProperty] || [];

        return {
            searchTerm: filters.searchTerm,
            selectedFilter: filters.selectedFilter,
            totalItems: allItems.length,
            filteredItems: filteredItems.length,
            isFiltered: filters.searchTerm !== '' || filters.selectedFilter !== 'all'
        };
    }

    /**
     * Setup common task filtering
     */
    setupTaskFiltering() {
        const taskFilterOptions = {
            default: 'all',
            filters: {
                'all': () => true,
                'today': (task) => {
                    const today = new Date();
                    const taskDate = new Date(task.timestamp);
                    return this.isSameDay(taskDate, today);
                },
                'this_week': (task) => {
                    const now = new Date();
                    const weekStart = new Date(now.setDate(now.getDate() - now.getDay()));
                    const taskDate = new Date(task.timestamp);
                    return taskDate >= weekStart;
                },
                'this_month': (task) => {
                    const now = new Date();
                    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
                    const taskDate = new Date(task.timestamp);
                    return taskDate >= monthStart;
                }
            }
        };

        return taskFilterOptions;
    }

    /**
     * Setup common project filtering
     */
    setupProjectFiltering() {
        const projectFilterOptions = {
            default: 'all',
            filters: {
                'all': () => true,
                'active': (project) => project.isActive !== false,
                'recent': (project) => {
                    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
                    const lastUsed = new Date(project.lastUsed || 0);
                    return lastUsed >= weekAgo;
                },
                'high_usage': (project) => (project.totalTime || 0) > 3600 // > 1 hour
            }
        };

        return projectFilterOptions;
    }

    /**
     * Setup common client filtering
     */
    setupClientFiltering() {
        const clientFilterOptions = {
            default: 'all',
            filters: {
                'all': () => true,
                'active': (client) => client.isActive !== false,
                'high_rate': (client) => (client.rate || 0) > 50,
                'recent': (client) => {
                    const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
                    const lastUsed = new Date(client.lastUsed || 0);
                    return lastUsed >= monthAgo;
                }
            }
        };

        return clientFilterOptions;
    }

    // Helper methods

    /**
     * Get nested property from object (e.g., 'user.name')
     */
    getNestedProperty(obj, path) {
        return path.split('.').reduce((current, key) => {
            return current && current[key] !== undefined ? current[key] : null;
        }, obj);
    }

    /**
     * Check if two dates are on the same day
     */
    isSameDay(date1, date2) {
        return date1.getFullYear() === date2.getFullYear() &&
               date1.getMonth() === date2.getMonth() &&
               date1.getDate() === date2.getDate();
    }

    /**
     * Debounce search input to avoid excessive filtering
     */
    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    /**
     * Create advanced search with multiple criteria
     */
    createAdvancedSearch(config = {}) {
        const {
            criteria = [],
            onSearchChanged = null
        } = config;

        const container = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 8
        });

        const criteriaWidgets = {};

        criteria.forEach(criterion => {
            const { id, label, type, options = [] } = criterion;

            const row = new Gtk.Box({
                spacing: 8,
                margin_bottom: 6
            });

            row.append(new Gtk.Label({
                label: `${label}:`,
                width_request: 100,
                halign: Gtk.Align.START
            }));

            let widget;
            switch (type) {
                case 'text':
                    widget = new Gtk.Entry({
                        placeholder_text: `Search by ${label.toLowerCase()}...`,
                        hexpand: true
                    });
                    break;

                case 'dropdown':
                    const stringList = new Gtk.StringList();
                    options.forEach(option => stringList.append(option));
                    widget = new Gtk.DropDown({
                        model: stringList,
                        selected: 0
                    });
                    break;

                case 'date':
                    // Could be extended with date picker
                    widget = new Gtk.Entry({
                        placeholder_text: 'YYYY-MM-DD',
                        hexpand: true
                    });
                    break;
            }

            if (widget) {
                criteriaWidgets[id] = widget;
                
                // Connect change events
                if (widget instanceof Gtk.Entry) {
                    widget.connect('changed', () => {
                        if (onSearchChanged) {
                            this.gatherAdvancedCriteria(criteriaWidgets, onSearchChanged);
                        }
                    });
                } else if (widget instanceof Gtk.DropDown) {
                    widget.connect('notify::selected', () => {
                        if (onSearchChanged) {
                            this.gatherAdvancedCriteria(criteriaWidgets, onSearchChanged);
                        }
                    });
                }

                row.append(widget);
            }

            container.append(row);
        });

        return {
            container,
            widgets: criteriaWidgets
        };
    }

    gatherAdvancedCriteria(widgets, callback) {
        const criteria = {};
        
        Object.entries(widgets).forEach(([id, widget]) => {
            if (widget instanceof Gtk.Entry) {
                criteria[id] = widget.get_text();
            } else if (widget instanceof Gtk.DropDown) {
                const selected = widget.get_selected();
                const model = widget.get_model();
                criteria[id] = model.get_string(selected);
            }
        });

        callback(criteria);
    }
}