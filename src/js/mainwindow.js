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
import { setupDatabase } from 'resource:///com/odnoyko/valot/js/func/global/dbinitialisation.js';
import { CompactTrackerWindow } from 'resource:///com/odnoyko/valot/js/compacttracker.js';
import { ProjectManager } from 'resource:///com/odnoyko/valot/js/func/pages/projectManager.js';
import { ClientManager } from 'resource:///com/odnoyko/valot/js/func/pages/clientManager.js';
import { TaskManager } from 'resource:///com/odnoyko/valot/js/func/pages/taskManager.js';
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
import { HeaderTrackingWidget } from 'resource:///com/odnoyko/valot/js/interface/components/complex/HeaderTrackingWidget.js';
import { WidgetFactory } from 'resource:///com/odnoyko/valot/js/interface/components/widgetFactory.js';
import { Button } from 'resource:///com/odnoyko/valot/js/interface/components/primitive/Button.js';
import { getCurrencySymbol } from 'resource:///com/odnoyko/valot/js/data/currencies.js';
import { ClientDropdown } from 'resource:///com/odnoyko/valot/js/interface/components/clientDropdown.js';
import { TasksPage } from 'resource:///com/odnoyko/valot/js/interface/pages/TasksPage.js';
import { ProjectsPage } from 'resource:///com/odnoyko/valot/js/interface/pages/ProjectsPage.js';
import { ClientsPage } from 'resource:///com/odnoyko/valot/js/interface/pages/ClientsPage.js';
import { ReportsPage } from 'resource:///com/odnoyko/valot/js/interface/pages/ReportsPage.js';

