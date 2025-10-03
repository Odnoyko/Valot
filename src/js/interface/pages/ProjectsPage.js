import Gtk from 'gi://Gtk';
import Adw from 'gi://Adw';
import Gdk from 'gi://Gdk';
import { ProjectCard } from '../components/complex/ProjectCard.js';
import { Button } from '../components/primitive/Button.js';
import { Label } from '../components/primitive/Label.js';
import { WidgetFactory } from '../components/widgetFactory.js';
import { getProjectIconColor, calculateColorBrightness } from 'resource:///com/odnoyko/valot/js/func/global/colorUtils.js';

/**
 * Projects management page - extracted from window.js
 * Handles all project-related functionality
 */
export class ProjectsPage {
    constructor(config = {}) {
        this.config = {
            title: 'Projects',
            subtitle: 'Manage your projects',
            showTrackingWidget: true,
            showSearchButton: true,
            actions: [
                {
                    icon: 'list-add-symbolic',
                    tooltip: 'Add Project',
                    cssClasses: ['suggested-action'],
                    onClick: (page) => page.showAddProjectDialog()
                }
            ],
            ...config
        };

        // Base page properties
        this.app = config.app;
        this.parentWindow = config.parentWindow;
        this.isLoading = false;
        this.currentPage = 0;
        this.itemsPerPage = 30;
        
        // Project-specific state
        this.projects = [];
        this.filteredProjects = [];
        this.selectedProjects = new Set();
        this.currentProjectsPage = 0;
        this.projectsPerPage = 10;
        
        // Get managers from parent window
        this.projectManager = config.projectManager;
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
            //('ProjectsPage: No parent window provided');
            return;
        }

        // Get references to existing UI elements from the template
        this.projectSearch = this.parentWindow._project_search;
        this.addProjectBtn = this.parentWindow._add_project_btn;
        this.projectList = this.parentWindow._project_list;

        // Try to get pagination box from template, or create one
        this.paginationContextBar = this.parentWindow._projects_pagination_box;

