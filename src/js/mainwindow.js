/* window.js
 *
 * Copyright 2025 Vitaly Odnoiko
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 *
 * SPDX-License-Identifier: MIT
 */

import GObject from 'gi://GObject';
import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import Gdk from 'gi://Gdk?version=4.0';
import GLib from 'gi://GLib';
import { setupDatabase } from 'resource:///com/odnoyko/valot/js/func/global/dbinitialisation.js';
import { CompactTrackerWindow } from 'resource:///com/odnoyko/valot/js/compacttracker.js';
import { ProjectManager } from 'resource:///com/odnoyko/valot/js/func/pages/projectManager.js';
import { ClientManager } from 'resource:///com/odnoyko/valot/js/func/pages/clientManager.js';
import { TaskManager } from 'resource:///com/odnoyko/valot/js/func/pages/taskManager.js';
import { TaskRenderer } from 'resource:///com/odnoyko/valot/js/func/pages/taskRenderer.js';
import { GlobalTracking } from 'resource:///com/odnoyko/valot/js/func/global/globalTracking.js';
import { TimeUtils } from 'resource:///com/odnoyko/valot/js/func/global/timeUtils.js';
import { SimpleChart } from 'resource:///com/odnoyko/valot/js/func/pages/simpleChart.js';
import { timeTrack } from 'resource:///com/odnoyko/valot/js/func/global/timetracking.js';
import { trackingStateManager } from 'resource:///com/odnoyko/valot/js/func/global/trackingStateManager.js';
import { ReportExporter } from 'resource:///com/odnoyko/valot/js/func/pages/reportExporter.js';
import { showAboutDialog } from 'resource:///com/odnoyko/valot/js/func/global/aboutDialog.js';
import { getAllCurrencies } from 'resource:///com/odnoyko/valot/js/data/currencies.js';
import { getProjectIconColor } from 'resource:///com/odnoyko/valot/js/func/global/colorUtils.js';
import { handleDeleteKey, getCurrentPageName, setupApplicationKeyboardHandler } from 'resource:///com/odnoyko/valot/js/func/global/keyboardHandler.js';

// New modular UI components
import { ModularDialogManager } from 'resource:///com/odnoyko/valot/js/interface/components/complex/ModularDialogManager.js';
import { TrackingWidget } from 'resource:///com/odnoyko/valot/js/interface/components/complex/TrackingWidget.js';
import { DateRangeSelector } from 'resource:///com/odnoyko/valot/js/interface/components/complex/DateRangeSelector.js';
import { HeaderTrackingWidget } from 'resource:///com/odnoyko/valot/js/interface/components/complex/HeaderTrackingWidget.js';
import { WidgetFactory } from 'resource:///com/odnoyko/valot/js/interface/components/widgetFactory.js';
import { Button } from 'resource:///com/odnoyko/valot/js/interface/components/primitive/Button.js';
import { getCurrencySymbol } from 'resource:///com/odnoyko/valot/js/data/currencies.js';
import { ClientDropdown } from 'resource:///com/odnoyko/valot/js/interface/components/clientDropdown.js';
import { TasksPage } from 'resource:///com/odnoyko/valot/js/interface/pages/TasksPage.js';
import { ProjectsPage } from 'resource:///com/odnoyko/valot/js/interface/pages/ProjectsPage.js';
import { ClientsPage } from 'resource:///com/odnoyko/valot/js/interface/pages/ClientsPage.js';
import { ReportsPage } from 'resource:///com/odnoyko/valot/js/interface/pages/ReportsPage.js';
import { PDFExportPreferencesDialog } from 'resource:///com/odnoyko/valot/js/interface/dialogs/PDFExportPreferencesDialog.js';