export const ValotWindow = GObject.registerClass({
    GTypeName: 'ValotWindow',
    Template: 'resource:///com/odnoyko/valot/ui/window.ui',
    InternalChildren: [
        'split_view', 'main_content', 'sidebar_list',
        'sidebar_toggle_btn', 'menu_button',
        'tasks_page', 'projects_page', 'clients_page', 'reports_page', 
        'sidebar_compact_tracker',
        'task_search', 'task_filter', 'task_list', 
        'prev_page_btn', 'next_page_btn', 'page_info', 'pagination_box',
        'project_search', 'add_project_btn', 'project_list',
        'client_search', 'add_client_btn', 'client_list',
        // Tracking widgets for all pages
        'tracking_widget', 'task_name', 'actual_time', 'track_button', 'project_context_btn', 'client_context_btn',
        'tracking_widget_projects', 'task_name_projects', 'actual_time_projects', 'track_button_projects', 
        'tracking_widget_clients', 'task_name_clients', 'actual_time_clients', 'track_button_clients',
        'tracking_widget_reports', 'task_name_reports', 'actual_time_reports', 'track_button_reports'
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
        
        // Initialize task selection state
        this.selectedTasks = new Set();
        this.selectedStacks = new Set();
        this.taskRowMap = new Map();
        this.stackRowMap = new Map();
        
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
        
        // Setup other keyboard shortcuts
        this._setupKeyboardShortcuts();
        
    }

    _initializeDatabase(application) {
        const app = application;
        if (app && app.database_connection) {
            this.dbConnection = app.database_connection;
        } else {
            console.warn('⚠️ No database connection found in application, using fallback');
            try {
                this.dbConnection = setupDatabase();
            } catch (error) {
                console.error('❌ Failed to initialize database:', error);
            }
        }
    }

    _initializeManagers() {
        if (!this.dbConnection) {
            console.error('No database connection for managers');
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

        // Initialize other managers
        this.timeUtils = TimeUtils;
        this.simpleChart = new SimpleChart();
        this.reportExporter = new ReportExporter();
        
        // Make trackingStateManager available to child components
        this.trackingStateManager = trackingStateManager;

        // Initialize modular dialog manager
        this.modularDialogManager = new ModularDialogManager(this, this.application);

        
        // Load initial data
        this._loadProjects();
        this._loadClients();
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
                
                console.log(`✅ Created ${isMaster ? 'MASTER' : 'non-master'} tracking widget for ${name} page`);
            } else {
                console.warn(`⚠️ Could not find tracking container for ${name} page`);
            }
        });

        // All widgets are automatically synchronized through trackingStateManager
        console.log(`✅ Created ${this.trackingWidgets.length} synchronized tracking widgets`);
        
        // Update project buttons after widgets are created
        if (this.allProjects && this.allProjects.length > 0 && this.currentProjectId) {
            const currentProject = this.allProjects.find(p => p.id === this.currentProjectId);
            if (currentProject) {
                console.log(`🔄 Initial project button update for: ${currentProject.name}`);
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
                console.log(`✅ Time tracking initialized on master widget`);
            }
            
            console.log(`✅ Master tracking widget set for page: ${this.trackingWidgets[0].page}`);
        }
        
        // ВАЖНО: Также инициализировать основные template кнопки
        this._setupMainTrackingButtons();
    }

    /**
     * Synchronize all tracking widget inputs when one changes
     */
    _syncAllInputsFromCurrentWidget(text, sourceWidget) {
        if (!this.trackingWidgets) return;
        
        // Sync text to all other widgets except the source
        this.trackingWidgets.forEach(({ widget }) => {
            if (widget !== sourceWidget && widget.getTaskText() !== text) {
                widget.setTaskTextSilent(text);
            }
        });
    }

    /**
     * Update all project buttons when project selection changes
     */
    _updateProjectButtonsDisplay(projectName) {
        const project = this.allProjects?.find(p => p.name === projectName);
        if (!project || !this.trackingWidgets) return;
        
        // Update all project buttons across all tracking widgets
        this.trackingWidgets.forEach(({ widget }) => {
            widget.updateProjectDisplay(project);
        });
        
        // Synchronize compact tracker if it's open
        if (this.compactTrackerWindow) {
            console.log(`🔄 Main window: syncing compact tracker for project: ${projectName}`);
            this.compactTrackerWindow.syncWithMainWindow();
        } else {
            console.log(`🔄 Main window: compact tracker not open, skipping sync`);
        }
        
        console.log(`✅ Updated all project buttons to: ${projectName}`);
    }

    /**
     * Update all client buttons when client selection changes
     */
    _updateClientButtonsDisplay(clientName) {
        // Prevent infinite loops by checking if we're already updating
        if (this._isUpdatingClientButtons) {
            console.log(`🔄 Skipping client button update - already in progress`);
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
            console.log(`🔄 Main window: syncing compact tracker for client: ${clientName}`);
            this.compactTrackerWindow.syncWithMainWindow();
        } else {
            console.log(`🔄 Main window: compact tracker not open for client sync`);
        }
        
        console.log(`✅ Updated all client buttons to: ${clientName}`);
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
                console.log(`Client selected: ${selectedClient.name}`);
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
            console.warn('Projects not loaded');
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
                css_classes: ['boxed-list'],
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
                        width_request: 28,
                        height_request: 28
                    });
                } else {
                    iconWidget = new Gtk.Image({
                        icon_name: project.icon || 'folder-symbolic',
                        pixel_size: 14
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
                    console.log(`Selected project: ${selectedProject.name} with color ${selectedProject.color}`);
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
            console.error('Error showing project selector:', error);
        }
    }

    _showClientSelector() {
        if (!this.allClients) {
            console.warn('Clients not loaded');
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
                        console.log(`Selected client: ${selectedClient.name} with currency ${selectedClient.currency}`);
                    }
                }
                dialog.close();
            });

            dialog.present(this);

        } catch (error) {
            console.error('Error showing client selector:', error);
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
        // Основная кнопка Tasks page
        if (this._track_button && this._task_name && this._actual_time) {
            console.log(`🔧 Инициализация основной кнопки _track_button`);
            GlobalTracking.registerTrackingComponent(null, {
                button: this._track_button,
                input: this._task_name,
                timeLabel: this._actual_time,
                parentWindow: this
            });
        }
        
        // Кнопки других страниц
        const pageButtons = [
            { button: this._track_button_projects, input: this._task_name_projects, label: this._actual_time_projects, page: 'projects' },
            { button: this._track_button_clients, input: this._task_name_clients, label: this._actual_time_clients, page: 'clients' },
            { button: this._track_button_reports, input: this._task_name_reports, label: this._actual_time_reports, page: 'reports' }
        ];
        
        pageButtons.forEach(({ button, input, label, page }) => {
            if (button && input && label) {
                console.log(`🔧 Инициализация кнопки трекинга для страницы: ${page}`);
                GlobalTracking.registerTrackingComponent(null, {
                    button: button,
                    input: input,
                    timeLabel: label,
                    parentWindow: this
                });
            }
        });
        
        console.log(`✅ Инициализированы основные кнопки трекинга`);
    }

    _connectPageComponents() {
        // Tasks page uses the existing template UI, so just connect the functionality
        // The TasksPage component connects to existing UI elements via _connectToExistingUI()
        
        // For other pages, we can connect them to work with the existing template
        // or replace their content if needed
    }

    _setupNavigation() {
        // Setup sidebar navigation using original working method
        this._sidebar_list.connect('row-activated', (list, row) => {
            const index = row.get_index();
            switch (index) {
                case 0: 
                    this._showPage('tasks'); 
                    if (this.tasksPageComponent) {
                        this.tasksPageComponent.refresh().catch(error => {
                            console.error('Failed to refresh tasks page:', error);
                        });
                    }
                    break;
                case 1: 
                    this._showPage('projects'); 
                    if (this.projectsPageComponent) {
                        this.projectsPageComponent.refresh().catch(error => {
                            console.error('Failed to refresh projects page:', error);
                        });
                    }
                    break;
                case 2: 
                    this._showPage('clients'); 
                    if (this.clientsPageComponent) {
                        this.clientsPageComponent.refresh().catch(error => {
                            console.error('Failed to refresh clients page:', error);
                        });
                    }
                    break;
                case 3: 
                    this._showPage('reports'); 
                    if (this.reportsPageComponent) {
                        this.reportsPageComponent.refresh().catch(error => {
                            console.error('Failed to refresh reports page:', error);
                        });
                    }
                    break;
                case 4: 
                    // Compact tracker handled by _setupCompactTrackerButton()
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

    }

    _setupCompactTrackerButton() {
        this._sidebar_compact_tracker.connect('activated', () => {
            this._launchCompactTrackerDebug();
        });
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
                        this._showPage('tasks');
                        if (this.tasksPageComponent) {
                            this.tasksPageComponent.refresh().catch(error => {
                                console.error('Failed to refresh tasks page:', error);
                            });
                        }
                        return true;
                    case 50: // Ctrl+2 - Projects
                        this._showPage('projects');
                        if (this.projectsPageComponent) {
                            this.projectsPageComponent.refresh().catch(error => {
                                console.error('Failed to refresh projects page:', error);
                            });
                        }
                        return true;
                    case 51: // Ctrl+3 - Clients
                        this._showPage('clients');
                        if (this.clientsPageComponent) {
                            this.clientsPageComponent.refresh().catch(error => {
                                console.error('Failed to refresh clients page:', error);
                            });
                        }
                        return true;
                    case 52: // Ctrl+4 - Reports
                        this._showPage('reports');
                        if (this.reportsPageComponent) {
                            this.reportsPageComponent.refresh().catch(error => {
                                console.error('Failed to refresh reports page:', error);
                            });
                        }
                        return true;
                }
            }
            return false;
        });
        
        this.add_controller(keyController);
    }

    _testDeleteKeyFunction() {
        console.log('🧪 TEST FUNCTION: Delete key test executed successfully!');
        console.log('🧪 TEST FUNCTION: Current page components available:');
        console.log('🧪 TEST FUNCTION: - tasksPageComponent:', !!this.tasksPageComponent);
        console.log('🧪 TEST FUNCTION: - projectsPageComponent:', !!this.projectsPageComponent);
        console.log('🧪 TEST FUNCTION: - clientsPageComponent:', !!this.clientsPageComponent);
        console.log('🧪 TEST FUNCTION: - reportsPageComponent:', !!this.reportsPageComponent);
        
        // Try to show a simple alert if possible
        try {
            const dialog = new Adw.AlertDialog({
                heading: 'Delete Key Test',
                body: 'Delete key is working! Check console for details.'
            });
            dialog.add_response('ok', 'OK');
            dialog.present(this);
            console.log('🧪 TEST FUNCTION: Alert dialog shown');
        } catch (error) {
            console.log('🧪 TEST FUNCTION: Could not show alert:', error.message);
        }
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
                // Use your original replace method for instant navigation
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
                console.error('Failed to load initial tasks data:', error);
            });
        }
        
    }

    _showCompactTrackerOnHide() {
        console.log('🔄 Main window hidden - showing compact tracker...');
        
        if (!this.compactTrackerWindow) {
            this.compactTrackerWindow = new CompactTrackerWindow(this.application, this);
            console.log('🔄 Compact tracker created for hidden window');
        }
        
        // Force sync before presenting
        this.compactTrackerWindow.syncWithMainWindow();
        this.compactTrackerWindow.present();
        console.log('🔄 Compact tracker shown');
    }

    _launchCompactTrackerDebug() {
        console.log('🧪 Debug: Toggling compact tracker from sidebar...');
        
        if (!this.compactTrackerWindow) {
            this.compactTrackerWindow = new CompactTrackerWindow(this.application, this);
            console.log('🧪 Debug compact tracker created');
            // Force sync before presenting
            this.compactTrackerWindow.syncWithMainWindow();
            this.compactTrackerWindow.present();
            console.log('🧪 Debug compact tracker shown');
        } else {
            if (this.compactTrackerWindow.is_visible()) {
                this.compactTrackerWindow.set_visible(false);
                console.log('🧪 Debug compact tracker hidden');
            } else {
                // Force sync before presenting
                this.compactTrackerWindow.syncWithMainWindow();
                this.compactTrackerWindow.present();
                console.log('🧪 Debug compact tracker shown');
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
                console.error(`Failed to refresh ${pageTag} page:`, error);
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
            console.error('ProjectManager or database connection not available to load projects');
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
                console.log(`Default project set: ${this.allProjects[0].name} (ID: ${this.currentProjectId})`);
            } else if (this.allProjects.length > 0 && this.currentProjectId) {
                // Update header buttons for currently selected project after reload
                const currentProject = this.allProjects.find(p => p.id === this.currentProjectId);
                if (currentProject) {
                    this._updateProjectButtonsDisplay(currentProject.name);
                    console.log(`Updated header buttons for current project: ${currentProject.name}`);
                }
            }
            
        } catch (error) {
            console.error('❌ Failed to load projects:', error);
            this.allProjects = [];
        }
    }

    /**
     * Load clients from database to populate allClients array
     */
    _loadClients() {
        if (!this.clientManager || !this.clientManager.dbConnection) {
            console.error('ClientManager or database connection not available to load clients');
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
                console.log('Currency column not found, trying without it:', currencyColumnError.message);
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
                console.log(`Default client set: ${this.allClients[0].name} (ID: ${this.currentClientId})`);
            }
            
        } catch (error) {
            console.error('❌ Failed to load clients:', error);
            this.allClients = [];
        }
    }

});