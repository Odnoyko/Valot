import Gtk from 'gi://Gtk';
import Adw from 'gi://Adw';
import { ButtonInterface } from '../../components/primitive/Button.js';
import { EntryInterface } from '../../components/primitive/Entry.js';
import { EMPTY_STATE, LOADING } from 'resource:///com/odnoyko/valot/ui/utils/commonStrings.js';

/**
 * Interface: Projects Page UI Structure
 * Contains all UI elements for the projects page, maps to template widgets
 */
export class ProjectsPageInterface {
    constructor(config = {}) {
        this.config = config;
        
        // Template widget references - these come from window.blp
        this.templateWidgets = {
            projectsPage: config.projectsPage, // From template: projects_page
            projectSearch: config.projectSearch, // From template: project_search
            projectList: config.projectList, // From template: project_list
            addProjectBtn: config.addProjectBtn, // From template: add_project_btn
            prevProjectsPageBtn: config.prevProjectsPageBtn,
            nextProjectsPageBtn: config.nextProjectsPageBtn,
            projectsPageInfo: config.projectsPageInfo
        };

        this.elements = {}; // Custom UI elements we create
        this._initializeInterface();
    }

    _initializeInterface() {
        // Work with existing template structure
        this._setupSearchInterface();
        this._setupProjectsListInterface();
        this._setupPaginationInterface();
        this._setupToolbarInterface();
    }

    _setupSearchInterface() {
        if (this.templateWidgets.projectSearch) {
            // The search entry already exists in template
            // Just store reference and setup any custom behavior needed
            this.elements.searchEntry = this.templateWidgets.projectSearch;
        }
    }

    _setupProjectsListInterface() {
        if (this.templateWidgets.projectList) {
            // The project list container already exists in template
            this.elements.projectsList = this.templateWidgets.projectList;
            
            // Create empty state widget
            this.elements.emptyState = this._createEmptyStateWidget();
            
            // Create loading state widget
            this.elements.loadingState = this._createLoadingStateWidget();
        }
    }

    _setupPaginationInterface() {
        // Pagination widgets already exist in template
        this.elements.pagination = {
            prevButton: this.templateWidgets.prevProjectsPageBtn,
            nextButton: this.templateWidgets.nextProjectsPageBtn,
            pageInfo: this.templateWidgets.projectsPageInfo
        };
    }

    _setupToolbarInterface() {
        if (this.templateWidgets.addProjectBtn) {
            // Add project button already exists
            this.elements.addProjectButton = this.templateWidgets.addProjectBtn;
        }

        // Create additional toolbar elements if needed
        this._createSelectionToolbar();
    }

    _createEmptyStateWidget() {
        const emptyBox = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 12,
            halign: Gtk.Align.CENTER,
            valign: Gtk.Align.CENTER,
            margin_top: 48,
            margin_bottom: 48,
            css_classes: ['empty-state']
        });

        const icon = new Gtk.Image({
            icon_name: 'folder-symbolic',
            pixel_size: 64,
            css_classes: ['dim-label']
        });

        const title = new Gtk.Label({
            label: EMPTY_STATE.NO_PROJECTS,
            css_classes: ['title-2']
        });

        const subtitle = new Gtk.Label({
            label: EMPTY_STATE.CREATE_FIRST_PROJECT,
            css_classes: ['dim-label']
        });

        emptyBox.append(icon);
        emptyBox.append(title);
        emptyBox.append(subtitle);

        return emptyBox;
    }

    _createLoadingStateWidget() {
        const loadingBox = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 12,
            halign: Gtk.Align.CENTER,
            valign: Gtk.Align.CENTER,
            margin_top: 48,
            margin_bottom: 48
        });

        const spinner = new Gtk.Spinner({
            spinning: true,
            width_request: 32,
            height_request: 32
        });

        const label = new Gtk.Label({
            label: LOADING.LOADING_PROJECTS,
            css_classes: ['dim-label']
        });

        loadingBox.append(spinner);
        loadingBox.append(label);

        return loadingBox;
    }

    _createSelectionToolbar() {
        // Create selection toolbar (initially hidden)
        this.elements.selectionToolbar = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 6,
            css_classes: ['toolbar', 'selection-toolbar'],
            visible: false
        });

        this.elements.selectionLabel = new Gtk.Label({
            css_classes: ['dim-label']
        });

        this.elements.deleteSelectedButton = new ButtonInterface({
            iconName: 'edit-delete-symbolic',
            label: _('Delete Selected'),
            cssClasses: ['flat', 'destructive-action']
        });

        this.elements.selectionToolbar.append(this.elements.selectionLabel);
        this.elements.selectionToolbar.append(this.elements.deleteSelectedButton.widget);

        // Add to page (would need to find appropriate container in template)
        // This depends on the actual template structure
    }

    // Interface state management
    showEmptyState() {
        this._clearProjectsList();
        if (this.elements.projectsList) {
            this.elements.projectsList.append(this.elements.emptyState);
        }
    }

    showLoadingState() {
        this._clearProjectsList();
        if (this.elements.projectsList) {
            this.elements.projectsList.append(this.elements.loadingState);
        }
    }

    hideLoadingState() {
        if (this.elements.loadingState.get_parent()) {
            this.elements.projectsList.remove(this.elements.loadingState);
        }
    }

    _clearProjectsList() {
        if (!this.elements.projectsList) return;
        
        // Remove all children from the projects list
        let child = this.elements.projectsList.get_first_child();
        while (child) {
            const next = child.get_next_sibling();
            this.elements.projectsList.remove(child);
            child = next;
        }
    }

    addProjectCard(projectCardWidget) {
        if (this.elements.projectsList) {
            // Create list row for the project card
            const row = new Gtk.ListBoxRow({
                css_classes: ['project-row']
            });
            row.set_child(projectCardWidget);
            this.elements.projectsList.append(row);
            return row;
        }
        return null;
    }

    removeProjectCard(row) {
        if (row && this.elements.projectsList) {
            this.elements.projectsList.remove(row);
        }
    }

    // Pagination interface
    updatePaginationInfo(currentPage, totalPages) {
        if (this.elements.pagination.pageInfo) {
            this.elements.pagination.pageInfo.set_label(
                _('Page %d of %d').format(currentPage, totalPages)
            );
        }
    }

    setPaginationEnabled(prevEnabled, nextEnabled) {
        if (this.elements.pagination.prevButton) {
            this.elements.pagination.prevButton.set_sensitive(prevEnabled);
        }
        if (this.elements.pagination.nextButton) {
            this.elements.pagination.nextButton.set_sensitive(nextEnabled);
        }
    }

    // Selection interface
    showSelectionToolbar(selectedCount) {
        if (this.elements.selectionToolbar) {
            this.elements.selectionLabel.set_label(`${selectedCount} selected`);
            this.elements.selectionToolbar.set_visible(true);
        }
    }

    hideSelectionToolbar() {
        if (this.elements.selectionToolbar) {
            this.elements.selectionToolbar.set_visible(false);
        }
    }

    // Search interface
    getSearchText() {
        return this.elements.searchEntry ? this.elements.searchEntry.get_text() : '';
    }

    clearSearch() {
        if (this.elements.searchEntry) {
            this.elements.searchEntry.set_text('');
        }
    }

    // Getters for elements
    getElements() {
        return this.elements;
    }

    getTemplateWidgets() {
        return this.templateWidgets;
    }
}