        // If no pagination bar in template, we need to create one
        if (!this.paginationContextBar) {
            this._createPaginationContextBar();
        }

    }

    /**
     * Setup event handlers for UI elements
     */
    _setupEventHandlers() {
        // Connect search functionality
        if (this.projectSearch) {
            this.projectSearch.connect('search-changed', () => {
                const query = this.projectSearch.get_text();
                this._filterProjects(query);
            });
        }

        // Connect add project button
        if (this.addProjectBtn) {
            this.addProjectBtn.connect('clicked', () => {
                this.showAddProjectDialog();
            });
        }

    }


    /**
     * Get the main widget for this page - returns null since we use template
     */
    getWidget() {
        return null; // We use the existing template UI
    }

    _createMainContent() {
        const mainContent = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 12,
            hexpand: true,
            vexpand: true
        });

        // Search bar (initially hidden)
        this._createSearchBar(mainContent);

        // Projects toolbar
        this._createProjectsToolbar(mainContent);

        // Projects grid/list
        this._createProjectsList(mainContent);

        // Pagination
        this._createPagination(mainContent);

        return mainContent;
    }

    _createSearchBar(container) {
        this.searchBar = new Gtk.SearchBar({
            visible: false
        });

        const searchEntry = new Gtk.SearchEntry({
            placeholder_text: _('Search projects...'),
            hexpand: true
        });

        searchEntry.connect('search-changed', () => {
            const query = searchEntry.get_text();
            this._filterProjects(query);
        });

        this.searchBar.set_child(searchEntry);
        this.searchBar.connect_entry(searchEntry);
        
        container.append(this.searchBar);
    }

    _createProjectsToolbar(container) {
        const toolbar = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 6,
            css_classes: ['toolbar']
        });

        // Bulk actions (shown when projects are selected)
        this.bulkActionsBox = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 6,
            visible: false
        });

        const deleteSelectedBtn = new Button({
            iconName: 'edit-delete-symbolic',
            label: _('Delete Selected'),
            cssClasses: ['flat', 'destructive-action'],
            onClick: () => this._deleteSelectedProjects()
        });

        this.bulkActionsBox.append(deleteSelectedBtn.widget);

        // Selection info
        this.selectionLabel = new Gtk.Label({
            label: '',
            css_classes: ['dim-label'],
            visible: false
        });

        toolbar.append(this.bulkActionsBox);
        toolbar.append(this.selectionLabel);

        container.append(toolbar);
    }

    _createProjectsList(container) {
        // Projects container
        this.projectsContainer = WidgetFactory.createScrollableList({
            height_request: 400,
            cssClasses: ['projects-list']
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
            icon_name: 'folder-symbolic',
            pixel_size: 64,
            css_classes: ['dim-label']
        });

        const emptyLabel = new Gtk.Label({
            label: _('No projects found'),
            css_classes: ['title-2'],
            halign: Gtk.Align.CENTER
        });

        const emptySubLabel = new Gtk.Label({
            label: _('Create your first project to get started'),
            css_classes: ['dim-label'],
            halign: Gtk.Align.CENTER
        });

        this.emptyState.append(emptyIcon);
        this.emptyState.append(emptyLabel);
        this.emptyState.append(emptySubLabel);

        // Stack to switch between list and empty state
        this.listStack = new Gtk.Stack();
        this.listStack.add_named(this.projectsContainer.widget, 'list');
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

        this.prevProjectsButton = new Button({
            iconName: 'go-previous-symbolic',
            tooltipText: _('Previous page'),
            cssClasses: ['circular'],
            onClick: () => this._previousPage()
        });

        this.projectsPageInfo = new Label({
            text: _('Page 1 of 1'),
            cssClasses: ['monospace']
        });

        this.nextProjectsButton = new Button({
            iconName: 'go-next-symbolic',
            tooltipText: _('Next page'),
            cssClasses: ['circular'],
            onClick: () => this._nextPage()
        });

        paginationBox.append(this.prevProjectsButton.widget);
        paginationBox.append(this.projectsPageInfo.widget);
        paginationBox.append(this.nextProjectsButton.widget);

        container.append(paginationBox);
    }

    /**
     * Load projects from database
     */
    async loadProjects() {
        this.showLoading('Loading projects...');
        
        try {
            // This would connect to actual data source
            this.projects = await this._fetchProjects();
            this.filteredProjects = [...this.projects];
            this._updateProjectsDisplay();
            // Projects loaded successfully
        } catch (error) {
            //('Error loading projects:', error);
            this.showError('Load Error', 'Failed to load projects');
        } finally {
            this.hideLoading();
            
            // Update weekly time in sidebar after loading projects
            if (this.parentWindow && typeof this.parentWindow.updateWeeklyTime === 'function') {
                await this.parentWindow.updateWeeklyTime();
            }
        }
    }

    /**
     * Filter projects based on search query
     */
    _filterProjects(query = '') {
        if (!query.trim()) {
            this.filteredProjects = [...this.projects];
        } else {
            const lowerQuery = query.toLowerCase();
            this.filteredProjects = this.projects.filter(project => 
                project.name.toLowerCase().includes(lowerQuery) ||
                (project.client_name && project.client_name.toLowerCase().includes(lowerQuery))
            );
        }

        this.currentProjectsPage = 0;
        this._updateProjectsDisplay();
    }

    /**
     * Update projects display
     */
    _updateProjectsDisplay() {
        // Clear existing projects from template UI
        if (this.projectList) {
            // Remove all existing children
            let child = this.projectList.get_first_child();
            while (child) {
                const next = child.get_next_sibling();
                this.projectList.remove(child);
                child = next;
            }
        }

        if (!this.filteredProjects || this.filteredProjects.length === 0) {
            this.currentProjectsPage = 0;
            this._updatePaginationInfo();
            this._updateSelectionUI();
            return;
        }

        // Calculate pagination
        const totalPages = Math.ceil(this.filteredProjects.length / this.projectsPerPage);

        // If current page is beyond total pages, go to last page
        if (this.currentProjectsPage >= totalPages && totalPages > 0) {
            this.currentProjectsPage = totalPages - 1;
        }

        const start = this.currentProjectsPage * this.projectsPerPage;
        const end = Math.min(start + this.projectsPerPage, this.filteredProjects.length);
        const projectsToShow = this.filteredProjects.slice(start, end);

        // Displaying filtered projects (page ${this.currentProjectsPage + 1} of ${totalPages})

        // Add only paginated projects
        projectsToShow.forEach(project => {
            if (this.projectList) {
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
                
                // Left: Settings button with color and icon
                const settingsButton = new Gtk.Button({
                    width_request: 40,
                    height_request: 40,
                    halign: Gtk.Align.CENTER,
                    valign: Gtk.Align.CENTER,
                    css_classes: ['project-settings-button', 'flat'],
                    tooltip_text: _('Project settings - Change color and icon')
                });
                
                // Create icon widget (handle both emoji and system icons)
                let iconWidget;
                if (project.icon && project.icon.startsWith('emoji:')) {
                    const emoji = project.icon.substring(6);
                    iconWidget = new Gtk.Label({
                        label: emoji,
                        css_classes: ['emoji-icon'],
                        halign: Gtk.Align.CENTER,
                        valign: Gtk.Align.CENTER
                    });
                } else {
                    iconWidget = new Gtk.Image({
                        icon_name: project.icon || 'folder-symbolic',
                        pixel_size: 20
                    });
                }
                
                // Apply background color and icon color
                const iconColor = getProjectIconColor(project);
                const provider = new Gtk.CssProvider();
                provider.load_from_string(
                    `.project-settings-button { 
                        background-color: ${project.color}; 
                        border-radius: 6px; 
                        color: ${iconColor}; 
                        min-width: 40px;
                        min-height: 40px;
                        padding: 0;
                    }
                    .project-settings-button:hover {
                        filter: brightness(1.1);
                        box-shadow: 0 2px 4px rgba(0,0,0,0.1);
                    }
                    .emoji-icon {
                        font-size: 18px;
                    }`
                );
                settingsButton.get_style_context().add_provider(provider, Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION);
                
                settingsButton.set_child(iconWidget);
                
                // Connect settings dialog
                settingsButton.connect('clicked', () => {
                    this._showProjectSettings(project);
                });
                
                // Center: Simple label with manual editing
                const nameLabel = new Gtk.Label({
                    label: project.name,
                    hexpand: true,
                    halign: Gtk.Align.START,
                    valign: Gtk.Align.CENTER,
                    css_classes: ['project-name-label']
                });

                // Add double-click to edit via dialog
                const nameClickGesture = new Gtk.GestureClick({
                    button: 1 // Left mouse button only
                });
                nameClickGesture.connect('pressed', (gesture, n_press, x, y) => {
                    if (n_press === 2) { // Double-click
                        this._showProjectNameEditDialog(project, nameLabel);
                    }
                });
                nameLabel.add_controller(nameClickGesture);
                
                // Right: Time display only
                const timeLabel = new Gtk.Label({
                    label: this._formatDurationHMS(project.totalTime || 0),
                    css_classes: ['time-display', 'monospace', 'dim-label'],
                    valign: Gtk.Align.CENTER,
                    halign: Gtk.Align.END,
                    width_request: 100
                });
                
                // Add right-click selection handlers
                this._addProjectSelectionHandlers(row, project);
                
                // Assemble the row
                mainBox.append(settingsButton);
                mainBox.append(nameLabel);
                mainBox.append(timeLabel);
                
                row.set_child(mainBox);
                
                // Apply selection styling if selected
                if (this.selectedProjects.has(project.id)) {
                    row.add_css_class('selected-project');
                }
                
                this.projectList.append(row);
            }
        });

        // Update pagination info
        this._updatePaginationInfo();
        this._updateSelectionUI();
    }

    /**
     * Generate unique project name
     */
    _generateUniqueProjectName() {
        const now = new Date();
        const index = now.getTime().toString().slice(-4); // Last 4 digits of timestamp
        return `Default (${index})`;
    }

    /**
     * Show add project dialog
     */
    showAddProjectDialog() {
        if (this.modularDialogManager && this.projectManager) {
            // Get text from search input to use as initial project name
            const searchText = this.projectSearch ? this.projectSearch.get_text().trim() : '';
            const initialName = searchText || this._generateUniqueProjectName();
            
            
            // STEP 1: Create project immediately with default values
            const newProjectId = this.projectManager.createProjectAndGetId(
                initialName,
                '#3584e4', // Default blue color
                'folder-symbolic', // Default icon
                this.parentWindow,
                'auto' // Default icon color mode
            );
            
            if (!newProjectId) {
                return;
            }
            
            // STEP 2: Get the created project data
            const createdProject = this.projectManager.getProjectById(newProjectId);
            if (!createdProject) {
                return;
            }
            
            // STEP 3: Show "editing" dialog for the newly created project
            this.modularDialogManager.showProjectDialog({
                mode: 'edit', // This is now an EDIT dialog internally
                project: createdProject, // Pass the real project with ID
                forceCreateAppearance: true, // But make it LOOK like a create dialog
                onSave: (projectData, mode, dialog) => {
                    // Save changes to the existing project
                    if (this.projectManager) {
                        const success = this.projectManager.updateProject(
                            createdProject.id,
                            projectData.name,
                            projectData.color,
                            projectData.icon,
                            this.parentWindow,
                            projectData.iconColorMode
                        );
                        
                        if (success) {
                            this.loadProjects();
                            return true; // Close dialog
                        } else {
                            dialog.showFieldError('name', 'Failed to save project changes');
                            return false; // Keep dialog open
                        }
                    }
                    return false;
                },
                onCancel: (dialog) => {
                    // CANCEL: Delete the project we just created
                    const deleteSuccess = this.projectManager.deleteProject(createdProject.id, this.parentWindow);
                    if (deleteSuccess) {
                        this.loadProjects(); // Refresh the project list
                    }
                }
            });
        }
    }

    /**
     * Edit project
     */
    _editProject(project) {
        if (this.modularDialogManager) {
            this.modularDialogManager.editProject(project, () => {
                this.loadProjects();
                return true;
            });
        }
    }

    /**
     * Delete project with confirmation
     */
    _deleteProject(project) {
        if (this.modularDialogManager) {
            this.modularDialogManager.confirmDelete('project', project.name, () => {
                // Call project manager delete method
                if (this.projectManager) {
                    const success = this.projectManager.deleteProject(project.id, this.parentWindow);
                    if (success) {
                        this.loadProjects();
                    }
                    return success;
                }
                return false;
            });
        }
    }

    /**
     * Select/deselect project
     */
    _selectProject(project) {
        if (this.selectedProjects.has(project.id)) {
            this.selectedProjects.delete(project.id);
        } else {
            this.selectedProjects.add(project.id);
        }
        
        this._updateSelectionUI();
    }

    /**
     * Delete selected projects
     */
    _deleteSelectedProjects() {
        if (this.selectedProjects.size === 0) return;

        // Create simple confirmation dialog
        const dialog = new Adw.AlertDialog({
            heading: _('Delete Projects'),
            body: _('Are you sure you want to delete %d selected project(s)? This cannot be undone.').replace('%d', this.selectedProjects.size)
        });

        dialog.add_response('cancel', _('Cancel'));
        dialog.add_response('delete', _('Delete'));
        dialog.set_response_appearance('delete', Adw.ResponseAppearance.DESTRUCTIVE);

        dialog.connect('response', (dialog, response) => {
            if (response === 'delete') {
                // Delete all selected projects
                this.selectedProjects.forEach(projectId => {
                    if (this.projectManager) {
                        this.projectManager.deleteProject(projectId, this.parentWindow);
                    }
                });

                this.selectedProjects.clear();
                this._updateSelectionUI();
                this.loadProjects();
            }
            dialog.close();
        });

        dialog.present(this.parentWindow);
    }

    /**
     * Create pagination/context bar if not in template
     */
    _createPaginationContextBar() {
        this.paginationContextBarWidget = WidgetFactory.createPaginationContextBar({
            onPreviousClick: () => this._previousPage(),
            onNextClick: () => this._nextPage(),
            onCancelClick: () => this._clearSelection(),
            onDeleteClick: () => this._deleteSelectedProjects()
        });

        // Try to find a container to append to
        if (this.projectList) {
            // Navigate up the widget hierarchy to find a Box container
            let parent = this.projectList.get_parent();
            while (parent && !parent.append) {
                parent = parent.get_parent();
            }

            if (parent && parent.append) {
                parent.append(this.paginationContextBarWidget.widget);
            } else {
                console.warn('Could not find suitable container for pagination bar');
            }
        }
    }

    /**
     * Update selection UI
     */
    _updateSelectionUI() {
        const selectedCount = this.selectedProjects.size;

        if (!this.paginationContextBarWidget) return;

        if (selectedCount > 0) {
            // Show context actions mode (always visible when items selected)
            this.paginationContextBarWidget.show();
            this.paginationContextBarWidget.showContextActions(selectedCount);
        } else {
            // Show pagination mode - use stored totalPages
            const totalPages = this._totalPages || Math.ceil(this.filteredProjects.length / this.projectsPerPage);

            if (totalPages > 1) {
                this.paginationContextBarWidget.show();
                this.paginationContextBarWidget.showPagination(this.currentProjectsPage + 1, totalPages);
            } else {
                // Hide pagination when no selection and only 1 page
                this.paginationContextBarWidget.hide();
            }
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
            await this.loadProjects();
            // Update header project buttons after refresh
            if (this.parentWindow) {
                // Reload projects from database
                if (this.parentWindow._loadProjects) {
                    this.parentWindow._loadProjects();
                }
                // Update header buttons for currently selected project
                if (this.parentWindow.currentProjectId && this.parentWindow.allProjects) {
                    const currentProject = this.parentWindow.allProjects.find(p => p.id === this.parentWindow.currentProjectId);
                    if (currentProject && this.parentWindow._updateProjectButtonsDisplay) {
                        // Refreshing header buttons
                        this.parentWindow._updateProjectButtonsDisplay(currentProject.name);
                    }
                }
            }
        } catch (error) {
            //('ProjectsPage refresh failed:', error);
        }
    }

    /**
     * Show loading state
     */
    showLoading(message = 'Loading...') {
        // ProjectsPage loading message
        // Could show spinner in UI if needed
    }

    /**
     * Hide loading state
     */
    hideLoading() {
        // ProjectsPage loading finished
        // Could hide spinner in UI if needed
    }

    /**
     * Show error message
     */
    showError(message) {
        //(`ProjectsPage Error: ${message}`);
        // Could show error dialog in UI if needed
    }

    /**
     * Navigate to previous page
     */
    _previousPage() {
        if (this.currentProjectsPage > 0) {
            this.currentProjectsPage--;
            this._updateProjectsDisplay();
        }
    }

    /**
     * Navigate to next page
     */
    _nextPage() {
        const totalPages = Math.ceil(this.filteredProjects.length / this.projectsPerPage);
        if (this.currentProjectsPage < totalPages - 1) {
            this.currentProjectsPage++;
            this._updateProjectsDisplay();
        }
    }

    /**
     * Update pagination info
     */
    _updatePaginationInfo() {
        // Store totalPages for use in _updateSelectionUI
        this._totalPages = Math.ceil(this.filteredProjects.length / this.projectsPerPage);
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

    async _fetchProjects() {
        if (!this.projectManager || !this.projectManager.dbConnection) {
            return [];
        }

        try {
            // Calculate total tracked time for each project from tasks
            const sql = `
                SELECT 
                    p.id, 
                    p.name, 
                    p.color, 
                    p.icon, 
                    p.dark_icons, 
                    p.icon_color_mode,
                    COALESCE(SUM(t.time_spent), 0) as total_time
                FROM Project p
                LEFT JOIN Task t ON p.id = t.project_id
                GROUP BY p.id, p.name, p.color, p.icon, p.dark_icons, p.icon_color_mode
                ORDER BY p.id
            `;
            const result = this.projectManager.dbConnection.execute_select_command(sql);
            const projects = [];

            if (result && result.get_n_rows() > 0) {
                for (let i = 0; i < result.get_n_rows(); i++) {
                    const project = {
                        id: result.get_value_at(0, i),
                        name: result.get_value_at(1, i),
                        color: result.get_value_at(2, i) || '#cccccc',
                        icon: result.get_value_at(3, i) || 'folder-symbolic',
                        dark_icons: result.get_value_at(4, i) || 0,
                        icon_color_mode: result.get_value_at(5, i) || 'auto',
                        totalTime: result.get_value_at(6, i) || 0
                    };
                    projects.push(project);
                }
            }

            // Loaded projects from database
            return projects;
        } catch (error) {
            //('Error loading projects:', error);
            return [];
        }
    }

    async _getProjectsFromManager() {
        return await this._fetchProjects();
    }

    /**
     * Show project settings dialog with color picker and icon selector
     */
    _showProjectSettings(project) {
        if (!this.parentWindow || !this.projectManager) {
            //('Missing dependencies for project settings');
            return;
        }

        // Use the existing project manager dialog system
        this.projectManager._showProjectAppearanceDialog(project);
    }

    /**
     * Show dialog to edit project name
     */
    _showProjectNameEditDialog(project, nameLabel) {
        if (!this.modularDialogManager) {
            //('No modular dialog manager available');
            return;
        }

        const dialog = new Adw.AlertDialog({
            heading: _('Edit Project Name'),
            body: _('Change the name of "%s"').replace('%s', project.name)
        });

        const entry = new Gtk.Entry({
            text: project.name,
            hexpand: true
        });

        dialog.set_extra_child(entry);
        dialog.add_response('cancel', _('Cancel'));
        dialog.add_response('save', _('Save'));
        dialog.set_response_appearance('save', Adw.ResponseAppearance.SUGGESTED);

        dialog.connect('response', (dialog, response) => {
            if (response === 'save') {
                const newName = entry.get_text().trim();
                if (newName && newName !== project.name) {
                    this._handleProjectNameChange(project.id, newName, nameLabel);
                }
            }
            dialog.close();
        });

        dialog.present(this.parentWindow);
    }


    /**
     * Handle project name changes with validation
     */
    _handleProjectNameChange(projectId, newName, nameLabel) {
        if (!this.projectManager) {
            //('No project manager available');
            return;
        }

        // Find the project
        const project = this.projects.find(p => p.id === projectId);
        if (!project) {
            //('Project not found:', projectId);
            return;
        }

        // Validate new name (basic validation for now)
        if (newName.length < 1 || newName.length > 100) {
            // Revert to original name (using set_text for Gtk.EditableLabel)
            nameLabel.set_text(project.name);
            return;
        }

        // Update project via manager
        const success = this.projectManager.updateProject(
            projectId,
            newName,
            project.color,
            project.icon,
            this.parentWindow,
            project.icon_color_mode || 'auto'
        );

        if (!success) {
            // Revert to original name (using set_label for Gtk.Label)
            nameLabel.set_label(project.name);
        } else {
            // Update the label with the new name
            nameLabel.set_label(newName);
            // Update header project buttons after name change (avoid infinite loop)
            if (this.parentWindow && this.parentWindow._loadProjects) {
                this.parentWindow._loadProjects();
            }
        }
    }

    /**
     * Add right-click selection handlers for multiple selection
     */
    _addProjectSelectionHandlers(row, project) {
        // Add right-click gesture for selection
        const rightClick = new Gtk.GestureClick({
            button: 3 // Right mouse button
        });

        rightClick.connect('pressed', (gesture, n_press, x, y) => {
            this._toggleProjectSelection(project.id, row);
            gesture.set_state(Gtk.EventSequenceState.CLAIMED);
        });

        row.add_controller(rightClick);

        // Handle keyboard shortcuts on the row
        const rowKeyController = new Gtk.EventControllerKey();
        rowKeyController.connect('key-pressed', (controller, keyval, keycode, state) => {
            // Delete key
            if (keyval === 65535) { // Delete key
                // If this project is selected, delete all selected projects
                if (this.selectedProjects.has(project.id)) {
                    this._deleteSelectedProjects();
                    return true;
                } else {
                    // If not selected, select it first and then delete
                    this._toggleProjectSelection(project.id, row);
                    this._deleteSelectedProjects();
                    return true;
                }
            }
            return false;
        });

        row.add_controller(rowKeyController);
        
        // Make the row focusable so it can receive keyboard events
        row.set_focusable(true);
        row.set_can_focus(true);
    }

    /**
     * Toggle project selection
     */
    _toggleProjectSelection(projectId, row) {
        if (this.selectedProjects.has(projectId)) {
            this.selectedProjects.delete(projectId);
            row.remove_css_class('selected-project');
        } else {
            this.selectedProjects.add(projectId);
            row.add_css_class('selected-project');
        }

        this._updateSelectionUI();
    }

    /**
     * Format duration helper (legacy)
     */
    _formatDuration(totalSeconds) {
        if (!totalSeconds) return '0h 0m';
        
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        
        if (hours > 0) {
            return `${hours}h ${minutes}m`;
        } else {
            return `${minutes}m`;
        }
    }

    /**
     * Format duration in HH:MM:SS format
     */
    _formatDurationHMS(totalSeconds) {
        if (!totalSeconds) return '00:00:00';
        
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;
        
        return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }

    /**
     * Setup keyboard shortcuts for the page
     */
    setupKeyboardShortcuts() {
        if (!this.parentWindow) return;

        const keyController = new Gtk.EventControllerKey();
        keyController.connect('key-pressed', (controller, keyval, keycode, state) => {
            
            // Delete key - delete selected projects
            if (keyval === 65535) { // Delete key
                if (this.selectedProjects.size > 0) {
                    this._deleteSelectedProjects();
                    return true;
                } else {
                }
            }
            
            // Ctrl+A - select all projects
            if ((state & Gdk.ModifierType.CONTROL_MASK) && keyval === 97) { // Ctrl+A
                this._selectAllProjects();
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
     * Select all projects
     */
    _selectAllProjects() {
        this.selectedProjects.clear();
        this.filteredProjects.forEach(project => {
            this.selectedProjects.add(project.id);
        });
        this._updateProjectsDisplay(); // Refresh to show selection
        this._updateSelectionUI();
    }

    /**
     * Clear all selection
     */
    _clearSelection() {
        this.selectedProjects.clear();
        this._updateProjectsDisplay(); // Refresh to remove selection styling
        this._updateSelectionUI();
    }

}