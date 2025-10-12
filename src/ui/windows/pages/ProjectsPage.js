import Gtk from 'gi://Gtk';
import Adw from 'gi://Adw?version=1';
import Gdk from 'gi://Gdk';
import GLib from 'gi://GLib';
import { ProjectDialog } from 'resource:///com/odnoyko/valot/ui/components/complex/ProjectDialog.js';
import { ProjectAppearanceDialog } from 'resource:///com/odnoyko/valot/ui/components/complex/ProjectAppearanceDialog.js';

/**
 * Projects management page
 * Original UI from main branch - adapted to Core architecture
 */
export class ProjectsPage {
    constructor(config = {}) {
        this.app = config.app;
        this.parentWindow = config.parentWindow;
        this.coreBridge = config.coreBridge;

        // Project-specific state
        this.projects = [];
        this.filteredProjects = [];
        this.selectedProjects = new Set();
        this.currentProjectsPage = 0;
        this.projectsPerPage = 10;

        // Subscribe to Core events for automatic updates
        this._subscribeToCore();
    }

    /**
     * Subscribe to Core events to auto-update project list
     */
    _subscribeToCore() {
        if (!this.coreBridge) return;

        // Reload projects when tracking starts/stops
        this.coreBridge.onUIEvent('tracking-started', () => {
            setTimeout(() => this.loadProjects(), 300);
        });

        this.coreBridge.onUIEvent('tracking-stopped', () => {
            this.loadProjects();
        });

        // Reload when projects are created/updated
        this.coreBridge.onUIEvent('project-created', () => {
            this.loadProjects();
        });

        this.coreBridge.onUIEvent('project-updated', () => {
            this.loadProjects();
        });

        this.coreBridge.onUIEvent('project-deleted', () => {
            this.loadProjects();
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

        // Load projects on initialization
        this.loadProjects();

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
        // Reuse same tracking widget as TasksPage (adapted to Core)
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
        this.taskNameEntry.connect('activate', () => this._onTaskNameChanged());
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
     * Connect tracking widget to Core (same as TasksPage)
     */
    _connectTrackingToCore() {
        if (!this.coreBridge) return;

        this.coreBridge.onUIEvent('tracking-started', (data) => {
            this._updateTrackingUIFromCore();
        });

        this.coreBridge.onUIEvent('tracking-stopped', (data) => {
            this._updateTrackingUIFromCore();
        });

        this.coreBridge.onUIEvent('tracking-updated', (data) => {
            const state = this.coreBridge.getTrackingState();
            this.actualTimeLabel.set_label(this._formatDuration(state.elapsedSeconds));

            if (state.currentTaskName && this.taskNameEntry.get_text() !== state.currentTaskName) {
                this.taskNameEntry.set_text(state.currentTaskName);
            }
        });

        this._updateTrackingUIFromCore();
    }

    _updateTrackingUIFromCore() {
        if (!this.coreBridge) return;

        const state = this.coreBridge.getTrackingState();

        if (state.isTracking) {
            this.taskNameEntry.set_text(state.currentTaskName || '');
            this.taskNameEntry.set_sensitive(true);
            this.projectBtn.set_sensitive(true);
            this.clientBtn.set_sensitive(true);

            this.trackButton.set_icon_name('media-playback-stop-symbolic');
            this.trackButton.set_tooltip_text(_('Stop tracking'));
            this.trackButton.remove_css_class('suggested-action');
            this.trackButton.add_css_class('destructive-action');

            this.actualTimeLabel.set_label(this._formatDuration(state.elapsedSeconds));
            this._startTrackingUITimer();
        } else {
            this.taskNameEntry.set_text('');
            this.taskNameEntry.set_sensitive(true);
            this.projectBtn.set_sensitive(true);
            this.clientBtn.set_sensitive(true);

            this.trackButton.set_icon_name('media-playback-start-symbolic');
            this.trackButton.set_tooltip_text(_('Start tracking'));
            this.trackButton.remove_css_class('destructive-action');
            this.trackButton.add_css_class('suggested-action');

            this.actualTimeLabel.set_label('00:00:00');
            this._stopTrackingUITimer();
        }
    }

    async _toggleTracking() {
        if (!this.coreBridge) return;

        const state = this.coreBridge.getTrackingState();

        if (state.isTracking) {
            try {
                await this.coreBridge.stopTracking();
            } catch (error) {
                console.error('Error stopping tracking:', error);
            }
        } else {
            try {
                const taskName = this.taskNameEntry.get_text().trim();
                let task;

                if (taskName === '' || taskName.length === 0) {
                    task = await this.coreBridge.createAutoIndexedTask();
                } else {
                    task = await this.coreBridge.findOrCreateTask(taskName);
                }

                await this.coreBridge.startTracking(task.id, null, null);
            } catch (error) {
                console.error('Error starting tracking:', error);
            }
        }
    }

    _startTrackingUITimer() {
        if (this.trackingTimerId) return;

        this.trackingTimerId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1000, () => {
            const state = this.coreBridge.getTrackingState();
            if (state.isTracking) {
                this.actualTimeLabel.set_label(this._formatDuration(state.elapsedSeconds));
                return true;
            } else {
                this.trackingTimerId = null;
                return false;
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

    async _onTaskNameChanged() {
        if (!this.coreBridge) return;

        const state = this.coreBridge.getTrackingState();
        if (!state.isTracking) return;

        const newName = this.taskNameEntry.get_text().trim();
        if (!newName || newName === state.currentTaskName) return;

        try {
            await this.coreBridge.updateCurrentTaskName(newName);
        } catch (error) {
            console.error('Error updating task name:', error);
        }
    }

    _selectProject() {
        console.log('TODO: Select project');
    }

    _selectClient() {
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

        // Search and toolbar
        const toolbar = this._createToolbar();
        contentBox.append(toolbar);

        // Projects list
        const scrolledWindow = this._createProjectsList();
        contentBox.append(scrolledWindow);

        // Pagination
        const pagination = this._createPagination();
        contentBox.append(pagination);

        return contentBox;
    }

    _createToolbar() {
        const toolbar = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 0,
            margin_bottom: 12,
            css_classes: ['search-button-box'],
        });

        // Search entry
        this.projectSearch = new Gtk.SearchEntry({
            placeholder_text: _('Search projects...'),
            hexpand: true,
        });

        this.projectSearch.connect('search-changed', () => {
            const query = this.projectSearch.get_text();
            this._filterProjects(query);
        });

        toolbar.append(this.projectSearch);

        // Add project button (same style as Add Client button)
        this.addProjectBtn = new Gtk.Button({
            tooltip_text: _('Add Project'),
            css_classes: ['flat'],
        });

        const btnBox = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 6,
            halign: Gtk.Align.CENTER,
        });

        const btnLabel = new Gtk.Label({
            label: _('Add project'),
        });
        btnBox.append(btnLabel);

        const btnIcon = new Gtk.Image({
            icon_name: 'list-add-symbolic',
        });
        btnBox.append(btnIcon);

        this.addProjectBtn.set_child(btnBox);

        this.addProjectBtn.connect('clicked', () => this._showAddProjectDialog());
        toolbar.append(this.addProjectBtn);

        return toolbar;
    }

    _createProjectsList() {
        const scrolledWindow = new Gtk.ScrolledWindow({
            vexpand: true,
            hscrollbar_policy: Gtk.PolicyType.NEVER,
        });

        this.projectList = new Gtk.ListBox({
            css_classes: ['content-box'],
            selection_mode: Gtk.SelectionMode.NONE,
        });

        scrolledWindow.set_child(this.projectList);

        return scrolledWindow;
    }

    _createPagination() {
        const paginationBox = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 12,
            halign: Gtk.Align.CENTER,
            margin_top: 12,
        });

        this.prevProjectsButton = new Gtk.Button({
            icon_name: 'go-previous-symbolic',
            tooltip_text: _('Previous page'),
            css_classes: ['circular'],
        });
        this.prevProjectsButton.connect('clicked', () => this._previousPage());

        this.projectsPageInfo = new Gtk.Label({
            label: _('Page 1 of 1'),
            css_classes: ['monospace'],
        });

        this.nextProjectsButton = new Gtk.Button({
            icon_name: 'go-next-symbolic',
            tooltip_text: _('Next page'),
            css_classes: ['circular'],
        });
        this.nextProjectsButton.connect('clicked', () => this._nextPage());

        paginationBox.append(this.prevProjectsButton);
        paginationBox.append(this.projectsPageInfo);
        paginationBox.append(this.nextProjectsButton);

        return paginationBox;
    }

