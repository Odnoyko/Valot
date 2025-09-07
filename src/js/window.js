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
import Gio from 'gi://Gio';
import { timeTrack } from 'resource:///com/odnoyko/valot/js/global/timetracking.js';
import { trackingStateManager } from 'resource:///com/odnoyko/valot/js/global/trackingStateManager.js';
import { saveTask } from 'resource:///com/odnoyko/valot/js/global/addtask.js';
import { setupDatabase, executeQuery, executeNonSelectCommand } from 'resource:///com/odnoyko/valot/js/dbinitialisation.js';
import { CompactTrackerWindow } from 'resource:///com/odnoyko/valot/js/compactTracker.js';
import { InputValidator } from 'resource:///com/odnoyko/valot/js/global/inputValidation.js';
import { ProjectManager } from 'resource:///com/odnoyko/valot/js/projects/projectManager.js';
import { ClientManager } from 'resource:///com/odnoyko/valot/js/clients/clientManager.js';
import { TimeUtils } from 'resource:///com/odnoyko/valot/js/utils/timeUtils.js';
import { SimpleChart } from 'resource:///com/odnoyko/valot/js/charts/simpleChart.js';
import { TaskRenderer } from 'resource:///com/odnoyko/valot/js/tasks/taskRenderer.js';
import { PDFExporter } from 'resource:///com/odnoyko/valot/js/reports/pdfExporter.js';
import { ReportExporter } from 'resource:///com/odnoyko/valot/js/reports/reportExporter.js';
import { showAboutDialog } from 'resource:///com/odnoyko/valot/js/global/aboutDialog.js';

