import Gtk from 'gi://Gtk';
import Adw from 'gi://Adw?version=1';
import Gdk from 'gi://Gdk';
import GLib from 'gi://GLib';
import { ProjectDialog } from 'resource:///com/odnoyko/valot/ui/components/complex/ProjectDialog.js';
import { ProjectAppearanceDialog } from 'resource:///com/odnoyko/valot/ui/components/complex/ProjectAppearanceDialog.js';
import { AdvancedTrackingWidget } from 'resource:///com/odnoyko/valot/ui/components/complex/AdvancedTrackingWidget.js';
import { createProjectIconWidget } from 'resource:///com/odnoyko/valot/ui/utils/widgetFactory.js';
import { stringCache } from 'resource:///com/odnoyko/valot/ui/utils/StringCache.js';

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

        // Map to store time labels for real-time updates
        this.projectTimeLabels = new Map(); // projectId -> timeLabel widget
        
        // Map to store project rows for reuse (projectId -> row widget)
        this.projectRowMap = new Map(); // projectId -> Gtk.ListBoxRow
        this._cssProviders = new Map(); // settingsButton -> CssProvider (for cleanup)

        // Track currently tracked project for real-time time updates
        this._trackingProjectId = null;
        this._trackingProjectBaseTime = 0;
        
        // Track last tracking project to reset its time when switching
        this.lastTrackingProjectId = null;
        
        // Cache last displayed projects to avoid unnecessary redraws
        this._lastDisplayedProjects = [];

        // Store event handler references for cleanup
        this._eventHandlers = {};
        
        // Store GTK signal handler IDs for cleanup (GLib timers)
        this._signalHandlerIds = [];
        
        // Store widget handler connections for cleanup (widget -> handlerId)
        this._widgetConnections = new Map();

        // REMOVED: trackingTimerToken - no longer using separate timers

        // Subscribe to Core events for automatic updates
        this._subscribeToCore();
    }

    /**
     * Subscribe to Core events to auto-update project list
     */
    _subscribeToCore() {
        if (!this.coreBridge) return;

        // Store handlers for cleanup
        this._eventHandlers['tracking-started'] = (data) => {
            // OPTIMIZED: Don't reload projects - tracking doesn't change project list
            // Reloading creates new objects every time, causing RAM growth
            // CRITICAL: Save base time for tracked project to add elapsed seconds to it
            if (data && data.projectId) {
                const project = this.projects.find(p => p.id === data.projectId);
                if (project) {
                    // Store base time before tracking started
                    this._trackingProjectBaseTime = project.total_time || 0;
                    this._trackingProjectId = data.projectId;
                }
            }
        };
        this._eventHandlers['tracking-stopped'] = () => {
            // OPTIMIZED: Don't reload projects - stopping tracking doesn't change projects
            // Clear tracking state
            this._trackingProjectId = null;
            this._trackingProjectBaseTime = 0;
        };
        // OPTIMIZED: tracking-updated handler for real-time project time updates
        // Only updates time label, no object creation, no DB queries
        this._eventHandlers['tracking-updated'] = (data) => {
            if (!data) return;
            
            // Check if project changed during tracking
            if (data.projectId !== undefined && data.projectId !== this._trackingProjectId) {
                // CRITICAL: Clear tracking state before reload to prevent reset in loadProjects()
                this._trackingProjectId = null;
                this._trackingProjectBaseTime = 0;
                
                // Reload projects to get updated total_time after old time entry was saved
                // Then set new tracking project
                this.loadProjects().then(() => {
                    const newProject = this.projects.find(p => p.id === data.projectId);
                    if (newProject) {
                        // Set new tracking project and base time
                        this._trackingProjectId = data.projectId;
                        this._trackingProjectBaseTime = newProject.total_time || 0;
                    }
                }).catch(err => {
                    console.error('[ProjectsPage] Error reloading projects after project change:', err);
                });
                return; // Exit - will update after reload
            }
            
            // CRITICAL: Early return if not tracking or no elapsed seconds
            if (!this._trackingProjectId || data.elapsedSeconds === undefined) {
                return;
            }
            
            // OPTIMIZED: Update only time label for currently tracked project
            // No getTrackingState() call, no object creation, just update label text
            const timeLabel = this.projectTimeLabels.get(this._trackingProjectId);
            if (timeLabel && !timeLabel.is_destroyed?.()) {
                // Calculate current total time: base time + elapsed seconds
                const currentTotal = (this._trackingProjectBaseTime || 0) + data.elapsedSeconds;
                timeLabel.set_label(this._formatDurationHMS(currentTotal));
            }
        };
        this._eventHandlers['task-updated'] = () => {
            this.loadProjects();
        };
        this._eventHandlers['task-deleted'] = () => {
            this.loadProjects();
        };
        this._eventHandlers['tasks-deleted'] = () => {
            this.loadProjects();
        };
        this._eventHandlers['project-created'] = () => {
            this.loadProjects();
        };
        this._eventHandlers['project-updated'] = () => {
            this.loadProjects();
        };
        this._eventHandlers['project-deleted'] = () => {
            this.loadProjects();
        };
        this._eventHandlers['projects-deleted'] = () => {
            this.loadProjects();
        };

        // Subscribe with stored handlers
        Object.keys(this._eventHandlers).forEach(event => {
            this.coreBridge.onUIEvent(event, this._eventHandlers[event]);
        });
    }

    /**
     * Helper method to track GTK signal handler IDs for cleanup
     * @param {GObject.Object} widget - Widget to connect to
     * @param {string} signal - Signal name
     * @param {Function} callback - Callback function
     * @returns {number} Handler ID
     */
    _trackConnection(widget, signal, callback) {
        const handlerId = widget.connect(signal, callback);
        // Store widget reference and handler ID for cleanup
        if (!this._widgetConnections.has(widget)) {
            this._widgetConnections.set(widget, []);
        }
        this._widgetConnections.get(widget).push(handlerId);
        return handlerId;
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

        // Prevent search input from auto-focusing on startup
        if (this.projectList) {
            // Set focus to the project list instead of search
            this.projectList.set_can_focus(true);
            this.projectList.grab_focus();
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
            this._trackConnection(this.parentWindow.splitView, 'notify::show-sidebar', updateSidebarButtonVisibility);
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
                console.error('[ProjectsPage] No application reference!');
            }
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

        // DISABLED: tracking-updated handler removed - causes RAM growth
        // getTrackingState() creates objects every second
        // this.coreBridge.onUIEvent('tracking-updated', (data) => {
        //     // tracking-updated fires every second during tracking
        //     // Handler removed to prevent RAM growth
        // });

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

            // DISABLED: Time updates in ProjectsPage (only header widget shows time)
            // this.actualTimeLabel.set_label(this._formatDuration(state.elapsedSeconds));
            // this._startTrackingUITimer();
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
            // REMOVED: No timer to stop
        }
    }

    async _toggleTracking() {
        if (!this.coreBridge) return;

        const state = this.coreBridge.getTrackingState();

        if (state.isTracking) {
            try {
                await this.coreBridge.stopTracking();
            } catch (error) {
                console.error('[ProjectsPage] Error stopping tracking:', error);
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
                console.error('[ProjectsPage] Error starting tracking:', error);
            }
        }
    }

    // REMOVED: _startTrackingUITimer() and _stopTrackingUITimer()
    // No separate timers needed - only header widget shows time

    _formatDuration(seconds) {
        // OPTIMIZED: Use string cache to avoid creating new strings
        return stringCache.getTimeString(seconds);
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
            console.error('[ProjectsPage] Error updating task name:', error);
        }
    }

    _selectProject() {
    }

    _selectClient() {
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

        // Debounce search to avoid excessive filtering
        (async () => {
            const { Debouncer } = await import('resource:///com/odnoyko/valot/core/utils/Debouncer.js');
            const debouncedFilter = Debouncer.debounce((query) => {
                this._filterProjects(query);
            }, 300); // 300ms debounce
            
            this.projectSearch.connect('search-changed', () => {
                const query = this.projectSearch.get_text();
                debouncedFilter(query);
            });
        })();

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
            overflow: Gtk.Overflow.HIDDEN,
        });

        scrolledWindow.set_child(this.projectList);

        return scrolledWindow;
    }

    _createPagination() {
        // Context bar (pagination or selection mode)
        this.contextBar = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 12,
            halign: Gtk.Align.FILL,
            margin_top: 12,
            visible: false, // Hidden by default
        });

        // Pagination mode widgets
        this.paginationBox = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 12,
            halign: Gtk.Align.FILL,
        });

        this.prevProjectsButton = new Gtk.Button({
            label: _('Back'),
            css_classes: ['flat'],
        });
        this.prevProjectsButton.connect('clicked', () => this._previousPage());

        this.projectsPageInfo = new Gtk.Label({
            label: _('Page 1 of 1'),
            css_classes: ['dim-label'],
            hexpand: true,
        });

        this.nextProjectsButton = new Gtk.Button({
            label: _('Next'),
            css_classes: ['flat'],
        });
        this.nextProjectsButton.connect('clicked', () => this._nextPage());

        this.paginationBox.append(this.prevProjectsButton);
        this.paginationBox.append(this.projectsPageInfo);
        this.paginationBox.append(this.nextProjectsButton);

        // Selection mode widgets
        this.selectionBox = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 12,
            halign: Gtk.Align.FILL,
            visible: false,
        });

        const cancelBtn = new Gtk.Button({
            label: _('Cancel'),
            css_classes: ['flat'],
        });
        cancelBtn.connect('clicked', () => this._clearSelection());

        this.selectionLabel = new Gtk.Label({
            label: '0 selected',
            css_classes: ['dim-label'],
            hexpand: true,
        });

        const deleteBtn = new Gtk.Button({
            label: _('Delete'),
            css_classes: ['destructive-action'],
        });
        deleteBtn.connect('clicked', () => this._deleteSelectedProjects());

        this.selectionBox.append(cancelBtn);
        this.selectionBox.append(this.selectionLabel);
        this.selectionBox.append(deleteBtn);

        // Add both to context bar
        this.contextBar.append(this.paginationBox);
        this.contextBar.append(this.selectionBox);

        return this.contextBar;
    }

    /**
     * Load projects from Core
     */
    async loadProjects() {
        if (!this.coreBridge) {
            console.error('[ProjectsPage] No coreBridge available');
            return;
        }

        try {
            // Get projects with calculated total_time from Core
            const projects = await this.coreBridge.getAllProjectsWithTime();
            this.projects = projects || [];
            // OPTIMIZED: Direct reference instead of spread operator (will be filtered later if needed)
            this.filteredProjects = this.projects;
            
            // Clear cached project times when reloading
            this._cachedProjectBaseTimes = null;
            
            // CRITICAL: Restore tracking state after reload
            // If tracking is active, update base time for tracked project
            if (this._trackingProjectId) {
                const trackingState = this.coreBridge.getTrackingState();
                if (trackingState && trackingState.isTracking && trackingState.currentProjectId === this._trackingProjectId) {
                    const trackedProject = this.projects.find(p => p.id === this._trackingProjectId);
                    if (trackedProject) {
                        // Recalculate base time: current total - elapsed seconds
                        this._trackingProjectBaseTime = (trackedProject.total_time || 0) - (trackingState.elapsedSeconds || 0);
                    }
                } else {
                    // Tracking stopped or changed - clear state
                    this._trackingProjectId = null;
                    this._trackingProjectBaseTime = 0;
                }
            }
            
            this._updateProjectsDisplay();
        } catch (error) {
            console.error('[ProjectsPage] Error loading projects:', error);
        }
    }

    /**
     * Filter projects based on search query
     * OPTIMIZED: Direct reference when no filter, only create new array when filtering
     */
    _filterProjects(query = '') {
        if (!query.trim()) {
            // OPTIMIZED: Direct reference instead of spread operator
            this.filteredProjects = this.projects;
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
     * Optimized to reuse rows and avoid recreating icon widgets
     */
    _updateProjectsDisplay() {
        if (!this.filteredProjects || this.filteredProjects.length === 0) {
            // Clear all rows
            let child = this.projectList.get_first_child();
            while (child) {
                const next = child.get_next_sibling();
                this.projectList.remove(child);
                child = next;
            }
            this.projectTimeLabels.clear();
            this.projectRowMap.clear();
            this._lastDisplayedProjects = [];
            
            this._showEmptyState();
            this._updatePaginationInfo();
            this._updateSelectionUI();
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

        // Check if displayed projects changed (by ID only, to detect adds/removes/reorders)
        const currentIds = projectsToShow.map(p => p.id).join(',');
        const lastIds = this._lastDisplayedProjects.map(p => p.id).join(',');
        const projectsChanged = currentIds !== lastIds;

        if (projectsChanged) {
            // Projects list changed - need to rebuild rows
            // Clear existing rows from list (but keep in map for potential reuse)
            let child = this.projectList.get_first_child();
            while (child) {
                const next = child.get_next_sibling();
                this.projectList.remove(child);
                child = next;
            }

            // Remove rows for projects that are no longer displayed
            const currentProjectIds = new Set(projectsToShow.map(p => p.id));
            for (const [projectId, row] of this.projectRowMap.entries()) {
                if (!currentProjectIds.has(projectId)) {
                    // Row is no longer needed - remove from map
                    this.projectRowMap.delete(projectId);
                    this.projectTimeLabels.delete(projectId);
                }
            }

            // Add or reuse rows for current projects
            projectsToShow.forEach(project => {
                let row = this.projectRowMap.get(project.id);
                if (row) {
                    // Reuse existing row - just update data
                    this._updateProjectRowData(row, project);
                } else {
                    // Create new row
                    row = this._createProjectRow(project);
                    this.projectRowMap.set(project.id, row);
                }
                this.projectList.append(row);
            });

            this._lastDisplayedProjects = [...projectsToShow];
        } else {
            // Projects list didn't change - just update data in existing rows
            projectsToShow.forEach(project => {
                const row = this.projectRowMap.get(project.id);
                if (row) {
                    this._updateProjectRowData(row, project);
                }
            });
        }

        this._updatePaginationInfo();
        this._updateSelectionUI();
    }
    
    /**
     * Update existing project row data without recreating widgets
     */
    _updateProjectRowData(row, project) {
        const mainBox = row.get_child();
        if (!mainBox) return;

        // Update project name (index 1: settingsButton, 2: nameLabel, 3: timeLabel)
        const nameLabel = mainBox.get_first_child()?.get_next_sibling();
        if (nameLabel && nameLabel instanceof Gtk.Label) {
            nameLabel.set_label(project.name);
        }

        // Update time label (index 3)
        const timeLabel = mainBox.get_last_child();
        if (timeLabel && timeLabel instanceof Gtk.Label) {
            const totalTime = project.total_time || 0;
            timeLabel.set_label(this._formatDurationHMS(totalTime));
            this.projectTimeLabels.set(project.id, timeLabel);
        }

        // Update settings button icon and color (first child)
        const settingsButton = mainBox.get_first_child();
        if (settingsButton && settingsButton instanceof Gtk.Button) {
            const iconWidget = settingsButton.get_child();
            if (iconWidget && !iconWidget.is_destroyed?.()) {
                // Update icon widget without recreating it
                this._updateProjectIconWidget(iconWidget, project);
            }

            // Update CSS color
            const iconColor = this._getProjectIconColor(project);
            
            // Remove old provider if exists (GTK4 doesn't have remove_all_providers)
            const oldProvider = this._cssProviders.get(settingsButton);
            if (oldProvider) {
                settingsButton.get_style_context().remove_provider(oldProvider);
                this._cssProviders.delete(settingsButton);
            }
            
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
            this._cssProviders.set(settingsButton, provider);
        }

        // Update selection styling
        if (this.selectedProjects.has(project.id)) {
            row.add_css_class('selected-project');
        } else {
            row.remove_css_class('selected-project');
        }
    }
    
    /**
     * Update existing icon widget without recreating it
     */
    _updateProjectIconWidget(iconWidget, project) {
        if (!project.icon) {
            // Empty icon - should be empty box
            if (!(iconWidget instanceof Gtk.Box)) {
                // Type changed - need to recreate
                const parent = iconWidget.get_parent();
                if (parent) {
                    parent.remove(iconWidget);
                    const newWidget = new Gtk.Box({
                        width_request: 20,
                        height_request: 20,
                    });
                    parent.set_child(newWidget);
                }
            }
            return;
        }

        if (project.icon.startsWith('emoji:')) {
            const emoji = project.icon.substring(6);
            if (iconWidget instanceof Gtk.Label) {
                // Reuse Label - just update emoji
                iconWidget.set_label(emoji);
            } else {
                // Type changed - need to recreate
                const parent = iconWidget.get_parent();
                if (parent) {
                    parent.remove(iconWidget);
                    const newWidget = new Gtk.Label({
                        label: emoji,
                        css_classes: ['emoji-icon'],
                    });
                    parent.set_child(newWidget);
                }
            }
        } else {
            // Symbolic icon
            if (iconWidget instanceof Gtk.Image) {
                // Reuse Image - just update icon_name
                iconWidget.set_from_icon_name(project.icon);
            } else {
                // Type changed - need to recreate
                const parent = iconWidget.get_parent();
                if (parent) {
                    parent.remove(iconWidget);
                    const newWidget = new Gtk.Image({
                        icon_name: project.icon,
                        pixel_size: 20,
                    });
                    parent.set_child(newWidget);
                }
            }
        }
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
        const iconWidget = createProjectIconWidget(project, 20);

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

        // Store time label reference for real-time updates
        this.projectTimeLabels.set(project.id, timeLabel);

        mainBox.append(settingsButton);
        mainBox.append(nameLabel);
        mainBox.append(timeLabel);

        row.set_child(mainBox);

        // Add right-click selection handler
        this._addProjectSelectionHandlers(row, project);

        // Apply selection styling if selected
        if (this.selectedProjects.has(project.id)) {
            row.add_css_class('selected-project');
        }

        return row;
    }

    /**
     * Add right-click selection handlers
     */
    _addProjectSelectionHandlers(row, project) {
        const rightClick = new Gtk.GestureClick({
            button: 3, // Right mouse button
        });

        rightClick.connect('pressed', (gesture, n_press, x, y) => {
            this._toggleProjectSelection(project.id, row);
            gesture.set_state(Gtk.EventSequenceState.CLAIMED);
        });

        row.add_controller(rightClick);
    }

    /**
     * Toggle project selection
     */
    _toggleProjectSelection(projectId, row) {
        // Prevent selection of default project (ID = 1)
        if (projectId === 1) {
            // Show toast notification
            if (this.parentWindow && this.parentWindow.showToast) {
                this.parentWindow.showToast(_('Default Project cannot be selected'));
            }
            return;
        }

        if (this.selectedProjects.has(projectId)) {
            this.selectedProjects.delete(projectId);
            row.remove_css_class('selected-project');
        } else {
            this.selectedProjects.add(projectId);
            row.add_css_class('selected-project');
        }

        this._updateSelectionUI();
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
        // OPTIMIZED: Use string cache to avoid creating new strings
        return stringCache.getTimeString(seconds);
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

        this.projectsPageInfo.set_label(_('Page %d of %d').format(currentPage, totalPages));

        this.prevProjectsButton.set_sensitive(this.currentProjectsPage > 0);
        this.nextProjectsButton.set_sensitive(this.currentProjectsPage < totalPages - 1);
    }

    _previousPage() {
        if (this.currentProjectsPage > 0) {
            this._clearSelection(); // Clear selection BEFORE changing pages
            this.currentProjectsPage--;
            this._updateProjectsDisplay();
        }
    }

    _nextPage() {
        const totalPages = Math.ceil(this.filteredProjects.length / this.projectsPerPage);
        if (this.currentProjectsPage < totalPages - 1) {
            this._clearSelection(); // Clear selection BEFORE changing pages
            this.currentProjectsPage++;
            this._updateProjectsDisplay();
        }
    }

    /**
     * Update pagination info
     */
    _updatePaginationInfo() {
        const totalPages = Math.max(1, Math.ceil(this.filteredProjects.length / this.projectsPerPage));
        const currentPage = Math.min(this.currentProjectsPage + 1, totalPages);

        this.projectsPageInfo.set_label(_('Page %d of %d').format(currentPage, totalPages));
        this.prevProjectsButton.set_sensitive(this.currentProjectsPage > 0);
        this.nextProjectsButton.set_sensitive(this.currentProjectsPage < totalPages - 1);
    }

    /**
     * Update selection UI
     */
    _updateSelectionUI() {
        const selectedCount = this.selectedProjects.size;
        const totalPages = Math.ceil(this.filteredProjects.length / this.projectsPerPage);

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
        this.selectedProjects.clear();
        this._updateProjectsDisplay();
    }

    /**
     * Select all projects on current page (except default project ID=1)
     */
    _toggleSelectAll() {
        const start = this.currentProjectsPage * this.projectsPerPage;
        const end = Math.min(start + this.projectsPerPage, this.filteredProjects.length);
        const projectsOnPage = this.filteredProjects.slice(start, end);

        // Check if all selectable projects on page are selected
        const selectableProjects = projectsOnPage.filter(p => p.id !== 1);
        const allSelected = selectableProjects.every(p => this.selectedProjects.has(p.id));

        if (allSelected) {
            // Deselect all on current page
            selectableProjects.forEach(project => {
                this.selectedProjects.delete(project.id);
            });
        } else {
            // Select all on current page (except default ID=1)
            selectableProjects.forEach(project => {
                this.selectedProjects.add(project.id);
            });
        }

        // Update display
        this._updateProjectsDisplay();
    }

    /**
     * Delete selected projects
     */
    async _deleteSelectedProjects() {
        if (this.selectedProjects.size === 0) return;

        // Filter out default project (should never be selected, but double-check)
        const idsToDelete = Array.from(this.selectedProjects).filter(id => id !== 1);

        if (idsToDelete.length === 0) {
            return;
        }

        // Show confirmation dialog
        const dialog = new Adw.AlertDialog({
            heading: _('Delete Projects'),
            body: `Are you sure you want to delete ${idsToDelete.length} selected project(s)?`,
        });

        dialog.add_response('cancel', _('Cancel'));
        dialog.add_response('delete', _('Delete'));
        dialog.set_response_appearance('delete', Adw.ResponseAppearance.DESTRUCTIVE);

        dialog.connect('response', async (dialog, response) => {
            if (response === 'delete') {
                try {
                    // Save project data for undo
                    const deletedProjects = this.projects.filter(p => idsToDelete.includes(p.id));

                    // Delete via Core
                    await this.coreBridge.deleteMultipleProjects(idsToDelete);

                    // Emit event to refresh all pages
                    this.coreBridge.emitUIEvent('projects-deleted');

                    // Clear selection
                    this.selectedProjects.clear();

                    // Reload projects
                    await this.loadProjects();

                    // Show toast with Undo
                    const message = idsToDelete.length === 1
                        ? _('Project deleted')
                        : _(`${idsToDelete.length} projects deleted`);

                    if (this.parentWindow && this.parentWindow.showToastWithAction) {
                        this.parentWindow.showToastWithAction(message, _('Undo'), async () => {
                            // Restore deleted projects
                            for (const project of deletedProjects) {
                                await this.coreBridge.createProject({
                                    name: project.name,
                                    color: project.color,
                                    icon: project.icon,
                                    client_id: project.client_id,
                                    dark_icons: project.dark_icons,
                                    icon_color: project.icon_color,
                                    icon_color_mode: project.icon_color_mode,
                                });
                            }
                            await this.loadProjects();
                        });
                    }
                } catch (error) {
                    console.error('[ProjectsPage] Error deleting projects:', error);
                }
            }
            dialog.close();
        });

        dialog.present(this.parentWindow);
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
                icon: null,
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
                        console.error('[ProjectsPage] Error updating project:', error);
                        dialogInstance.showFieldError('name', _('Failed to update project'));
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
                        console.error('[ProjectsPage] Error deleting cancelled project:', error);
                    }
                }
            });

            dialog.present(this.parentWindow);

        } catch (error) {
            console.error('[ProjectsPage] Error in add project flow:', error);
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
                    console.error('[ProjectsPage] Error updating project:', error);
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
                    console.error('[ProjectsPage] Error updating project name:', error);
                }
            }
            dialog.close();
        });

        dialog.present(this.parentWindow);
    }

    // REMOVED: _updateTrackingProjectTime()
    // No real-time time updates in pages - only header widget shows time

    /**
     * Refresh page data
     */
    async refresh() {
        await this.loadProjects();
    }

    /**
     * Focus search input (called by Ctrl+F shortcut)
     */
    _focusSearch() {
        if (this.projectSearch) {
            this.projectSearch.grab_focus();
        }
    }

    /**
     * Cleanup: unsubscribe from events and clear references
     */
    destroy() {
        // Unsubscribe from CoreBridge events
        if (this.coreBridge && this._eventHandlers) {
            Object.keys(this._eventHandlers).forEach(event => {
                this.coreBridge.offUIEvent(event, this._eventHandlers[event]);
            });
            this._eventHandlers = {};
        }

        // REMOVED: No timer to stop

        // Disconnect GTK signal handlers
        // Disconnect tracked widget connections
        if (this._widgetConnections && this._widgetConnections.size > 0) {
            this._widgetConnections.forEach((handlerIds, widget) => {
                handlerIds.forEach(id => {
                    try {
                        if (widget && !widget.is_destroyed?.()) {
                            widget.disconnect(id);
                        }
                    } catch (e) {
                        // Widget may already be destroyed
                    }
                });
            });
            this._widgetConnections.clear();
        }

        // Remove GLib timers
        if (this._signalHandlerIds.length > 0) {
            this._signalHandlerIds.forEach(id => {
                try {
                    GLib.Source.remove(id);
                } catch (e) {
                    // Handler may already be removed
                }
            });
            this._signalHandlerIds = [];
        }

        // Clear Maps to release widget references
        this.projectTimeLabels.clear();
        this.selectedProjects.clear();

        // Clear arrays
        this.projects = [];
        this.filteredProjects = [];

        // Cleanup tracking widget if exists
        if (this.trackingWidget && typeof this.trackingWidget.cleanup === 'function') {
            this.trackingWidget.cleanup();
            this.trackingWidget = null;
        }
    }

    /**
     * Called when page is hidden (navigated away from)
     * Lightweight cleanup - clears data but keeps UI structure
     */
    onHide() {
        // REMOVED: No timer to stop
        
        // Cleanup tracking widget subscriptions
        if (this.trackingWidget && typeof this.trackingWidget.cleanup === 'function') {
            this.trackingWidget.cleanup();
        }
        
        // Clear data arrays
        this.projects = [];
        this.filteredProjects = [];
        this.selectedProjects.clear();
        
        // Clear time labels map
        this.projectTimeLabels.clear();
        
        // Clear project rows map
        this.projectRowMap.clear();
        
        // Clear CSS providers map
        this._cssProviders.clear();
        this._lastDisplayedProjects = [];
        
        // Reset tracking references
        this.lastTrackingProjectId = null;
    }
}
