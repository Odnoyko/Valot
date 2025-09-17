import { ProjectCard } from '../../interface/components/complex/ProjectCard.js';
import { ProjectCardBehavior } from '../complex/ProjectCardBehavior.js';

/**
 * Functionality: Projects Page Business Logic
 * Handles data management, events, and coordination between UI and backend
 */
export class ProjectsPageBehavior {
    constructor(projectsPageInterface, config = {}) {
        this.interface = projectsPageInterface;
        this.config = {
            projectManager: config.projectManager,
            modularDialogManager: config.modularDialogManager,
            parentWindow: config.parentWindow,
            itemsPerPage: config.itemsPerPage || 10,
            ...config
        };

        // State management
        this.projects = [];
        this.filteredProjects = [];
        this.selectedProjects = new Set();
        this.currentPage = 0;
        this.projectCards = new Map(); // Map of project.id -> {interface, behavior, row}
        this.isLoading = false;

        this._setupEventHandlers();
        this._initialize();
    }

    _setupEventHandlers() {
        const elements = this.interface.getElements();

        // Search functionality
        if (elements.searchEntry) {
            elements.searchEntry.connect('search-changed', () => {
                const query = this.interface.getSearchText();
                this._filterProjects(query);
            });
        }

        // Add project button
        if (elements.addProjectButton) {
            elements.addProjectButton.connect('clicked', () => {
                this._handleAddProject();
            });
        }

        // Pagination buttons
        if (elements.pagination.prevButton) {
            elements.pagination.prevButton.connect('clicked', () => {
                this._previousPage();
            });
        }

        if (elements.pagination.nextButton) {
            elements.pagination.nextButton.connect('clicked', () => {
                this._nextPage();
            });
        }

        // Selection toolbar
        if (elements.deleteSelectedButton) {
            elements.deleteSelectedButton.widget.connect('clicked', () => {
                this._deleteSelectedProjects();
            });
        }
    }

    async _initialize() {
        await this.loadProjects();
    }

    // Data management
    async loadProjects() {
        if (this.isLoading) return;
        
        this.isLoading = true;
        this.interface.showLoadingState();

        try {
            if (this.config.projectManager) {
                this.projects = await this._fetchProjectsFromManager();
            } else {
                this.projects = await this._fetchProjectsFromAPI();
            }

            this.filteredProjects = [...this.projects];
            this.currentPage = 0;
            this._updateDisplay();

        } catch (error) {
            console.error('Failed to load projects:', error);
            this._showError('Failed to load projects');
        } finally {
            this.isLoading = false;
            this.interface.hideLoadingState();
        }
    }

    async _fetchProjectsFromManager() {
        // Use project manager to fetch data
        const projectManager = this.config.projectManager;
        
        if (!projectManager || !projectManager.dbConnection) {
            return [];
        }

        try {
            const sql = `SELECT id, name, color, total_time, icon, dark_icons, icon_color_mode 
                        FROM Project ORDER BY name`;
            const result = projectManager.dbConnection.execute_select_command(sql);
            const projects = [];

            if (result && result.get_n_rows() > 0) {
                for (let i = 0; i < result.get_n_rows(); i++) {
                    projects.push({
                        id: result.get_value_at(0, i),
                        name: result.get_value_at(1, i),
                        color: result.get_value_at(2, i) || '#cccccc',
                        totalTime: result.get_value_at(3, i) || 0,
                        icon: result.get_value_at(4, i) || 'folder-symbolic',
                        dark_icons: result.get_value_at(5, i) || 0,
                        icon_color_mode: result.get_value_at(6, i) || 'auto'
                    });
                }
            }

            return projects;
        } catch (error) {
            console.error('Error fetching projects from manager:', error);
            return [];
        }
    }

    async _fetchProjectsFromAPI() {
        // Fallback API fetch method
        return [];
    }

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

