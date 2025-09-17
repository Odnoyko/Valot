import Gtk from 'gi://Gtk';
import Adw from 'gi://Adw';

/**
 * Manages pagination functionality across different entity types
 */
export class PaginationManager {
    constructor(parentWindow) {
        this.parentWindow = parentWindow;
        this.configs = new Map();
    }

    /**
     * Register a pagination configuration for an entity type
     */
    registerPagination(entityType, config) {
        const {
            prevButton,
            nextButton,
            pageInfo,
            currentPageProperty,
            itemsPerPageProperty,
            allItemsProperty,
            filteredItemsProperty,
            displayMethod
        } = config;

        this.configs.set(entityType, config);

        // Set up event handlers
        prevButton.connect('clicked', () => {
            this.goToPreviousPage(entityType);
        });

        nextButton.connect('clicked', () => {
            this.goToNextPage(entityType);
        });
    }

    goToPreviousPage(entityType) {
        const config = this.configs.get(entityType);
        if (!config) return;

        if (this.parentWindow[config.currentPageProperty] > 0) {
            this.parentWindow[config.currentPageProperty]--;
            this.parentWindow[config.displayMethod]();
        }
    }

    goToNextPage(entityType) {
        const config = this.configs.get(entityType);
        if (!config) return;

        const totalPages = this.getTotalPages(entityType);
        if (this.parentWindow[config.currentPageProperty] < totalPages - 1) {
            this.parentWindow[config.currentPageProperty]++;
            this.parentWindow[config.displayMethod]();
        }
    }

    getTotalPages(entityType) {
        const config = this.configs.get(entityType);
        if (!config) return 0;

        const totalItems = this.parentWindow[config.filteredItemsProperty].length;
        const itemsPerPage = this.parentWindow[config.itemsPerPageProperty];
        return Math.ceil(totalItems / itemsPerPage);
    }

    updatePaginationControls(entityType) {
        const config = this.configs.get(entityType);
        if (!config) return;

        const currentPage = this.parentWindow[config.currentPageProperty];
        const totalPages = this.getTotalPages(entityType);
        const totalItems = this.parentWindow[config.filteredItemsProperty].length;

        // Update button states
        config.prevButton.set_sensitive(currentPage > 0);
        config.nextButton.set_sensitive(currentPage < totalPages - 1);

        // Update page info label
        if (totalPages === 0) {
            config.pageInfo.set_label('No items');
        } else {
            config.pageInfo.set_label(`Page ${currentPage + 1} of ${totalPages} (${totalItems} items)`);
        }
    }
}

/**
 * Manages navigation and sidebar functionality
 */
export class NavigationManager {
    constructor(parentWindow, useTransitions = false) {
        this.parentWindow = parentWindow;
        this.sidebarButtons = [];
        this.useTransitions = useTransitions;
        this.pageMap = {}; // Will be set by parent window
    }

    /**
     * Register multiple sidebar toggle buttons
     */
    registerSidebarButtons(buttons) {
        this.sidebarButtons = buttons;
        buttons.forEach(button => {
            button.connect('clicked', () => this.showSidebar());
        });
    }

    showSidebar() {
        this.parentWindow._split_view.set_show_sidebar(true);
    }

    hideSidebar() {
        this.parentWindow._split_view.set_show_sidebar(false);
    }

    /**
     * Set page mapping for instant navigation
     */
    setPageMap(pageMap) {
        this.pageMap = pageMap;
    }

    navigateToPage(pageName) {
        try {
            if (this.useTransitions) {
                this.parentWindow._main_content.push_by_tag(pageName);
            } else {
                // Instant navigation without transitions - use replace method
                const targetPage = this.pageMap[pageName];
                if (targetPage) {
                    this.parentWindow._main_content.replace([targetPage]);
                } else {
                    console.error(`Navigation error: Page '${pageName}' not found in pageMap.`);
                }
            }
        } catch (error) {
            console.error(`Navigation error for ${pageName}:`, error);
            // Fallback for instant navigation
            if (!this.useTransitions && this.pageMap[pageName]) {
                try {
                    this.parentWindow._main_content.add(this.pageMap[pageName]);
                    this.parentWindow._main_content.set_visible_page(this.pageMap[pageName]);
                } catch (fallbackError) {
                    console.error(`Fallback navigation failed for ${pageName}:`, fallbackError);
                }
            }
        }
    }

    setupSidebarNavigation(navigationItems) {
        navigationItems.forEach(item => {
            item.row.connect('activated', () => {
                this.navigateToPage(item.pageTag);
            });
        });
    }
}

/**
 * Manages tracking widget synchronization across different pages
 */
export class TrackingWidgetManager {
    constructor(parentWindow) {
        this.parentWindow = parentWindow;
        this.widgets = [];
    }

    /**
     * Register tracking widgets for synchronization
     */
    registerTrackingWidgets(widgetConfigs) {
        this.widgets = widgetConfigs;
        this.setupSynchronization();
    }