    /**
     * Load projects from Core
     */
    async loadProjects() {
        if (!this.coreBridge) {
            console.error('No coreBridge available');
            return;
        }

        try {
            // Get projects from Core
            const projects = await this.coreBridge.getAllProjects();
            this.projects = projects || [];
            this.filteredProjects = [...this.projects];
            this._updateProjectsDisplay();
        } catch (error) {
            console.error('Error loading projects:', error);
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
                project.name.toLowerCase().includes(lowerQuery)
            );
        }

        this.currentProjectsPage = 0;
        this._updateProjectsDisplay();
    }

    /**
     * Update projects display (ORIGINAL UI from main branch)
     */
    _updateProjectsDisplay() {
        // Clear existing projects
        let child = this.projectList.get_first_child();
        while (child) {
            const next = child.get_next_sibling();
            this.projectList.remove(child);
            child = next;
        }

        if (!this.filteredProjects || this.filteredProjects.length === 0) {
            this._showEmptyState();
            this._updatePaginationInfo();
            return;
        }

        // Calculate pagination
        const totalPages = Math.ceil(this.filteredProjects.length / this.projectsPerPage);

        if (this.currentProjectsPage >= totalPages && totalPages > 0) {
            this.currentProjectsPage = totalPages - 1;
        }

        const start = this.currentProjectsPage * this.projectsPerPage;
        const end = Math.min(start + this.projectsPerPage, this.filteredProjects.length);
        const projectsToShow = this.filteredProjects.slice(start, end);

        // Render each project (SAME UI as main branch)
        projectsToShow.forEach(project => {
            const row = this._createProjectRow(project);
            this.projectList.append(row);
        });

        this._updatePaginationInfo();
    }

    /**
     * Create project row (ORIGINAL UI from main branch)
     */
    _createProjectRow(project) {
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

        // Left: Settings button with color and icon
        const settingsButton = new Gtk.Button({
            width_request: 40,
            height_request: 40,
            halign: Gtk.Align.CENTER,
            valign: Gtk.Align.CENTER,
            css_classes: ['project-settings-button', 'flat'],
            tooltip_text: _('Project settings - Change color and icon'),
        });

        // Create icon widget
        let iconWidget;
        if (project.icon && project.icon.startsWith('emoji:')) {
            const emoji = project.icon.substring(6);
            iconWidget = new Gtk.Label({
                label: emoji,
                css_classes: ['emoji-icon'],
                halign: Gtk.Align.CENTER,
                valign: Gtk.Align.CENTER,
            });
        } else {
            iconWidget = new Gtk.Image({
                icon_name: project.icon || 'folder-symbolic',
                pixel_size: 20,
            });
        }

        // Apply background color
        const iconColor = this._getProjectIconColor(project);
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
        settingsButton.connect('clicked', () => this._showProjectSettings(project));

        // Center: Project name label
        const nameLabel = new Gtk.Label({
            label: project.name,
            hexpand: true,
            halign: Gtk.Align.START,
            valign: Gtk.Align.CENTER,
            css_classes: ['project-name-label'],
        });

        // Double-click to edit
        const nameClickGesture = new Gtk.GestureClick({
            button: 1,
        });
        nameClickGesture.connect('pressed', (gesture, n_press, x, y) => {
            if (n_press === 2) {
                this._showProjectNameEditDialog(project);
            }
        });
        nameLabel.add_controller(nameClickGesture);

        // Right: Time display
        const totalTime = project.total_time || 0;
        const timeLabel = new Gtk.Label({
            label: this._formatDurationHMS(totalTime),
            css_classes: ['time-display', 'monospace', 'dim-label'],
            valign: Gtk.Align.CENTER,
            halign: Gtk.Align.END,
            width_request: 100,
        });

        mainBox.append(settingsButton);
        mainBox.append(nameLabel);
        mainBox.append(timeLabel);

        row.set_child(mainBox);

        return row;
    }

    _getProjectIconColor(project) {
        // Simple brightness calculation
        const color = project.color || '#3584e4';
        const hex = color.replace('#', '');
        const r = parseInt(hex.substr(0, 2), 16);
        const g = parseInt(hex.substr(2, 2), 16);
        const b = parseInt(hex.substr(4, 2), 16);
        const brightness = (r * 299 + g * 587 + b * 114) / 1000;
        return brightness > 128 ? '#000000' : '#ffffff';
    }

    _formatDurationHMS(seconds) {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;
        return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }

    _showEmptyState() {
        const emptyRow = new Adw.ActionRow({
            title: _('No projects found'),
            subtitle: _('Create your first project to get started'),
            sensitive: false,
        });
        this.projectList.append(emptyRow);
    }

    _updatePaginationInfo() {
        const totalPages = Math.max(1, Math.ceil(this.filteredProjects.length / this.projectsPerPage));
        const currentPage = this.currentProjectsPage + 1;

        this.projectsPageInfo.set_label(`Page ${currentPage} of ${totalPages}`);

        this.prevProjectsButton.set_sensitive(this.currentProjectsPage > 0);
        this.nextProjectsButton.set_sensitive(this.currentProjectsPage < totalPages - 1);
    }

    _previousPage() {
        if (this.currentProjectsPage > 0) {
            this.currentProjectsPage--;
            this._updateProjectsDisplay();
        }
    }

    _nextPage() {
        const totalPages = Math.ceil(this.filteredProjects.length / this.projectsPerPage);
        if (this.currentProjectsPage < totalPages - 1) {
            this.currentProjectsPage++;
            this._updateProjectsDisplay();
        }
    }

    async _showAddProjectDialog() {
        try {
            // Get project name from search or generate indexed name
            const searchText = this.projectSearch.get_text().trim();
            let projectName;

            if (searchText === '') {
                // Generate auto-indexed name - find first available index
                const existingProjects = await this.coreBridge.getAllProjects();
                const existingNames = new Set(existingProjects.map(p => p.name));

                let nextIndex = 1;
                while (existingNames.has(`Project - ${nextIndex}`)) {
                    nextIndex++;
                }

                projectName = `Project - ${nextIndex}`;
            } else {
                projectName = searchText;
            }

            // Create project immediately in DB (Core will ensure unique name)
            const createdProject = await this.coreBridge.createProject({
                name: projectName,
                color: '#3584e4',
                icon: 'folder-symbolic',
                icon_color_mode: 'auto',
            });

            // Clear search
            this.projectSearch.set_text('');

            // Reload list
            await this.loadProjects();

            let wasSaved = false;

            // Open edit dialog
            const dialog = ProjectDialog.createEdit(createdProject, {
                parentWindow: this.parentWindow,
                onProjectSave: async (projectData, mode, dialogInstance) => {
                    try {
                        // Update project
                        await this.coreBridge.updateProject(createdProject.id, {
                            name: projectData.name,
                            color: projectData.color,
                            icon: projectData.icon,
                            icon_color_mode: projectData.iconColorMode,
                        });

                        await this.loadProjects();
                        wasSaved = true;
                        return true;
                    } catch (error) {
                        console.error('Error updating project:', error);
                        dialogInstance.showFieldError('name', 'Failed to update project');
                        return false;
                    }
                }
            });

            // Handle cancel - delete project if not saved
            dialog.widget.connect('response', async (dialog, response) => {
                if (response === 'cancel' && !wasSaved) {
                    try {
                        await this.coreBridge.deleteProject(createdProject.id);
                        await this.loadProjects();
                    } catch (error) {
                        console.error('Error deleting cancelled project:', error);
                    }
                }
            });

            dialog.present(this.parentWindow);

        } catch (error) {
            console.error('Error in add project flow:', error);
        }
    }

    _showProjectSettings(project) {
        const appearanceDialog = new ProjectAppearanceDialog({
            project: project,
            parentWindow: this.parentWindow,
            onSave: async (updatedProject) => {
                try {
                    await this.coreBridge.updateProject(updatedProject.id, {
                        color: updatedProject.color,
                        icon: updatedProject.icon,
                        icon_color_mode: updatedProject.icon_color_mode,
                    });

                    await this.loadProjects();
                } catch (error) {
                    console.error('Error updating project:', error);
                }
            }
        });

        appearanceDialog.present();
    }

    _showProjectNameEditDialog(project) {
        const dialog = new Adw.AlertDialog({
            heading: _('Projektname bearbeiten'),
            body: _('Name von "{oldName}" ändern').replace('{oldName}', project.name),
        });

        const nameEntry = new Gtk.Entry({
            text: project.name,
            hexpand: true,
            margin_top: 12,
            margin_bottom: 12,
            margin_start: 12,
            margin_end: 12,
        });

        dialog.set_extra_child(nameEntry);
        dialog.add_response('cancel', _('Abbrechen'));
        dialog.add_response('save', _('Speichern'));
        dialog.set_response_appearance('save', Adw.ResponseAppearance.SUGGESTED);

        dialog.connect('response', async (dialog, response) => {
            if (response === 'save') {
                const newName = nameEntry.get_text().trim();

                if (!newName || newName === project.name) {
                    dialog.close();
                    return;
                }

                try {
                    await this.coreBridge.updateProject(project.id, {
                        name: newName,
                    });

                    await this.loadProjects();
                } catch (error) {
                    console.error('Error updating project name:', error);
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
        await this.loadProjects();
    }
}