        this.currentPage = 0;
        this._updateDisplay();
    }

    _updateDisplay() {
        this._clearProjectCards();

        if (this.filteredProjects.length === 0) {
            this.interface.showEmptyState();
            this._updatePaginationDisplay();
            return;
        }

        this._renderCurrentPageProjects();
        this._updatePaginationDisplay();
        this._updateSelectionDisplay();
    }

    _clearProjectCards() {
        // Remove all existing project cards
        this.projectCards.forEach(({ row }) => {
            if (row) {
                this.interface.removeProjectCard(row);
            }
        });
        this.projectCards.clear();
    }

    _renderCurrentPageProjects() {
        const totalPages = Math.ceil(this.filteredProjects.length / this.config.itemsPerPage);
        const start = this.currentPage * this.config.itemsPerPage;
        const end = Math.min(start + this.config.itemsPerPage, this.filteredProjects.length);
        const currentProjects = this.filteredProjects.slice(start, end);

        currentProjects.forEach(project => {
            this._createProjectCard(project);
        });
    }

    _createProjectCard(project) {
        // Create project card interface
        const cardInterface = new ProjectCardInterface({
            project,
            showActions: true,
            selectable: true
        });

        // Create project card behavior
        const cardBehavior = new ProjectCardBehavior(cardInterface, {
            onEdit: (project) => this._editProject(project),
            onDelete: (project) => this._deleteProject(project),
            onSelect: (project, selected) => this._selectProject(project, selected),
            onDoubleClick: (project) => this._editProject(project),
            selectable: true
        });

        // Add to interface
        const row = this.interface.addProjectCard(cardInterface.getWidget());

        // Store references
        this.projectCards.set(project.id, {
            interface: cardInterface,
            behavior: cardBehavior,
            row: row
        });
    }

    // Project actions
    _handleAddProject() {
        if (this.config.modularDialogManager) {
            // Get search text for pre-filling
            const searchText = this.interface.getSearchText();

            const dialog = this.config.modularDialogManager.createProject((projectData) => {
                // Clear search if it was used for pre-filling
                if (searchText && projectData.name.includes(searchText)) {
                    this.interface.clearSearch();
                }

                // Refresh projects list
                this.loadProjects();
                return true;
            });

            // Pre-fill with search text if available
            if (searchText) {
                setTimeout(() => dialog.setFormData({ name: searchText }), 100);
            }
        } else {
            console.error('ModularDialogManager not available');
        }
    }

    _editProject(project) {
        if (this.config.modularDialogManager) {
            this.config.modularDialogManager.editProject(project, () => {
                this.loadProjects();
                return true;
            });
        }
    }

    _deleteProject(project) {
        if (this.config.modularDialogManager) {
            this.config.modularDialogManager.confirmDelete('project', project.name, () => {
                if (this.config.projectManager) {
                    const success = this.config.projectManager.deleteProject(project.id, this.config.parentWindow);
                    if (success) {
                        this.loadProjects();
                    }
                    return success;
                }
                return false;
            });
        }
    }

    // Selection management
    _selectProject(project, selected) {
        if (selected) {
            this.selectedProjects.add(project.id);
        } else {
            this.selectedProjects.delete(project.id);
        }

        this._updateSelectionDisplay();
    }

    _updateSelectionDisplay() {
        const selectedCount = this.selectedProjects.size;
        if (selectedCount > 0) {
            this.interface.showSelectionToolbar(selectedCount);
        } else {
            this.interface.hideSelectionToolbar();
        }
    }

    _deleteSelectedProjects() {
        if (this.selectedProjects.size === 0) return;

        if (this.config.modularDialogManager) {
            this.config.modularDialogManager.confirmDelete(
                'projects',
                `${this.selectedProjects.size} projects`,
                () => {
                    // Delete all selected projects
                    this.selectedProjects.forEach(projectId => {
                        this.config.projectManager.deleteProject(projectId, this.config.parentWindow);
                    });

                    this.selectedProjects.clear();
                    this.loadProjects();
                    return true;
                }
            );
        }
    }

    // Pagination
    _previousPage() {
        if (this.currentPage > 0) {
            this.currentPage--;
            this._updateDisplay();
        }
    }

    _nextPage() {
        const totalPages = Math.ceil(this.filteredProjects.length / this.config.itemsPerPage);
        if (this.currentPage < totalPages - 1) {
            this.currentPage++;
            this._updateDisplay();
        }
    }

    _updatePaginationDisplay() {
        const totalPages = Math.max(1, Math.ceil(this.filteredProjects.length / this.config.itemsPerPage));
        const currentPage = this.currentPage + 1;

        this.interface.updatePaginationInfo(currentPage, totalPages);
        this.interface.setPaginationEnabled(
            this.currentPage > 0,
            this.currentPage < totalPages - 1
        );
    }

    // Error handling
    _showError(message) {
        // Show error message to user
        console.error(message);
        // Could integrate with notification system or show error dialog
    }

    // Public API
    refresh() {
        return this.loadProjects();
    }

    getSelectedProjects() {
        return Array.from(this.selectedProjects);
    }

    clearSelection() {
        this.selectedProjects.clear();
        this._updateSelectionDisplay();
    }

    // Cleanup
    destroy() {
        this.projectCards.forEach(({ behavior }) => {
            if (behavior.destroy) {
                behavior.destroy();
            }
        });
        this.projectCards.clear();
    }
}