    setupSynchronization() {
        this.widgets.forEach((widget, index) => {
            // Sync task name inputs
            widget.taskNameInput.connect('changed', () => {
                this.syncTaskName(index);
            });

            // Register with tracking state manager
            if (this.parentWindow.trackingStateManager) {
                this.parentWindow.trackingStateManager.registerTrackingButton(
                    widget.trackButton, 
                    null, 
                    widget.taskNameInput
                );
                this.parentWindow.trackingStateManager.registerTimeLabel(widget.timeLabel);
            }
        });
    }

    syncTaskName(changedIndex) {
        const changedWidget = this.widgets[changedIndex];
        const newValue = changedWidget.taskNameInput.get_text();

        // Update all other widgets
        this.widgets.forEach((widget, index) => {
            if (index !== changedIndex) {
                widget.taskNameInput.set_text(newValue);
            }
        });
    }

    syncAllWidgets() {
        if (this.widgets.length === 0) return;

        const referenceWidget = this.widgets[0];
        const taskName = referenceWidget.taskNameInput.get_text();

        this.widgets.slice(1).forEach(widget => {
            widget.taskNameInput.set_text(taskName);
        });
    }

    updateProjectButtons(projectName) {
        this.widgets.forEach(widget => {
            if (widget.projectButton) {
                widget.projectButton.set_tooltip_text(`Project: ${projectName}`);
            }
        });
    }

    updateClientButtons(clientName) {
        this.widgets.forEach(widget => {
            if (widget.clientButton) {
                widget.clientButton.set_tooltip_text(`Client: ${clientName}`);
            }
        });
    }
}

/**
 * Manages dialog creation with consistent templates
 */
export class DialogManager {
    static createEntityDialog(config = {}) {
        const {
            title = 'Add Item',
            subtitle = 'Create a new item',
            width = 400,
            height = 300
        } = config;

        const dialog = new Adw.AlertDialog({
            heading: title,
            body: subtitle
        });

        return dialog;
    }

    static createFormContainer() {
        return new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 12,
            margin_top: 12,
            margin_bottom: 12,
            margin_start: 12,
            margin_end: 12
        });
    }

    static createFormField(label, widget) {
        const container = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 6
        });

        if (label) {
            container.append(new Gtk.Label({
                label: label,
                halign: Gtk.Align.START
            }));
        }

        container.append(widget);
        return container;
    }

    static createSearchContainer() {
        return new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 12
        });
    }

    static createScrolledList(width = 300, height = 250) {
        const scrolled = new Gtk.ScrolledWindow({
            width_request: width,
            height_request: height
        });

        const listBox = new Gtk.ListBox({
            css_classes: ['boxed-list']
        });

        scrolled.set_child(listBox);
        return { scrolled, listBox };
    }
}

/**
 * Configuration constants for the application
 */
export class WindowConfig {
    static get PAGINATION_CONFIG() {
        return {
            ITEMS_PER_PAGE: 50,
            DEFAULT_PAGE_SIZE: 20
        };
    }

    static get PROJECT_COLORS() {
        return [
            { name: 'Blue', value: '#3b82f6', textColor: 'white' },
            { name: 'Green', value: '#10b981', textColor: 'white' },
            { name: 'Purple', value: '#8b5cf6', textColor: 'white' },
            { name: 'Pink', value: '#ec4899', textColor: 'white' },
            { name: 'Yellow', value: '#f59e0b', textColor: 'black' },
            { name: 'Red', value: '#ef4444', textColor: 'white' },
            { name: 'Indigo', value: '#6366f1', textColor: 'white' },
            { name: 'Teal', value: '#14b8a6', textColor: 'white' },
            { name: 'Orange', value: '#f97316', textColor: 'white' },
            { name: 'Gray', value: '#6b7280', textColor: 'white' },
            { name: 'Cyan', value: '#06b6d4', textColor: 'white' },
            { name: 'Lime', value: '#84cc16', textColor: 'black' },
            { name: 'Amber', value: '#f59e0b', textColor: 'black' },
            { name: 'Emerald', value: '#059669', textColor: 'white' },
            { name: 'Rose', value: '#f43f5e', textColor: 'white' },
            { name: 'Slate', value: '#475569', textColor: 'white' }
        ];
    }

    static get PROJECT_ICONS() {
        return [
            'folder-symbolic',
            'applications-development-symbolic',
            'applications-multimedia-symbolic',
            'applications-graphics-symbolic',
            'document-edit-symbolic',
            'emblem-favorite-symbolic',
            'folder-documents-symbolic',
            'folder-pictures-symbolic',
            'folder-music-symbolic',
            'folder-videos-symbolic',
            'applications-games-symbolic',
            'applications-internet-symbolic',
            'applications-office-symbolic',
            'applications-system-symbolic',
            'applications-utilities-symbolic',
            'folder-download-symbolic',
            'user-desktop-symbolic',
            'folder-templates-symbolic',
            'folder-publicshare-symbolic',
            'emblem-documents-symbolic',
            'folder-remote-symbolic',
            'camera-symbolic',
            'applications-science-symbolic',
            'applications-engineering-symbolic',
            'applications-accessories-symbolic'
        ];
    }

    static get DEFAULT_VALUES() {
        return {
            DEFAULT_PROJECT_ID: 1,
            DEFAULT_CLIENT_ID: 1,
            MIN_TASK_NAME_LENGTH: 3,
            MAX_TASK_NAME_LENGTH: 100
        };
    }
}