export const ValotWindow = GObject.registerClass({
    GTypeName: 'ValotWindow',
    Template: 'resource:///com/odnoyko/valot/ui/window.ui',
    InternalChildren: [
        'split_view', 'main_content', 'sidebar_list',
        'sidebar_toggle_btn', 'menu_button',
        'tasks_page', 'projects_page', 'clients_page', 'reports_page',
        'export_pdf_btn', 'period_filter', 'project_filter', 'client_filter',
        'task_search', 'task_filter', 'task_list', 
        'prev_page_btn', 'next_page_btn', 'page_info', 'pagination_box',
        'project_search', 'add_project_btn', 'project_list',
        'client_search', 'add_client_btn', 'client_list',
        // Sidebar stats
        'weekly_time_row',
        // Page-specific sidebar toggle buttons
        'show_sidebar_btn', 'show_sidebar_btn2', 'show_sidebar_btn3', 'show_sidebar_btn5',
        // Tracking widgets for all pages
        'tracking_widget', 'task_name', 'actual_time', 'track_button', 'project_context_btn', 'client_context_btn', 'compact_tracker_btn',
        'tracking_widget_projects', 'task_name_projects', 'actual_time_projects', 'track_button_projects', 'compact_tracker_btn_projects',
        'tracking_widget_clients', 'task_name_clients', 'actual_time_clients', 'track_button_clients', 'compact_tracker_btn_clients',
        'tracking_widget_reports', 'task_name_reports', 'actual_time_reports', 'track_button_reports', 'compact_tracker_btn_reports',
        // Reports page chart elements  
        'chart_placeholder', 'period_filter', 'project_filter', 'client_filter',
        // Reports page statistics
        'reports_total_time_value', 'reports_total_projects_value', 'reports_total_tasks_value',
        // Currency carousel
        'reports_currency_carousel', 'reports_carousel_indicators',
        // Reports page recent tasks
        'recent_tasks_list', 'reports_delete_selected_btn'
    ],
}, class ValotWindow extends Adw.ApplicationWindow {
    constructor(application) {
        super({ application });
        
        // Core application state
        this.dbConnection = null;
        this.compactTrackerWindow = null;
        
        // Current selections for compact tracker compatibility
        this.currentProjectId = 1;
        this.currentClientId = 1;
        
        // Data arrays for compatibility
        this.allProjects = [];
        this.allClients = [];
        this.allTasks = [];
        
        // Initialize database connection
        this._initializeDatabase(application);
        
        // Initialize managers
        this._initializeManagers();
        
        // Setup GTK overflow properties on content boxes
        this._setupContentBoxOverflow();
        
        // Initialize task selection state
        this.selectedTasks = new Set();
        this.selectedStacks = new Set();
        this.taskRowMap = new Map();
        this.stackRowMap = new Map();
        
        // Track current page for selection clearing
        this.currentPageIndex = 0; // Start with tasks page
        
        // Reports page selection state
        this.reportsSelectedTasks = new Set();
        this.reportsSelectedStacks = new Set();
        
        // Initialize modular page components
        this._initializePages();
        
        // Setup navigation and basic UI
        this._setupNavigation();
        this._setupTimeTracking();
        this._setupProjectClientButtons();
        this._setupCompactTrackerButton();
        this._setupWindowVisibilityTracking();
        
        // Show default page (Tasks) on startup FIRST
        this._showDefaultPage();
        
        // Setup application-wide keyboard handler using func logic
        setupApplicationKeyboardHandler(this.application, this);
        
        // Handle window close - ensure application quits properly
        this.connect('close-request', () => {
            // If compact tracker is open, close it too
            if (this.compactTrackerWindow && this.compactTrackerWindow.is_visible()) {
                this.compactTrackerWindow.close();
            }
            this.application.quit();
            return false; // Allow window destruction
        });
        
        // Setup other keyboard shortcuts
        this._setupKeyboardShortcuts();
        
        // Subscribe to tracking events for updating stats
        this._setupTrackingSubscriptions();
        
        // Initialize weekly stats (async)
        GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
            this.updateWeeklyStats();
            return false; // Remove from event loop
        });
        
    }

    _initializeDatabase(application) {
        const app = application;
        if (app && app.database_connection) {
            this.dbConnection = app.database_connection;
        } else {
            try {
                this.dbConnection = setupDatabase();
            } catch (error) {
                // Database initialization failed
            }
        }
    }

    _initializeManagers() {
        if (!this.dbConnection) {
            // No database connection available for managers
            return;
        }

        // Initialize ProjectManager with required parameters
        const projectColors = [
            { name: 'Red', value: '#e74c3c' },
            { name: 'Green', value: '#2ecc71' },
            { name: 'Blue', value: '#3498db' },
            { name: 'Orange', value: '#f39c12' },
            { name: 'Purple', value: '#9b59b6' },
            { name: 'Teal', value: '#1abc9c' },
            { name: 'Pink', value: '#e91e63' },
            { name: 'Brown', value: '#795548' },
            { name: 'Grey', value: '#607d8b' },
            { name: 'Yellow', value: '#ffeb3b' },
            { name: 'Indigo', value: '#3f51b5' },
            { name: 'Cyan', value: '#00bcd4' },
            { name: 'Lime', value: '#8bc34a' },
            { name: 'Deep Orange', value: '#ff5722' },
            { name: 'Light Blue', value: '#03a9f4' },
            { name: 'Amber', value: '#ffc107' }
        ];

        const projectIcons = [
            'folder-symbolic', 'folder-open-symbolic', 'applications-office-symbolic',
            'applications-development-symbolic', 'document-new-symbolic', 'text-editor-symbolic',
            'applications-graphics-symbolic', 'camera-photo-symbolic', 'preferences-desktop-symbolic',
            'applications-multimedia-symbolic', 'audio-volume-high-symbolic', 'video-player-symbolic'
        ];

        this.projectManager = new ProjectManager(
            this.dbConnection,
            (db, sql) => db.execute_select_command(sql),
            (db, sql) => db.execute_non_select_command(sql),
            projectColors,
            projectIcons
        );
        this.projectManager.setParentWindow(this);
        this.projectManager.useModularDialogs(true);

        // Initialize ClientManager with currencies
        const currencies = getAllCurrencies();

        this.clientManager = new ClientManager(
            this.dbConnection,
            (db, sql) => db.execute_select_command(sql),
            (db, sql) => db.execute_non_select_command(sql),
            currencies
        );
        this.clientManager.setParentWindow(this);

        // Initialize TaskManager
        this.taskManager = new TaskManager(
            this.dbConnection,
            (db, sql) => db.execute_select_command(sql),
            (db, sql) => db.execute_non_select_command(sql)
        );

        // Initialize TaskRenderer for Reports page recent tasks
        this.reportsTaskRenderer = new TaskRenderer(
            TimeUtils,
            this.allProjects || [],
            this
        );
        // Set Reports-specific selection state
        this.reportsTaskRenderer.selectedTasks = this.reportsSelectedTasks;
        this.reportsTaskRenderer.selectedStacks = this.reportsSelectedStacks;
        // Set callback for selection changes
        this.reportsTaskRenderer.onSelectionChanged = () => {
            this._updateReportsDeleteButton();
        };

        // Initialize other managers
        this.timeUtils = TimeUtils;
        this.simpleChart = new SimpleChart(this._chart_placeholder);
        this.reportExporter = new ReportExporter();
        
        // Make trackingStateManager available to child components
        this.trackingStateManager = trackingStateManager;

        // Register sidebar elements for real-time updates
        if (this._weekly_time_row) {
            trackingStateManager.registerSidebarElement('weeklyTime', this._weekly_time_row);
        }

        // Subscribe to tracking events for weekly time updates and project sync
        trackingStateManager.subscribe((event, eventData) => {
            if (event === 'updateWeeklyTime') {
                this._updateWeeklyTimeRealTime(eventData.additionalTime);
            } else if (event === 'start') {
                // Update project/client when tracking starts from task list
                if (eventData.projectId) {
                    this.currentProjectId = eventData.projectId;
                    if (eventData.projectName) {
                        this._updateProjectButtonsDisplay(eventData.projectName);
                    }
                }
                if (eventData.clientId) {
                    this.currentClientId = eventData.clientId;
                    if (eventData.clientName) {
                        this._updateClientButtonsDisplay(eventData.clientName);
                    }
                }
            }
        });

        // Initialize modular dialog manager
        this.modularDialogManager = new ModularDialogManager(this, this.application);

        
        // Load initial data
        this._loadProjects();
        this._loadClients();
        
        // Update weekly time after initial data load
        setTimeout(() => this.updateWeeklyStats(), 1000);
    }

    /**
     * Create a new TrackingWidget instance with all managers configured
     */
    createTrackingWidget(config = {}) {
        return TrackingWidget.createFull({
            parentWindow: this,
            projectManager: this.projectManager,
            clientManager: this.clientManager,
            taskManager: this.taskManager,
            ...config
        });
    }

    /**
     * Setup GTK overflow properties on content boxes
     * Adds overflow hidden to main content list boxes, excluding tracking widget elements
     */
    _setupContentBoxOverflow() {
        // Add overflow hidden to main page content boxes
        if (this._task_list) {
            this._task_list.set_overflow(Gtk.Overflow.HIDDEN);
        }
        
        if (this._project_list) {
            this._project_list.set_overflow(Gtk.Overflow.HIDDEN);
        }
        
        if (this._client_list) {
            this._client_list.set_overflow(Gtk.Overflow.HIDDEN);
        }
        
        if (this._recent_tasks_list) {
            this._recent_tasks_list.set_overflow(Gtk.Overflow.HIDDEN);
        }
        
        // Note: We deliberately exclude tracking widget related content boxes
        // as they need to be able to overflow for dropdown functionality
    }

    _initializePages() {
        // Initialize Tasks Page
        this.tasksPageComponent = new TasksPage({
            parentWindow: this,
            app: this.application
        });

        // Initialize Projects Page
        this.projectsPageComponent = new ProjectsPage({
            projectManager: this.projectManager,
            modularDialogManager: this.modularDialogManager,
            parentWindow: this
        });

        // Initialize Clients Page
        this.clientsPageComponent = new ClientsPage({
            clientManager: this.clientManager,
            modularDialogManager: this.modularDialogManager,
            parentWindow: this
        });

        // Initialize Reports Page
        this.reportsPageComponent = new ReportsPage({
            reportExporter: this.reportExporter,
            simpleChart: this.simpleChart,
            timeUtils: this.timeUtils,
            parentWindow: this
        });

        // Connect existing UI export button to preferences dialog
        if (this._export_pdf_btn) {
            // Connecting export PDF button
            this._export_pdf_btn.connect('clicked', () => {
                this._showPDFExportPreferences();
            });
        } else {
        }

        // Connect filter dropdowns to update ReportExporter
        if (this._period_filter) {
            this._period_filter.connect('notify::selected', () => {
                const periods = ['week', 'month', 'year'];
                const selectedPeriod = periods[this._period_filter.get_selected()];
                if (this.reportExporter) {
                    this.reportExporter.configurePeriod(selectedPeriod);
                }
            });
        }

        if (this._project_filter) {
            this._project_filter.connect('notify::selected', () => {
                const selectedIndex = this._project_filter.get_selected();
                const projectId = selectedIndex === 0 ? null : this._getProjectIdByFilterIndex(selectedIndex - 1);
                // Project filter changed
                if (this.reportExporter) {
                    this.reportExporter.configureProjectFilter(projectId);
                }
            });
        }

        if (this._client_filter) {
            this._client_filter.connect('notify::selected', () => {
                const selectedIndex = this._client_filter.get_selected();
                const clientId = selectedIndex === 0 ? null : this._getClientIdByFilterIndex(selectedIndex - 1);
                // Client filter changed
                if (this.reportExporter) {
                    this.reportExporter.configureClientFilter(clientId);
                }
            });
        }


        // Store page components for easy access
        this.pageComponents = {
            tasks: this.tasksPageComponent,
            projects: this.projectsPageComponent,
            clients: this.clientsPageComponent,
            reports: this.reportsPageComponent
        };

        // Connect page components to existing template UI
        this._connectPageComponents();

    }

    _setupTimeTracking() {
        // Create unified header tracking widgets (one instance per page, but all synchronized)
        this._createUnifiedTrackingWidgets();
    }

    _createUnifiedTrackingWidgets() {
        // Get all tracking widget containers from the template
        const trackingContainers = [
            { container: this._tracking_widget, name: 'tasks' },
            { container: this._tracking_widget_projects, name: 'projects' },
            { container: this._tracking_widget_clients, name: 'clients' },
            { container: this._tracking_widget_reports, name: 'reports' }
        ];

        // Store all tracking widget instances for synchronization
        this.trackingWidgets = [];

        trackingContainers.forEach(({ container, name }, index) => {
            if (container) {
                // Remove all existing children
                let child = container.get_first_child();
                while (child) {
                    const next = child.get_next_sibling();
                    container.remove(child);
                    child = next;
                }

                // Create a new instance of the unified tracking widget for this container
                // First widget (index 0) is the master widget
                const isMaster = index === 0;
                const trackingWidget = new HeaderTrackingWidget(this, isMaster);
                container.append(trackingWidget.getWidget());
                
                // Store the instance for synchronization
                this.trackingWidgets.push({
                    widget: trackingWidget,
                    page: name,
                    isMaster: isMaster
                });
                
                // Created tracking widget
            } else {
            }
        });

        // All widgets are automatically synchronized through trackingStateManager
        // Created synchronized tracking widgets
        
        // Update project buttons after widgets are created
        if (this.allProjects && this.allProjects.length > 0 && this.currentProjectId) {
            const currentProject = this.allProjects.find(p => p.id === this.currentProjectId);
            if (currentProject) {
                // Initial project button update
                this._updateProjectButtonsDisplay(currentProject.name);
            }
        }
        
        // Set up master widget for time tracking logic (like before)
        if (this.trackingWidgets.length > 0) {
            this.masterTrackingWidget = this.trackingWidgets[0].widget;
            
            // Initialize actual time tracking on the master widget using timeTrack function
            const masterWidgets = this.masterTrackingWidget.getRawWidgets();
            if (masterWidgets.trackButton && masterWidgets.taskEntry && masterWidgets.timeLabel) {
                // Call timeTrack like the original system
                // HeaderTrackingWidget handles its own tracking now
                // Time tracking initialized
            }
            
            // Master tracking widget set
        }
        
        // IMPORTANT: Also initialize main template buttons
        this._setupMainTrackingButtons();
    }

    /**
     * Synchronize all tracking widget inputs when one changes (debounced)
     */
    _syncAllInputsFromCurrentWidget(text, sourceWidget) {
        if (!this.trackingWidgets) return;
        
        // Clear any existing debounce timeout
        if (this._syncDebounceTimeout) {
            clearTimeout(this._syncDebounceTimeout);
        }
        
        // Store the latest sync parameters
        this._pendingSync = { text, sourceWidget };
        
        // Debounce synchronization to avoid excessive updates while typing
        this._syncDebounceTimeout = setTimeout(() => {
            if (this._pendingSync) {
                this._performSync(this._pendingSync.text, this._pendingSync.sourceWidget);
            }
            this._syncDebounceTimeout = null;
            this._pendingSync = null;
        }, 50); // 50ms delay after user stops typing
    }

    /**
     * Perform the actual synchronization of tracking widget inputs
     */
    _performSync(text, sourceWidget) {
        if (!this.trackingWidgets) return;
        
        // Sync text to all other widgets except the source
        this.trackingWidgets.forEach(({ widget }) => {
            if (widget !== sourceWidget && widget.getTaskText() !== text) {
                widget.setTaskTextSilent(text);
            }
        });
        
        // Also sync with compact tracker if it's open
        if (this.compactTrackerWindow && this.compactTrackerWindow.setTaskTextSilent) {
            const compactText = this.compactTrackerWindow.getTaskText();
            if (compactText !== text) {
                this.compactTrackerWindow.setTaskTextSilent(text);
            }
        }
    }

    /**
     * Force immediate synchronization of all tracking widget inputs
     * (used when page changes to ensure all fields show the same data)
     */
    _forceSyncAllInputs() {
        if (!this.trackingWidgets || this.trackingWidgets.length === 0) return;
        
        // Cancel any pending debounced sync
        if (this._syncDebounceTimeout) {
            clearTimeout(this._syncDebounceTimeout);
            this._syncDebounceTimeout = null;
        }
        
        // Get text from the first widget (master widget)
        const masterWidget = this.trackingWidgets[0].widget;
        if (!masterWidget) return;
        
        const masterText = masterWidget.getTaskText();
        
        // Sync to all other widgets
        this.trackingWidgets.forEach(({ widget }, index) => {
            if (index > 0 && widget.getTaskText() !== masterText) {
                widget.setTaskTextSilent(masterText);
            }
        });
        
        // Also sync with compact tracker if it's open
        if (this.compactTrackerWindow && this.compactTrackerWindow.setTaskTextSilent) {
            const compactText = this.compactTrackerWindow.getTaskText();
            if (compactText !== masterText) {
                this.compactTrackerWindow.setTaskTextSilent(masterText);
            }
        }
    }

    /**
     * Update all project buttons when project selection changes
     */
    _updateProjectButtonsDisplay(projectName) {
        const project = this.allProjects?.find(p => p.name === projectName);
        if (!project) return;
        
        // Update all project buttons across all tracking widgets
        if (this.trackingWidgets && this.trackingWidgets.length > 0) {
            this.trackingWidgets.forEach(({ widget }) => {
                widget.updateProjectDisplay(project);
            });
        }
        
        // Synchronize compact tracker if it's open
        if (this.compactTrackerWindow) {
            this.compactTrackerWindow.syncWithMainWindow();
        } else {
            // Compact tracker not open, skipping sync
        }
        
        // Updated all project buttons
    }

    /**
     * Update all client buttons when client selection changes
     */
    _updateClientButtonsDisplay(clientName) {
        // Prevent infinite loops by checking if we're already updating
        if (this._isUpdatingClientButtons) {
            return;
        }
        
        this._isUpdatingClientButtons = true;
        
        const client = this.allClients?.find(c => c.name === clientName);
        if (!client || !this.trackingWidgets) {
            this._isUpdatingClientButtons = false;
            return;
        }
        
        // Update all client buttons across all tracking widgets
        this.trackingWidgets.forEach(({ widget }) => {
            widget.updateClientDisplay(client);
        });
        
        // Synchronize compact tracker if it's open
        if (this.compactTrackerWindow) {
            this.compactTrackerWindow.syncWithMainWindow();
        } else {
        }
        
        this._isUpdatingClientButtons = false;
    }

    _setupProjectClientButtons() {
        
        // Replace template project button with primitive Button component
        if (this._project_context_btn && this._tracking_widget) {
            this._replaceWithProjectButton();
        }
        
        // Replace template client button with primitive Button component
        if (this._client_context_btn && this._tracking_widget) {
            this._replaceWithClientButton();
        }
        
        // Update button visuals with current selections
        this._updateProjectClientButtons();
        
    }

    _replaceWithProjectButton() {
        const currentProject = this.allProjects.find(p => p.id === this.currentProjectId) || {
            id: 1,
            name: 'Default',
            color: '#cccccc',
            icon: 'folder-symbolic'
        };

        // Create enhanced project button using primitive Button
        this.projectButton = new Button({
            iconName: currentProject.icon || 'folder-symbolic',
            backgroundColor: currentProject.color,
            showColorPreview: true,
            cssClasses: ['flat'],
            tooltipText: `Project: ${currentProject.name}`,
            widthRequest: 36,
            heightRequest: 36,
            onClick: () => this._showProjectSelector()
        });

        // Apply stored icon color from database
        this._applyStoredIconColor(currentProject.icon_color || 'white');

        // Replace template button in correct position
        const parent = this._project_context_btn.get_parent();
        if (parent) {
            // Find client button to insert before it
            const clientBtn = this._client_context_btn;
            parent.remove(this._project_context_btn);
            parent.insert_child_after(this.projectButton.widget, this._task_name);
        }
    }

    _replaceWithClientButton() {
        // Create client dropdown with all clients
        this.clientDropdown = new ClientDropdown(
            this.allClients || [],
            this.currentClientId,
            (selectedClient) => {
                this.currentClientId = selectedClient.id;
                this._updateClientButtonsDisplay(selectedClient.name);
            }
        );
        
        // Replace template button in correct position  
        const parent = this._client_context_btn.get_parent();
        if (parent) {
            // Insert after project button, before time label
            parent.remove(this._client_context_btn);
            parent.insert_child_after(this.clientDropdown.getWidget(), this.projectButton.widget);
        }
    }

    _showProjectSelector(triggerButton = null) {
        if (!this.allProjects) {
            return;
        }

        try {
            // Reload projects to ensure we have the latest data
            this._loadProjects();
            const projects = this.allProjects;
            if (projects.length === 0) {
                this._showMessage('No projects available', 'Create a project first in the Projects page');
                return;
            }

            // Create a popover-based searchable dropdown
            const popover = new Gtk.Popover({
                width_request: 320,
                height_request: Math.min(380, projects.length * 56 + 80),
                has_arrow: true
            });

            const mainBox = new Gtk.Box({
                orientation: Gtk.Orientation.VERTICAL,
                spacing: 6,
                margin_top: 8,
                margin_bottom: 8,
                margin_start: 8,
                margin_end: 8
            });

            // Search entry
            const searchEntry = new Gtk.SearchEntry({
                placeholder_text: 'Search projects...',
                hexpand: true
            });

            // Disable right-click context menu on search entry
            const searchRightClickGesture = new Gtk.GestureClick({
                button: 3 // Right mouse button
            });
            searchRightClickGesture.connect('pressed', (gesture, n_press, x, y) => {
                return true; // Consume event to prevent context menu
            });
            searchEntry.add_controller(searchRightClickGesture);

            // Scrolled window for project list
            const scrolled = new Gtk.ScrolledWindow({
                hexpand: true,
                vexpand: true,
                height_request: Math.min(320, projects.length * 56)
            });

            // Project list
            const listBox = new Gtk.ListBox({
                css_classes: ['content-box'],
                selection_mode: Gtk.SelectionMode.NONE
            });

            // Disable right-click context menu on listbox
            const listRightClickGesture = new Gtk.GestureClick({
                button: 3 // Right mouse button
            });
            listRightClickGesture.connect('pressed', (gesture, n_press, x, y) => {
                return true; // Consume event to prevent context menu
            });
            listBox.add_controller(listRightClickGesture);

            // Store all project rows for filtering
            const projectRows = [];

            projects.forEach((project, index) => {
                const row = new Gtk.ListBoxRow({
                    height_request: 48
                });

                // Disable right-click context menu
                const rightClickGesture = new Gtk.GestureClick({
                    button: 3 // Right mouse button
                });
                rightClickGesture.connect('pressed', (gesture, n_press, x, y) => {
                    // Consume the right-click event to prevent context menu
                    return true;
                });
                row.add_controller(rightClickGesture);

                const rowBox = new Gtk.Box({
                    orientation: Gtk.Orientation.HORIZONTAL,
                    spacing: 10,
                    margin_top: 6,
                    margin_bottom: 6,
                    margin_start: 8,
                    margin_end: 8
                });

                // Project icon/emoji with color background
                let iconWidget;
                if (project.icon && project.icon.startsWith('emoji:')) {
                    const emoji = project.icon.substring(6);
                    iconWidget = new Gtk.Label({
                        label: emoji,
                        css_classes: ['emoji-icon'],
                        width_request: 22,
                        height_request: 23
                    });
                } else {
                    iconWidget = new Gtk.Image({
                        icon_name: project.icon || 'folder-symbolic',
                        width_request: 23,
                        height_request: 23,
                        pixel_size: 14,
                        halign: Gtk.Align.CENTER,
                        valign: Gtk.Align.CENTER
                    });
                }

                // Color background container
                const iconContainer = new Gtk.Box({
                    css_classes: ['project-icon-container'],
                    width_request: 28,
                    height_request: 28,
                    halign: Gtk.Align.CENTER,
                    valign: Gtk.Align.CENTER
                });

                // Apply project color styling (same as HeaderTrackingWidget)
                if (project.color) {
                    const iconColor = getProjectIconColor(project);
                    const provider = new Gtk.CssProvider();
                    provider.load_from_string(
                        `.project-icon-container {
                            background-color: ${project.color};
                            border-radius: 6px;
                            padding: 4px;
                            color: ${iconColor};
                        }
                        .project-icon-container image {
                            color: ${iconColor};
                        }
                        .emoji-icon {
                            font-size: 12px;
                            color: ${iconColor};
                        }`
                    );
                    iconContainer.get_style_context().add_provider(provider, Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION);
                }

                iconContainer.append(iconWidget);

                // Project name
                const nameLabel = new Gtk.Label({
                    label: project.name,
                    css_classes: ['body'],
                    hexpand: true,
                    halign: Gtk.Align.START,
                    ellipsize: 3 // PANGO_ELLIPSIZE_END
                });

                // Current project indicator
                if (project.id === this.currentProjectId) {
                    const checkIcon = new Gtk.Image({
                        icon_name: 'object-select-symbolic',
                        pixel_size: 14,
                        css_classes: ['success']
                    });
                    rowBox.append(iconContainer);
                    rowBox.append(nameLabel);
                    rowBox.append(checkIcon);
                    row.add_css_class('selected-project');
                } else {
                    rowBox.append(iconContainer);
                    rowBox.append(nameLabel);
                }

                row.set_child(rowBox);
                listBox.append(row);
                
                // Store for filtering
                projectRows.push({
                    row: row,
                    project: project,
                    name: project.name.toLowerCase()
                });
            });

            // Search functionality
            searchEntry.connect('search-changed', () => {
                const searchText = searchEntry.get_text().toLowerCase();
                projectRows.forEach(({ row, name }) => {
                    row.set_visible(name.includes(searchText));
                });
            });

            // Handle selection
            listBox.connect('row-activated', (listBox, row) => {
                const rowIndex = Array.from(listBox).indexOf(row);
                const selectedProjectData = projectRows.find(({ row: r }) => r === row);
                
                if (selectedProjectData) {
                    const selectedProject = selectedProjectData.project;
                    this.currentProjectId = selectedProject.id;
                    this._updateProjectClientButtons();
                    this._updateProjectButtonsDisplay(selectedProject.name);
                    
                    // Update compact tracker if it's open
                    if (this.compactTrackerWindow && this.compactTrackerWindow.is_visible()) {
                        this.compactTrackerWindow._updateProjectButton();
                    }
                    
                    // Selected project with color
                }
                
                popover.popdown();
            });

            scrolled.set_child(listBox);
            mainBox.append(searchEntry);
            mainBox.append(scrolled);
            popover.set_child(mainBox);

            // Position popover relative to the button that triggered it
            if (triggerButton) {
                popover.set_parent(triggerButton);
                popover.popup();
            } else {
                // Fallback to dialog-style if no trigger button
                const dialog = new Adw.AlertDialog({
                    heading: 'Select Project',
                    body: 'Choose a project for time tracking'
                });
                dialog.set_extra_child(mainBox);
                dialog.add_response('cancel', 'Cancel');
                dialog.present(this);
            }

        } catch (error) {
            // Error showing project selector
        }
    }

    _showClientSelector() {
        if (!this.allClients) {
            return;
        }

        try {
            const clients = this.allClients;
            if (clients.length === 0) {
                this._showMessage('No clients available', 'Create a client first in the Clients page');
                return;
            }

            const dialog = new Adw.AlertDialog({
                heading: 'Select Client',
                body: 'Choose a client for time tracking'
            });

            const listBox = new Gtk.ListBox({
                css_classes: ['boxed-list'],
                selection_mode: Gtk.SelectionMode.SINGLE
            });

            clients.forEach(client => {
                const row = new Adw.ActionRow({
                    title: client.name,
                    subtitle: client.email ? `${client.email} • ${client.currency || 'USD'} ${client.rate || 0}/hour` : `${client.currency || 'USD'} ${client.rate || 0}/hour`
                });

                listBox.append(row);
            });

            dialog.set_extra_child(listBox);
            dialog.add_response('cancel', 'Cancel');
            dialog.add_response('select', 'Select');
            dialog.set_response_appearance('select', Adw.ResponseAppearance.SUGGESTED);

            dialog.connect('response', (dialog, response) => {
                if (response === 'select') {
                    const selectedRow = listBox.get_selected_row();
                    if (selectedRow) {
                        const selectedIndex = selectedRow.get_index();
                        const selectedClient = clients[selectedIndex];
                        this.currentClientId = selectedClient.id;
                        this._updateProjectClientButtons();
                        this._updateClientButtonsDisplay(selectedClient.name);
                    }
                }
                dialog.close();
            });

            dialog.present(this);

        } catch (error) {
            // Error showing client selector
        }
    }

    _updateProjectClientButtons() {
        // Update project button using primitive Button methods
        if (this.projectButton) {
            const currentProject = this.allProjects.find(p => p.id === this.currentProjectId);
            if (currentProject) {
                this.projectButton.setTooltip(`Project: ${currentProject.name}`);
                this.projectButton.setBackgroundColor(currentProject.color);
                this.projectButton.setIcon(currentProject.icon || 'folder-symbolic');
                this._applyStoredIconColor(currentProject.icon_color || 'white');
            } else {
                this.projectButton.setTooltip('Select Project');
                this.projectButton.setBackgroundColor('#cccccc');
                this.projectButton.setIcon('folder-symbolic');
                this._applyStoredIconColor('black'); // Default icon color for gray background
            }
        }

        // Update client dropdown with latest data - use quiet update to prevent loops
        if (this.clientDropdown) {
            this.clientDropdown.updateClientsQuietly(this.allClients || [], this.currentClientId);
        }
    }

    _applyStoredIconColor(iconColor) {
        if (!this.projectButton || !iconColor) return;

        // Apply the same CSS structure as Projects page for consistency
        const css = `button { color: ${iconColor}; }`;
        const provider = new Gtk.CssProvider();
        provider.load_from_string(css);
        this.projectButton.widget.get_style_context().add_provider(provider, Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION);
    }

    _showMessage(title, message) {
        const dialog = new Adw.AlertDialog({
            heading: title,
            body: message
        });
        dialog.add_response('ok', 'OK');
        dialog.present(this);
    }

    /**
     * Helper method to integrate TrackingWidget with existing UI elements
     */
    _createTrackingWidgetForExistingElements(trackButton, taskEntry, timeLabel, page) {
        // Use the existing timeTrack function directly with existing UI elements
        // The TrackingWidget is available for new implementations
        GlobalTracking.registerTrackingComponent(null, {
            button: trackButton,
            input: taskEntry,
            timeLabel: timeLabel,
            parentWindow: this
        });
        
        return {
            trackButton,
            taskEntry,
            timeLabel,
            page
        };
    }

    /**
     * Setup main template tracking buttons (from UI template)
     */
    _setupMainTrackingButtons() {
        // Main Tasks page button
        if (this._track_button && this._task_name && this._actual_time) {
            // Initializing main track button
            GlobalTracking.registerTrackingComponent(null, {
                button: this._track_button,
                input: this._task_name,
                timeLabel: this._actual_time,
                parentWindow: this
            });
        }
        
        // Other page buttons
        const pageButtons = [
            { button: this._track_button_projects, input: this._task_name_projects, label: this._actual_time_projects, page: 'projects' },
            { button: this._track_button_clients, input: this._task_name_clients, label: this._actual_time_clients, page: 'clients' },
            { button: this._track_button_reports, input: this._task_name_reports, label: this._actual_time_reports, page: 'reports' }
        ];
        
        pageButtons.forEach(({ button, input, label, page }) => {
            if (button && input && label) {
                // Initializing tracking button for page
                GlobalTracking.registerTrackingComponent(null, {
                    button: button,
                    input: input,
                    timeLabel: label,
                    parentWindow: this
                });
            }
        });
        
        // Main tracking buttons initialized
    }

    _connectPageComponents() {
        // Tasks page uses the existing template UI, so just connect the functionality
        // The TasksPage component connects to existing UI elements via _connectToExistingUI()
        
        
        // Setup Reports page chart filters
        this._setupReportsChartFilters();
        
        // Setup Reports page delete button
        this._setupReportsDeleteButton();
        
        // For other pages, we can connect them to work with the existing template
        // or replace their content if needed
    }

    _setupNavigation() {
        // Setup sidebar navigation using original working method
        if (!this._sidebar_list) {
            //('❌ sidebar_list is null - UI template may not be fully loaded');
            return;
        }
        
        this._sidebar_list.connect('row-activated', (list, row) => {
            const index = row.get_index();
            
            // Clear selections when navigating away from Projects and Clients pages
            this._clearPageSelections(index);
            
            // Force synchronization of all task name inputs when page changes
            this._forceSyncAllInputs();
            
            switch (index) {
                case 0: 
                    this._showPage('tasks'); 
                    if (this.tasksPageComponent) {
                        this.tasksPageComponent.refresh().catch(error => {
                            //('Failed to refresh tasks page:', error);
                        });
                        this.updateWeeklyStats();
                    }
                    break;
                case 1: 
                    this._showPage('projects'); 
                    if (this.projectsPageComponent) {
                        this.projectsPageComponent.refresh().catch(error => {
                            //('Failed to refresh projects page:', error);
                        });
                    }
                    break;
                case 2: 
                    this._showPage('clients'); 
                    if (this.clientsPageComponent) {
                        this.clientsPageComponent.refresh().catch(error => {
                            //('Failed to refresh clients page:', error);
                        });
                    }
                    break;
                case 3: 
                    this._showPage('reports'); 
                    if (this.reportsPageComponent) {
                        this.reportsPageComponent.refresh().catch(error => {
                            //('Failed to refresh reports page:', error);
                        });
                    }
                    // Update chart and statistics when Reports page is shown
                    this._refreshReportsChartFilters();
                    this._updateChart();
                    this._updateReportsStatistics();
                    this._updateRecentTasksList();
                    break;
            }
        });

        // Menu button
        this._menu_button.connect('clicked', () => {
            showAboutDialog(this);
        });

        // Sidebar toggle
        this._sidebar_toggle_btn.connect('toggled', () => {
            const isOpen = this._sidebar_toggle_btn.get_active();
            this._split_view.set_show_sidebar(isOpen);
        });

        // Setup responsive sidebar behavior
        this._setupResponsiveSidebar();

    }

    _setupCompactTrackerButton() {
        // Connect compact tracker buttons for all pages with shift-click detection
        const buttons = [
            this._compact_tracker_btn,
            this._compact_tracker_btn_projects, 
            this._compact_tracker_btn_clients,
            this._compact_tracker_btn_reports
        ];

        buttons.forEach(button => {
            if (button) {
                // Add gesture controller to handle all clicks
                const controller = new Gtk.GestureClick();
                controller.connect('pressed', (gesture, n_press, x, y) => {
                    const event = gesture.get_current_event();
                    if (event) {
                        const modifiers = event.get_modifier_state();
                        const shiftPressed = (modifiers & Gdk.ModifierType.SHIFT_MASK) !== 0;
                        
                        // Claim the event to prevent normal button click
                        gesture.set_state(Gtk.EventSequenceState.CLAIMED);
                        
                        // Call with appropriate shift state
                        this._launchCompactTrackerDebug(shiftPressed);
                    } else {
                        // Fallback for normal click if no event
                        gesture.set_state(Gtk.EventSequenceState.CLAIMED);
                        this._launchCompactTrackerDebug(false);
                    }
                });
                button.add_controller(controller);
            }
        });
    }

    /**
     * Clear selections when navigating away from Projects and Clients pages
     */
    _clearPageSelections(targetPageIndex) {
        // Clear projects selection when leaving projects page (index 1)
        if (this.currentPageIndex === 1 && targetPageIndex !== 1) {
            if (this.projectsPageComponent && typeof this.projectsPageComponent._clearSelection === 'function') {
                this.projectsPageComponent._clearSelection();
            }
        }
        
        // Clear clients selection when leaving clients page (index 2)
        if (this.currentPageIndex === 2 && targetPageIndex !== 2) {
            if (this.clientsPageComponent && typeof this.clientsPageComponent._clearSelection === 'function') {
                this.clientsPageComponent._clearSelection();
            }
        }
        
        // Update current page tracking
        this.currentPageIndex = targetPageIndex;
    }

    _setupWindowVisibilityTracking() {
        this.connect('notify::minimized', () => {
            if (this.minimized) {
                this._showCompactTrackerOnHide();
            }
        });
    }

    _setupKeyboardShortcuts() {
        // Global keyboard shortcuts for navigation and actions
        const keyController = new Gtk.EventControllerKey();
        keyController.connect('key-pressed', (controller, keyval, keycode, state) => {
            // Ctrl+1-4 for page navigation (Delete key handled by application-level handler)
            if (state & Gdk.ModifierType.CONTROL_MASK) {
                switch (keyval) {
                    case 49: // Ctrl+1 - Tasks
                        this._clearPageSelections(0);
                        this._forceSyncAllInputs();
                        this._showPage('tasks');
                        if (this.tasksPageComponent) {
                            this.tasksPageComponent.refresh().catch(error => {
                                //('Failed to refresh tasks page:', error);
                            });
                            this.updateWeeklyStats();
                        }
                        return true;
                    case 50: // Ctrl+2 - Projects
                        this._clearPageSelections(1);
                        this._forceSyncAllInputs();
                        this._showPage('projects');
                        if (this.projectsPageComponent) {
                            this.projectsPageComponent.refresh().catch(error => {
                                //('Failed to refresh projects page:', error);
                            });
                        }
                        return true;
                    case 51: // Ctrl+3 - Clients
                        this._clearPageSelections(2);
                        this._forceSyncAllInputs();
                        this._showPage('clients');
                        if (this.clientsPageComponent) {
                            this.clientsPageComponent.refresh().catch(error => {
                                //('Failed to refresh clients page:', error);
                            });
                        }
                        return true;
                    case 52: // Ctrl+4 - Reports
                        this._clearPageSelections(3);
                        this._forceSyncAllInputs();
                        this._showPage('reports');
                        if (this.reportsPageComponent) {
                            this.reportsPageComponent.refresh().catch(error => {
                                //('Failed to refresh reports page:', error);
                            });
                        }
                        this._updateReportsStatistics();
                        this._updateRecentTasksList();
                        return true;
                }
            }
            return false;
        });
        
        this.add_controller(keyController);
    }

    _testDeleteKeyFunction() {
        
        // Try to show a simple alert if possible
        try {
            const dialog = new Adw.AlertDialog({
                heading: 'Delete Key Test',
                body: 'Delete key is working! Check console for details.'
            });
            dialog.add_response('ok', 'OK');
            dialog.present(this);
        } catch (error) {
        }
    }

    _showPage(pageName) {
        const pages = {
            'tasks': this._tasks_page,
            'projects': this._projects_page,
            'clients': this._clients_page,
            'reports': this._reports_page
        };
        
        // Reports page uses static UI with connected functionality
        // Showing page

        if (pages[pageName]) {
            try {
                // Use your original replace method for instant navigation
                this._main_content.replace([pages[pageName]]);
            } catch (error) {
                // Fallback: try to add page to stack first
                try {
                    this._main_content.add(pages[pageName]);
                    this._main_content.set_visible_page(pages[pageName]);
                } catch (fallbackError) {
                    //(`Fallback navigation failed for ${pageName}:`, fallbackError);
                }
            }
        }
    }

    _showDefaultPage() {
        // Show Tasks page by default and load initial data
        this._showPage('tasks');
        
        // Select first sidebar item (Tasks)
        if (this._sidebar_list) {
            const firstRow = this._sidebar_list.get_row_at_index(0);
            if (firstRow) {
                this._sidebar_list.select_row(firstRow);
            }
        }
        
        // Load tasks data
        if (this.tasksPageComponent) {
            this.tasksPageComponent.refresh().catch(error => {
                //('Failed to load initial tasks data:', error);
            });
            this.updateWeeklyStats();
        }
        
    }

    _showCompactTrackerOnHide() {
        // Enforce single instance: close existing compact tracker if it exists
        if (this.compactTrackerWindow) {
            this.compactTrackerWindow.close();
            this.compactTrackerWindow = null;
        }
        
        // Create new compact tracker window
        this.compactTrackerWindow = new CompactTrackerWindow(this.application, this);
        
        // Handle window destruction properly
        this.compactTrackerWindow.connect('destroy', () => {
            this.compactTrackerWindow = null;
        });
        
        this.compactTrackerWindow.syncWithMainWindow();
        this.compactTrackerWindow.present();
    }

    _launchCompactTrackerDebug(shiftPressed = false) {
        if (!this.compactTrackerWindow) {
            // Enforce single instance: close existing compact tracker if it exists
            this.compactTrackerWindow = new CompactTrackerWindow(this.application, this);
            
            // Set shift mode on compact tracker
            this.compactTrackerWindow.setShiftMode(shiftPressed);
            
            // Handle window destruction properly
            this.compactTrackerWindow.connect('destroy', () => {
                this.compactTrackerWindow = null;
            });
            
            this.compactTrackerWindow.syncWithMainWindow();
            this.compactTrackerWindow.present();
            
            // Hide main window only if shift not pressed
            if (!shiftPressed) {
                this.set_visible(false);
            }
        } else {
            if (this.compactTrackerWindow.is_visible()) {
                this.compactTrackerWindow.set_visible(false);
                // When hiding, show main window if it was hidden in normal mode
                if (!this.compactTrackerWindow.shiftMode && !this.is_visible()) {
                    this.set_visible(true);
                    this.present();
                }
            } else {
                // Update shift mode
                this.compactTrackerWindow.setShiftMode(shiftPressed);
                this.compactTrackerWindow.syncWithMainWindow();
                this.compactTrackerWindow.present();
                
                // Hide main window only if shift not pressed
                if (!shiftPressed) {
                    this.set_visible(false);
                }
            }
        }
    }

    /**
     * Get the current active page component
     */
    getCurrentPage() {
        const visiblePage = this._main_content.get_visible_page();
        if (!visiblePage) return null;

        const tag = visiblePage.get_tag();
        return this.pageComponents[tag] || null;
    }

    /**
     * Navigate to specific page
     */
    navigateToPage(pageTag) {
        this._showPage(pageTag);
        
        // Refresh the page component if it exists
        const pageComponent = this.pageComponents[pageTag];
        if (pageComponent && typeof pageComponent.refresh === 'function') {
            pageComponent.refresh().catch(error => {
                //(`Failed to refresh ${pageTag} page:`, error);
            });
        }
    }

    /**
     * Access to database connection for page components
     */
    getDatabaseConnection() {
        return this.dbConnection;
    }

    /**
     * Access to managers for page components
     */
    getManagers() {
        return {
            projectManager: this.projectManager,
            clientManager: this.clientManager,
            modularDialogManager: this.modularDialogManager,
            timeUtils: this.timeUtils,
            simpleChart: this.simpleChart,
            reportExporter: this.reportExporter
        };
    }

    /**
     * Get selected context for time tracking
     * Returns current project, client, and currency information
     */
    getSelectedContext() {
        const currentProject = this.allProjects.find(p => p.id === this.currentProjectId) || {
            id: 1,
            name: 'Default',
            color: '#cccccc'
        };
        
        const currentClient = this.allClients.find(c => c.id === this.currentClientId) || {
            id: 1,
            name: 'Default Client',
            currency: 'USD',
            rate: 0
        };

        return {
            project: {
                id: currentProject.id,
                name: currentProject.name,
                color: currentProject.color
            },
            client: {
                id: currentClient.id,
                name: currentClient.name,
                rate: currentClient.rate || 0
            },
            currency: {
                code: currentClient.currency || 'USD',
                symbol: getCurrencySymbol(currentClient.currency || 'USD')
            }
        };
    }

    /**
     * Refresh all project-related UI elements (header buttons, lists, etc.)
     */
    refreshAllProjectElements() {
        this._loadProjects();
        // Refresh projects page if it exists (without triggering another refresh cycle)
        if (this.pageComponents && this.pageComponents.projects) {
            this.pageComponents.projects.loadProjects();
        }
    }

    /**
     * Load projects from database to populate allProjects array
     */
    _loadProjects() {
        if (!this.projectManager || !this.projectManager.dbConnection) {
            //('ProjectManager or database connection not available to load projects');
            return;
        }

        try {
            const sql = `SELECT id, name, color, total_time, icon, dark_icons, icon_color_mode, icon_color FROM Project ORDER BY id`;
            const result = this.projectManager.dbConnection.execute_select_command(sql);
            const projects = [];

            if (result && result.get_n_rows() > 0) {
                for (let i = 0; i < result.get_n_rows(); i++) {
                    const project = {
                        id: result.get_value_at(0, i),
                        name: result.get_value_at(1, i),
                        color: result.get_value_at(2, i) || '#cccccc',
                        totalTime: result.get_value_at(3, i) || 0,
                        icon: result.get_value_at(4, i) || 'folder-symbolic',
                        dark_icons: result.get_value_at(5, i) || 0,
                        icon_color_mode: result.get_value_at(6, i) || 'auto',
                        icon_color: result.get_value_at(7, i) || 'white'
                    };
                    projects.push(project);
                }
            }

            this.allProjects = projects;
            
            
            // Set default current project if not set
            if (this.allProjects.length > 0 && (!this.currentProjectId || this.currentProjectId === 1)) {
                this.currentProjectId = this.allProjects[0].id;
                this._updateProjectButtonsDisplay(this.allProjects[0].name);
                // Default project set
            } else if (this.allProjects.length > 0 && this.currentProjectId) {
                // Update header buttons for currently selected project after reload
                const currentProject = this.allProjects.find(p => p.id === this.currentProjectId);
                if (currentProject) {
                    this._updateProjectButtonsDisplay(currentProject.name);
                    // Updated header buttons for current project
                }
            }
            
        } catch (error) {
            //('❌ Failed to load projects:', error);
            this.allProjects = [];
        }
    }

    /**
     * Load clients from database to populate allClients array
     */
    _loadClients() {
        if (!this.clientManager || !this.clientManager.dbConnection) {
            //('ClientManager or database connection not available to load clients');
            return;
        }

        try {
            // First ensure the currency column exists
            if (this.clientManager.ensureCurrencyColumn) {
                this.clientManager.ensureCurrencyColumn();
            }

            // Try to select with currency column, fallback if it doesn't exist
            let sql = `SELECT id, name, email, rate, currency FROM Client ORDER BY name`;
            let result;
            
            try {
                result = this.clientManager.dbConnection.execute_select_command(sql);
            } catch (currencyColumnError) {
                sql = `SELECT id, name, email, rate FROM Client ORDER BY name`;
                result = this.clientManager.dbConnection.execute_select_command(sql);
            }

            const clients = [];
            if (result && result.get_n_rows() > 0) {
                for (let i = 0; i < result.get_n_rows(); i++) {
                    const client = {
                        id: result.get_value_at(0, i),
                        name: result.get_value_at(1, i),
                        email: result.get_value_at(2, i),
                        rate: result.get_value_at(3, i) || 0,
                        currency: result.get_n_columns() > 4 ? result.get_value_at(4, i) || 'USD' : 'USD'
                    };
                    clients.push(client);
                }
            }

            this.allClients = clients;
            
            
            // Set default current client if not set
            if (this.allClients.length > 0 && (!this.currentClientId || this.currentClientId === 1)) {
                this.currentClientId = this.allClients[0].id;
                this._updateClientButtonsDisplay(this.allClients[0].name);
                // Default client set
            }
            
        } catch (error) {
            //('❌ Failed to load clients:', error);
            this.allClients = [];
        }
    }

    /**
     * Update weekly statistics in sidebar
     */
    async updateWeeklyStats() {
        if (!this.dbConnection || !this._weekly_time_row) {
            return;
        }

        try {
            // Get current week date range
            const now = new Date();
            const startOfWeek = new Date(now);
            startOfWeek.setDate(now.getDate() - now.getDay()); // Sunday as start of week
            startOfWeek.setHours(0, 0, 0, 0);
            
            const endOfWeek = new Date(startOfWeek);
            endOfWeek.setDate(startOfWeek.getDate() + 6);
            endOfWeek.setHours(23, 59, 59, 999);

            const startDateStr = startOfWeek.toISOString().split('T')[0];
            const endDateStr = endOfWeek.toISOString().split('T')[0];

            // Query tasks for current week
            const sql = `
                SELECT COUNT(*) as task_count, SUM(time_spent) as total_time
                FROM Task 
                WHERE DATE(created_at) >= '${startDateStr}' 
                AND DATE(created_at) <= '${endDateStr}'
            `;

            const result = this.dbConnection.execute_select_command(sql);
            let taskCount = 0;
            let totalSeconds = 0;

            if (result && result.get_n_rows() > 0) {
                taskCount = result.get_value_at(0, 0) || 0;
                totalSeconds = result.get_value_at(1, 0) || 0;
            }

            // Format time as HH:MM:SS
            const hours = Math.floor(totalSeconds / 3600);
            const minutes = Math.floor((totalSeconds % 3600) / 60);
            const seconds = totalSeconds % 60;
            const timeStr = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;

            // Update the UI
            const subtitle = `${timeStr} • ${taskCount} tasks`;
            this._weekly_time_row.set_subtitle(subtitle);

        } catch (error) {
            //('❌ Failed to update weekly stats:', error);
            this._weekly_time_row.set_subtitle('Error loading stats');
        }
    }

    /**
     * Update weekly time in real-time during tracking
     */
    _updateWeeklyTimeRealTime(additionalTime = 0) {
        if (!this._weekly_time_row) {
            return;
        }

        // Use the existing updateWeeklyStats method as base and add real-time time
        this.updateWeeklyStats().then(() => {
            // Get current subtitle and add additional time if needed
            if (additionalTime > 0) {
                try {
                    const currentSubtitle = this._weekly_time_row.get_subtitle();
                    const timeMatch = currentSubtitle.match(/(\d{2}):(\d{2}):(\d{2})/);
                    
                    if (timeMatch) {
                        const currentHours = parseInt(timeMatch[1]);
                        const currentMinutes = parseInt(timeMatch[2]);
                        const currentSeconds = parseInt(timeMatch[3]);
                        const currentTotalSeconds = currentHours * 3600 + currentMinutes * 60 + currentSeconds;
                        
                        const newTotalSeconds = currentTotalSeconds + additionalTime;
                        const hours = Math.floor(newTotalSeconds / 3600);
                        const minutes = Math.floor((newTotalSeconds % 3600) / 60);
                        const seconds = newTotalSeconds % 60;
                        const timeStr = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
                        
                        const taskCountMatch = currentSubtitle.match(/(\d+) tasks?/);
                        const taskCount = taskCountMatch ? taskCountMatch[1] : '0';
                        
                        this._weekly_time_row.set_subtitle(`${timeStr} • ${taskCount} tasks`);
                    }
                } catch (error) {
                    //('❌ Failed to update real-time weekly stats:', error);
                }
            }
        }).catch(error => {
            //('❌ Failed to update weekly stats for real-time update:', error);
        });
    }

    /**
     * Setup tracking event subscriptions
     */
    _setupTrackingSubscriptions() {
        if (!this.trackingStateManager) {
            return;
        }

        // Subscribe to tracking events
        this.trackingStateManager.subscribe((event, taskInfo) => {
            try {
                switch (event) {
                    case 'stop':
                        // Update weekly stats
                        this.updateWeeklyStats();
                        // Update project stats
                        this._updateProjectStats();
                        // Update task list
                        this._updateTaskStats();
                        break;
                    case 'start':
                        break;
                    case 'updateTaskList':
                        // Update stats when task list changes
                        this.updateWeeklyStats();
                        break;
                }
            } catch (error) {
                //('❌ Error handling tracking event:', error);
            }
        });
    }

    /**
     * Update project statistics (refresh projects page if visible)
     */
    _updateProjectStats() {
        if (this.projectsPageComponent && typeof this.projectsPageComponent.loadProjects === 'function') {
            this.projectsPageComponent.loadProjects().catch(error => {
                //('❌ Failed to refresh project stats:', error);
            });
        }
    }

    /**
     * Update task statistics (refresh tasks page if visible)
     */
    _updateTaskStats() {
        if (this.tasksPageComponent && typeof this.tasksPageComponent.refresh === 'function') {
            this.tasksPageComponent.refresh().catch(error => {
                //('❌ Failed to refresh task stats:', error);
            });
        }
    }

    /**
     * Setup responsive sidebar behavior for small screens
     */
    _setupResponsiveSidebar() {
        // Connect all page-specific sidebar buttons
        const sidebarButtons = [
            this._show_sidebar_btn,     // Tasks page
            this._show_sidebar_btn2,    // Projects page  
            this._show_sidebar_btn3,    // Clients page
            this._show_sidebar_btn5     // Reports page
        ];

        sidebarButtons.forEach(button => {
            if (button) {
                button.connect('clicked', () => {
                    this._split_view.set_show_sidebar(true);
                });
            }
        });

        // Function to update page button visibility based on sidebar state
        const updatePageButtonVisibility = () => {
            const isCollapsed = this._split_view.get_collapsed();
            const isVisible = this._split_view.get_show_sidebar();
            
            // Show page buttons when sidebar is hidden (either collapsed OR manually hidden)
            const shouldShowButtons = isCollapsed || !isVisible;
            
            sidebarButtons.forEach(button => {
                if (button) {
                    button.set_visible(shouldShowButtons);
                }
            });

            // Sidebar state updated
        };

        // Monitor split view collapsed state (responsive behavior)
        this._split_view.connect('notify::collapsed', updatePageButtonVisibility);

        // Monitor sidebar visibility changes (manual toggle)
        this._split_view.connect('notify::show-sidebar', () => {
            const isVisible = this._split_view.get_show_sidebar();
            this._sidebar_toggle_btn.set_active(isVisible);
            updatePageButtonVisibility();
        });

        // Initial state check
        updatePageButtonVisibility();
    }
    
    /**
     * Setup chart filters for Reports page (like v0.2.5)
     */
    _setupReportsChartFilters() {
        if (!this._period_filter || !this._project_filter || !this._client_filter) {
            return;
        }

        // Create and setup Date Range Selector
        this._setupDateRangeSelector();
        
        // Setup period filter
        this._period_filter.connect('notify::selected', () => {
            const selectedPeriod = this._period_filter.get_selected();
            const periods = ['week', 'month', 'year', 'custom'];
            
            if (this.simpleChart && periods[selectedPeriod]) {
                if (periods[selectedPeriod] === 'custom') {
                    // Show/enable the date range selector
                    if (this.dateRangeSelector) {
                        this.dateRangeSelector.getWidget().set_visible(true);
                        // If custom range is already set, keep it; otherwise use current week
                        if (!this.simpleChart.customDateRange) {
                            const currentRange = this.dateRangeSelector.getDateRange();
                            this.simpleChart.setCustomDateRange(currentRange.fromDate, currentRange.toDate);
                        }
                    }
                } else {
                    // Hide the date range selector for predefined periods
                    if (this.dateRangeSelector) {
                        this.dateRangeSelector.getWidget().set_visible(false);
                    }
                    this.simpleChart.clearCustomDateRange();
                    this.simpleChart.setPeriod(periods[selectedPeriod]);
                }
                
                this._updateChart();
                this._updateReportsStatistics(); // Update statistics when period changes
                this._updateRecentTasksList(); // Update recent tasks when period changes
            }
        });

        // Setup project filter - populate with projects
        this._refreshReportsChartFilters();

        this._project_filter.connect('notify::selected', () => {
            const selectedProject = this._project_filter.get_selected();
            const projectId = selectedProject === 0 ? null : this.allProjects[selectedProject - 1]?.id;
            if (this.simpleChart) {
                this.simpleChart.setProjectFilter(projectId);
                this._updateChart();
                this._updateReportsStatistics(); // Update statistics when project changes
                this._updateRecentTasksList(); // Update recent tasks when project changes
            }
        });

        this._client_filter.connect('notify::selected', () => {
            const selectedClient = this._client_filter.get_selected();
            const clientId = selectedClient === 0 ? null : this.allClients[selectedClient - 1]?.id;
            if (this.simpleChart) {
                this.simpleChart.setClientFilter(clientId);
                this._updateChart();
                this._updateReportsStatistics(); // Update statistics when client changes
                this._updateRecentTasksList(); // Update recent tasks when client changes
            }
        });
        
        // Reports chart filters setup completed
    }

    /**
     * Setup Date Range Selector for custom date filtering
     */
    _setupDateRangeSelector() {
        if (!this._chart_placeholder) {
            return;
        }

        // Create date range selector
        this.dateRangeSelector = new DateRangeSelector({
            showTimeControls: false,
            showQuickFilters: false, // Disabled to avoid duplication with existing filters
            onDateRangeChanged: (dateRange) => {
                // When custom date range is selected, update chart
                if (this.simpleChart) {
                    this.simpleChart.setCustomDateRange(dateRange.fromDate, dateRange.toDate);
                    this._updateChart();
                    this._updateReportsStatistics();
                    this._updateRecentTasksList();
                }
            }
        });

        // Insert the date range selector above the chart
        const parentBox = this._chart_placeholder.get_parent();
        if (parentBox && parentBox instanceof Gtk.Box) {
            // Get the chart placeholder index
            let chartIndex = 0;
            let child = parentBox.get_first_child();
            while (child && child !== this._chart_placeholder) {
                chartIndex++;
                child = child.get_next_sibling();
            }

            // Insert date range selector before chart (no separator needed)
            parentBox.insert_child_after(this.dateRangeSelector.getWidget(), 
                chartIndex > 0 ? parentBox.get_first_child() : null);
        }

        // Add a "Custom Range" option to the period filter if it doesn't exist
        if (this._period_filter && this._period_filter.get_model()) {
            const model = this._period_filter.get_model();
            if (model instanceof Gtk.StringList && model.get_n_items() === 3) {
                model.append('Custom Range');
            }
        }

        // Initially hide the date range selector (shown only when "Custom Range" is selected)
        this.dateRangeSelector.getWidget().set_visible(false);
    }

    /**
     * Setup Reports page delete button functionality
     */
    _setupReportsDeleteButton() {
        if (!this._reports_delete_selected_btn) {
            return;
        }

        this._reports_delete_selected_btn.connect('clicked', () => {
            this._deleteSelectedReportsTasks();
        });
        
        // Reports delete button setup completed
    }

    /**
     * Delete selected tasks from Reports page
     */
    _deleteSelectedReportsTasks() {
        if (this.reportsSelectedTasks.size === 0 && this.reportsSelectedStacks.size === 0) {
            return;
        }

        // Show confirmation dialog
        const dialog = new Adw.AlertDialog({
            heading: 'Delete Selected Tasks',
            body: `Are you sure you want to delete ${this.reportsSelectedTasks.size} selected tasks? This action cannot be undone.`
        });

        dialog.add_response('cancel', 'Cancel');
        dialog.add_response('delete', 'Delete');
        dialog.set_response_appearance('delete', Adw.ResponseAppearance.DESTRUCTIVE);
        
        dialog.connect('response', (dialog, response) => {
            if (response === 'delete') {
                this._performReportsTaskDeletion();
            }
        });

        dialog.present(this);
    }

    /**
     * Perform actual task deletion from Reports page selection
     */
    _performReportsTaskDeletion() {
        if (!this.dbConnection || !this.taskManager) {
            //('Database connection or TaskManager not available');
            return;
        }

        try {
            // Collect all task IDs to delete (from individual tasks and stacks)
            const taskIdsToDelete = new Set([...this.reportsSelectedTasks]);
            
            // Add tasks from selected stacks
            for (const stackKey of this.reportsSelectedStacks) {
                const stackTasks = this.allTasks.filter(task => {
                    const taskBaseName = task.name.match(/^(.+?)\s*(?:\(\d+\))?$/);
                    const baseName = taskBaseName ? taskBaseName[1].trim() : task.name;
                    const taskGroupKey = `${baseName}::${task.project_name || 'Unknown'}::${task.client_name || 'Default'}`;
                    return taskGroupKey === stackKey;
                });
                
                stackTasks.forEach(task => taskIdsToDelete.add(task.id));
            }


            // Delete each task
            for (const taskId of taskIdsToDelete) {
                const sql = `DELETE FROM Task WHERE id = ${taskId}`;
                this.dbConnection.execute_non_select_command(sql);
            }

            // Clear selections
            this.reportsSelectedTasks.clear();
            this.reportsSelectedStacks.clear();
            this._updateReportsDeleteButton();

            // Refresh data
            this._loadTasks();
            this._updateRecentTasksList();
            this._updateReportsStatistics();
            this._updateChart();


        } catch (error) {
            //('❌ Failed to delete tasks:', error);
        }
    }

    /**
     * Update Reports delete button visibility and state
     */
    _updateReportsDeleteButton() {
        if (!this._reports_delete_selected_btn) return;

        const hasSelection = this.reportsSelectedTasks.size > 0 || this.reportsSelectedStacks.size > 0;
        this._reports_delete_selected_btn.set_visible(hasSelection);
        this._reports_delete_selected_btn.set_sensitive(hasSelection);

        if (hasSelection) {
            const totalCount = this.reportsSelectedTasks.size + this.reportsSelectedStacks.size;
            this._reports_delete_selected_btn.set_tooltip_text(`Delete ${totalCount} selected items`);
        }
    }
    
    /**
     * Update chart filter dropdowns with current data
     */
    _refreshReportsChartFilters() {
        if (!this._project_filter || !this._client_filter) return;

        // Update project filter dropdown
        const projectStringList = new Gtk.StringList();
        projectStringList.append(_('All Projects'));
        if (this.allProjects) {
            this.allProjects.forEach(project => {
                projectStringList.append(project.name);
            });
        }
        this._project_filter.set_model(projectStringList);
        this._project_filter.set_selected(0);

        // Update client filter dropdown
        const clientStringList = new Gtk.StringList();
        clientStringList.append(_('All Clients'));
        if (this.allClients) {
            this.allClients.forEach(client => {
                clientStringList.append(client.name);
            });
        }
        this._client_filter.set_model(clientStringList);
        this._client_filter.set_selected(0);
    }
    
    /**
     * Update the Reports page chart
     */
    _updateChart() {
        if (this.simpleChart) {
            this.simpleChart.createChart(this.allTasks, this.allProjects, this.allClients);
            // Chart updated in Reports page
        }
    }
    
    /**
     * Update Reports page statistics based on current filters
     */
    _updateReportsStatistics() {
        if (!this.allTasks || !this._reports_total_time_value) {
            return;
        }
        
        try {
            // Get current filter settings
            const periodIndex = this._period_filter ? this._period_filter.get_selected() : 0;
            const projectIndex = this._project_filter ? this._project_filter.get_selected() : 0;
            const clientIndex = this._client_filter ? this._client_filter.get_selected() : 0;
            
            // Get filter values - check if custom range is active
            let currentPeriod;
            if (this.simpleChart && this.simpleChart.currentPeriod === 'custom') {
                currentPeriod = 'custom';
            } else {
                const periods = ['week', 'month', 'year'];
                currentPeriod = periods[periodIndex] || 'week';
            }
            
            const selectedProjectId = projectIndex === 0 ? null : this.allProjects[projectIndex - 1]?.id;
            const selectedClientId = clientIndex === 0 ? null : this.allClients[clientIndex - 1]?.id;
            
            // Filter tasks based on current settings
            const filteredTasks = this._getFilteredTasksForReports(currentPeriod, selectedProjectId, selectedClientId);
            
            // Calculate statistics
            const stats = this._calculateFilteredStatistics(filteredTasks, selectedProjectId, selectedClientId);
            
            // Update UI
            this._reports_total_time_value.set_label(this._formatTime(stats.totalTime));
            this._reports_total_projects_value.set_label(stats.activeProjects.toString());
            this._updateCurrencyCarousel(stats.totalEarnings);
            this._reports_total_tasks_value.set_label(stats.totalTasks.toString());
            
            // Reports statistics updated
            
        } catch (error) {
            //('❌ Failed to update Reports statistics:', error);
        }
    }

    /**
     * Update the currency carousel with earnings from different currencies
     */
    _updateCurrencyCarousel(earningsByCurrency) {
        if (!this._reports_currency_carousel) {
            return;
        }

        try {
            // Clear existing carousel pages
            let child = this._reports_currency_carousel.get_first_child();
            while (child) {
                const next = child.get_next_sibling();
                this._reports_currency_carousel.remove(child);
                child = next;
            }

            // Add pages for each currency
            for (const [currency, amount] of earningsByCurrency) {
                const currencySymbol = this._getCurrencySymbol(currency);
                const formattedAmount = `${currencySymbol}${amount.toFixed(2)}`;
                
                // Create a page for this currency
                const currencyPage = new Gtk.Box({
                    orientation: Gtk.Orientation.VERTICAL,
                    valign: Gtk.Align.CENTER,
                    halign: Gtk.Align.CENTER,
                    spacing: 4
                });

                // Main amount label
                const amountLabel = new Gtk.Label({
                    label: formattedAmount,
                    css_classes: ['title-1'],
                    halign: Gtk.Align.CENTER
                });

                // Currency code label (smaller)
                const currencyLabel = new Gtk.Label({
                    label: currency,
                    css_classes: ['caption', 'dim-label'],
                    halign: Gtk.Align.CENTER
                });

                currencyPage.append(amountLabel);
                currencyPage.append(currencyLabel);

                this._reports_currency_carousel.append(currencyPage);
            }

            // Show/hide indicators based on number of currencies
            if (this._reports_carousel_indicators) {
                this._reports_carousel_indicators.set_visible(earningsByCurrency.size > 1);
            }

            // Updated currency carousel

        } catch (error) {
            //('❌ Failed to update currency carousel:', error);
        }
    }

    /**
     * Update Recent Tasks list in Reports page with TaskRenderer
     */
    _updateRecentTasksList() {
        if (!this._recent_tasks_list || !this.reportsTaskRenderer) {
            return;
        }

        try {
            // Updating Recent Tasks list

            // Get current filter settings
            const selectedPeriod = this._period_filter?.get_selected() || 0;
            
            // Check if custom range is active
            let period;
            if (this.simpleChart && this.simpleChart.currentPeriod === 'custom') {
                period = 'custom';
            } else {
                const periods = ['week', 'month', 'year'];
                period = periods[selectedPeriod];
            }

            const selectedProjectIndex = this._project_filter?.get_selected() || 0;
            const projectId = selectedProjectIndex > 0 ? this.allProjects[selectedProjectIndex - 1]?.id : null;

            const selectedClientIndex = this._client_filter?.get_selected() || 0;
            const clientId = selectedClientIndex > 0 ? this.allClients[selectedClientIndex - 1]?.id : null;

            // Get filtered tasks based on current Reports page filters
            const filteredTasks = this._getFilteredTasksForReports(period, projectId, clientId);

            // Sort by created_at descending and limit to recent 10 tasks
            const recentTasks = filteredTasks
                .sort((a, b) => new Date(b.created_at || b.start_time) - new Date(a.created_at || a.start_time))
                .slice(0, 10);

            // Found recent tasks to display

            // Clear existing tasks
            let child = this._recent_tasks_list.get_first_child();
            while (child) {
                const next = child.get_next_sibling();
                this._recent_tasks_list.remove(child);
                child = next;
            }

            // Clear task renderer state for recent tasks
            if (this.reportsTaskRenderer) {
                this.reportsTaskRenderer.clearAllActiveTaskTracking();
            }

            if (recentTasks.length === 0) {
                // Show empty state
                const emptyRow = new Adw.ActionRow({
                    title: 'No recent tasks',
                    subtitle: 'Tasks matching your filters will appear here',
                    sensitive: false
                });
                
                const icon = new Gtk.Image({
                    icon_name: 'view-list-symbolic',
                    pixel_size: 16,
                    css_classes: ['dim-label']
                });
                emptyRow.add_prefix(icon);
                
                this._recent_tasks_list.append(emptyRow);
                return;
            }

            // Group similar tasks for stacking
            const taskGroups = this._groupSimilarTasksForRecent(recentTasks);

            // Render using TaskRenderer
            taskGroups.forEach(group => {
                if (group.tasks.length === 1) {
                    // Single task
                    const row = this.reportsTaskRenderer.renderSingleTask(group.tasks[0]);
                    this._recent_tasks_list.append(row);
                } else {
                    // Multiple tasks (stack) - limit to 5 tasks per group for recent tasks
                    group.tasks = group.tasks.slice(0, 5);
                    const groupRow = this.reportsTaskRenderer.renderTaskGroup(group);
                    this._recent_tasks_list.append(groupRow);
                }
            });

            // Update delete button visibility
            this._updateReportsDeleteButton();
            
            // Recent Tasks list updated successfully

        } catch (error) {
            //('❌ Failed to update Recent Tasks list:', error);
        }
    }

    /**
     * Group similar tasks for Recent Tasks (simplified grouping for reports)
     */
    _groupSimilarTasksForRecent(tasks) {
        const groups = new Map();
        
        tasks.forEach(task => {
            // Get base name by removing numbers in parentheses
            const baseNameMatch = task.name.match(/^(.+?)\s*(?:\(\d+\))?$/);
            const baseName = baseNameMatch ? baseNameMatch[1].trim() : task.name;
            
            // Create unique key combining base name, project, and client
            const groupKey = `${baseName}::${task.project_name || 'Unknown'}::${task.client_name || 'Default'}`;
            
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
            
            // Calculate cost if client rate exists
            const clientRate = task.client_rate || 0;
            group.totalCost += (task.duration / 3600) * clientRate;
            
            if (task.is_active) {
                group.hasActive = true;
            }
            
            // Keep track of the most recent task
            if (!group.latestTask || new Date(task.created_at) > new Date(group.latestTask.created_at)) {
                group.latestTask = task;
            }
        });
        
        return Array.from(groups.values());
    }
    
    /**
     * Get filtered tasks based on Reports page filter settings
     */
    _getFilteredTasksForReports(period, projectId, clientId) {
        if (!this.allTasks) return [];
        
        // Get date range for period
        const dateRange = this._getDateRangeForPeriod(period);
        
        return this.allTasks.filter(task => {
            // Date filter
            const taskDate = new Date(task.created_at || task.start_time);
            if (taskDate < dateRange.start || taskDate > dateRange.end) {
                return false;
            }
            
            // Project filter
            if (projectId && task.project_id !== projectId) {
                return false;
            }
            
            // Client filter  
            if (clientId && task.client_id !== clientId) {
                return false;
            }
            
            return true;
        });
    }
    
    /**
     * Get date range for a given period (like v0.2.5 logic)
     */
    _getDateRangeForPeriod(period) {
        const now = new Date();
        let start, end;
        
        switch (period) {
            case 'week':
                start = new Date(now);
                start.setDate(now.getDate() - now.getDay()); // Start of week
                start.setHours(0, 0, 0, 0);
                end = new Date(start);
                end.setDate(start.getDate() + 6); // End of week
                end.setHours(23, 59, 59, 999);
                break;
                
            case 'month':
                start = new Date(now.getFullYear(), now.getMonth(), 1);
                end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
                end.setHours(23, 59, 59, 999);
                break;
                
            case 'year':
                start = new Date(now.getFullYear(), 0, 1);
                end = new Date(now.getFullYear(), 11, 31);
                end.setHours(23, 59, 59, 999);
                break;
                
            case 'custom':
                // Use custom date range from simpleChart
                if (this.simpleChart && this.simpleChart.customDateRange) {
                    start = new Date(this.simpleChart.customDateRange.fromDate);
                    end = new Date(this.simpleChart.customDateRange.toDate);
                    end.setHours(23, 59, 59, 999);
                } else {
                    // Fallback to week if no custom range
                    start = new Date(now);
                    start.setDate(now.getDate() - now.getDay());
                    start.setHours(0, 0, 0, 0);
                    end = new Date(start);
                    end.setDate(start.getDate() + 6);
                    end.setHours(23, 59, 59, 999);
                }
                break;
                
            default:
                // Default to week
                start = new Date(now);
                start.setDate(now.getDate() - now.getDay());
                start.setHours(0, 0, 0, 0);
                end = new Date(start);
                end.setDate(start.getDate() + 6);
                end.setHours(23, 59, 59, 999);
        }
        
        return { start, end };
    }
    
    /**
     * Calculate statistics from filtered tasks
     */
    _calculateFilteredStatistics(tasks, selectedProjectId, selectedClientId) {
        // Calculating statistics for tasks
        // Sample task data available
        
        const totalTime = tasks.reduce((sum, task) => {
            const taskTime = task.duration || task.time_spent || 0;
            // Task time calculated
            return sum + taskTime;
        }, 0);
        const totalTasks = tasks.length;
        
        // Total calculated time
        
        // Count unique projects
        const projectIds = new Set();
        if (selectedProjectId) {
            // If project filter is applied, count only that project
            projectIds.add(selectedProjectId);
        } else {
            // Count all unique projects in filtered tasks
            tasks.forEach(task => {
                if (task.project_id) {
                    projectIds.add(task.project_id);
                }
            });
        }
        const activeProjects = projectIds.size;
        
        // Calculate earnings by currency
        const earningsByCurrency = new Map();
        
        if (this.allClients) {
            tasks.forEach(task => {
                const client = this.allClients.find(c => c.id === task.client_id);
                if (client && client.rate) {
                    const taskTime = task.duration || task.time_spent || 0;
                    const currency = client.currency || 'USD';
                    const earnings = taskTime * (client.rate / 3600); // rate per hour
                    
                    if (earningsByCurrency.has(currency)) {
                        earningsByCurrency.set(currency, earningsByCurrency.get(currency) + earnings);
                    } else {
                        earningsByCurrency.set(currency, earnings);
                    }
                }
            });
        }
        
        // If no earnings, show default
        if (earningsByCurrency.size === 0) {
            earningsByCurrency.set('USD', 0);
        }
        
        const totalEarnings = earningsByCurrency;
        
        return {
            totalTime,
            activeProjects,
            totalEarnings,
            totalTasks
        };
    }
    
    /**
     * Get currency symbol (simple implementation)
     */
    _getCurrencySymbol(currency) {
        const symbols = {
            'USD': '$',
            'EUR': '€',
            'GBP': '£',
            'JPY': '¥',
            'CHF': 'Fr.',
            'CAD': 'C$',
            'AUD': 'A$',
            'CNY': '¥',
            'INR': '₹',
            'KRW': '₩',
            'BRL': 'R$',
            'RUB': '₽',
            'SEK': 'kr',
            'NOK': 'kr',
            'DKK': 'kr',
            'PLN': 'zł',
            'CZK': 'Kč',
            'HUF': 'Ft',
            'TRY': '₺',
            'ZAR': 'R',
            'MXN': '$',
            'SGD': 'S$',
            'HKD': 'HK$',
            'NZD': 'NZ$'
        };
        return symbols[currency] || currency;
    }
    
    /**
     * Format time in seconds to HH:MM:SS
     */
    _formatTime(seconds) {
        if (!seconds || seconds < 0) return '00:00:00';
        
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = Math.floor(seconds % 60);
        
        return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }

    // TaskRenderer compatibility methods

    /**
     * Edit task by ID - called by TaskRenderer
     */
    _editTask(taskId) {
        const task = this.allTasks?.find(t => t.id === taskId);
        if (task && this.tasksPageComponent) {
            // Delegate to TasksPage component which has the edit functionality
            this.tasksPageComponent._editTaskById(task);
        } else {
        }
    }

    /**
     * Start tracking from task - called by TaskRenderer
     */
    _startTrackingFromTask(task) {
        
        if (this.tasksPageComponent) {
            // Use TasksPage's tracking start logic
            this.tasksPageComponent._startTrackingFromTask(task);
        } else {
            // Fallback implementation
            this._setTrackingContext(task.project_id, task.client_id);
            this._startTracking(task.name);
        }
    }

    /**
     * Stop current tracking - called by TaskRenderer
     */
    _stopCurrentTracking() {
        
        if (this.tasksPageComponent) {
            // Use TasksPage's tracking stop logic
            this.tasksPageComponent._stopCurrentTracking();
        } else {
            // Fallback implementation
            this._stopTracking();
        }
    }

    /**
     * Set tracking context (project/client) - helper method
     */
    _setTrackingContext(projectId, clientId) {
        if (projectId) this.currentProjectId = projectId;
        if (clientId) this.currentClientId = clientId;
        
        // Update UI selectors if available
        this._updateProjectClientSelectors();
    }

    /**
     * Start tracking with task name - simplified implementation
     */
    _startTracking(taskName) {
        if (this.globalTracking) {
            this.globalTracking.startTracking({
                name: taskName,
                projectId: this.currentProjectId,
                clientId: this.currentClientId
            });
        }
    }

    /**
     * Stop tracking - simplified implementation
     */
    _stopTracking() {
        if (this.globalTracking) {
            this.globalTracking.stopTracking();
        }
    }

    /**
     * Update project/client UI selectors - helper method
     */
    _updateProjectClientSelectors() {
        // Update project context button
        const project = this.allProjects?.find(p => p.id === this.currentProjectId);
        if (project && this._project_context_btn) {
            this._project_context_btn.set_label(project.name);
        }

        // Update client context button  
        const client = this.allClients?.find(c => c.id === this.currentClientId);
        if (client && this._client_context_btn) {
            this._client_context_btn.set_label(client.name);
        }
    }

    /**
     * Get project ID by filter dropdown index
     */
    _getProjectIdByFilterIndex(index) {
        const projects = this.allProjects || [];
        return projects[index]?.id || null;
    }

    /**
     * Get client ID by filter dropdown index
     */
    _getClientIdByFilterIndex(index) {
        const clients = this.allClients || [];
        return clients[index]?.id || null;
    }

    /**
     * Show PDF Export Preferences Dialog
     */
    _showPDFExportPreferences() {

        if (!this.reportExporter) {
            //('❌ No report exporter available for preferences dialog');
            return;
        }

        try {
            PDFExportPreferencesDialog.show(this, this.reportExporter);
        } catch (error) {
            //('💥 Error opening PDF Export Preferences Dialog:', error);
        }
    }

});