export const ValotWindow = GObject.registerClass({
    GTypeName: 'ValotWindow',
    Template: 'resource:///com/odnoyko/valot/ui/window.ui',
    InternalChildren: [
        'split_view', 'main_content', 'sidebar_list',
        'sidebar_toggle_btn', 'show_sidebar_btn', 'show_sidebar_btn2', 'show_sidebar_btn3', 'show_sidebar_btn5', 'menu_button',
        'tasks_page', 'projects_page', 'clients_page', 'reports_page', 'sidebar_compact_tracker',
        'track_button', 'task_name', 'actual_time',
        'task_name_projects', 'project_context_btn_projects', 'client_context_btn_projects', 'actual_time_projects', 'track_button_projects',
        'task_name_clients', 'project_context_btn_clients', 'client_context_btn_clients', 'actual_time_clients', 'track_button_clients', 
        'task_name_reports', 'project_context_btn_reports', 'client_context_btn_reports', 'actual_time_reports', 'track_button_reports',
        'project_context_btn', 'client_context_btn',
        'task_search', 'task_filter', 'task_list',
        'prev_page_btn', 'next_page_btn', 'page_info',
        'recent_tasks_list', 'chart_placeholder', 'period_filter', 'project_filter', 'client_filter',
        'add_project_btn', 'project_search', 'project_list',
        'tracking_widget', 'tracking_widget_projects', 'tracking_widget_clients', 'tracking_widget_reports', 'tasks_header', 'projects_header', 'clients_header', 'reports_header',
        'add_client_btn', 'client_search', 'client_list',
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
        this.selectedStacks = new Set(); // Selected stack base names
        this.taskRowMap = new Map();
        this.stackRowMap = new Map(); // Maps stack rows to base names
        this.allClients = [];
        this.currentClientId = 1;
        
        // Compact tracker window
        this.compactTrackerWindow = null;
        
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
            
            this.clientManager = new ClientManager(this.dbConnection);
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
        this._setupCompactTrackerButton();
        
        this._loadProjects();
        this._loadClients();
        
        // Initialize task renderer BEFORE loading tasks (needed for rendering)
        this.taskRenderer = new TaskRenderer(this.timeUtils, this.allProjects, this);
        
        this._loadTasks();
        this._updateReports();
        this._updateWeeklyTime();
        
        // Initialize chart component
        this.simpleChart = new SimpleChart(this._chart_placeholder);
        this._setupChartFilters();
        this.simpleChart.createChart(this.allTasks, this.allProjects, this.allClients);
        
        // Setup tracking state manager subscriptions
        this._setupTrackingStateSubscription();
        
        this._initializeContextButtons();
        this._setupWindowVisibilityTracking();
    }
    
    _setupWindowVisibilityTracking() {
        // Only listen for window minimize/iconify, not focus loss
        this.connect('notify::minimized', () => {
            if (this.minimized) {
                this._showCompactTrackerOnHide();
            }
        });
    }
    
    _showCompactTrackerOnHide() {
        console.log('🔄 Main window hidden - showing compact tracker...');
        
        if (!this.compactTrackerWindow) {
            this.compactTrackerWindow = new CompactTrackerWindow(this.application, this);
            console.log('🔄 Compact tracker created for hidden window');
        }
        
        this.compactTrackerWindow.present();
        console.log('🔄 Compact tracker shown');
    }
    
    _launchCompactTrackerDebug() {
        console.log('🧪 Debug: Launching compact tracker from sidebar...');
        
        if (!this.debugCompactTracker) {
            this.debugCompactTracker = new CompactTrackerWindow(this.application, this);
            console.log('🧪 Debug compact tracker created');
        }
        
        this.debugCompactTracker.present();
        console.log('🧪 Debug compact tracker presented');
    }
    
    _setupNavigation() {
        this._sidebar_list.connect('row-activated', (list, row) => {
            const index = row.get_index();
            switch (index) {
                case 0: this._showPage('tasks'); break;
                case 1: this._showPage('projects'); break;
                case 2: this._showPage('clients'); break;
                case 3: this._showPage('reports'); this._updateReports(); this._updateChart(); break;
                case 4: this._launchCompactTrackerDebug(); break; // Debug compact tracker
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
        
        // Setup menu button with contribution window
        this._setupMenuButton();
        
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
        // Set up multiple synchronized tracking widgets for all pages
        this._setupUnifiedTrackingWidgets();
    }
    
    _setupUnifiedTrackingWidgets() {
        // Create array of all tracking widgets using direct references to unique IDs
        this.trackingWidgets = [
            {
                container: this._tracking_widget,
                button: this._track_button,
                input: this._task_name,
                timeLabel: this._actual_time,
                projectBtn: this._project_context_btn,
                clientBtn: this._client_context_btn
            },
            {
                container: this._tracking_widget_projects,
                button: this._track_button_projects,
                input: this._task_name_projects,
                timeLabel: this._actual_time_projects,
                projectBtn: this._project_context_btn_projects,
                clientBtn: this._client_context_btn_projects
            },
            {
                container: this._tracking_widget_clients,
                button: this._track_button_clients,
                input: this._task_name_clients,
                timeLabel: this._actual_time_clients,
                projectBtn: this._project_context_btn_clients,
                clientBtn: this._client_context_btn_clients
            },
            {
                container: this._tracking_widget_reports,
                button: this._track_button_reports,
                input: this._task_name_reports,
                timeLabel: this._actual_time_reports,
                projectBtn: this._project_context_btn_reports,
                clientBtn: this._client_context_btn_reports
            }
        ];
        
        // Initialize tracking on the first widget (master) and sync others
        const masterWidget = this.trackingWidgets[0];
        timeTrack(masterWidget.button, masterWidget.input, masterWidget.timeLabel);
        
        // Set up synchronization for all widgets
        this._synchronizeTrackingWidgets();
    }
    
    _synchronizeTrackingWidgets() {
        // Synchronize all tracking widgets efficiently using trackingStateManager
        this.trackingWidgets.forEach((widget, index) => {
            // Register ALL buttons and time labels with the tracking state manager (including master)
            trackingStateManager.registerTrackingButton(widget.button, null, widget.input);
            trackingStateManager.registerTimeLabel(widget.timeLabel);
            
            // For non-master widgets, set up additional tracking functionality
            if (index > 0) {
                // Set up full tracking functionality for each widget
                // This ensures each button can independently start/stop tracking
                widget.button.connect('clicked', () => {
                    this._handleUnifiedTrackingClick(widget, index);
                });
                
                // Add Enter key support for task input
                widget.input.connect('activate', () => {
                    widget.button.emit('clicked');
                });
            }
            
            // Sync input changes between widgets using proper GTK4 signals
            // This avoids interrupting the user while typing
            
            // Create a focus controller for this input
            const focusController = new Gtk.EventControllerFocus();
            widget.input.add_controller(focusController);
            
            focusController.connect('leave', () => {
                this._syncAllInputsFromWidget(widget, index);
            });
            
            // Create a key controller for Enter key handling
            const keyController = new Gtk.EventControllerKey();
            widget.input.add_controller(keyController);
            
            keyController.connect('key-pressed', (controller, keyval, keycode, state) => {
                if (keyval === Gdk.KEY_Return || keyval === Gdk.KEY_KP_Enter) {
                    this._syncAllInputsFromWidget(widget, index);
                }
                return false; // Continue event propagation
            });
            
            // Connect project and client buttons to the same handlers
            widget.projectBtn.connect('clicked', () => {
                this._showProjectSelector();
            });
            
            widget.clientBtn.connect('clicked', () => {
                this._showClientSelector();
            });
        });
        
        console.log(`🎯 Unified tracking setup complete - ${this.trackingWidgets.length} widgets synchronized`);
    }
    
    _syncAllInputsFromWidget(sourceWidget, sourceIndex) {
        // Sync all other inputs from the source widget
        const text = sourceWidget.input.get_text();
        this.trackingWidgets.forEach((targetWidget, targetIndex) => {
            if (targetIndex !== sourceIndex && targetWidget.input.get_text() !== text) {
                targetWidget.input.set_text(text);
            }
        });
    }
    
    _handleUnifiedTrackingClick(widget, widgetIndex) {
        // Handle tracking button clicks from any widget
        const currentTracking = trackingStateManager.getCurrentTracking();
        
        if (currentTracking) {
            // Stop current tracking - use the master widget's logic
            const masterWidget = this.trackingWidgets[0];
            if (masterWidget && masterWidget.button) {
                masterWidget.button.emit('clicked');
            }
        } else {
            // Start new tracking - ensure task name is set in master widget first
            const taskName = widget.input.get_text().trim();
            if (taskName.length === 0) return;
            
            // Validate task name
            const validation = InputValidator.validateTaskName(taskName);
            if (!validation.valid) {
                InputValidator.showValidationTooltip(widget.input, validation.error, true);
                return;
            }
            
            // Set the task name in master widget and start tracking
            const masterWidget = this.trackingWidgets[0];
            if (masterWidget && masterWidget.input && masterWidget.button) {
                masterWidget.input.set_text(validation.sanitized);
                masterWidget.button.emit('clicked');
                console.log(`✅ Started tracking from widget ${widgetIndex}: "${validation.sanitized}"`);
            }
        }
    }
    
    _setupTrackingStateSubscription() {
        // Subscribe to tracking state changes to update UI elements
        trackingStateManager.subscribe((event, taskInfo) => {
            console.log(`📊 Tracking state changed: ${event}`, taskInfo);
            
            if (event === 'start') {
                this._onTrackingStarted(taskInfo);
            } else if (event === 'stop') {
                this._onTrackingStopped(taskInfo);
            } else if (event === 'updateWeeklyTime') {
                this._updateWeeklyTimeRealTime(taskInfo.additionalTime);
            } else if (event === 'updateTodayTime') {
                this._updateTodayTimeRealTime(taskInfo.additionalTime);
            } else if (event === 'updateProjectTime') {
                this._updateProjectTimeRealTime(taskInfo.projectId, taskInfo.additionalTime);
            } else if (event === 'updateTaskList') {
                this._updateTaskListAfterTrackingChange(taskInfo);
            } else if (event === 'updateTaskListRealTime') {
                this._updateTaskListRealTime(taskInfo.taskInfo, taskInfo.elapsedTime);
            }
        });
    }
    
    _registerSidebarElements() {
        // Register sidebar elements for real-time updates
        if (this._weekly_time_row) {
            trackingStateManager.registerSidebarElement('weeklyTime', this._weekly_time_row);
        }
        if (this._today_time_row) {
            trackingStateManager.registerSidebarElement('todayTime', this._today_time_row);
        }
        if (this._week_time_row) {
            trackingStateManager.registerSidebarElement('weekTime', this._week_time_row);
        }
    }
    
    _updateWeeklyTimeRealTime(additionalSeconds) {
        if (!this._weekly_time_row) return;
        
        try {
            // Calculate current week time from stored data plus additional tracking time
            const now = new Date();
            const startOfWeek = new Date(now.setDate(now.getDate() - now.getDay()));
            startOfWeek.setHours(0, 0, 0, 0);
            const endOfWeek = new Date(startOfWeek);
            endOfWeek.setDate(startOfWeek.getDate() + 6);
            endOfWeek.setHours(23, 59, 59, 999);
            
            let weekTime = 0;
            let weekTasks = 0;
            
            this.allTasks.forEach(task => {
                const taskDate = new Date(task.created || task.start);
                if (taskDate >= startOfWeek && taskDate <= endOfWeek) {
                    weekTime += task.duration || 0;
                    weekTasks++;
                }
            });
            
            // Add current tracking time
            weekTime += additionalSeconds;
            
            const timeText = this._formatDuration(weekTime);
            const tasksText = weekTasks === 1 ? '1 task' : `${weekTasks} tasks`;
            this._weekly_time_row.set_subtitle(`${timeText} • ${tasksText}`);
            
        } catch (error) {
            console.error('Error updating weekly time in real-time:', error);
        }
    }
    
    _updateTodayTimeRealTime(additionalSeconds) {
        if (!this._today_time_row) return;
        
        try {
            // Calculate today's time from stored data plus additional tracking time
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const tomorrow = new Date(today);
            tomorrow.setDate(today.getDate() + 1);
            
            let todayTime = 0;
            let todayTasks = 0;
            
            this.allTasks.forEach(task => {
                const taskDate = new Date(task.created || task.start);
                if (taskDate >= today && taskDate < tomorrow) {
                    todayTime += task.duration || 0;
                    todayTasks++;
                }
            });
            
            // Add current tracking time
            todayTime += additionalSeconds;
            
            const timeText = this._formatDuration(todayTime);
            const tasksText = todayTasks === 1 ? '1 task' : `${todayTasks} tasks`;
            this._today_time_row.set_subtitle(`${timeText} • ${tasksText}`);
            
        } catch (error) {
            console.error('Error updating today time in real-time:', error);
        }
    }

    _updateProjectTimeRealTime(projectId, additionalSeconds) {
        try {
            // Update project statistics with additional tracking time
            const project = this.allProjects.find(p => p.id === projectId);
            if (!project) return;
            
            // Calculate new project time including additional tracking time
            const projectTasks = this.allTasks.filter(task => task.project_id === projectId);
            let totalProjectTime = 0;
            
            projectTasks.forEach(task => {
                totalProjectTime += task.duration || 0;
            });
            
            // Add the current tracking time
            totalProjectTime += additionalSeconds;
            
            // Update project object with new total
            project.total_time = totalProjectTime;
            
            // Update the project list display
            this._updateProjectsList();
            
            console.log(`📊 Updated project ${project.name} with additional ${additionalSeconds}s (total: ${totalProjectTime}s)`);
            
            // Also update any project time labels that are registered
            const projectTimeLabel = trackingStateManager.projectTimeLabels?.get?.(projectId);
            if (projectTimeLabel && typeof projectTimeLabel.set_text === 'function') {
                projectTimeLabel.set_text(TimeUtils.formatDuration(totalProjectTime));
            }
            
        } catch (error) {
            console.error('Error updating project time in real-time:', error);
        }
    }

    _updateTaskListAfterTrackingChange(taskInfo) {
        try {
            // Refresh the task list when tracking starts or stops
            console.log('🔄 Updating task list after tracking change:', taskInfo.name);
            this.loadTasks();
        } catch (error) {
            console.error('Error updating task list after tracking change:', error);
        }
    }

    _updateTaskListRealTime(taskInfo, elapsedTime) {
        try {
            // PERFORMANCE FIX: Do NOT reload the entire task list every second
            // Instead, just update the UI elements that show real-time data
            
            // The TrackingStateManager handles updating the time labels
            // This method should be minimal to avoid performance issues
            console.log(`📊 Real-time update: ${taskInfo.name} - ${elapsedTime}s (no DB reload)`);
            
            // Note: Task list updates are handled by the TrackingStateManager 
            // through registered time labels. We don't need to reload the entire list.
            
        } catch (error) {
            console.error('Error updating task list in real-time:', error);
        }
    }

    _refreshTaskDisplay() {
        // DEPRECATED: This method should not be used for real-time updates
        // as it causes performance issues by reloading the entire task list
        try {
            console.warn('⚠️ _refreshTaskDisplay called - this should be avoided for real-time updates');
            
            // Only use this method when absolutely necessary (e.g., after task save/delete)
            // For real-time updates, the TrackingStateManager handles UI updates directly
            
        } catch (error) {
            console.error('Error refreshing task display:', error);
        }
    }
    
    _onTrackingStarted(taskInfo) {
        console.log('🎯 Tracking started for:', taskInfo.name);
        
        // Register sidebar elements with the tracking state manager
        this._registerSidebarElements();
        
        // Update weekly time tracker
        this._updateWeeklyTime();
        
        // Task list will be refreshed by tracking state manager subscription
        
        // Update project statistics if needed
        if (taskInfo.projectId) {
            this._calculateProjectStats();
            this._updateProjectsList();
        }
    }
    
    _onTrackingStopped(taskInfo) {
        console.log('⏹️ Tracking stopped for:', taskInfo.name);
        
        // Update weekly time tracker
        this._updateWeeklyTime();
        
        // Task list will be refreshed by tracking state manager subscription
        
        // Update project statistics
        if (taskInfo.projectId) {
            this._calculateProjectStats();
            this._updateProjectsList();
        }
        
        // Update reports if on reports page
        this._updateReports();
        this._updateChart();
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
        console.log('🎯 Setting up keyboard shortcuts...');
        
        const controller = new Gtk.EventControllerKey();
        this.add_controller(controller);
        
        // Add debug logging for all key presses
        controller.connect('key-pressed', (controller, keyval, keycode, state) => {
            console.log(`🎯 Key pressed: keyval=${keyval}, keycode=${keycode}, Delete=${Gdk.KEY_Delete}, KP_Delete=${Gdk.KEY_KP_Delete}`);
            return Gdk.EVENT_PROPAGATE; // Let other handlers process first
        });
        
        // Use key-released instead since key-pressed is being consumed
        controller.connect('key-released', (controller, keyval, keycode, state) => {
            if (keyval === Gdk.KEY_Delete || keyval === Gdk.KEY_KP_Delete) {
                // Check what is selected and delete accordingly
                const selectedTasks = this.selectedTasks ? this.selectedTasks.size : 0;
                const selectedStacks = this.selectedStacks ? this.selectedStacks.size : 0;
                const selectedProjects = this.selectedProjects ? this.selectedProjects.size : 0;
                const selectedClients = this.selectedClients ? this.selectedClients.size : 0;
                
                console.log(`🗑️ Delete key RELEASED - Selected tasks: ${selectedTasks}, Selected stacks: ${selectedStacks}, Selected projects: ${selectedProjects}, Selected clients: ${selectedClients}`);
                
                if (selectedClients > 0) {
                    console.log(`🗑️ Deleting ${selectedClients} selected clients`);
                    this._deleteSelectedClients();
                } else if (selectedProjects > 0) {
                    console.log(`🗑️ Deleting ${selectedProjects} selected projects`);
                    this._deleteSelectedProjects();
                } else if (selectedTasks > 0 || selectedStacks > 0) {
                    console.log(`🗑️ Deleting ${selectedTasks} tasks and ${selectedStacks} stacks`);
                    this._deleteSelectedTasks();
                } else {
                    console.log('🗑️ Nothing selected to delete');
                }
                
                return Gdk.EVENT_STOP;
            }
            return Gdk.EVENT_PROPAGATE;
        });

        
        console.log('🎯 Keyboard shortcuts setup complete');
    }
    
    _setupCompactTrackerButton() {
        // This function sets up any compact tracker specific UI elements
        // Currently the compact tracker is opened via Ctrl+T shortcut or menu
        console.log('🎯 Compact tracker button setup complete');
    }
    
    _setupContextButtons() {
        // Project context button (main/sidebar)
        this._project_context_btn.connect('clicked', () => {
            this._showProjectSelector();
        });
        
        // Client context button (main/sidebar)  
        this._client_context_btn.connect('clicked', () => {
            this._showClientSelector();
        });
        
        // Note: Tracking widget context buttons are set up in _synchronizeTrackingWidgets()
    }
    
    _setupMenuButton() {
        // Connect menu button to show about dialog directly
        this._menu_button.connect('clicked', () => {
            this._showAboutDialog();
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
            this._showExportDialog();
        } catch (error) {
            console.error('PDF export error:', error);
            const errorDialog = new Gtk.AlertDialog({
                message: 'Export Failed', 
                detail: `Could not open export dialog: ${error.message}`
            });
            errorDialog.show(this);
        }
    }

    _showExportDialog() {
        // Create export dialog
        const dialog = new Gtk.Dialog({
            title: 'Export Time Report',
            modal: true,
            transient_for: this
        });

        dialog.add_button('Cancel', Gtk.ResponseType.CANCEL);
        dialog.add_button('Export PDF', Gtk.ResponseType.OK);
        dialog.set_default_response(Gtk.ResponseType.OK);

        // Create content area
        const contentArea = dialog.get_content_area();
        const box = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 12,
            margin_start: 24,
            margin_end: 24,
            margin_top: 12,
            margin_bottom: 12
        });
        contentArea.append(box);

        // Period filter
        const periodGroup = new Adw.PreferencesGroup({
            title: 'Time Period'
        });
        
        const periodRow = new Adw.ComboRow({
            title: 'Filter by Period',
            subtitle: 'Select time range for the report'
        });
        
        const periodModel = new Gtk.StringList();
        periodModel.append('Current Week');
        periodModel.append('Current Month'); 
        periodModel.append('Current Year');
        periodModel.append('All Time');
        periodModel.append('Custom Range');
        
        periodRow.set_model(periodModel);
        periodRow.set_selected(0); // Default to current week
        periodGroup.add(periodRow);
        box.append(periodGroup);

        // Date range inputs (initially hidden)
        const dateGroup = new Adw.PreferencesGroup({
            title: 'Custom Date Range',
            visible: false
        });

        const fromDateRow = new Adw.ActionRow({
            title: 'From Date'
        });
        const fromDateEntry = new Gtk.Entry({
            placeholder_text: 'YYYY-MM-DD',
            text: new Date().toISOString().split('T')[0]
        });
        fromDateRow.add_suffix(fromDateEntry);
        dateGroup.add(fromDateRow);

        const toDateRow = new Adw.ActionRow({
            title: 'To Date'
        });
        const toDateEntry = new Gtk.Entry({
            placeholder_text: 'YYYY-MM-DD',
            text: new Date().toISOString().split('T')[0]
        });
        toDateRow.add_suffix(toDateEntry);
        dateGroup.add(toDateRow);
        box.append(dateGroup);

        // Show/hide date inputs based on period selection
        periodRow.connect('notify::selected', () => {
            const isCustom = periodRow.get_selected() === 4; // Custom Range
            dateGroup.set_visible(isCustom);
        });

        // Project filter
        const projectGroup = new Adw.PreferencesGroup({
            title: 'Project Filter'
        });
        
        const projectRow = new Adw.ComboRow({
            title: 'Filter by Project',
            subtitle: 'Select specific project (optional)'
        });
        
        const projectModel = new Gtk.StringList();
        projectModel.append('All Projects');
        this.allProjects.forEach(project => {
            projectModel.append(project.name);
        });
        
        projectRow.set_model(projectModel);
        projectRow.set_selected(0);
        projectGroup.add(projectRow);
        box.append(projectGroup);

        // Client filter
        const clientGroup = new Adw.PreferencesGroup({
            title: 'Client Filter'
        });
        
        const clientRow = new Adw.ComboRow({
            title: 'Filter by Client',
            subtitle: 'Select specific client (optional)'
        });
        
        const clientModel = new Gtk.StringList();
        clientModel.append('All Clients');
        this.allClients.forEach(client => {
            clientModel.append(client.name);
        });
        
        clientRow.set_model(clientModel);
        clientRow.set_selected(0);
        clientGroup.add(clientRow);
        box.append(clientGroup);

        // Logo selection
        const logoGroup = new Adw.PreferencesGroup({
            title: 'Logo &amp; Branding'
        });

        const logoRow = new Adw.ActionRow({
            title: 'Select Logo',
            subtitle: 'Choose logo for report header'
        });
        const logoButton = new Gtk.Button({
            label: 'Browse Logo...',
            valign: Gtk.Align.CENTER
        });
        let selectedLogoPath = null;
        logoButton.connect('clicked', () => {
            const logoDialog = new Gtk.FileDialog({
                title: 'Select Logo Image'
            });
            logoDialog.open(this, null, (source, result) => {
                try {
                    const file = logoDialog.open_finish(result);
                    selectedLogoPath = file.get_path();
                    logoButton.set_label(`Logo: ${file.get_basename()}`);
                } catch (error) {
                    // User cancelled
                }
            });
        });
        logoRow.add_suffix(logoButton);
        logoGroup.add(logoRow);
        box.append(logoGroup);

        // Report sections
        const sectionsGroup = new Adw.PreferencesGroup({
            title: 'Report Sections'
        });

        const chartsRow = new Adw.ActionRow({
            title: 'Include Charts',
            subtitle: 'Show time distribution and productivity charts'
        });
        const chartsSwitch = new Gtk.Switch({
            active: true,
            valign: Gtk.Align.CENTER
        });
        chartsRow.add_suffix(chartsSwitch);
        sectionsGroup.add(chartsRow);

        const tasksRow = new Adw.ActionRow({
            title: 'Include Task Summary',
            subtitle: 'Show detailed task information'
        });
        const tasksSwitch = new Gtk.Switch({
            active: true,
            valign: Gtk.Align.CENTER
        });
        tasksRow.add_suffix(tasksSwitch);
        sectionsGroup.add(tasksRow);

        const projectsRow = new Adw.ActionRow({
            title: 'Include Project Summary',
            subtitle: 'Show project breakdown and statistics'
        });
        const projectsSwitch = new Gtk.Switch({
            active: true,
            valign: Gtk.Align.CENTER
        });
        projectsRow.add_suffix(projectsSwitch);
        sectionsGroup.add(projectsRow);

        const billingRow = new Adw.ActionRow({
            title: 'Include Billing Information',
            subtitle: 'Show revenue and rate calculations'
        });
        const billingSwitch = new Gtk.Switch({
            active: false,
            valign: Gtk.Align.CENTER
        });
        billingRow.add_suffix(billingSwitch);
        sectionsGroup.add(billingRow);

        const hourRateRow = new Adw.ActionRow({
            title: 'Show Hourly Rates',
            subtitle: 'Display detailed rate breakdown in billing section'
        });
        const hourRateSwitch = new Gtk.Switch({
            active: true,
            valign: Gtk.Align.CENTER
        });
        hourRateRow.add_suffix(hourRateSwitch);
        sectionsGroup.add(hourRateRow);

        box.append(sectionsGroup);

        // Handle dialog response
        dialog.connect('response', (dialog, response) => {
            if (response === Gtk.ResponseType.OK) {
                try {
                    // Use Smart Report Exporter (tries PDF first, falls back to HTML)
                    const reportExporter = new ReportExporter(
                        this.allTasks,
                        this.allProjects,
                        this.allClients
                    );

                    // Apply period filter
                    const periodIndex = periodRow.get_selected();
                    const periods = ['week', 'month', 'year', 'all', 'custom'];
                    const selectedPeriod = periods[periodIndex];
                    
                    if (selectedPeriod === 'custom') {
                        const fromText = fromDateEntry.get_text();
                        const toText = toDateEntry.get_text();
                        if (fromText && toText) {
                            const fromDate = new Date(fromText);
                            const toDate = new Date(toText);
                            toDate.setHours(23, 59, 59, 999); // End of day
                            reportExporter.configureDateRange(fromDate, toDate);
                        }
                    } else {
                        reportExporter.configurePeriod(selectedPeriod);
                    }

                    // Apply project filter
                    const projectIndex = projectRow.get_selected();
                    if (projectIndex > 0) {
                        const selectedProject = this.allProjects[projectIndex - 1];
                        reportExporter.configureProjectFilter(selectedProject.id);
                    }

                    // Apply client filter
                    const clientIndex = clientRow.get_selected();
                    if (clientIndex > 0) {
                        const selectedClient = this.allClients[clientIndex - 1];
                        reportExporter.configureClientFilter(selectedClient.id);
                    }

                    // Apply billing option
                    reportExporter.configureBilling(billingSwitch.get_active());

                    // Configure sections visibility
                    reportExporter.configureSections({
                        showCharts: chartsSwitch.get_active(),
                        showTasks: tasksSwitch.get_active(),
                        showProjects: projectsSwitch.get_active(),
                        showBilling: billingSwitch.get_active(),
                        showHourlyRates: hourRateSwitch.get_active(),
                        logoPath: selectedLogoPath
                    });

                    // Smart export: Try PDF first, fallback to HTML if needed
                    reportExporter.exportReport(this);

                } catch (error) {
                    console.error('Export configuration error:', error);
                    const errorDialog = new Gtk.AlertDialog({
                        message: 'Export Failed',
                        detail: `Could not configure export: ${error.message}`
                    });
                    errorDialog.show(this);
                }
            }
            dialog.destroy();
        });

        dialog.present();
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
        // Clear old button registrations before loading new ones
        trackingStateManager.clearTaskButtons();
        
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
        
        // Update button states after task list is loaded and rendered
        setTimeout(() => {
            trackingStateManager._updateAllTrackingButtons();
            trackingStateManager._updateStackButtons();
        }, 0);
        
        this._updateWeeklyTime(); // Update weekly time after loading tasks
        this._updateChart(); // Update chart after loading tasks
        
        // Update project statistics with actual task data
        this._calculateProjectStats();
        this._updateProjectsList();
        this._updateProjectStats();
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
        this.stackRowMap.clear();
        
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
            
            // Create unique key combining base name, project, and client for proper stacking
            const groupKey = `${baseName}::${task.project}::${task.client}`;
            
            if (!groups.has(groupKey)) {
                groups.set(groupKey, {
                    groupKey: groupKey,
                    baseName: baseName,
                    tasks: [],
                    totalDuration: 0,
                    totalCost: 0,
                    hasActive: false,
                    latestTask: null
                });
            }
            
            const group = groups.get(groupKey);
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
                // Single task - render using TaskRenderer with real-time updates
                const row = this.taskRenderer.renderSingleTask(group.tasks[0]);
                this._task_list.append(row);
            } else {
                // Multiple tasks - render as expandable group using TaskRenderer
                const groupRow = this.taskRenderer.renderTaskGroup(group);
                this._task_list.append(groupRow);
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
            title: InputValidator.escapeForGTKMarkup(task.name),
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
            icon_name: 'media-playback-start-symbolic', // Will be updated by state manager
            css_classes: ['flat'],
            tooltip_text: 'Start Tracking' // Will be updated by state manager
        });
        
        // Register this button with the tracking state manager
        trackingStateManager.registerTrackingButton(trackBtn, task.name);
        trackBtn.connect('clicked', () => {
            // Check current state dynamically when clicked
            console.log(`🎯 Individual task button clicked: "${task.name}"`);
            const isCurrentlyThisTaskTracking = trackingStateManager.isTaskTracking(task.name);
            console.log(`🎯 Is "${task.name}" currently tracking? ${isCurrentlyThisTaskTracking}`);
            if (isCurrentlyThisTaskTracking) {
                console.log(`🎯 Stopping tracking for individual task: "${task.name}"`);
                this._stopCurrentTracking();
            } else {
                console.log(`🎯 Starting tracking for individual task: "${task.name}"`);
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
            title: `${InputValidator.escapeForGTKMarkup(group.baseName)} (${group.tasks.length} sessions)`,
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
                icon_name: 'media-playback-start-symbolic', // Will be updated by state manager
                css_classes: ['flat'],
                tooltip_text: 'Start Tracking' // Will be updated by state manager
            });
            
            // Register this button with the tracking state manager
            trackingStateManager.registerTrackingButton(trackBtn, task.name);
            trackBtn.connect('clicked', () => {
                // Check current state dynamically when clicked
                const isCurrentlyThisTaskTracking = trackingStateManager.isTaskTracking(task.name);
                if (isCurrentlyThisTaskTracking) {
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
                    title: InputValidator.escapeForGTKMarkup(task.name),
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
            this._ensureDarkIconsColumn();
            this._ensureIconColorModeColumn();
            
            const sql = `SELECT id, name, color, total_time, icon, dark_icons, icon_color_mode FROM Project ORDER BY id`;
            const result = executeQuery(this.dbConnection, sql);
            this.allProjects = [];
            
            if (result && result.get_n_rows() > 0) {
                for (let i = 0; i < result.get_n_rows(); i++) {
                    const project = {
                        id: result.get_value_at(0, i),
                        name: result.get_value_at(1, i),
                        color: result.get_value_at(2, i) || '#cccccc',
                        totalTime: result.get_value_at(3, i) || 0,
                        icon: result.get_value_at(4, i) || 'folder-symbolic',
                        dark_icons: result.get_value_at(5, i) || 0,
                        icon_color_mode: result.get_value_at(6, i) || 'auto'
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
        // Use the filter function to display all projects (empty search = show all)
        this._filterProjects();
    }
    
    _getProjectIconColor(project) {
        const iconColorMode = project.icon_color_mode || 'auto';
        
        if (iconColorMode === 'dark') {
            return 'black';
        } else if (iconColorMode === 'light') {
            return 'white';
        } else {
            // Auto mode - determine from color brightness
            const colorInfo = this.projectColors.find(c => c.value === project.color);
            if (colorInfo) {
                return colorInfo.textColor;
            } else {
                // Calculate brightness for custom colors
                return this._calculateColorBrightness(project.color) > 128 ? 'black' : 'white';
            }
        }
    }
    
    _calculateColorBrightness(hexColor) {
        // Remove # if present
        const hex = hexColor.replace('#', '');
        
        // Parse RGB values
        const r = parseInt(hex.substr(0, 2), 16);
        const g = parseInt(hex.substr(2, 2), 16);  
        const b = parseInt(hex.substr(4, 2), 16);
        
        // Calculate brightness using the luminance formula
        return (r * 299 + g * 587 + b * 114) / 1000;
    }
    
    _handleProjectNameChange(projectId, newName) {
        // Validate and update project name
        const validation = InputValidator.validateProjectName(newName);
        if (!validation.valid) {
            console.warn('Invalid project name:', validation.error);
            this._loadProjects(); // Reload to revert changes
            return;
        }
        
        try {
            const sql = `UPDATE Project SET name = '${InputValidator.sanitizeForSQL(validation.sanitized)}' WHERE id = ${projectId}`;
            executeNonSelectCommand(this.dbConnection, sql);
            console.log(`Project name updated: ID ${projectId} -> "${validation.sanitized}"`);
            
            // Update in memory and refresh related UI
            const project = this.allProjects.find(p => p.id === projectId);
            if (project) {
                project.name = validation.sanitized;
            }
            
            // Refresh context buttons if this is the current project
            if (this.currentProjectId === projectId) {
                this._updateProjectButtonsDisplay(validation.sanitized);
            }
            
        } catch (error) {
            console.error('Error updating project name:', error);
            this._loadProjects(); // Reload to revert changes
        }
    }
    
    _addProjectSelectionHandlers(row, project) {
        // ONLY right-click gesture for selection - NO OTHER TRIGGERS
        const rightClickGesture = new Gtk.GestureClick({
            button: 3 // ONLY Right click
        });
        
        rightClickGesture.connect('pressed', () => {
            console.log(`Right-click detected on project: ${project.name}`);
            this._toggleProjectSelection(project.id, row);
        });
        
        row.add_controller(rightClickGesture);
        
        // Explicitly prevent left-click from doing anything
        const leftClickGesture = new Gtk.GestureClick({
            button: 1 // Left click
        });
        
        leftClickGesture.connect('pressed', () => {
            console.log(`Left-click blocked on project: ${project.name} - only right-click selects`);
            // Do nothing - selection ONLY with right-click
        });
        
        row.add_controller(leftClickGesture);
    }
    
    _toggleProjectSelection(projectId, row) {
        if (projectId === 1) {
            // Can't select Default project
            console.log('Cannot select Default project');
            return;
        }
        
        if (this.selectedProjects.has(projectId)) {
            // Deselect - multiple selection support
            this.selectedProjects.delete(projectId);
            row.remove_css_class('selected-task');
            console.log(`Project deselected: ${projectId}. Total selected: ${this.selectedProjects.size}`);
        } else {
            // Select - multiple selection support
            this.selectedProjects.add(projectId);
            row.add_css_class('selected-task');
            console.log(`Project selected: ${projectId}. Total selected: ${this.selectedProjects.size}`);
        }
        
        this._updateProjectSelectionUI();
    }
    
    _updateProjectSelectionUI() {
        const selectedCount = this.selectedProjects.size;
        
        // Footer removed from UI - just log selection count
        if (selectedCount > 0) {
            console.log(`${selectedCount} projects selected`);
        }
    }
    
    _deleteSelectedProjects() {
        if (this.selectedProjects.size === 0) return;
        
        const dialog = new Adw.AlertDialog({
            heading: 'Delete Selected Projects',
            body: `Are you sure you want to delete ${this.selectedProjects.size} projects? All associated tasks will be moved to the Default project.`
        });
        
        dialog.add_response('cancel', 'Cancel');
        dialog.add_response('delete', 'Delete');
        dialog.set_response_appearance('delete', Adw.ResponseAppearance.DESTRUCTIVE);
        
        dialog.connect('response', (dialog, response) => {
            if (response === 'delete') {
                // Delete all selected projects
                this.selectedProjects.forEach(projectId => {
                    this._confirmDeleteProject(projectId);
                });
                
                // Clear selection
                this.selectedProjects.clear();
                this._updateProjectSelectionUI();
                this._loadProjects(); // Refresh list
            }
        });
        
        dialog.present(this);
    }
    
    _showProjectAppearanceDialog(projectId) {
        const project = this.allProjects.find(p => p.id === projectId);
        if (!project) return;
        
        const dialog = new Adw.Window({
            title: `Edit ${project.name} Appearance`,
            width_request: 500,
            height_request: 600,
            modal: true,
            transient_for: this
        });
        
        const toolbarView = new Adw.ToolbarView();
        
        // Header bar
        const headerBar = new Adw.HeaderBar();
        
        const cancelBtn = new Gtk.Button({
            label: 'Cancel'
        });
        cancelBtn.connect('clicked', () => {
            dialog.close();
        });
        headerBar.pack_start(cancelBtn);
        
        const saveBtn = new Gtk.Button({
            label: 'Save',
            css_classes: ['suggested-action']
        });
        headerBar.pack_end(saveBtn);
        
        toolbarView.add_top_bar(headerBar);
        
        // Content
        const scrolled = new Gtk.ScrolledWindow({
            vexpand: true
        });
        
        const content = new Adw.PreferencesPage();
        
        // Color selection group
        const colorGroup = new Adw.PreferencesGroup({
            title: 'Color',
            description: 'Choose a color for this project'
        });
        
        // Color grid
        const colorFlow = new Gtk.FlowBox({
            max_children_per_line: 6,
            min_children_per_line: 3,
            column_spacing: 8,
            row_spacing: 8,
            margin_top: 12,
            margin_bottom: 12,
            margin_start: 12,
            margin_end: 12,
            selection_mode: Gtk.SelectionMode.SINGLE
        });
        
        let selectedColor = project.color;
        
        // Add predefined colors
        this.projectColors.forEach(color => {
            const colorBox = new Gtk.Box({
                width_request: 48,
                height_request: 48,
                css_classes: ['color-selector'],
                halign: Gtk.Align.CENTER,
                valign: Gtk.Align.CENTER
            });
            
            const provider = new Gtk.CssProvider();
            provider.load_from_string(
                `.color-selector { 
                    background-color: ${color.value}; 
                    border-radius: 24px; 
                    border: 3px solid transparent;
                }
                .color-selector.selected { 
                    border-color: @accent_color;
                }`
            );
            colorBox.get_style_context().add_provider(provider, Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION);
            
            if (color.value === project.color) {
                colorBox.add_css_class('selected');
            }
            
            const gesture = new Gtk.GestureClick();
            gesture.connect('pressed', () => {
                // Remove selected class from all colors - GTK4 compatible
                let child = colorFlow.get_first_child();
                while (child) {
                    const colorWidget = child.get_first_child();
                    if (colorWidget) {
                        colorWidget.remove_css_class('selected');
                    }
                    child = child.get_next_sibling();
                }
                
                colorBox.add_css_class('selected');
                selectedColor = color.value;
            });
            
            colorBox.add_controller(gesture);
            colorFlow.append(colorBox);
        });
        
        const colorRow = new Adw.ActionRow();
        colorRow.set_child(colorFlow);
        colorGroup.add(colorRow);
        
        // Icon selection group
        const iconGroup = new Adw.PreferencesGroup({
            title: 'Icon',
            description: 'Choose an icon for this project'
        });
        
        // Icon grid
        const iconFlow = new Gtk.FlowBox({
            max_children_per_line: 8,
            min_children_per_line: 4,
            column_spacing: 8,
            row_spacing: 8,
            margin_top: 12,
            margin_bottom: 12,
            margin_start: 12,
            margin_end: 12,
            selection_mode: Gtk.SelectionMode.SINGLE
        });
        
        let selectedIcon = project.icon;
        
        // Add predefined icons
        this.projectIcons.forEach(iconName => {
            const iconBox = new Gtk.Box({
                width_request: 40,
                height_request: 40,
                css_classes: ['icon-selector'],
                halign: Gtk.Align.CENTER,
                valign: Gtk.Align.CENTER
            });
            
            const icon = new Gtk.Image({
                icon_name: iconName,
                pixel_size: 24
            });
            
            iconBox.append(icon);
            
            const provider = new Gtk.CssProvider();
            provider.load_from_string(
                `.icon-selector { 
                    background-color: alpha(@accent_color, 0.1);
                    border-radius: 8px; 
                    border: 2px solid transparent;
                }
                .icon-selector.selected { 
                    border-color: @accent_color;
                    background-color: @accent_color;
                }
                .icon-selector.selected image {
                    color: white;
                }`
            );
            iconBox.get_style_context().add_provider(provider, Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION);
            
            if (iconName === project.icon) {
                iconBox.add_css_class('selected');
            }
            
            const gesture = new Gtk.GestureClick();
            gesture.connect('pressed', () => {
                // Remove selected class from all icons - GTK4 compatible
                let child = iconFlow.get_first_child();
                while (child) {
                    const iconWidget = child.get_first_child();
                    if (iconWidget) {
                        iconWidget.remove_css_class('selected');
                    }
                    child = child.get_next_sibling();
                }
                
                iconBox.add_css_class('selected');
                selectedIcon = iconName;
            });
            
            iconBox.add_controller(gesture);
            iconFlow.append(iconBox);
        });
        
        const iconRow = new Adw.ActionRow();
        iconRow.set_child(iconFlow);
        iconGroup.add(iconRow);
        
        content.add(colorGroup);
        content.add(iconGroup);
        
        scrolled.set_child(content);
        toolbarView.set_content(scrolled);
        dialog.set_content(toolbarView);
        
        // Save button action
        saveBtn.connect('clicked', () => {
            try {
                const sql = `UPDATE Project SET color = '${selectedColor}', icon = '${selectedIcon}' WHERE id = ${projectId}`;
                executeNonSelectCommand(this.dbConnection, sql);
                
                // Update in memory
                project.color = selectedColor;
                project.icon = selectedIcon;
                
                // Refresh UI
                this._updateProjectsList();
                this._updateProjectButtonsDisplay(project.name);
                
                console.log(`Project appearance updated: ${project.name} -> Color: ${selectedColor}, Icon: ${selectedIcon}`);
                dialog.close();
                
            } catch (error) {
                console.error('Error updating project appearance:', error);
            }
        });
        
        dialog.present();
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
        // Project stats UI removed - stats calculation still available in memory
        const totalProjects = this.allProjects.length;
        const totalTime = this.allProjects.reduce((sum, p) => sum + p.totalTime, 0);
        
        console.log(`Project stats: ${totalProjects} projects, ${this._formatDuration(totalTime)} total time`);
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
        
        // Project name - pre-filled with search text
        const searchText = this._project_search.get_text().trim();
        const nameEntry = new Gtk.Entry({
            placeholder_text: 'Project name',
            text: searchText // Pre-fill with search input
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
                
                // Validate project name
                const nameValidation = InputValidator.validateProjectName(name);
                if (!nameValidation.valid) {
                    InputValidator.showValidationTooltip(nameEntry, nameValidation.error, true);
                    return; // Don't close dialog
                }
                
                console.log('Creating project:', name, selectedColor.value, selectedIcon);
                if (nameValidation.sanitized) {
                    this._createProject(nameValidation.sanitized, selectedColor.value, selectedIcon);
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
            
            // Clear search input after successful creation
            this._project_search.set_text('');
            
            this._loadProjects(); // Refresh the list
        } catch (error) {
            console.error('Error creating project:', error);
        }
    }
    
    _ensureProjectIconColumn() {
        try {
            const alterSql = `ALTER TABLE Project ADD COLUMN icon TEXT DEFAULT 'folder-symbolic'`;
            executeNonSelectCommand(this.dbConnection, alterSql);
            console.log('Added icon column to Project table');
        } catch (error) {
            // Column already exists, ignore error
            if (error.message && error.message.includes('duplicate column name')) {
                console.log('Icon column already exists in Project table');
            } else {
                console.log('Error adding icon column:', error.message);
            }
        }
    }

    _ensureDarkIconsColumn() {
        try {
            const alterSql = `ALTER TABLE Project ADD COLUMN dark_icons INTEGER DEFAULT 0`;
            executeNonSelectCommand(this.dbConnection, alterSql);
            console.log('Added dark_icons column to Project table');
        } catch (error) {
            // Column already exists, ignore error
            if (error.message && error.message.includes('duplicate column name')) {
                console.log('dark_icons column already exists in Project table');
            } else {
                console.log('Error adding dark_icons column:', error.message);
            }
        }
    }

    _ensureIconColorModeColumn() {
        try {
            const alterSql = `ALTER TABLE Project ADD COLUMN icon_color_mode TEXT DEFAULT 'auto'`;
            executeNonSelectCommand(this.dbConnection, alterSql);
            console.log('Added icon_color_mode column to Project table');
        } catch (error) {
            // Column already exists, ignore error
            if (error.message && error.message.includes('duplicate column name')) {
                console.log('icon_color_mode column already exists in Project table');
            } else {
                console.log('Error adding icon_color_mode column:', error.message);
            }
        }
    }
    
    _ensureTaskClientColumn() {
        try {
            const alterSql = `ALTER TABLE Task ADD COLUMN client_id INTEGER DEFAULT 1`;
            executeNonSelectCommand(this.dbConnection, alterSql);
            console.log('Added client_id column to Task table');
        } catch (error) {
            // Column already exists, ignore error
            if (error.message && error.message.includes('duplicate column name')) {
                console.log('client_id column already exists in Task table');
            } else {
                console.log('Error adding client_id column:', error.message);
            }
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
                
                // Validate project name
                const nameValidation = InputValidator.validateProjectName(name);
                if (!nameValidation.valid) {
                    InputValidator.showValidationTooltip(nameEntry, nameValidation.error, true);
                    return; // Don't close dialog
                }
                
                console.log('Updating project:', name, selectedColor.value, selectedIcon);
                if (nameValidation.sanitized) {
                    this._updateProject(projectId, nameValidation.sanitized, selectedColor.value, selectedIcon);
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
        const searchText = this._project_search.get_text().toLowerCase().trim();
        console.log('Filter projects:', searchText);
        
        // Clear existing projects
        while (this._project_list.get_first_child()) {
            this._project_list.remove(this._project_list.get_first_child());
        }
        
        // Initialize selected projects set if not exists
        if (!this.selectedProjects) {
            this.selectedProjects = new Set();
        }
        
        // Filter projects based on search text
        const filteredProjects = searchText.length === 0 
            ? this.allProjects 
            : this.allProjects.filter(project => 
                project.name.toLowerCase().includes(searchText)
            );
        
        console.log(`Showing ${filteredProjects.length} of ${this.allProjects.length} projects`);
        
        // Render filtered projects using the same logic as _updateProjectsList
        filteredProjects.forEach(project => {
            // Create ListBoxRow with custom content (same as _updateProjectsList)
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
            
            // Add prefix with clickable icon
            const iconButton = new Gtk.Button({
                width_request: 32,
                height_request: 32,
                halign: Gtk.Align.CENTER,
                valign: Gtk.Align.CENTER,
                css_classes: ['project-icon-button', 'flat'],
                tooltip_text: 'Click to change color and icon'
            });
            
            const icon = new Gtk.Image({
                icon_name: project.icon || 'folder-symbolic',
                pixel_size: 16
            });
            
            // Determine icon color and apply styling
            let iconColor = this._getProjectIconColor(project);
            
            // Apply background color and icon color
            const provider = new Gtk.CssProvider();
            provider.load_from_string(
                `.project-icon-button { 
                    background-color: ${project.color}; 
                    border-radius: 6px; 
                    color: ${iconColor}; 
                    min-width: 32px;
                    min-height: 32px;
                }
                .project-icon-button:hover {
                    filter: brightness(1.1);
                }`
            );
            iconButton.get_style_context().add_provider(provider, Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION);
            
            iconButton.set_child(icon);
            
            // Click to edit appearance
            iconButton.connect('clicked', () => {
                this._showProjectAppearanceDialog(project.id);
            });
            
            // Editable project name
            const nameLabel = new Gtk.EditableLabel({
                text: project.name,
                hexpand: true,
                valign: Gtk.Align.CENTER
            });
            
            // Handle name changes
            nameLabel.connect('changed', () => {
                const newName = nameLabel.get_text().trim();
                if (newName && newName !== project.name) {
                    this._handleProjectNameChange(project.id, newName);
                }
            });
            
            // Add right-click to editable label for selection (no context menu)
            const labelRightClick = new Gtk.GestureClick({
                button: 3, // Right click
                propagation_phase: Gtk.PropagationPhase.CAPTURE
            });
            
            labelRightClick.connect('pressed', (gesture, n_press, x, y) => {
                console.log(`Right-click on label detected for project: ${project.name}`);
                this._toggleProjectSelection(project.id, row);
                
                // Prevent context menu from appearing
                gesture.set_state(Gtk.EventSequenceState.CLAIMED);
                return Gdk.EVENT_STOP;
            });
            
            nameLabel.add_controller(labelRightClick);
            
            // Time display
            const timeLabel = new Gtk.Label({
                label: this._formatDuration(project.totalTime),
                css_classes: ['time-display', 'monospace', 'title-4'],
                valign: Gtk.Align.CENTER,
                halign: Gtk.Align.END
            });
            
            // Assemble the row
            mainBox.append(iconButton);
            mainBox.append(nameLabel);
            mainBox.append(timeLabel);
            row.set_child(mainBox);
            
            // Add selection logic (right-click to select/deselect)
            this._addProjectSelectionHandlers(row, project);
            
            // Apply selection styling if selected
            if (this.selectedProjects.has(project.id)) {
                row.add_css_class('selected-task'); // Use same class as tasks
            }
            
            this._project_list.append(row);
        });
        
        // Update selection UI
        this._updateProjectSelectionUI();
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
        console.log(`🗑️ _deleteSelectedTasks called. Tasks: ${this.selectedTasks.size}, Stacks: ${this.selectedStacks.size}`);
        console.log(`🗑️ Selected task IDs:`, Array.from(this.selectedTasks));
        console.log(`🗑️ Selected stack names:`, Array.from(this.selectedStacks));
        
        const hasSelectedTasks = this.selectedTasks.size > 0;
        const hasSelectedStacks = this.selectedStacks.size > 0;
        
        console.log(`🗑️ hasSelectedTasks: ${hasSelectedTasks}, hasSelectedStacks: ${hasSelectedStacks}`);
        
        if (!hasSelectedTasks && !hasSelectedStacks) {
            console.log('🗑️ No tasks or stacks selected, returning early');
            return;
        }
        
        console.log('🗑️ Proceeding with delete dialog creation...');
        
        // Since selecting a stack now automatically adds all its tasks to selectedTasks,
        // we can simply use selectedTasks.size for the total count
        const totalItems = this.selectedTasks.size;
        
        // Calculate how many tasks are in selected stacks (for display purposes)
        let stackTaskCount = 0;
        if (hasSelectedStacks) {
            this.selectedStacks.forEach(baseName => {
                const stackTasks = this.allTasks.filter(task => {
                    const taskBaseName = task.name.match(/^(.+?)\s*(?:\(\d+\))?$/);
                    const baseNameToCheck = taskBaseName ? taskBaseName[1].trim() : task.name;
                    return baseNameToCheck === baseName;
                });
                stackTaskCount += stackTasks.length;
            });
        }
        
        // Create description of what will be deleted
        let bodyText = '';
        if (hasSelectedStacks) {
            if (hasSelectedTasks && this.selectedTasks.size > stackTaskCount) {
                // Mixed selection: stacks + individual tasks
                const individualTaskCount = this.selectedTasks.size - stackTaskCount;
                bodyText = `Are you sure you want to delete the selected items?\n\n• ${this.selectedStacks.size} stack(s) (${stackTaskCount} tasks)\n• ${individualTaskCount} additional individual task(s)\n\nTotal: ${totalItems} tasks will be deleted.`;
            } else {
                // Only stacks selected
                bodyText = `Are you sure you want to delete ${this.selectedStacks.size} selected stack(s)?\n\nThis will delete ${totalItems} tasks in total.`;
            }
        } else {
            // Only individual tasks selected
            bodyText = `Are you sure you want to delete ${this.selectedTasks.size} selected task(s)?`;
        }
        
        const dialog = new Adw.AlertDialog({
            heading: 'Delete Tasks',
            body: bodyText
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
            // Since selecting stacks now automatically adds all their tasks to selectedTasks,
            // we can simply delete all tasks in selectedTasks
            if (this.selectedTasks.size === 0) {
                console.log('No tasks to delete');
                return;
            }
            
            console.log(`🗑️ Deleting ${this.selectedTasks.size} selected task(s)`);
            if (this.selectedStacks.size > 0) {
                console.log(`🗑️ This includes ${this.selectedStacks.size} selected stack(s):`, Array.from(this.selectedStacks));
            }
            
            const taskIds = Array.from(this.selectedTasks);
            const taskIdsToDelete = new Set(taskIds);
            const sql = `DELETE FROM Task WHERE id IN (${taskIds.join(',')})`;
            
            console.log(`🗑️ Executing delete SQL: ${sql}`);
            executeNonSelectCommand(this.dbConnection, sql);
            
            // Check if currently tracked task is being deleted
            const currentlyTracked = trackingStateManager.getCurrentTracking();
            if (currentlyTracked) {
                const trackedTask = this.allTasks.find(task => task.name === currentlyTracked.name);
                if (trackedTask && taskIdsToDelete.has(trackedTask.id)) {
                    console.log(`🗑️ Stopping tracking for deleted task: "${currentlyTracked.name}"`);
                    this._stopCurrentTracking();
                }
            }
            
            // Remove deleted tasks from memory
            this.allTasks = this.allTasks.filter(task => !taskIdsToDelete.has(task.id));
            
            // Clear selections
            this.selectedTasks.clear();
            this.selectedStacks.clear();
            
            // Refresh task list
            this._filterTasks();
            
            console.log(`🗑️ Successfully deleted ${taskIds.length} tasks`);
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
        
        // Add real-time validation while typing
        nameEntry.connect('changed', () => {
            const currentText = nameEntry.get_text();
            const validation = InputValidator.validateTaskName(currentText);
            
            if (currentText.length > 0 && !validation.valid) {
                // Show error styling
                InputValidator.showValidationTooltip(nameEntry, validation.error, true);
            } else {
                // Clear error styling when input is empty or valid
                InputValidator.showValidationTooltip(nameEntry, null, false);
            }
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
                
                // Validate task name
                const nameValidation = InputValidator.validateTaskName(name);
                if (!nameValidation.valid) {
                    InputValidator.showValidationTooltip(nameEntry, nameValidation.error, true);
                    return;
                }
                
                if (nameValidation.sanitized && projectIndex >= 0 && clientIndex >= 0) {
                    const project = this.allProjects[projectIndex];
                    const client = this.allClients[clientIndex];
                    this._updateTask(taskId, nameValidation.sanitized, project.id, client.id, startTime, endTime);
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
        
        // Validate all inputs
        const nameValidation = InputValidator.validateTaskName(name);
        if (!nameValidation.valid) {
            console.error('Task name validation failed in _updateTask:', nameValidation.error);
            return;
        }
        
        const idValidation = InputValidator.validateNumber(taskId, 1);
        if (!idValidation.valid) {
            console.error('Task ID validation failed:', idValidation.error);
            return;
        }
        
        const projectIdValidation = InputValidator.validateNumber(projectId, 1);
        if (!projectIdValidation.valid) {
            console.error('Project ID validation failed:', projectIdValidation.error);
            return;
        }
        
        const clientIdValidation = InputValidator.validateNumber(clientId, 1);
        if (!clientIdValidation.valid) {
            console.error('Client ID validation failed:', clientIdValidation.error);
            return;
        }
        
        try {
            // Use sanitized and validated values
            const safeName = nameValidation.sanitized;
            const safeTaskId = idValidation.sanitized;
            const safeProjectId = projectIdValidation.sanitized;
            const safeClientId = clientIdValidation.sanitized;
            
            let sql = `UPDATE Task SET name = '${InputValidator.sanitizeForSQL(safeName)}', project_id = ${safeProjectId}, client_id = ${safeClientId}`;
            
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
            
            sql += ` WHERE id = ${safeTaskId}`;
            
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
        
        // Stop any currently active tracking first using the state manager
        if (trackingStateManager.getCurrentTracking()) {
            this._stopCurrentTracking();
        }
        
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
        const taskInputs = this.trackingWidgets ? 
            this.trackingWidgets.map(w => w.input) : 
            [];
        
        taskInputs.forEach(input => {
            if (input) {
                input.set_text(newTaskName);
            }
        });
        
        // Start tracking on the main tasks page
        const trackButton = this.trackingWidgets && this.trackingWidgets[0] ? this.trackingWidgets[0].button : null;
        if (trackButton) {
            // Simulate clicking the master track button to start tracking
            trackButton.emit('clicked');
            console.log(`✅ Started tracking: "${newTaskName}" with project: ${task.project}, client: ${task.client}`);
        }
        
        // Switch to tasks page to show the tracking
        this._showPage('tasks');
    }
    
    _stopCurrentTracking() {
        console.log('Stop current tracking');
        
        // Get current tracking info before stopping
        const currentTracking = trackingStateManager.getCurrentTracking();
        if (!currentTracking) {
            console.log('No active tracking to stop');
            return;
        }
        
        // Use the state manager to stop tracking, which will update all UI elements
        const stoppedTask = trackingStateManager.stopTracking();
        
        if (stoppedTask && currentTracking.name) {
            console.log('Stopped tracking via state manager for:', stoppedTask.name);
            
            // Use the duration calculated by trackingStateManager (already in seconds)
            const spentSeconds = stoppedTask.duration;
            const endDateTime = GLib.DateTime.new_now_local();
            
            // Get current context
            const context = this.getSelectedContext ? this.getSelectedContext() : { 
                project: { id: currentTracking.projectId || 1, name: currentTracking.projectName || 'Default' },
                client: { id: 1, name: 'Default Client' },
                currency: { code: 'EUR', symbol: '€' }
            };
            
            const projectId = context.project?.id || currentTracking.projectId || 1;
            const projectName = context.project?.name || currentTracking.projectName || "Default";
            const clientId = context.client?.id || 1;
            const clientName = context.client?.name || "Default Client";
            const currency = context.currency || { code: 'EUR', symbol: '€' };
            
            // Format time strings
            const startStr = currentTracking.startTime;
            const endStr = endDateTime.format('%Y-%m-%d %H:%M:%S');
            
            console.log(`Saving task: ${currentTracking.name}, Time: ${spentSeconds} seconds`);
            
            // Save task
            try {
                console.log(`💾 Attempting to save task: "${currentTracking.name}"`);
                console.log(`📊 Task context: Project: ${projectName}, Client: ${clientName}, Currency: ${currency.symbol} ${currency.code}`);
                console.log(`⏰ Duration: ${spentSeconds}s, Time range: ${startStr} → ${endStr}`);
                
                const saveResult = saveTask(currentTracking.name, projectName, startStr, endStr, spentSeconds, projectId, {
                    client: { id: clientId, name: clientName },
                    currency: currency
                });
                
                if (saveResult) {
                    console.log("✅ Task successfully saved to database");
                } else {
                    console.log("❌ Failed to save task to database");
                }
                
                // Update task list
                if (typeof this._removeActiveTask === 'function') {
                    this._removeActiveTask(currentTracking.name);
                    console.log("🔄 Active task removed from UI");
                }
                if (typeof this.loadTasks === 'function') {
                    this.loadTasks();
                    console.log("🔄 Task list refreshed");
                }
            } catch (error) {
                console.error("❌ Error during task save process:", error);
            }
            
            // Also trigger the UI buttons to stop (for backward compatibility)
            const trackingButtons = this.trackingWidgets ? 
                this.trackingWidgets.map(w => w.button) : 
                [];
            
            trackingButtons.forEach(btn => {
                if (btn && btn.get_icon_name() === 'media-playback-stop-symbolic') {
                    btn.emit('clicked'); // Stop current tracking
                    console.log('Stopped tracking via button click');
                }
            });
        }
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
        
        // Update all project buttons across all tracking widgets
        const projectButtons = this.trackingWidgets ? 
            this.trackingWidgets.map(w => w.projectBtn).concat([this._project_context_btn]) : 
            [this._project_context_btn];
        
        // Determine icon color based on icon_color_mode setting
        let iconColor = 'black'; // Default
        
        const iconColorMode = project.icon_color_mode || 'auto';
        
        if (iconColorMode === 'dark') {
            // Force dark/black icons
            iconColor = 'black';
            console.log(`Context button - Project ${project.name}: Using dark icons (manual override)`);
        } else if (iconColorMode === 'light') {
            // Force light/white icons
            iconColor = 'white';
            console.log(`Context button - Project ${project.name}: Using light icons (manual override)`);
        } else {
            // Auto mode - use color detection
            const colorInfo = this.projectColors.find(c => c.value === project.color);
            if (colorInfo) {
                iconColor = colorInfo.textColor;
                console.log(`Context button - Project ${project.name}: Auto mode - Color ${project.color}, Icon color: ${iconColor}`);
            } else {
                // For colors not in predefined list, determine based on color brightness
                console.log(`Context button - Unknown color ${project.color} for project ${project.name}, using brightness detection`);
                // If color starts with dark values, use white icons
                if (project.color && (project.color.startsWith('#1') || project.color.startsWith('#2') || 
                    project.color.startsWith('#3') || project.color.startsWith('#4') || 
                    project.color.startsWith('#5') || project.color.toLowerCase().includes('dark'))) {
                    iconColor = 'white';
                }
            }
        }
        
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
                        color: ${iconColor};
                        ${iconColor === 'white' ? '-gtk-icon-shadow: 1px 1px 1px rgba(0,0,0,0.3);' : ''}
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
        
        // Update compact tracker if it exists
        if (this.compactTrackerWindow) {
            this.compactTrackerWindow.updateContext();
        }
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
        // Update all client buttons across all tracking widgets
        const clientButtons = this.trackingWidgets ? 
            this.trackingWidgets.map(w => w.clientBtn).concat([this._client_context_btn]) : 
            [this._client_context_btn];
        
        clientButtons.forEach(btn => {
            if (btn) {
                btn.set_tooltip_text(`Client: ${clientName}`);
                // Optionally add a visual indicator that client is selected
                btn.add_css_class('context-selected');
            }
        });
        
        // Update compact tracker if it exists
        if (this.compactTrackerWindow) {
            this.compactTrackerWindow.updateContext();
        }
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

    // Compact Tracker Window Methods
    showCompactTracker() {
        if (this.compactTrackerWindow) {
            // If already exists, just present it
            this.compactTrackerWindow.present();
            return;
        }

        // Create new compact tracker window
        this.compactTrackerWindow = new CompactTrackerWindow(this.get_application(), this);
        
        // Handle window close
        this.compactTrackerWindow.connect('close-request', () => {
            this.compactTrackerWindow = null;
            return false; // Allow the window to close
        });

        this.compactTrackerWindow.present();
        console.log('Compact tracker window opened');
    }

    _startTrackingFromCompact(taskName) {
        console.log('Starting tracking from compact tracker:', taskName);
        
        // Set the task name in all tracking widget inputs
        if (this.trackingWidgets) {
            this.trackingWidgets.forEach(widget => {
                if (widget.input) {
                    widget.input.set_text(taskName);
                }
            });
        }
        
        // Use the master tracking widget's button to start tracking
        if (this.trackingWidgets && this.trackingWidgets[0] && this.trackingWidgets[0].button) {
            this.trackingWidgets[0].button.emit('clicked');
        }
        
        // Update compact tracker if it exists
        if (this.compactTrackerWindow) {
            this.compactTrackerWindow.updateContext();
        }
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
            
            // Don't call _loadClients again to avoid infinite recursion
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
        // Use the filter function to display all clients (empty search = show all)
        this._filterClients();
    }
    
    _updateClientStats() {
        // Client stats UI removed - stats calculation still available in memory
        const totalClients = this.allClients.length;
        const totalRevenue = this.allClients.reduce((sum, c) => sum + (c.totalRevenue || 0), 0);
        
        console.log(`Client stats: ${totalClients} clients, €${totalRevenue.toFixed(2)} total revenue`);
    }
    
    _handleClientNameChange(clientId, newName) {
        // Validate and update client name
        const validation = InputValidator.validateClientName(newName);
        if (!validation.valid) {
            console.warn('Invalid client name:', validation.error);
            return;
        }
        
        if (!this.dbConnection) return;
        
        try {
            const sql = `UPDATE Client SET name = '${validation.sanitized}' WHERE id = ${clientId}`;
            executeNonSelectCommand(this.dbConnection, sql);
            
            // Update in memory
            const client = this.allClients.find(c => c.id === clientId);
            if (client) {
                client.name = validation.sanitized;
            }
            
            console.log(`Client name updated: ${clientId} -> ${validation.sanitized}`);
        } catch (error) {
            console.error('Error updating client name:', error);
            this._loadClients(); // Reload to revert changes
        }
    }
    
    _addClientSelectionHandlers(row, client) {
        // ONLY right-click gesture for selection - NO OTHER TRIGGERS
        const rightClickGesture = new Gtk.GestureClick({
            button: 3 // ONLY Right click
        });
        
        rightClickGesture.connect('pressed', () => {
            console.log(`Right-click detected on client: ${client.name}`);
            this._toggleClientSelection(client.id, row);
        });
        
        row.add_controller(rightClickGesture);
        
        // Explicitly prevent left-click from doing anything
        const leftClickGesture = new Gtk.GestureClick({
            button: 1 // Left click
        });
        
        leftClickGesture.connect('pressed', () => {
            console.log(`Left-click blocked on client: ${client.name} - only right-click selects`);
            // Do nothing - selection ONLY with right-click
        });
        
        row.add_controller(leftClickGesture);
    }
    
    _toggleClientSelection(clientId, row) {
        if (clientId === 1) {
            // Can't select Default client
            console.log('Cannot select Default client');
            return;
        }
        
        if (this.selectedClients.has(clientId)) {
            // Deselect - multiple selection support
            this.selectedClients.delete(clientId);
            row.remove_css_class('selected-task');
            console.log(`Client deselected: ${clientId}. Total selected: ${this.selectedClients.size}`);
        } else {
            // Select - multiple selection support
            this.selectedClients.add(clientId);
            row.add_css_class('selected-task');
            console.log(`Client selected: ${clientId}. Total selected: ${this.selectedClients.size}`);
        }
        
        this._updateClientSelectionUI();
    }
    
    _updateClientSelectionUI() {
        const selectedCount = this.selectedClients.size;
        
        // Footer removed from UI - just log selection count
        if (selectedCount > 0) {
            console.log(`${selectedCount} clients selected`);
        }
    }
    
    _showCurrencyRateDialog(clientId) {
        const client = this.allClients.find(c => c.id === clientId);
        if (!client) return;
        
        const dialog = new Adw.AlertDialog({
            heading: `Edit Rate for ${client.name}`,
            body: 'Set currency and hourly rate for this client'
        });
        
        // Create content box
        const contentBox = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 12,
            margin_start: 12,
            margin_end: 12,
            margin_top: 12,
            margin_bottom: 12
        });
        
        // Currency selection
        const currencyLabel = new Gtk.Label({
            label: 'Currency:',
            halign: Gtk.Align.START
        });
        
        const currencyDropdown = new Gtk.DropDown({
            model: new Gtk.StringList({
                strings: ['€ (EUR)', '$ (USD)', '£ (GBP)', '¥ (JPY)', '₽ (RUB)']
            }),
            selected: 0 // Default to EUR
        });
        
        // Rate entry
        const rateLabel = new Gtk.Label({
            label: 'Hourly Rate:',
            halign: Gtk.Align.START
        });
        
        const rateEntry = new Gtk.Entry({
            text: client.rate.toString(),
            placeholder_text: 'Enter hourly rate',
            input_purpose: Gtk.InputPurpose.NUMBER
        });
        
        contentBox.append(currencyLabel);
        contentBox.append(currencyDropdown);
        contentBox.append(rateLabel);
        contentBox.append(rateEntry);
        
        dialog.set_extra_child(contentBox);
        dialog.add_response('cancel', 'Cancel');
        dialog.add_response('save', 'Save');
        dialog.set_response_appearance('save', Adw.ResponseAppearance.SUGGESTED);
        
        dialog.connect('response', (dialog, response) => {
            if (response === 'save') {
                const newRate = parseFloat(rateEntry.get_text());
                const currencyIndex = currencyDropdown.get_selected();
                const currencies = ['€', '$', '£', '¥', '₽'];
                const selectedCurrency = currencies[currencyIndex];
                
                if (!isNaN(newRate) && newRate > 0) {
                    this._updateClientRate(clientId, newRate, selectedCurrency);
                }
            }
        });
        
        dialog.present(this);
    }
    
    _updateClientRate(clientId, newRate, currency) {
        if (!this.dbConnection) return;
        
        try {
            const sql = `UPDATE Client SET rate = ${newRate} WHERE id = ${clientId}`;
            executeNonSelectCommand(this.dbConnection, sql);
            
            // Update in memory
            const client = this.allClients.find(c => c.id === clientId);
            if (client) {
                client.rate = newRate;
                client.currency = currency; // Store currency (may need to add column later)
            }
            
            console.log(`Client rate updated: ${clientId} -> ${currency}${newRate}/h`);
            this._updateClientsList(); // Refresh display
            this._calculateClientStats();
            this._updateClientStats();
            
        } catch (error) {
            console.error('Error updating client rate:', error);
        }
    }
    
    _deleteSelectedClients() {
        if (this.selectedClients.size === 0) return;
        
        const dialog = new Adw.AlertDialog({
            heading: 'Delete Selected Clients',
            body: `Are you sure you want to delete ${this.selectedClients.size} clients? All associated tasks will be moved to the Default Client.`
        });
        
        dialog.add_response('cancel', 'Cancel');
        dialog.add_response('delete', 'Delete');
        dialog.set_response_appearance('delete', Adw.ResponseAppearance.DESTRUCTIVE);
        
        dialog.connect('response', (dialog, response) => {
            if (response === 'delete') {
                // Delete all selected clients
                this.selectedClients.forEach(clientId => {
                    this._confirmDeleteClient(clientId);
                });
                
                // Clear selection
                this.selectedClients.clear();
                this._updateClientSelectionUI();
                this._loadClients(); // Refresh list
            }
        });
        
        dialog.present(this);
    }
    
    _confirmDeleteClient(clientId) {
        if (!this.dbConnection) return;
        
        try {
            // Move tasks to default client
            const updateTasks = `UPDATE Task SET client_id = 1 WHERE client_id = ${clientId}`;
            executeNonSelectCommand(this.dbConnection, updateTasks);
            
            // Delete client
            const deleteClient = `DELETE FROM Client WHERE id = ${clientId}`;
            executeNonSelectCommand(this.dbConnection, deleteClient);
            
            console.log('Client deleted:', clientId);
            this._loadClients(); // Refresh
        } catch (error) {
            console.error('Error deleting client:', error);
        }
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
        
        // Client name - pre-filled with search text
        const searchText = this._client_search.get_text().trim();
        const nameEntry = new Gtk.Entry({
            placeholder_text: 'Client name',
            text: searchText // Pre-fill with search input
        });
        
        // Add real-time validation while typing
        nameEntry.connect('changed', () => {
            const currentText = nameEntry.get_text();
            const validation = InputValidator.validateClientName(currentText);
            
            if (currentText.length > 0 && !validation.valid) {
                // Show error styling
                InputValidator.showValidationTooltip(nameEntry, validation.error, true);
            } else {
                // Clear error styling when input is empty or valid
                InputValidator.showValidationTooltip(nameEntry, null, false);
            }
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
                
                // Validate client name
                const nameValidation = InputValidator.validateClientName(name);
                if (!nameValidation.valid) {
                    InputValidator.showValidationTooltip(nameEntry, nameValidation.error, true);
                    return; // Don't close dialog
                }
                
                if (nameValidation.sanitized) {
                    this._createClient(nameValidation.sanitized, email, rate);
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
            
            // Clear search input after successful creation
            this._client_search.set_text('');
            
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
        
        // Add real-time validation while typing
        nameEntry.connect('changed', () => {
            const currentText = nameEntry.get_text();
            const validation = InputValidator.validateClientName(currentText);
            
            if (currentText.length > 0 && !validation.valid) {
                // Show error styling
                InputValidator.showValidationTooltip(nameEntry, validation.error, true);
            } else {
                // Clear error styling when input is empty or valid
                InputValidator.showValidationTooltip(nameEntry, null, false);
            }
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
                
                // Validate client name
                const nameValidation = InputValidator.validateClientName(name);
                if (!nameValidation.valid) {
                    InputValidator.showValidationTooltip(nameEntry, nameValidation.error, true);
                    return; // Don't close dialog
                }
                
                console.log('Updating client:', nameValidation.sanitized, email, rate);
                if (nameValidation.sanitized) {
                    this._updateClient(clientId, nameValidation.sanitized, email, rate);
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
        const searchText = this._client_search.get_text().toLowerCase().trim();
        console.log('Filter clients:', searchText);
        
        // Clear existing clients
        while (this._client_list.get_first_child()) {
            this._client_list.remove(this._client_list.get_first_child());
        }
        
        // Initialize selected clients set if not exists
        if (!this.selectedClients) {
            this.selectedClients = new Set();
        }
        
        // Filter clients based on search text
        const filteredClients = searchText.length === 0 
            ? this.allClients 
            : this.allClients.filter(client => 
                client.name.toLowerCase().includes(searchText) ||
                (client.email && client.email.toLowerCase().includes(searchText))
            );
        
        console.log(`Showing ${filteredClients.length} of ${this.allClients.length} clients`);
        
        // Render filtered clients using the same logic as _updateClientsList
        filteredClients.forEach(client => {
            // Create ListBoxRow with custom content (same as _updateClientsList)
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
            
            // Editable client name
            const nameLabel = new Gtk.EditableLabel({
                text: client.name,
                hexpand: true,
                valign: Gtk.Align.CENTER
            });
            
            // Handle name changes
            nameLabel.connect('changed', () => {
                const newName = nameLabel.get_text().trim();
                if (newName && newName !== client.name) {
                    this._handleClientNameChange(client.id, newName);
                }
            });
            
            // Add right-click to editable label for selection (no context menu)
            const labelRightClick = new Gtk.GestureClick({
                button: 3, // Right click
                propagation_phase: Gtk.PropagationPhase.CAPTURE
            });
            
            labelRightClick.connect('pressed', (gesture, n_press, x, y) => {
                console.log(`Right-click on client label detected: ${client.name}`);
                this._toggleClientSelection(client.id, row);
                
                // Stop all propagation
                gesture.set_state(Gtk.EventSequenceState.CLAIMED);
                return Gdk.EVENT_STOP;
            });
            
            nameLabel.add_controller(labelRightClick);
            
            // Clickable currency display (replaces time display from projects)
            const currencyButton = new Gtk.Button({
                label: `€${client.rate.toFixed(0)}/h`,
                css_classes: ['flat', 'currency-button'],
                tooltip_text: 'Click to edit currency and rate',
                valign: Gtk.Align.CENTER,
                halign: Gtk.Align.END
            });
            
            // Click to edit currency and rate
            currencyButton.connect('clicked', () => {
                this._showCurrencyRateDialog(client.id);
            });
            
            // Assemble the row (no icon)
            mainBox.append(nameLabel);
            mainBox.append(currencyButton);
            row.set_child(mainBox);
            
            // Add selection logic (right-click to select/deselect)
            this._addClientSelectionHandlers(row, client);
            
            // Apply selection styling if selected
            if (this.selectedClients.has(client.id)) {
                row.add_css_class('selected-task'); // Use same class as tasks/projects
            }
            
            this._client_list.append(row);
        });
        
        // Update selection UI
        this._updateClientSelectionUI();
    }
    
    _selectClient(clientId) {
        this.currentClientId = clientId;
        console.log('Selected client ID:', clientId);
    }
    
    _showAboutDialog() {
        showAboutDialog(this);
    }
});

