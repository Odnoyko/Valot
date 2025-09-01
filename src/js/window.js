/* window.js
 *
 * Copyright 2025 Unknown
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 */
import GObject from 'gi://GObject';
import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import Gdk from 'gi://Gdk';
import GLib from 'gi://GLib';
import { timeTrack } from 'resource:///com/odnoyko/valot/js/global/timetracking.js';
import { setupDatabase, executeQuery, executeNonSelectCommand } from 'resource:///com/odnoyko/valot/js/dbinitialisation.js';
import { TimeUtils } from 'resource:///com/odnoyko/valot/js/utils/timeUtils.js';
import { SimpleChart } from 'resource:///com/odnoyko/valot/js/charts/simpleChart.js';
import { TaskRenderer } from 'resource:///com/odnoyko/valot/js/tasks/taskRenderer.js';
import { ProjectManager } from 'resource:///com/odnoyko/valot/js/projects/projectManager.js';
import { PDFExporter } from 'resource:///com/odnoyko/valot/js/reports/pdfExporter.js';
import { PDFPreviewWindow } from 'resource:///com/odnoyko/valot/js/reports/pdfPreviewWindow.js';

export const ValotWindow = GObject.registerClass({
    GTypeName: 'ValotWindow',
    Template: 'resource:///com/odnoyko/valot/ui/window.ui',
    InternalChildren: [
        'split_view', 'main_content', 'sidebar_list',
        'sidebar_toggle_btn', 'show_sidebar_btn', 'show_sidebar_btn2', 'show_sidebar_btn3', 'show_sidebar_btn5', 'menu_button',
        'tasks_page', 'projects_page', 'clients_page', 'reports_page',
        'track_button', 'task_name', 'actual_time',
        'project_context_btn', 'client_context_btn',
        'task_search', 'task_filter', 'task_list',
        'prev_page_btn', 'next_page_btn', 'page_info',
        'recent_tasks_list', 'chart_placeholder', 'period_filter', 'project_filter', 'client_filter',
        'add_project_btn', 'project_search', 'project_list',
        'total_projects_row', 'total_time_row',
        'task_name_projects', 'actual_time_projects', 'track_button_projects',
        'project_context_btn_projects', 'client_context_btn_projects',
        'task_name_clients', 'actual_time_clients', 'track_button_clients',
        'project_context_btn_clients', 'client_context_btn_clients',
        'add_client_btn', 'client_search', 'client_list', 'total_clients_row', 'total_revenue_row',
        'weekly_time_row', 'today_time_row', 'today_tasks_row', 'week_time_row', 'week_tasks_row',
        'month_time_row', 'month_tasks_row', 'export_pdf_btn',
    ],
}, class ValotWindow extends Adw.ApplicationWindow {
    constructor(application) {
        super({ application });
        
        this.currentPage = 0;
        this.tasksPerPage = 50;
        this.allTasks = [];
        this.filteredTasks = [];
        this.allProjects = [];
        this.currentProjectId = 1; // Default project ID
        this.dbConnection = null;
        this.selectedTasks = new Set();
        this.taskRowMap = new Map();
        this.allClients = [];
        this.currentClientId = 1;
        
        // Initialize modular components
        this.timeUtils = TimeUtils;
        this.simpleChart = null; // Will be initialized after UI loads
        this.taskRenderer = null; // Will be initialized after data loads
        this.projectManager = null; // Will be initialized after DB connection
        
        // Standard icon pool for projects
        this.projectIcons = [
            'folder-symbolic', 'folder-documents-symbolic', 'folder-pictures-symbolic',
            'applications-engineering-symbolic', 'applications-graphics-symbolic', 
            'applications-multimedia-symbolic', 'applications-internet-symbolic',
            'applications-development-symbolic', 'applications-games-symbolic',
            'applications-office-symbolic', 'applications-science-symbolic',
            'applications-system-symbolic', 'applications-utilities-symbolic',
            'emblem-web-symbolic', 'emblem-music-symbolic', 'emblem-photos-symbolic',
            'emblem-videos-symbolic', 'emblem-documents-symbolic', 'emblem-downloads-symbolic',
            'computer-symbolic', 'network-workgroup-symbolic', 'preferences-system-symbolic',
            'system-users-symbolic', 'dialog-information-symbolic', 'dialog-question-symbolic'
        ];
        
        // Standard color palette - lighter colors with black text, darker with white icons
        this.projectColors = [
            // Light colors (black text/icons)
            { name: 'Light Blue', value: '#a8cdf0', class: 'light-blue', textColor: 'black' },
            { name: 'Light Green', value: '#a8e6c1', class: 'light-green', textColor: 'black' },
            { name: 'Light Yellow', value: '#fcf0a7', class: 'light-yellow', textColor: 'black' },
            { name: 'Light Orange', value: '#ffc99a', class: 'light-orange', textColor: 'black' },
            { name: 'Light Red', value: '#f4a5a8', class: 'light-red', textColor: 'black' },
            { name: 'Light Purple', value: '#c4a0d1', class: 'light-purple', textColor: 'black' },
            { name: 'Light Pink', value: '#fab5b0', class: 'light-pink', textColor: 'black' },
            { name: 'Light Cyan', value: '#a8e1ed', class: 'light-cyan', textColor: 'black' },
            // Dark colors (white text/icons)
            { name: 'Dark Blue', value: '#1c4b82', class: 'dark-blue', textColor: 'white' },
            { name: 'Dark Green', value: '#1e6b3e', class: 'dark-green', textColor: 'white' },
            { name: 'Dark Orange', value: '#b85400', class: 'dark-orange', textColor: 'white' },
            { name: 'Dark Red', value: '#a01219', class: 'dark-red', textColor: 'white' },
            { name: 'Dark Purple', value: '#5d2d6b', class: 'dark-purple', textColor: 'white' },
            { name: 'Dark Gray', value: '#3d3d3d', class: 'dark-gray', textColor: 'white' },
            { name: 'Dark Brown', value: '#5a3e2b', class: 'dark-brown', textColor: 'white' },
            { name: 'Dark Indigo', value: '#4a2582', class: 'dark-indigo', textColor: 'white' }
        ];
        
        // Get database connection from application
        const app = application;
        if (app && app.database_connection) {
            this.dbConnection = app.database_connection;
            console.log('📊 Using shared database connection from app');
        } else {
            console.warn('⚠️ No database connection found in application, using fallback');
            try {
                this.dbConnection = setupDatabase();
                console.log('✅ Database initialized successfully (fallback)');
            } catch (error) {
                console.error('❌ Failed to initialize database:', error);
            }
        }
        
        // Initialize modular components with database connection
        if (this.dbConnection) {
            this.projectManager = new ProjectManager(
                this.dbConnection,
                executeQuery,
                executeNonSelectCommand,
                this.projectColors,
                this.projectIcons
            );
        }
        
        this._setupNavigation();
        this._setupTaskTracking();
        this._setupTaskList();
        this._setupPagination();
        this._setupSidebar();
        this._setupProjects();
        this._setupClients();
        this._setupKeyboardShortcuts();
        this._setupContextButtons();
        
        this._loadProjects();
        this._loadClients();
        this._loadTasks();
        this._updateReports();
        this._updateWeeklyTime();
        
        // Initialize chart component
        this.simpleChart = new SimpleChart(this._chart_placeholder);
        this._setupChartFilters();
        this.simpleChart.createChart(this.allTasks, this.allProjects, this.allClients);
        
        // Initialize task renderer
        this.taskRenderer = new TaskRenderer(this.timeUtils, this.allProjects, this);
        
        this._initializeContextButtons();
    }
    
    _setupNavigation() {
        this._sidebar_list.connect('row-activated', (list, row) => {
            const index = row.get_index();
            switch (index) {
                case 0: this._showPage('tasks'); break;
                case 1: this._showPage('projects'); break;
                case 2: this._showPage('clients'); break;
                case 3: this._showPage('reports'); this._updateReports(); this._updateChart(); break;
            }
        });
        
        this._sidebar_toggle_btn.connect('toggled', () => {
            this._split_view.set_show_sidebar(this._sidebar_toggle_btn.active);
        });
        
        // Connect all show_sidebar buttons
        this._show_sidebar_btn.connect('clicked', () => {
            this._split_view.set_show_sidebar(true);
        });
        this._show_sidebar_btn2.connect('clicked', () => {
            this._split_view.set_show_sidebar(true);
        });
        this._show_sidebar_btn3.connect('clicked', () => {
            this._split_view.set_show_sidebar(true);
        });
        this._show_sidebar_btn5.connect('clicked', () => {
            this._split_view.set_show_sidebar(true);
        });
        
        // Handle both collapsed (mobile) and show-sidebar (manual toggle) changes
        this._split_view.connect('notify::collapsed', () => {
            this._updateSidebarButtonVisibility();
        });
        
        this._split_view.connect('notify::show-sidebar', () => {
            this._updateSidebarButtonVisibility();
        });
    }
    
    _updateSidebarButtonVisibility() {
        const collapsed = this._split_view.get_collapsed();
        const showSidebar = this._split_view.get_show_sidebar();
        
        // Show buttons when collapsed (mobile) OR when manually hidden (!showSidebar)
        const shouldShowButtons = collapsed || !showSidebar;
        
        this._show_sidebar_btn.set_visible(shouldShowButtons);
        this._show_sidebar_btn2.set_visible(shouldShowButtons);
        this._show_sidebar_btn3.set_visible(shouldShowButtons);
        this._show_sidebar_btn5.set_visible(shouldShowButtons);
        
        // Update toggle button state
        this._sidebar_toggle_btn.set_active(showSidebar && !collapsed);
    }
    
    _showPage(pageName) {
        const pages = {
            'tasks': this._tasks_page,
            'projects': this._projects_page,
            'clients': this._clients_page,
            'reports': this._reports_page
        };
        
        if (pages[pageName]) {
            try {
                // Use push_by_tag instead of pop_to_page for proper navigation
                this._main_content.replace([pages[pageName]]);
            } catch (error) {
                console.log(`Navigation error for ${pageName}:`, error);
                // Fallback: try to add page to stack first
                try {
                    this._main_content.add(pages[pageName]);
                    this._main_content.set_visible_page(pages[pageName]);
                } catch (fallbackError) {
                    console.error(`Fallback navigation failed for ${pageName}:`, fallbackError);
                }
            }
        }
    }
    
    _setupTaskTracking() {
        timeTrack(this._track_button, this._task_name, this._actual_time);
        timeTrack(this._track_button_projects, this._task_name_projects, this._actual_time_projects);
        timeTrack(this._track_button_clients, this._task_name_clients, this._actual_time_clients);
    }
    
    _setupTaskList() {
        this._task_search.connect('search-changed', () => {
            this._filterTasks();
        });
        
        this._task_filter.connect('notify::selected', () => {
            this._filterTasks();
        });
    }
    
    _setupKeyboardShortcuts() {
        const controller = new Gtk.EventControllerKey();
        this.add_controller(controller);
        
        controller.connect('key-pressed', (controller, keyval, keycode, state) => {
            if (keyval === Gdk.KEY_Delete || keyval === Gdk.KEY_KP_Delete) {
                this._deleteSelectedTasks();
                return true;
            }
            return false;
        });
    }
    
    _setupContextButtons() {
        // Project context buttons
        this._project_context_btn.connect('clicked', () => {
            this._showProjectSelector();
        });
        this._project_context_btn_projects.connect('clicked', () => {
            this._showProjectSelector();
        });
        this._project_context_btn_clients.connect('clicked', () => {
            this._showProjectSelector();
        });
        
        // Client context buttons
        this._client_context_btn.connect('clicked', () => {
            this._showClientSelector();
        });
        this._client_context_btn_projects.connect('clicked', () => {
            this._showClientSelector();
        });
        this._client_context_btn_clients.connect('clicked', () => {
            this._showClientSelector();
        });
    }
    
    
    _setupPagination() {
        this._prev_page_btn.connect('clicked', () => {
            if (this.currentPage > 0) {
                this.currentPage--;
                this._updateTaskList();
            }
        });
        
        this._next_page_btn.connect('clicked', () => {
            const totalPages = Math.ceil(this.filteredTasks.length / this.tasksPerPage);
            if (this.currentPage < totalPages - 1) {
                this.currentPage++;
                this._updateTaskList();
            }
        });
    }
    
    _setupSidebar() {
        this._sidebar_list.select_row(this._sidebar_list.get_row_at_index(0));
    }
    
    _setupChartFilters() {
        // Setup period filter
        this._period_filter.connect('notify::selected', () => {
            const selectedPeriod = this._period_filter.get_selected();
            const periods = ['week', 'month', 'year'];
            this.simpleChart.setPeriod(periods[selectedPeriod]);
            this._updateChart();
        });

        // Setup project filter - populate with projects
        const projectStringList = new Gtk.StringList();
        projectStringList.append('All Projects');
        if (this.allProjects) {
            this.allProjects.forEach(project => {
                projectStringList.append(project.name);
            });
        }
        this._project_filter.set_model(projectStringList);
        this._project_filter.set_selected(0);

        this._project_filter.connect('notify::selected', () => {
            const selectedProject = this._project_filter.get_selected();
            const projectId = selectedProject === 0 ? null : this.allProjects[selectedProject - 1]?.id;
            this.simpleChart.setProjectFilter(projectId);
            this._updateChart();
        });

        // Setup client filter - populate with clients
        const clientStringList = new Gtk.StringList();
        clientStringList.append('All Clients');
        if (this.allClients) {
            this.allClients.forEach(client => {
                clientStringList.append(client.name);
            });
        }
        this._client_filter.set_model(clientStringList);
        this._client_filter.set_selected(0);

        this._client_filter.connect('notify::selected', () => {
            const selectedClient = this._client_filter.get_selected();
            const clientId = selectedClient === 0 ? null : this.allClients[selectedClient - 1]?.id;
            this.simpleChart.setClientFilter(clientId);
            this._updateChart();
        });
    }
    
    _updateChart() {
        if (this.simpleChart) {
            this.simpleChart.createChart(this.allTasks, this.allProjects, this.allClients);
        }
    }
    
    _refreshChartFilters() {
        if (!this._project_filter || !this._client_filter) {
            return;
        }

        // Update project filter dropdown
        const projectStringList = new Gtk.StringList();
        projectStringList.append('All Projects');
        if (this.allProjects) {
            this.allProjects.forEach(project => {
                projectStringList.append(project.name);
            });
        }
        this._project_filter.set_model(projectStringList);

        // Update client filter dropdown
        const clientStringList = new Gtk.StringList();
        clientStringList.append('All Clients');
        if (this.allClients) {
            this.allClients.forEach(client => {
                clientStringList.append(client.name);
            });
        }
        this._client_filter.set_model(clientStringList);
    }

    _exportToPDF() {
        try {
            // Open PDF preview window instead of direct export
            const previewWindow = new PDFPreviewWindow(
                this.get_application(),
                this.allTasks,
                this.allProjects,
                this.allClients
            );
            
            previewWindow.present();
        } catch (error) {
            console.error('PDF preview error:', error);
            const errorDialog = new Gtk.AlertDialog({
                message: 'Preview Failed', 
                detail: `Could not open PDF preview: ${error.message}`
            });
            errorDialog.show(this);
        }
    }
    
    _setupProjects() {
        // Add project button
        this._add_project_btn.connect('clicked', () => {
            this._showAddProjectDialog();
        });
        
        // Project search
        this._project_search.connect('search-changed', () => {
            this._filterProjects();
        });
        
        // Project list selection
        this._project_list.connect('row-selected', (list, row) => {
            if (row) {
                const index = row.get_index();
                if (index >= 0 && index < this.allProjects.length) {
                    this._selectProject(this.allProjects[index].id);
                }
            }
        });
        
        // Setup project selector dropdown
        this._setupProjectSelector();
    }
    
    _setupClients() {
        // Add client button
        this._add_client_btn.connect('clicked', () => {
            this._showAddClientDialog();
        });

        // Setup PDF export button
        this._export_pdf_btn.connect('clicked', () => {
            this._exportToPDF();
        });
        
        // Client search
        this._client_search.connect('search-changed', () => {
            this._filterClients();
        });
        
        // Client list selection
        this._client_list.connect('row-selected', (list, row) => {
            if (row) {
                const index = row.get_index();
                if (index >= 0 && index < this.allClients.length) {
                    this._selectClient(this.allClients[index].id);
                }
            }
        });
    }
    
    
    _setupProjectSelector() {
        // Project selector is no longer used in the unified header
        // Project selection is now handled via the project context button
        console.log('Project selector setup skipped - using unified header buttons');
    }
    
    _loadTasks() {
        if (!this.dbConnection) {
            console.warn('No database connection available');
            this.allTasks = [];
            this._filterTasks();
            return;
        }

        try {
            // Ensure Task table has client_id column
            this._ensureTaskClientColumn();
            
            const sql = `
                SELECT t.id, t.name, t.time_spent, t.start_time, t.end_time, 
                       t.created_at, p.name as project_name, p.id as project_id,
                       c.name as client_name, c.id as client_id, c.rate as client_rate
                FROM Task t
                LEFT JOIN Project p ON t.project_id = p.id
                LEFT JOIN Client c ON t.client_id = c.id
                ORDER BY t.created_at DESC
            `;
            
            const result = executeQuery(this.dbConnection, sql);
            this.allTasks = [];
            
            if (result && result.get_n_rows() > 0) {
                for (let i = 0; i < result.get_n_rows(); i++) {
                    const task = {
                        id: result.get_value_at(0, i),
                        name: result.get_value_at(1, i) || 'Untitled Task',
                        duration: result.get_value_at(2, i) || 0,
                        start: result.get_value_at(3, i) || new Date().toISOString(),
                        end: result.get_value_at(4, i) || new Date().toISOString(),
                        created: result.get_value_at(5, i) || new Date().toISOString(),
                        project: result.get_value_at(6, i) || 'Default',
                        project_id: result.get_value_at(7, i) || 1,
                        client: result.get_value_at(8, i) || 'Default Client',
                        client_id: result.get_value_at(9, i) || 1,
                        client_rate: result.get_value_at(10, i) || 0
                    };
                    this.allTasks.push(task);
                }
            }
            
            console.log(`Loaded ${this.allTasks.length} tasks from database`);
        } catch (error) {
            console.error('Error loading tasks from database:', error);
            this.allTasks = [];
        }
        
        this._filterTasks();
        this._updateWeeklyTime(); // Update weekly time after loading tasks
        this._updateChart(); // Update chart after loading tasks
    }
    
    _filterTasks() {
        const searchText = this._task_search.get_text().toLowerCase();
        const filterIndex = this._task_filter.get_selected();
        
        this.filteredTasks = this.allTasks.filter(task => {
            const matchesSearch = task.name.toLowerCase().includes(searchText);
            const now = new Date();
            let matchesFilter = true;
            
            switch (filterIndex) {
                case 1: // Today
                    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                    matchesFilter = new Date(task.start) >= today;
                    break;
                case 2: // This Week  
                    const weekStart = new Date(now);
                    weekStart.setDate(now.getDate() - now.getDay());
                    weekStart.setHours(0, 0, 0, 0); // Start of week
                    matchesFilter = new Date(task.start) >= weekStart;
                    break;
                case 3: // This Month
                    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
                    matchesFilter = new Date(task.start) >= monthStart;
                    break;
            }
            
            return matchesSearch && matchesFilter;
        });
        
        this.currentPage = 0;
        this._updateTaskList();
    }
    
    _updateTaskList() {
        while (this._task_list.get_first_child()) {
            this._task_list.remove(this._task_list.get_first_child());
        }
        
        this.taskRowMap.clear();
        
        const start = this.currentPage * this.tasksPerPage;
        const end = Math.min(start + this.tasksPerPage, this.filteredTasks.length);
        const tasksToShow = this.filteredTasks.slice(start, end);
        
        if (tasksToShow.length === 0) {
            const row = new Adw.ActionRow({
                title: 'No tasks found',
                subtitle: 'Start tracking time to see your tasks here',
                sensitive: false
            });
            this._task_list.append(row);
        } else {
            // Group similar tasks
            const taskGroups = this._groupSimilarTasks(tasksToShow);
            this._renderTaskGroups(taskGroups);
        }
        
        this._updatePaginationControls();
    }
    
    _groupSimilarTasks(tasks) {
        const groups = new Map();
        
        tasks.forEach(task => {
            // Get base name by removing numbers in parentheses
            const baseNameMatch = task.name.match(/^(.+?)\s*(?:\(\d+\))?$/);
            const baseName = baseNameMatch ? baseNameMatch[1].trim() : task.name;
            
            if (!groups.has(baseName)) {
                groups.set(baseName, {
                    baseName: baseName,
                    tasks: [],
                    totalDuration: 0,
                    totalCost: 0,
                    hasActive: false,
                    latestTask: null
                });
            }
            
            const group = groups.get(baseName);
            group.tasks.push(task);
            group.totalDuration += task.duration || 0;
            group.totalCost += (task.duration / 3600) * (task.client_rate || 0);
            
            if (task.isActive) {
                group.hasActive = true;
            }
            
            // Keep track of the most recent task
            if (!group.latestTask || new Date(task.created) > new Date(group.latestTask.created)) {
                group.latestTask = task;
            }
        });
        
        return Array.from(groups.values());
    }
    
    _renderTaskGroups(taskGroups) {
        taskGroups.forEach(group => {
            if (group.tasks.length === 1) {
                // Single task - render normally
                this._renderSingleTask(group.tasks[0]);
            } else {
                // Multiple tasks - render as expandable group
                this._renderTaskGroup(group);
            }
        });
    }
    
    _renderSingleTask(task) {
        // Calculate cost
        const cost = (task.duration / 3600) * (task.client_rate || 0);
        const costText = cost > 0 ? ` • €${cost.toFixed(2)}` : '';
        
        // Find project color
        const project = this.allProjects.find(p => p.id === task.project_id);
        const projectColor = project ? project.color : '#9a9996';
        
        console.log(`Task: ${task.name}, Project: ${task.project}, Project ID: ${task.project_id}, Color: ${projectColor}`);
        
        // Create subtitle with colored dot using Pango markup - simple and direct!
        const coloredSubtitle = task.isActive 
            ? `<span color="${projectColor}">●</span> ${task.project} • ${task.client} • Currently tracking • ${this._formatDate(task.start)}`
            : `<span color="${projectColor}">●</span> ${task.project} • ${task.client} • ${this._formatDate(task.start)}`;
        
        const row = new Adw.ActionRow({
            title: task.name,
            subtitle: coloredSubtitle,
            use_markup: true
        });
        
        if (task.isActive) {
            row.add_css_class('tracking-active');
        }
        
        if (this.selectedTasks.has(task.id)) {
            row.add_css_class('selected-task');
        }
        
        // Create suffix container with time and buttons
        const suffixBox = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 12,
            halign: Gtk.Align.END
        });
        
        // Add time display (duration or cost)
        if (!task.isActive && task.duration > 0) {
            const timeLabel = new Gtk.Label({
                label: this._formatDuration(task.duration),
                css_classes: ['caption', 'dim-label'],
                halign: Gtk.Align.END
            });
            
            if (cost > 0) {
                timeLabel.set_label(`${this._formatDuration(task.duration)} • €${cost.toFixed(2)}`);
            }
            
            suffixBox.append(timeLabel);
        }
        
        // Create button container
        const buttonBox = new Gtk.Box({
            spacing: 6
        });
        
        // Add edit button (first)
        const editBtn = new Gtk.Button({
            icon_name: 'document-edit-symbolic',
            css_classes: ['flat'],
            tooltip_text: 'Edit Task'
        });
        editBtn.connect('clicked', () => this._editTask(task.id));
        buttonBox.append(editBtn);
        
        // Add tracking button (last position, gray color)
        const trackBtn = new Gtk.Button({
            icon_name: task.isActive ? 'media-playback-stop-symbolic' : 'media-playback-start-symbolic',
            css_classes: ['flat'],
            tooltip_text: task.isActive ? 'Stop Tracking' : 'Start Tracking'
        });
        trackBtn.connect('clicked', () => {
            if (task.isActive) {
                // If task is currently active, stop tracking
                this._stopCurrentTracking();
            } else {
                // If task is not active, start tracking
                this._startTrackingFromTask(task);
            }
        });
        
        // Apply gray color to the icon
        const icon = trackBtn.get_first_child();
        if (icon) {
            icon.add_css_class('dim-label');
        }
        
        buttonBox.append(trackBtn);
        
        suffixBox.append(buttonBox);
        row.add_suffix(suffixBox);
        
        this.taskRowMap.set(row, task.id);
        
        // Add right-click gesture for task selection
        const rightClick = new Gtk.GestureClick({
            button: 3 // Right mouse button
        });
        rightClick.connect('pressed', () => {
            this._toggleTaskSelection(task.id, row);
        });
        row.add_controller(rightClick);
        
        this._task_list.append(row);
    }
    
    _renderTaskGroup(group) {
        const costText = group.totalCost > 0 ? ` • €${group.totalCost.toFixed(2)}` : '';
        const activeText = group.hasActive ? ' • Currently tracking' : '';
        
        // Find project color
        const project = this.allProjects.find(p => p.id === group.latestTask.project_id);
        const projectColor = project ? project.color : '#9a9996';
        
        // Create group subtitle with colored dot using Pango markup
        const groupColoredSubtitle = `<span color="${projectColor}">●</span> ${group.latestTask.project} • ${group.latestTask.client}${activeText}`;
        
        const groupRow = new Adw.ExpanderRow({
            title: `${group.baseName} (${group.tasks.length} sessions)`,
            subtitle: groupColoredSubtitle,
            use_markup: true
        });
        
        // Add group time and button to suffix
        const groupSuffixBox = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 12,
            halign: Gtk.Align.END
        });
        
        // Add group total time
        const groupTimeLabel = new Gtk.Label({
            label: `${this._formatDuration(group.totalDuration)}${costText}`,
            css_classes: ['caption', 'dim-label'],
            halign: Gtk.Align.END
        });
        groupSuffixBox.append(groupTimeLabel);
        
        if (group.hasActive) {
            groupRow.add_css_class('tracking-active');
        }
        
        // Add group-level tracking button
        const groupTrackBtn = new Gtk.Button({
            icon_name: 'media-playback-start-symbolic',
            css_classes: ['flat'],
            tooltip_text: 'Start New Session'
        });
        groupTrackBtn.connect('clicked', () => this._startTrackingFromTask(group.latestTask));
        
        // Apply gray color to the icon
        const groupIcon = groupTrackBtn.get_first_child();
        if (groupIcon) {
            groupIcon.add_css_class('dim-label');
        }
        
        groupSuffixBox.append(groupTrackBtn);
        groupRow.add_suffix(groupSuffixBox);
        
        // Add individual tasks as rows within the expander
        group.tasks.forEach(task => {
            const cost = (task.duration / 3600) * (task.client_rate || 0);
            const costText = cost > 0 ? ` • €${cost.toFixed(2)}` : '';
            
            // Find project color for individual task
            const taskProject = this.allProjects.find(p => p.id === task.project_id);
            const taskProjectColor = taskProject ? taskProject.color : '#9a9996';
            
            const taskRow = new Adw.ActionRow({
                title: task.name,
                subtitle: task.isActive 
                    ? `Currently tracking • ${this._formatDate(task.start)}`
                    : `${this._formatDate(task.start)}`
            });
            
            // Add time display for individual task in group
            const taskSuffixBox = new Gtk.Box({
                orientation: Gtk.Orientation.HORIZONTAL,
                spacing: 12,
                halign: Gtk.Align.END
            });
            
            // Add time display (duration or cost) for individual tasks
            if (!task.isActive && task.duration > 0) {
                const taskTimeLabel = new Gtk.Label({
                    label: this._formatDuration(task.duration),
                    css_classes: ['caption', 'dim-label'],
                    halign: Gtk.Align.END
                });
                
                if (cost > 0) {
                    taskTimeLabel.set_label(`${this._formatDuration(task.duration)} • €${cost.toFixed(2)}`);
                }
                
                taskSuffixBox.append(taskTimeLabel);
            }
            
            if (task.isActive) {
                taskRow.add_css_class('tracking-active');
            }
            
            // Create button container for individual task
            const taskButtonBox = new Gtk.Box({
                spacing: 6
            });
            
            // Edit button
            const editBtn = new Gtk.Button({
                icon_name: 'document-edit-symbolic',
                css_classes: ['flat'],
                tooltip_text: 'Edit Task'
            });
            editBtn.connect('clicked', () => this._editTask(task.id));
            taskButtonBox.append(editBtn);
            
            // Tracking button
            const trackBtn = new Gtk.Button({
                icon_name: task.isActive ? 'media-playback-stop-symbolic' : 'media-playback-start-symbolic',
                css_classes: ['flat'],
                tooltip_text: task.isActive ? 'Stop Tracking' : 'Start Tracking'
            });
            trackBtn.connect('clicked', () => {
                if (task.isActive) {
                    this._stopCurrentTracking();
                } else {
                    this._startTrackingFromTask(task);
                }
            });
            
            // Apply gray color to the icon
            const icon = trackBtn.get_first_child();
            if (icon) {
                icon.add_css_class('dim-label');
            }
            
            taskButtonBox.append(trackBtn);
            taskSuffixBox.append(taskButtonBox);
            taskRow.add_suffix(taskSuffixBox);
            
            this.taskRowMap.set(taskRow, task.id);
            
            // Add right-click gesture for individual tasks within groups
            const rightClick = new Gtk.GestureClick({
                button: 3 // Right mouse button
            });
            rightClick.connect('pressed', () => {
                this._toggleTaskSelection(task.id, taskRow);
            });
            taskRow.add_controller(rightClick);
            
            groupRow.add_row(taskRow);
        });
        
        this._task_list.append(groupRow);
    }
    
    
    _updatePaginationControls() {
        const totalPages = Math.ceil(this.filteredTasks.length / this.tasksPerPage);
        
        // Hide pagination if only 1 page or no pages
        const shouldShowPagination = totalPages > 1;
        this._prev_page_btn.set_visible(shouldShowPagination);
        this._next_page_btn.set_visible(shouldShowPagination);
        this._page_info.set_visible(shouldShowPagination);
        
        if (shouldShowPagination) {
            this._prev_page_btn.set_sensitive(this.currentPage > 0);
            this._next_page_btn.set_sensitive(this.currentPage < totalPages - 1);
            this._page_info.set_label(`Page ${this.currentPage + 1} of ${totalPages}`);
        }
    }
    
    _updateReports() {
        if (!this.dbConnection) {
            console.warn('No database connection for reports');
            return;
        }

        try {
            // Calculate statistics
            const now = new Date();
            const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            const weekStart = new Date(now);
            weekStart.setDate(now.getDate() - now.getDay());
            const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

            let todayTime = 0, todayTasks = 0;
            let weekTime = 0, weekTasks = 0;
            let monthTime = 0, monthTasks = 0;
            const recentTasks = [];

            this.allTasks.forEach(task => {
                // Use start time instead of created time for better accuracy
                const taskDate = new Date(task.start || task.created);
                const duration = task.duration || 0;

                if (taskDate >= today) {
                    todayTime += duration;
                    todayTasks++;
                }
                if (taskDate >= weekStart) {
                    weekTime += duration;
                    weekTasks++;
                }
                if (taskDate >= monthStart) {
                    monthTime += duration;
                    monthTasks++;
                }

                if (recentTasks.length < 5) {
                    recentTasks.push(task);
                }
            });

            // Update the reports UI with real data
            this._today_time_row.set_subtitle(this._formatDuration(todayTime));
            this._today_tasks_row.set_subtitle(todayTasks.toString());
            
            this._week_time_row.set_subtitle(this._formatDuration(weekTime));
            this._week_tasks_row.set_subtitle(weekTasks.toString());
            
            this._month_time_row.set_subtitle(this._formatDuration(monthTime));
            this._month_tasks_row.set_subtitle(monthTasks.toString());
            
            console.log('Reports updated - Today:', this._formatDuration(todayTime), `(${todayTasks} tasks)`);
            console.log('Week:', this._formatDuration(weekTime), `(${weekTasks} tasks)`);
            console.log('Month:', this._formatDuration(monthTime), `(${monthTasks} tasks)`);

            // Update recent tasks list if on reports page
            this._updateRecentTasksList(recentTasks);

        } catch (error) {
            console.error('Error updating reports:', error);
        }
    }

    _updateRecentTasksList(recentTasks) {
        if (!this._recent_tasks_list) return;

        // Clear existing items
        while (this._recent_tasks_list.get_first_child()) {
            this._recent_tasks_list.remove(this._recent_tasks_list.get_first_child());
        }

        if (recentTasks.length === 0) {
            const row = new Adw.ActionRow({
                title: 'No tasks yet',
                subtitle: 'Start tracking time to see your tasks here',
                sensitive: false
            });
            this._recent_tasks_list.append(row);
        } else {
            recentTasks.forEach(task => {
                // Find project color for recent task
                const project = this.allProjects.find(p => p.id === task.project_id);
                const projectColor = project ? project.color : '#9a9996';
                
                // Create recent task subtitle with colored dot using Pango markup
                const recentColoredSubtitle = `<span color="${projectColor}">●</span> ${task.project} • ${this._formatDate(task.start)}`;
                
                const row = new Adw.ActionRow({
                    title: task.name,
                    subtitle: recentColoredSubtitle,
                    use_markup: true
                });
                
                // Add time display to the right
                const recentTimeLabel = new Gtk.Label({
                    label: this._formatDuration(task.duration),
                    css_classes: ['caption', 'dim-label'],
                    halign: Gtk.Align.END
                });
                
                row.add_suffix(recentTimeLabel);
                
                this._recent_tasks_list.append(row);
            });
        }
    }
    
    _createSimpleChart() {
        if (!this._chart_placeholder) return;
        
        // Clear existing chart content
        while (this._chart_placeholder.get_first_child()) {
            this._chart_placeholder.remove(this._chart_placeholder.get_first_child());
        }
        
        // Get data for the last 7 days
        const chartData = this._getChartData();
        
        if (chartData.length === 0) {
            // Show placeholder when no data
            const placeholderLabel = new Gtk.Label({
                label: '📊 No data yet\nStart tracking time to see your productivity chart',
                css_classes: ['dim-label'],
                justify: Gtk.Justification.CENTER,
                halign: Gtk.Align.CENTER,
                valign: Gtk.Align.CENTER
            });
            this._chart_placeholder.append(placeholderLabel);
            return;
        }
        
        // Create chart container
        const chartBox = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 8,
            margin_top: 12,
            margin_bottom: 12
        });
        
        // Chart title
        const titleLabel = new Gtk.Label({
            label: '📊 Weekly Activity',
            css_classes: ['title-4'],
            halign: Gtk.Align.CENTER,
            margin_bottom: 8
        });
        chartBox.append(titleLabel);
        
        // Create bars container
        const barsBox = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 8,
            halign: Gtk.Align.CENTER,
            height_request: 120
        });
        
        // Find max value for scaling
        const maxHours = Math.max(...chartData.map(d => d.hours), 1);
        
        // Create bars for each day
        chartData.forEach(dayData => {
            const barContainer = new Gtk.Box({
                orientation: Gtk.Orientation.VERTICAL,
                spacing: 4,
                width_request: 40
            });
            
            // Bar (visual representation)
            const barHeight = Math.max((dayData.hours / maxHours) * 80, 2); // Min 2px height
            
            const barBox = new Gtk.Box({
                width_request: 24,
                height_request: 80,
                halign: Gtk.Align.CENTER,
                valign: Gtk.Align.END
            });
            
            const bar = new Gtk.Box({
                width_request: 24,
                height_request: barHeight,
                css_classes: ['chart-bar'],
                halign: Gtk.Align.CENTER,
                valign: Gtk.Align.END
            });
            
            // Apply color based on activity level
            let colorClass = 'low-activity';
            if (dayData.hours > maxHours * 0.7) colorClass = 'high-activity';
            else if (dayData.hours > maxHours * 0.3) colorClass = 'medium-activity';
            
            const barCss = `
                .chart-bar.${colorClass} {
                    background: ${this._getActivityColor(dayData.hours, maxHours)};
                    border-radius: 4px;
                }
            `;
            const barProvider = new Gtk.CssProvider();
            barProvider.load_from_data(barCss, -1);
            bar.get_style_context().add_provider(barProvider, Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION);
            bar.add_css_class(colorClass);
            
            barBox.append(bar);
            barContainer.append(barBox);
            
            // Day label
            const dayLabel = new Gtk.Label({
                label: dayData.day,
                css_classes: ['caption'],
                halign: Gtk.Align.CENTER
            });
            barContainer.append(dayLabel);
            
            // Hours label
            const hoursLabel = new Gtk.Label({
                label: dayData.hours > 0 ? `${dayData.hours.toFixed(1)}h` : '0h',
                css_classes: ['caption', 'dim-label'],
                halign: Gtk.Align.CENTER
            });
            barContainer.append(hoursLabel);
            
            barsBox.append(barContainer);
        });
        
        chartBox.append(barsBox);
        
        // Total summary
        const totalHours = chartData.reduce((sum, d) => sum + d.hours, 0);
        const summaryLabel = new Gtk.Label({
            label: `Total: ${totalHours.toFixed(1)} hours this week`,
            css_classes: ['caption'],
            halign: Gtk.Align.CENTER,
            margin_top: 8
        });
        chartBox.append(summaryLabel);
        
        this._chart_placeholder.append(chartBox);
    }
    
    _getChartData() {
        // Get last 7 days of data
        const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
        const data = [];
        
        // Get current date and calculate last 7 days
        const today = new Date();
        for (let i = 6; i >= 0; i--) {
            const date = new Date(today);
            date.setDate(date.getDate() - i);
            const dayName = days[date.getDay() === 0 ? 6 : date.getDay() - 1]; // Adjust for Monday start
            
            // Calculate total hours for this day from tasks
            let totalSeconds = 0;
            if (this.allTasks) {
                this.allTasks.forEach(task => {
                    if (task.start) {
                        const taskDate = new Date(task.start);
                        if (taskDate.toDateString() === date.toDateString()) {
                            totalSeconds += task.duration || 0;
                        }
                    }
                });
            }
            
            data.push({
                day: dayName,
                hours: totalSeconds / 3600, // Convert to hours
                date: date
            });
        }
        
        return data;
    }
    
    _getActivityColor(hours, maxHours) {
        const ratio = hours / maxHours;
        if (ratio > 0.7) return '#33d17a'; // Green for high activity
        if (ratio > 0.3) return '#f9c23c'; // Yellow for medium activity  
        if (ratio > 0) return '#99c1f1';   // Light blue for low activity
        return '#deddda';                  // Gray for no activity
    }
    
    _updateWeeklyTime() {
        try {
            const now = new Date();
            const weekStart = new Date(now);
            weekStart.setDate(now.getDate() - now.getDay()); // Start of this week (Sunday)
            weekStart.setHours(0, 0, 0, 0);
            
            let weekTime = 0;
            let weekTasks = 0;
            
            this.allTasks.forEach(task => {
                const taskDate = new Date(task.start || task.created);
                if (taskDate >= weekStart && !task.isActive) { // Only count completed tasks
                    weekTime += task.duration || 0;
                    weekTasks++;
                }
            });
            
            // Update the weekly time display
            if (this._weekly_time_row) {
                const timeText = this._formatDuration(weekTime);
                const tasksText = weekTasks === 1 ? '1 task' : `${weekTasks} tasks`;
                this._weekly_time_row.set_subtitle(`${timeText} • ${tasksText}`);
            }
            
            console.log(`Weekly time updated: ${this._formatDuration(weekTime)} (${weekTasks} tasks)`);
        } catch (error) {
            console.error('Error updating weekly time:', error);
        }
    }
    
    _formatDuration(seconds) {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;
        return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    
    _formatDate(dateString) {
        return new Date(dateString).toLocaleDateString('de-DE', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
        });
    }
    
    _formatDateTimeForEdit(dateString) {
        const date = new Date(dateString);
        const day = date.getDate().toString().padStart(2, '0');
        const month = (date.getMonth() + 1).toString().padStart(2, '0');
        const year = date.getFullYear();
        const hours = date.getHours().toString().padStart(2, '0');
        const minutes = date.getMinutes().toString().padStart(2, '0');
        const seconds = date.getSeconds().toString().padStart(2, '0');
        return `${day}/${month}/${year} ${hours}:${minutes}:${seconds}`;
    }
    
    _parseEuropeanDateTime(dateTimeString) {
        if (!dateTimeString) return null;
        
        const parts = dateTimeString.split(' ');
        if (parts.length !== 2) return dateTimeString;
        
        const [datePart, timePart] = parts;
        const [day, month, year] = datePart.split('/');
        
        if (!day || !month || !year) return dateTimeString;
        
        return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')} ${timePart}`;
    }
    
    loadTasks() {
        this._loadTasks();
    }
    
    _loadProjects() {
        if (!this.dbConnection) {
            console.warn('No database connection for projects');
            return;
        }

        try {
            // First ensure icon column exists
            this._ensureProjectIconColumn();
            
            const sql = `SELECT id, name, color, total_time, icon FROM Project ORDER BY id`;
            const result = executeQuery(this.dbConnection, sql);
            this.allProjects = [];
            
            if (result && result.get_n_rows() > 0) {
                for (let i = 0; i < result.get_n_rows(); i++) {
                    const project = {
                        id: result.get_value_at(0, i),
                        name: result.get_value_at(1, i),
                        color: result.get_value_at(2, i) || '#cccccc',
                        totalTime: result.get_value_at(3, i) || 0,
                        icon: result.get_value_at(4, i) || 'folder-symbolic'
                    };
                    this.allProjects.push(project);
                }
            }
            
            console.log(`Loaded ${this.allProjects.length} projects from database`);
            
            // Calculate actual time from tasks
            this._calculateProjectStats();
            
            this._updateProjectsList();
            this._updateProjectSelector();
            this._updateProjectStats();
            this._refreshChartFilters();
        } catch (error) {
            console.error('Error loading projects:', error);
        }
    }
    
    _calculateProjectStats() {
        // Reset all project times to 0
        this.allProjects.forEach(project => {
            project.totalTime = 0;
            project.taskCount = 0;
        });
        
        // Calculate actual time from tasks
        this.allTasks.forEach(task => {
            const project = this.allProjects.find(p => p.id === task.project_id);
            if (project && !task.isActive) { // Only count completed tasks
                project.totalTime += task.duration || 0;
                project.taskCount += 1;
            }
        });
        
        console.log('Updated project statistics from actual task data');
    }
    
    _updateProjectsList() {
        // Clear existing projects
        while (this._project_list.get_first_child()) {
            this._project_list.remove(this._project_list.get_first_child());
        }
        
        this.allProjects.forEach(project => {
            const row = new Adw.ActionRow({
                title: project.name,
                subtitle: `Total time: ${this._formatDuration(project.totalTime)}`
            });
            
            // Add project icon with color
            const iconBox = new Gtk.Box({
                width_request: 32,
                height_request: 32,
                halign: Gtk.Align.CENTER,
                valign: Gtk.Align.CENTER,
                css_classes: ['project-icon-container']
            });
            
            const icon = new Gtk.Image({
                icon_name: project.icon || 'folder-symbolic',
                pixel_size: 16,
                halign: Gtk.Align.CENTER,
                valign: Gtk.Align.CENTER
            });
            
            // Find color info to determine text color
            const colorInfo = this.projectColors.find(c => c.value === project.color) || { textColor: 'white' };
            
            // Apply color styling
            const css = `
                .project-icon-container {
                    background: ${project.color};
                    border-radius: 16px;
                    border: 1px solid rgba(0,0,0,0.15);
                    padding: 0;
                    margin: 0;
                }
                .project-icon-container image {
                    color: ${colorInfo.textColor};
                    ${colorInfo.textColor === 'white' ? '-gtk-icon-shadow: 1px 1px 1px rgba(0,0,0,0.3);' : ''}
                }
            `;
            
            const provider = new Gtk.CssProvider();
            provider.load_from_data(css, -1);
            iconBox.get_style_context().add_provider(provider, Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION);
            
            iconBox.append(icon);
            row.add_prefix(iconBox);
            
            // Add edit/delete buttons
            const editBtn = new Gtk.Button({
                icon_name: 'document-edit-symbolic',
                css_classes: ['flat'],
                tooltip_text: 'Edit Project'
            });
            editBtn.connect('clicked', () => this._editProject(project.id));
            
            const deleteBtn = new Gtk.Button({
                icon_name: 'user-trash-symbolic', 
                css_classes: ['flat', 'destructive-action'],
                tooltip_text: 'Delete Project',
                sensitive: project.id !== 1 // Can't delete default project
            });
            deleteBtn.connect('clicked', () => this._deleteProject(project.id));
            
            const buttonBox = new Gtk.Box({
                spacing: 6
            });
            buttonBox.append(editBtn);
            buttonBox.append(deleteBtn);
            row.add_suffix(buttonBox);
            
            this._project_list.append(row);
        });
    }
    
    _updateProjectSelector() {
        // Project selector is no longer used in the unified header
        // Set default project directly
        if (this.allProjects.length > 0) {
            this.currentProjectId = this.allProjects[0].id;
            console.log(`Default project set: ${this.allProjects[0].name} (ID: ${this.currentProjectId})`);
        }
    }
    
    _updateProjectStats() {
        const totalProjects = this.allProjects.length;
        const totalTime = this.allProjects.reduce((sum, p) => sum + p.totalTime, 0);
        
        this._total_projects_row.set_subtitle(totalProjects.toString());
        this._total_time_row.set_subtitle(this._formatDuration(totalTime));
    }
    
    _addTaskToList(task) {
        // Add task to the beginning of allTasks array for immediate display
        this.allTasks.unshift(task);
        
        // Update the filtered tasks and display
        this._filterTasks();
        
        console.log('Task added to list:', task.name);
    }
    
    _removeActiveTask(taskName) {
        // Remove the active task and replace with completed version
        this.allTasks = this.allTasks.filter(task => !(task.name === taskName && task.isActive));
        console.log('Active task removed:', taskName);
    }
    
    _showAddProjectDialog() {
        console.log('Opening add project dialog...');
        
        const dialog = new Adw.AlertDialog({
            heading: 'Add New Project',
            body: 'Create a new project with icon and color.'
        });
        
        // Simplified form for testing
        const form = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 12,
            margin_top: 12,
            margin_bottom: 12,
            margin_start: 12,
            margin_end: 12
        });
        
        // Project name
        const nameEntry = new Gtk.Entry({
            placeholder_text: 'Project name'
        });
        form.append(new Gtk.Label({label: 'Project Name:', halign: Gtk.Align.START}));
        form.append(nameEntry);
        
        // Icon selection - simplified grid
        let selectedIcon = this.projectIcons[0];
        form.append(new Gtk.Label({label: 'Project Icon:', halign: Gtk.Align.START}));
        
        const iconGrid = new Gtk.Grid({
            column_spacing: 6,
            row_spacing: 6,
            margin_bottom: 12
        });
        
        // Add first 12 icons in a 6x2 grid
        for (let i = 0; i < 12 && i < this.projectIcons.length; i++) {
            const iconName = this.projectIcons[i];
            const iconButton = new Gtk.Button({
                width_request: 40,
                height_request: 40,
                css_classes: ['flat']
            });
            
            const icon = new Gtk.Image({
                icon_name: iconName,
                pixel_size: 20
            });
            iconButton.set_child(icon);
            
            iconButton.connect('clicked', () => {
                selectedIcon = iconName;
                console.log('Selected icon:', iconName);
            });
            
            const row = Math.floor(i / 6);
            const col = i % 6;
            iconGrid.attach(iconButton, col, row, 1, 1);
        }
        
        form.append(iconGrid);
        
        // Color selection - 2 rows of 8 colors each
        let selectedColor = this.projectColors[0];
        form.append(new Gtk.Label({label: 'Project Color:', halign: Gtk.Align.START}));
        
        const colorGrid = new Gtk.Grid({
            column_spacing: 6,
            row_spacing: 6,
            margin_bottom: 12
        });
        
        // Add all colors (2 rows of 8)
        for (let i = 0; i < 16 && i < this.projectColors.length; i++) {
            const color = this.projectColors[i];
            const colorButton = new Gtk.Button({
                width_request: 30,
                height_request: 30,
                css_classes: ['flat'],
                tooltip_text: color.name
            });
            
            // Set background color with CSS
            const css = `button { background: ${color.value}; border-radius: 15px; border: 2px solid rgba(0,0,0,0.1); }`;
            const provider = new Gtk.CssProvider();
            provider.load_from_data(css, -1);
            colorButton.get_style_context().add_provider(provider, Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION);
            
            colorButton.connect('clicked', () => {
                selectedColor = color;
                console.log('Selected color:', color.name, color.value);
            });
            
            const row = Math.floor(i / 8);
            const col = i % 8;
            colorGrid.attach(colorButton, col, row, 1, 1);
        }
        
        form.append(colorGrid);
        
        dialog.set_extra_child(form);
        dialog.add_response('cancel', 'Cancel');
        dialog.add_response('create', 'Create Project');
        dialog.set_response_appearance('create', Adw.ResponseAppearance.SUGGESTED);
        
        dialog.connect('response', (dialog, response) => {
            console.log('Dialog response:', response);
            if (response === 'create') {
                const name = nameEntry.get_text().trim();
                console.log('Creating project:', name, selectedColor.value, selectedIcon);
                if (name) {
                    this._createProject(name, selectedColor.value, selectedIcon);
                }
            }
            dialog.close();
        });
        
        dialog.present(this);
        console.log('Dialog presented');
    }
    
    _createProject(name, color, icon = 'folder-symbolic') {
        if (!this.dbConnection) {
            console.error('No database connection to create project');
            return;
        }
        
        try {
            // First, ensure the Project table has the icon column
            this._ensureProjectIconColumn();
            
            const sql = `INSERT INTO Project (name, color, icon, total_time) VALUES ('${name.replace(/'/g, "''")}', '${color}', '${icon}', 0)`;
            const result = executeNonSelectCommand(this.dbConnection, sql);
            console.log('Project created:', name, color, icon);
            this._loadProjects(); // Refresh the list
        } catch (error) {
            console.error('Error creating project:', error);
        }
    }
    
    _ensureProjectIconColumn() {
        try {
            // Add icon column if it doesn't exist
            const alterSql = `ALTER TABLE Project ADD COLUMN icon TEXT DEFAULT 'folder-symbolic'`;
            executeNonSelectCommand(this.dbConnection, alterSql);
            console.log('Added icon column to Project table');
        } catch (error) {
            // Column might already exist, that's fine
            console.log('Icon column may already exist in Project table');
        }
    }
    
    _ensureTaskClientColumn() {
        try {
            // Add client_id column if it doesn't exist
            const alterSql = `ALTER TABLE Task ADD COLUMN client_id INTEGER DEFAULT 1`;
            executeNonSelectCommand(this.dbConnection, alterSql);
            console.log('Added client_id column to Task table');
        } catch (error) {
            // Column might already exist, that's fine
            console.log('client_id column may already exist in Task table');
        }
    }
    
    _editProject(projectId) {
        const project = this.allProjects.find(p => p.id === projectId);
        if (!project) return;
        
        console.log('Opening edit project dialog for:', project.name);
        
        const dialog = new Adw.AlertDialog({
            heading: 'Edit Project',
            body: 'Update project name, icon, and color.'
        });
        
        // Simplified form matching the add dialog
        const form = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 12,
            margin_top: 12,
            margin_bottom: 12,
            margin_start: 12,
            margin_end: 12
        });
        
        // Project name
        const nameEntry = new Gtk.Entry({
            placeholder_text: 'Project name',
            text: project.name
        });
        form.append(new Gtk.Label({label: 'Project Name:', halign: Gtk.Align.START}));
        form.append(nameEntry);
        
        // Icon selection - simplified grid
        let selectedIcon = project.icon || 'folder-symbolic';
        form.append(new Gtk.Label({label: 'Project Icon:', halign: Gtk.Align.START}));
        
        const iconGrid = new Gtk.Grid({
            column_spacing: 6,
            row_spacing: 6,
            margin_bottom: 12
        });
        
        // Add first 12 icons in a 6x2 grid
        for (let i = 0; i < 12 && i < this.projectIcons.length; i++) {
            const iconName = this.projectIcons[i];
            const iconButton = new Gtk.Button({
                width_request: 40,
                height_request: 40,
                css_classes: ['flat']
            });
            
            const icon = new Gtk.Image({
                icon_name: iconName,
                pixel_size: 20
            });
            iconButton.set_child(icon);
            
            // Highlight if this is the current icon
            if (iconName === selectedIcon) {
                iconButton.add_css_class('suggested-action');
            }
            
            iconButton.connect('clicked', () => {
                selectedIcon = iconName;
                console.log('Selected icon:', iconName);
                
                // Update visual selection
                for (let j = 0; j < 12 && j < this.projectIcons.length; j++) {
                    const btn = iconGrid.get_child_at(j % 6, Math.floor(j / 6));
                    if (btn) {
                        btn.remove_css_class('suggested-action');
                    }
                }
                iconButton.add_css_class('suggested-action');
            });
            
            const row = Math.floor(i / 6);
            const col = i % 6;
            iconGrid.attach(iconButton, col, row, 1, 1);
        }
        
        form.append(iconGrid);
        
        // Color selection - 2 rows of 8 colors each
        let selectedColor = this.projectColors.find(c => c.value === project.color) || this.projectColors[0];
        form.append(new Gtk.Label({label: 'Project Color:', halign: Gtk.Align.START}));
        
        const colorGrid = new Gtk.Grid({
            column_spacing: 6,
            row_spacing: 6,
            margin_bottom: 12
        });
        
        // Add all colors (2 rows of 8)
        for (let i = 0; i < 16 && i < this.projectColors.length; i++) {
            const color = this.projectColors[i];
            const colorButton = new Gtk.Button({
                width_request: 30,
                height_request: 30,
                css_classes: ['flat'],
                tooltip_text: color.name
            });
            
            // Set background color with CSS
            let css = `button { background: ${color.value}; border-radius: 15px; border: 2px solid rgba(0,0,0,0.1); }`;
            if (color.value === selectedColor.value) {
                css = `button { background: ${color.value}; border-radius: 15px; border: 3px solid #000000; }`;
            }
            
            const provider = new Gtk.CssProvider();
            provider.load_from_data(css, -1);
            colorButton.get_style_context().add_provider(provider, Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION);
            
            colorButton.connect('clicked', () => {
                selectedColor = color;
                console.log('Selected color:', color.name, color.value);
                
                // Update visual selection for all color buttons
                for (let j = 0; j < 16 && j < this.projectColors.length; j++) {
                    const row = Math.floor(j / 8);
                    const col = j % 8;
                    const btn = colorGrid.get_child_at(col, row);
                    if (btn) {
                        const currentColor = this.projectColors[j];
                        const newCss = j === i 
                            ? `button { background: ${currentColor.value}; border-radius: 15px; border: 3px solid #000000; }`
                            : `button { background: ${currentColor.value}; border-radius: 15px; border: 2px solid rgba(0,0,0,0.1); }`;
                        const newProvider = new Gtk.CssProvider();
                        newProvider.load_from_data(newCss, -1);
                        btn.get_style_context().add_provider(newProvider, Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION);
                    }
                }
            });
            
            const row = Math.floor(i / 8);
            const col = i % 8;
            colorGrid.attach(colorButton, col, row, 1, 1);
        }
        
        form.append(colorGrid);
        
        dialog.set_extra_child(form);
        dialog.add_response('cancel', 'Cancel');
        dialog.add_response('save', 'Save Changes');
        dialog.set_response_appearance('save', Adw.ResponseAppearance.SUGGESTED);
        
        dialog.connect('response', (dialog, response) => {
            console.log('Edit dialog response:', response);
            if (response === 'save') {
                const name = nameEntry.get_text().trim();
                console.log('Updating project:', name, selectedColor.value, selectedIcon);
                if (name) {
                    this._updateProject(projectId, name, selectedColor.value, selectedIcon);
                }
            }
            dialog.close();
        });
        
        dialog.present(this);
        console.log('Edit dialog presented');
    }
    
    _updateProject(projectId, name, color, icon) {
        if (!this.dbConnection) {
            console.error('No database connection to update project');
            return;
        }
        
        try {
            const sql = `UPDATE Project SET name = '${name.replace(/'/g, "''")}', color = '${color}', icon = '${icon}' WHERE id = ${projectId}`;
            executeNonSelectCommand(this.dbConnection, sql);
            console.log('Project updated:', name, color, icon);
            this._loadProjects(); // Refresh the list
        } catch (error) {
            console.error('Error updating project:', error);
        }
    }
    
    _deleteProject(projectId) {
        if (projectId === 1) {
            console.log('Cannot delete default project');
            return;
        }
        
        const dialog = new Adw.AlertDialog({
            heading: 'Delete Project',
            body: 'Are you sure you want to delete this project? All associated tasks will be moved to the Default project.'
        });
        
        dialog.add_response('cancel', 'Cancel');
        dialog.add_response('delete', 'Delete');
        dialog.set_response_appearance('delete', Adw.ResponseAppearance.DESTRUCTIVE);
        
        dialog.connect('response', (dialog, response) => {
            if (response === 'delete') {
                this._confirmDeleteProject(projectId);
            }
            dialog.close();
        });
        
        dialog.present(this);
    }
    
    _confirmDeleteProject(projectId) {
        if (!this.dbConnection) return;
        
        try {
            // Move tasks to default project
            const updateTasks = `UPDATE Task SET project_id = 1 WHERE project_id = ${projectId}`;
            executeNonSelectCommand(this.dbConnection, updateTasks);
            
            // Delete project
            const deleteProject = `DELETE FROM Project WHERE id = ${projectId}`;
            executeNonSelectCommand(this.dbConnection, deleteProject);
            
            console.log('Project deleted:', projectId);
            this._loadProjects(); // Refresh
        } catch (error) {
            console.error('Error deleting project:', error);
        }
    }
    
    _filterProjects() {
        // TODO: Implement project filtering
        console.log('Filter projects:', this._project_search.get_text());
    }
    
    _selectProject(projectId) {
        console.log('Selected project ID:', projectId);
        // TODO: Show project details
    }
    
    getCurrentProjectId() {
        return this.currentProjectId;
    }
    
    getCurrentProjectName() {
        const project = this.allProjects.find(p => p.id === this.currentProjectId);
        return project ? project.name : 'Default';
    }
    
    _toggleTaskSelection(taskId, row) {
        if (this.selectedTasks.has(taskId)) {
            this.selectedTasks.delete(taskId);
            row.remove_css_class('selected-task');
        } else {
            this.selectedTasks.add(taskId);
            row.add_css_class('selected-task');
        }
    }
    
    _deleteSelectedTasks() {
        if (this.selectedTasks.size === 0) {
            return;
        }
        
        const dialog = new Adw.AlertDialog({
            heading: 'Delete Tasks',
            body: `Are you sure you want to delete ${this.selectedTasks.size} selected task(s)?`
        });
        
        dialog.add_response('cancel', 'Cancel');
        dialog.add_response('delete', 'Delete');
        dialog.set_response_appearance('delete', Adw.ResponseAppearance.DESTRUCTIVE);
        
        dialog.connect('response', (dialog, response) => {
            if (response === 'delete') {
                this._confirmDeleteTasks();
            }
            dialog.close();
        });
        
        dialog.present(this);
    }
    
    _confirmDeleteTasks() {
        if (!this.dbConnection) {
            console.error('No database connection to delete tasks');
            return;
        }
        
        try {
            const taskIds = Array.from(this.selectedTasks);
            const placeholders = taskIds.map(() => '?').join(',');
            const sql = `DELETE FROM Task WHERE id IN (${taskIds.join(',')})`;
            
            executeNonSelectCommand(this.dbConnection, sql);
            
            this.allTasks = this.allTasks.filter(task => !this.selectedTasks.has(task.id));
            
            this.selectedTasks.clear();
            
            this._filterTasks();
            
            console.log(`Deleted ${taskIds.length} tasks`);
        } catch (error) {
            console.error('Error deleting tasks:', error);
        }
    }
    
    _editTask(taskId) {
        const task = this.allTasks.find(t => t.id === taskId);
        if (!task) return;
        
        console.log('Opening edit task dialog for:', task.name);
        
        const dialog = new Adw.AlertDialog({
            heading: 'Edit Task',
            body: 'Update task details and see cost calculation.'
        });
        
        const form = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 12,
            margin_top: 12,
            margin_bottom: 12,
            margin_start: 12,
            margin_end: 12
        });
        
        // Task name
        const nameEntry = new Gtk.Entry({
            placeholder_text: 'Task name',
            text: task.name
        });
        form.append(new Gtk.Label({label: 'Task Name:', halign: Gtk.Align.START}));
        form.append(nameEntry);
        
        // Project selection
        const projectCombo = new Gtk.DropDown();
        const projectModel = new Gtk.StringList();
        let selectedProjectIndex = 0;
        
        this.allProjects.forEach((project, index) => {
            projectModel.append(project.name);
            if (project.id === task.project_id) {
                selectedProjectIndex = index;
            }
        });
        projectCombo.set_model(projectModel);
        projectCombo.set_selected(selectedProjectIndex);
        
        form.append(new Gtk.Label({label: 'Project:', halign: Gtk.Align.START}));
        form.append(projectCombo);
        
        // Client selection
        const clientCombo = new Gtk.DropDown();
        const clientModel = new Gtk.StringList();
        let selectedClientIndex = 0;
        
        this.allClients.forEach((client, index) => {
            clientModel.append(client.name);
            if (client.id === task.client_id) {
                selectedClientIndex = index;
            }
        });
        clientCombo.set_model(clientModel);
        clientCombo.set_selected(selectedClientIndex);
        
        form.append(new Gtk.Label({label: 'Client:', halign: Gtk.Align.START}));
        form.append(clientCombo);
        
        // Start time
        const formattedStartTime = task.start ? this._formatDateTimeForEdit(task.start) : '';
        const startTimeEntry = new Gtk.Entry({
            placeholder_text: 'DD/MM/YYYY HH:MM:SS',
            text: formattedStartTime
        });
        form.append(new Gtk.Label({label: 'Start Time:', halign: Gtk.Align.START}));
        form.append(startTimeEntry);
        
        // End time
        const formattedEndTime = task.end ? this._formatDateTimeForEdit(task.end) : '';
        const endTimeEntry = new Gtk.Entry({
            placeholder_text: 'DD/MM/YYYY HH:MM:SS',
            text: formattedEndTime
        });
        form.append(new Gtk.Label({label: 'End Time:', halign: Gtk.Align.START}));
        form.append(endTimeEntry);
        
        // Cost calculation display
        const costLabel = new Gtk.Label({
            label: '',
            halign: Gtk.Align.START,
            css_classes: ['title-4']
        });
        
        // Function to update cost display
        const updateCostDisplay = () => {
            const clientIndex = clientCombo.get_selected();
            const client = this.allClients[clientIndex];
            const rate = client ? client.rate : 0;
            const hours = task.duration / 3600;
            const cost = hours * rate;
            
            costLabel.set_label(`Duration: ${this._formatDuration(task.duration)} • Rate: €${rate}/hour • Total Cost: €${cost.toFixed(2)}`);
        };
        
        // Update cost when client changes
        clientCombo.connect('notify::selected', updateCostDisplay);
        updateCostDisplay(); // Initial calculation
        
        form.append(new Gtk.Label({label: 'Cost Calculation:', halign: Gtk.Align.START}));
        form.append(costLabel);
        
        dialog.set_extra_child(form);
        dialog.add_response('cancel', 'Cancel');
        dialog.add_response('save', 'Save Changes');
        dialog.set_response_appearance('save', Adw.ResponseAppearance.SUGGESTED);
        
        dialog.connect('response', (dialog, response) => {
            console.log('Edit task dialog response:', response);
            if (response === 'save') {
                const name = nameEntry.get_text().trim();
                const projectIndex = projectCombo.get_selected();
                const clientIndex = clientCombo.get_selected();
                const startTime = startTimeEntry.get_text().trim();
                const endTime = endTimeEntry.get_text().trim();
                
                if (name && projectIndex >= 0 && clientIndex >= 0) {
                    const project = this.allProjects[projectIndex];
                    const client = this.allClients[clientIndex];
                    this._updateTask(taskId, name, project.id, client.id, startTime, endTime);
                }
            }
            dialog.close();
        });
        
        dialog.present(this);
        console.log('Edit task dialog presented');
    }
    
    _updateTask(taskId, name, projectId, clientId, startTime = null, endTime = null) {
        if (!this.dbConnection) {
            console.error('No database connection to update task');
            return;
        }
        
        try {
            let sql = `UPDATE Task SET name = '${name.replace(/'/g, "''")}', project_id = ${projectId}, client_id = ${clientId}`;
            
            let newDuration = null;
            
            if (startTime && endTime) {
                const isoStartTime = this._parseEuropeanDateTime(startTime);
                const isoEndTime = this._parseEuropeanDateTime(endTime);
                
                // Calculate new duration in seconds
                const startDate = new Date(isoStartTime);
                const endDate = new Date(isoEndTime);
                
                if (endDate > startDate) {
                    newDuration = Math.floor((endDate - startDate) / 1000);
                    sql += `, start_time = '${isoStartTime}', end_time = '${isoEndTime}', time_spent = ${newDuration}`;
                    console.log(`Recalculated duration: ${newDuration} seconds (${this._formatDuration(newDuration)})`);
                } else {
                    console.warn('End time must be after start time');
                    return;
                }
            } else if (startTime) {
                const isoStartTime = this._parseEuropeanDateTime(startTime);
                sql += `, start_time = '${isoStartTime}'`;
            } else if (endTime) {
                const isoEndTime = this._parseEuropeanDateTime(endTime);
                sql += `, end_time = '${isoEndTime}'`;
            }
            
            sql += ` WHERE id = ${taskId}`;
            
            executeNonSelectCommand(this.dbConnection, sql);
            console.log('Task updated:', name, projectId, clientId, startTime, endTime);
            if (newDuration !== null) {
                console.log(`New duration: ${this._formatDuration(newDuration)}`);
            }
            this._loadTasks(); // Refresh the task list
        } catch (error) {
            console.error('Error updating task:', error);
        }
    }
    
    _startTrackingFromTask(task) {
        console.log('Start tracking from task:', task.name);
        
        // Stop any currently active tracking first
        const currentlyTrackingButtons = [
            this._track_button,
            this._track_button_projects, 
            this._track_button_clients
        ];
        
        // Check if any tracking is currently active and stop it
        currentlyTrackingButtons.forEach(btn => {
            if (btn && btn.get_icon_name() === 'media-playback-stop-symbolic') {
                btn.emit('clicked'); // Stop current tracking
                console.log('Stopped current tracking');
            }
        });
        
        // Set the project and client context based on the task
        this.currentProjectId = task.project_id;
        this.currentClientId = task.client_id;
        
        // Update UI context buttons
        if (task.project) {
            this._updateProjectButtonsDisplay(task.project);
        }
        if (task.client) {
            this._updateClientButtonsDisplay(task.client);
        }
        
        // Use the exact same task name (or create new instance)
        let newTaskName = task.name;
        
        // If the task is currently active, create a new instance with a number
        if (task.isActive) {
            const continuationMatch = task.name.match(/^(.+?)\s*\((\d+)\)$/);
            if (continuationMatch) {
                // If it has a number, increment it
                const baseName = continuationMatch[1];
                const currentNumber = parseInt(continuationMatch[2]);
                newTaskName = `${baseName} (${currentNumber + 1})`;
            } else {
                // If no number, add (2)
                newTaskName = `${task.name} (2)`;
            }
        }
        // If task is completed, use the same name to create a new session
        
        // Set task name in all header input fields 
        const taskInputs = [
            this._task_name,
            this._task_name_projects,
            this._task_name_clients
        ];
        
        taskInputs.forEach(input => {
            if (input) {
                input.set_text(newTaskName);
            }
        });
        
        // Start tracking on the main tasks page
        const trackButton = this._track_button;
        if (trackButton) {
            // Simulate clicking the track button to start tracking
            trackButton.emit('clicked');
            console.log(`✅ Started tracking: "${newTaskName}" with project: ${task.project}, client: ${task.client}`);
        }
        
        // Switch to tasks page to show the tracking
        this._showPage('tasks');
    }
    
    _stopCurrentTracking() {
        console.log('Stop current tracking');
        
        // Find and click the stop button on any active tracking
        const trackingButtons = [
            this._track_button,
            this._track_button_projects,
            this._track_button_clients
        ];
        
        trackingButtons.forEach(btn => {
            if (btn && btn.get_icon_name() === 'media-playback-stop-symbolic') {
                btn.emit('clicked'); // Stop current tracking
                console.log('Stopped tracking via button click');
            }
        });
    }
    
    _showProjectSelector() {
        const dialog = new Adw.AlertDialog({
            heading: 'Select Project',
            body: 'Choose a project for time tracking'
        });
        
        // Create project list
        const scrolled = new Gtk.ScrolledWindow({
            width_request: 300,
            height_request: 200
        });
        
        const listBox = new Gtk.ListBox({
            css_classes: ['boxed-list']
        });
        
        this.allProjects.forEach(project => {
            const row = new Adw.ActionRow({
                title: project.name,
                subtitle: `Total time: ${this._formatDuration(project.totalTime)}`,
                activatable: true
            });
            
            // Add selected indicator
            if (project.id === this.currentProjectId) {
                row.add_css_class('selected-project');
                const checkIcon = new Gtk.Image({
                    icon_name: 'emblem-ok-symbolic',
                    css_classes: ['accent']
                });
                row.add_suffix(checkIcon);
            }
            
            row.connect('activated', () => {
                this.currentProjectId = project.id;
                console.log(`Selected project: ${project.name} (ID: ${project.id})`);
                this._updateProjectButtonsDisplay(project.name);
                dialog.close();
            });
            
            listBox.append(row);
        });
        
        scrolled.set_child(listBox);
        dialog.set_extra_child(scrolled);
        
        dialog.add_response('cancel', 'Cancel');
        dialog.present(this);
    }
    
    _showClientSelector() {
        const dialog = new Adw.AlertDialog({
            heading: 'Select Client',
            body: 'Choose a client for time tracking'
        });
        
        // Create client list
        const scrolled = new Gtk.ScrolledWindow({
            width_request: 300,
            height_request: 200
        });
        
        const listBox = new Gtk.ListBox({
            css_classes: ['boxed-list']
        });
        
        if (this.allClients.length === 0) {
            const noClientsRow = new Adw.ActionRow({
                title: 'No clients available',
                subtitle: 'Go to Clients page to add clients',
                sensitive: false
            });
            listBox.append(noClientsRow);
        } else {
            this.allClients.forEach(client => {
                const row = new Adw.ActionRow({
                    title: client.name,
                    subtitle: `${client.email} • €${client.rate}/hour`,
                    activatable: true
                });
                
                // Add selected indicator
                if (client.id === this.currentClientId) {
                    row.add_css_class('selected-client');
                    const checkIcon = new Gtk.Image({
                        icon_name: 'emblem-ok-symbolic',
                        css_classes: ['accent']
                    });
                    row.add_suffix(checkIcon);
                }
                
                row.connect('activated', () => {
                    this.currentClientId = client.id;
                    console.log(`Selected client: ${client.name} (ID: ${client.id})`);
                    this._updateClientButtonsDisplay(client.name);
                    dialog.close();
                });
                
                listBox.append(row);
            });
        }
        
        scrolled.set_child(listBox);
        dialog.set_extra_child(scrolled);
        
        dialog.add_response('cancel', 'Cancel');
        dialog.present(this);
    }
    
    
    _updateProjectButtonsDisplay(projectName) {
        const project = this.allProjects.find(p => p.name === projectName);
        if (!project) return;
        
        const projectButtons = [
            this._project_context_btn,
            this._project_context_btn_projects,
            this._project_context_btn_clients
        ];
        
        // Find color info to determine text color
        const colorInfo = this.projectColors.find(c => c.value === project.color) || { textColor: 'white' };
        
        projectButtons.forEach(btn => {
            if (btn) {
                // Update tooltip
                btn.set_tooltip_text(`Project: ${projectName}`);
                
                // Change icon to project icon
                btn.set_icon_name(project.icon || 'folder-symbolic');
                
                // Apply project color styling with appropriate text color
                const css = `
                    .project-context-active {
                        background: ${project.color};
                        border-radius: 18px;
                        border: 1px solid rgba(0,0,0,0.2);
                    }
                    .project-context-active:hover {
                        background: ${this._lightenColor(project.color, 20)};
                        transform: scale(1.05);
                    }
                    .project-context-active image {
                        color: ${colorInfo.textColor};
                        ${colorInfo.textColor === 'white' ? '-gtk-icon-shadow: 1px 1px 1px rgba(0,0,0,0.3);' : ''}
                    }
                `;
                
                const provider = new Gtk.CssProvider();
                provider.load_from_data(css, -1);
                btn.get_style_context().add_provider(provider, Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION);
                
                // Add styling class
                btn.remove_css_class('context-selected');
                btn.add_css_class('project-context-active');
            }
        });
    }
    
    _lightenColor(color, percent) {
        // Simple color lightening function
        const num = parseInt(color.replace("#",""), 16);
        const amt = Math.round(2.55 * percent);
        const R = (num >> 16) + amt;
        const G = (num >> 8 & 0x00FF) + amt;
        const B = (num & 0x0000FF) + amt;
        return "#" + (0x1000000 + (R<255?R<1?0:R:255)*0x10000 +
            (G<255?G<1?0:G:255)*0x100 + (B<255?B<1?0:B:255))
            .toString(16).slice(1);
    }
    
    _updateClientButtonsDisplay(clientName) {
        const clientButtons = [
            this._client_context_btn,
            this._client_context_btn_projects,
            this._client_context_btn_clients
        ];
        
        clientButtons.forEach(btn => {
            if (btn) {
                btn.set_tooltip_text(`Client: ${clientName}`);
                // Optionally add a visual indicator that client is selected
                btn.add_css_class('context-selected');
            }
        });
    }
    
    
    _initializeContextButtons() {
        // Use a small delay to ensure UI elements are ready
        GLib.timeout_add(GLib.PRIORITY_DEFAULT, 100, () => {
            // Initialize with default project
            if (this.allProjects.length > 0) {
                const defaultProject = this.allProjects.find(p => p.id === this.currentProjectId) || this.allProjects[0];
                this._updateProjectButtonsDisplay(defaultProject.name);
            }
            
            // Initialize with default client
            if (this.allClients.length > 0) {
                const defaultClient = this.allClients.find(c => c.id === this.currentClientId) || this.allClients[0];
                this._updateClientButtonsDisplay(defaultClient.name);
            }
            
            
            return GLib.SOURCE_REMOVE;
        });
    }
    
    getCurrentProject() {
        return this.allProjects.find(p => p.id === this.currentProjectId);
    }
    
    getCurrentClient() {
        return this.allClients.find(c => c.id === this.currentClientId);
    }
    
    getSelectedContext() {
        return {
            project: this.getCurrentProject(),
            client: this.getCurrentClient()
        };
    }
    
    // Client management methods
    _loadClients() {
        if (!this.dbConnection) {
            console.warn('No database connection for clients');
            return;
        }

        try {
            const sql = `SELECT id, name, email, rate FROM Client ORDER BY name`;
            const result = executeQuery(this.dbConnection, sql);
            this.allClients = [];
            
            if (result && result.get_n_rows() > 0) {
                for (let i = 0; i < result.get_n_rows(); i++) {
                    const client = {
                        id: result.get_value_at(0, i),
                        name: result.get_value_at(1, i),
                        email: result.get_value_at(2, i) || '',
                        rate: result.get_value_at(3, i) || 0
                    };
                    this.allClients.push(client);
                }
            }
            
            console.log(`Loaded ${this.allClients.length} clients from database`);
            
            // Calculate actual revenue from tasks
            this._calculateClientStats();
            
            this._updateClientsList();
            this._updateClientStats();
            this._refreshChartFilters();
        } catch (error) {
            console.log('Clients table may not exist yet, will be created');
            this._createClientTable();
        }
    }
    
    _createClientTable() {
        if (!this.dbConnection) return;
        
        try {
            const sql = `
                CREATE TABLE IF NOT EXISTS Client (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL,
                    email TEXT,
                    rate REAL DEFAULT 50.0,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            `;
            executeNonSelectCommand(this.dbConnection, sql);
            console.log('Client table created');
            
            // Add default client
            const defaultClient = `
                INSERT OR IGNORE INTO Client (id, name, email, rate)
                VALUES (1, 'Default Client', 'client@example.com', 50.0)
            `;
            executeNonSelectCommand(this.dbConnection, defaultClient);
            
            this._loadClients();
        } catch (error) {
            console.error('Error creating client table:', error);
        }
    }
    
    _calculateClientStats() {
        this.allClients.forEach(client => {
            client.totalRevenue = 0;
            client.totalHours = 0;
        });
        
        this.allTasks.forEach(task => {
            const client = this.allClients.find(c => c.id === task.client_id);
            if (client && !task.isActive && task.duration) {
                const hours = task.duration / 3600;
                const revenue = hours * client.rate;
                client.totalRevenue += revenue;
                client.totalHours += hours;
            }
        });
        
        console.log('Client stats calculated:');
        this.allClients.forEach(client => {
            console.log(`${client.name}: €${client.totalRevenue.toFixed(2)} (${client.totalHours.toFixed(2)}h @ €${client.rate}/h)`);
        });
    }
    
    _updateClientsList() {
        // Clear existing clients
        while (this._client_list.get_first_child()) {
            this._client_list.remove(this._client_list.get_first_child());
        }
        
        this.allClients.forEach(client => {
            const row = new Adw.ActionRow({
                title: client.name,
                subtitle: `${client.email} • €${client.rate}/hour`
            });
            
            // Add edit/delete buttons
            const editBtn = new Gtk.Button({
                icon_name: 'document-edit-symbolic',
                css_classes: ['flat'],
                tooltip_text: 'Edit Client'
            });
            editBtn.connect('clicked', () => this._editClient(client.id));
            
            const deleteBtn = new Gtk.Button({
                icon_name: 'user-trash-symbolic', 
                css_classes: ['flat', 'destructive-action'],
                tooltip_text: 'Delete Client',
                sensitive: client.id !== 1 // Can't delete default client
            });
            deleteBtn.connect('clicked', () => this._deleteClient(client.id));
            
            const buttonBox = new Gtk.Box({
                spacing: 6
            });
            buttonBox.append(editBtn);
            buttonBox.append(deleteBtn);
            row.add_suffix(buttonBox);
            
            this._client_list.append(row);
        });
    }
    
    _updateClientStats() {
        const totalClients = this.allClients.length;
        const totalRevenue = this.allClients.reduce((sum, c) => sum + (c.totalRevenue || 0), 0);
        
        this._total_clients_row.set_subtitle(totalClients.toString());
        this._total_revenue_row.set_subtitle(`€${totalRevenue.toFixed(2)}`);
    }
    
    _showAddClientDialog() {
        const dialog = new Adw.AlertDialog({
            heading: 'Add New Client',
            body: 'Create a new client for your projects.'
        });
        
        // Create form content
        const form = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 12,
            margin_top: 12,
            margin_bottom: 12,
            margin_start: 12,
            margin_end: 12
        });
        
        const nameEntry = new Gtk.Entry({
            placeholder_text: 'Client name'
        });
        
        const emailEntry = new Gtk.Entry({
            placeholder_text: 'Email address'
        });
        
        const rateSpinButton = new Gtk.SpinButton({
            adjustment: new Gtk.Adjustment({
                lower: 0,
                upper: 1000,
                step_increment: 5,
                value: 50
            })
        });
        
        form.append(new Gtk.Label({label: 'Client Name:', halign: Gtk.Align.START}));
        form.append(nameEntry);
        form.append(new Gtk.Label({label: 'Email:', halign: Gtk.Align.START}));
        form.append(emailEntry);
        form.append(new Gtk.Label({label: 'Hourly Rate (€):', halign: Gtk.Align.START}));
        form.append(rateSpinButton);
        
        dialog.set_extra_child(form);
        dialog.add_response('cancel', 'Cancel');
        dialog.add_response('create', 'Create Client');
        dialog.set_response_appearance('create', Adw.ResponseAppearance.SUGGESTED);
        
        dialog.connect('response', (dialog, response) => {
            if (response === 'create') {
                const name = nameEntry.get_text().trim();
                const email = emailEntry.get_text().trim();
                const rate = rateSpinButton.get_value();
                if (name) {
                    this._createClient(name, email, rate);
                }
            }
            dialog.close();
        });
        
        dialog.present(this);
    }
    
    _createClient(name, email, rate) {
        if (!this.dbConnection) {
            console.error('No database connection to create client');
            return;
        }
        
        try {
            const sql = `INSERT INTO Client (name, email, rate) VALUES ('${name.replace(/'/g, "''")}', '${email.replace(/'/g, "''")}', ${rate})`;
            executeNonSelectCommand(this.dbConnection, sql);
            console.log('Client created:', name, email, rate);
            this._loadClients();
        } catch (error) {
            console.error('Error creating client:', error);
        }
    }
    
    _editClient(clientId) {
        const client = this.allClients.find(c => c.id === clientId);
        if (!client) return;
        
        console.log('Opening edit client dialog for:', client.name);
        
        const dialog = new Adw.AlertDialog({
            heading: 'Edit Client',
            body: 'Update client information.'
        });
        
        // Simplified form matching the project edit dialog pattern
        const form = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 12,
            margin_top: 12,
            margin_bottom: 12,
            margin_start: 12,
            margin_end: 12
        });
        
        // Client name
        const nameEntry = new Gtk.Entry({
            placeholder_text: 'Client name',
            text: client.name
        });
        form.append(new Gtk.Label({label: 'Client Name:', halign: Gtk.Align.START}));
        form.append(nameEntry);
        
        // Client email
        const emailEntry = new Gtk.Entry({
            placeholder_text: 'Email address',
            text: client.email || ''
        });
        form.append(new Gtk.Label({label: 'Email Address:', halign: Gtk.Align.START}));
        form.append(emailEntry);
        
        // Hourly rate
        const rateEntry = new Gtk.Entry({
            placeholder_text: 'Hourly rate',
            text: client.rate?.toString() || '0'
        });
        form.append(new Gtk.Label({label: 'Hourly Rate (€):', halign: Gtk.Align.START}));
        form.append(rateEntry);
        
        dialog.set_extra_child(form);
        dialog.add_response('cancel', 'Cancel');
        dialog.add_response('save', 'Save Changes');
        dialog.set_response_appearance('save', Adw.ResponseAppearance.SUGGESTED);
        
        dialog.connect('response', (dialog, response) => {
            console.log('Edit client dialog response:', response);
            if (response === 'save') {
                const name = nameEntry.get_text().trim();
                const email = emailEntry.get_text().trim();
                const rate = parseFloat(rateEntry.get_text().trim()) || 0;
                
                console.log('Updating client:', name, email, rate);
                if (name) {
                    this._updateClient(clientId, name, email, rate);
                }
            }
            dialog.close();
        });
        
        dialog.present(this);
        console.log('Edit client dialog presented');
    }
    
    _updateClient(clientId, name, email, rate) {
        if (!this.dbConnection) {
            console.error('No database connection to update client');
            return;
        }
        
        try {
            const sql = `UPDATE Client SET name = '${name.replace(/'/g, "''")}', email = '${email.replace(/'/g, "''")}', rate = ${rate} WHERE id = ${clientId}`;
            executeNonSelectCommand(this.dbConnection, sql);
            console.log('Client updated:', name, email, rate);
            this._loadClients(); // Refresh the list
        } catch (error) {
            console.error('Error updating client:', error);
        }
    }
    
    _deleteClient(clientId) {
        if (clientId === 1) {
            console.log('Cannot delete default client');
            return;
        }
        
        const dialog = new Adw.AlertDialog({
            heading: 'Delete Client',
            body: 'Are you sure you want to delete this client?'
        });
        
        dialog.add_response('cancel', 'Cancel');
        dialog.add_response('delete', 'Delete');
        dialog.set_response_appearance('delete', Adw.ResponseAppearance.DESTRUCTIVE);
        
        dialog.connect('response', (dialog, response) => {
            if (response === 'delete') {
                this._confirmDeleteClient(clientId);
            }
            dialog.close();
        });
        
        dialog.present(this);
    }
    
    _confirmDeleteClient(clientId) {
        if (!this.dbConnection) return;
        
        try {
            const sql = `DELETE FROM Client WHERE id = ${clientId}`;
            executeNonSelectCommand(this.dbConnection, sql);
            console.log('Client deleted:', clientId);
            this._loadClients();
        } catch (error) {
            console.error('Error deleting client:', error);
        }
    }
    
    _filterClients() {
        console.log('Filter clients:', this._client_search.get_text());
        // TODO: Implement client filtering
    }
    
    _selectClient(clientId) {
        this.currentClientId = clientId;
        console.log('Selected client ID:', clientId);
    }
});