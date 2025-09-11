import Gtk from 'gi://Gtk';
import Gdk from 'gi://Gdk';
import Adw from 'gi://Adw';
import Pango from 'gi://Pango';
import GLib from 'gi://GLib';
import { Button } from '../components/primitive/Button.js';
import { Label } from '../components/primitive/Label.js';
import { WidgetFactory } from '../components/widgetFactory.js';
import { TaskManager } from '../../func/pages/taskManager.js';
import { TaskRenderer } from '../../func/pages/taskRenderer.js';
import { trackingStateManager } from '../../func/global/trackingStateManager.js';
import { executeQuery, executeNonSelectCommand } from '../../func/global/dbinitialisation.js';
import { getCurrencySymbol } from 'resource:///com/odnoyko/valot/js/data/currencies.js';
import { getProjectIconColor } from 'resource:///com/odnoyko/valot/js/func/global/colorUtils.js';
import { ClientDropdown } from '../components/clientDropdown.js';

/**
 * Tasks page component with task list and management
 */
export class TasksPage {
    constructor(config = {}) {
        this.config = {
            title: 'Tasks',
            subtitle: 'Manage and track your tasks',
            showTrackingWidget: true,
            showSearchButton: true,
            actions: [
                {
                    icon: 'list-add-symbolic',
                    tooltip: 'Add Task',
                    cssClasses: ['suggested-action'],
                    onClick: (page) => page.showAddTaskDialog()
                },
                {
                    icon: 'document-properties-symbolic',
                    tooltip: 'Add from Template',
                    cssClasses: ['flat'],
                    onClick: (page) => page.showTaskTemplateDialog()
                }
            ],
            ...config
        };

        // Base page properties
        this.app = config.app;
        this.parentWindow = config.parentWindow;
        this.isLoading = false;
        this.currentPage = 0;
        this.itemsPerPage = 20;
        
        this.tasks = [];
        this.filteredTasks = [];
        this.allTasks = []; // For task renderer compatibility
        this.searchQuery = '';
        this.activeFilter = 'all';
        
        // Task selection state (for original functionality)
        this.selectedTasks = new Set();
        this.selectedStacks = new Set(); 
        this.taskRowMap = new Map();
        this.stackRowMap = new Map();
        
        // Initialize task manager and renderer
        this._initializeTaskManager();
        this._initializeTaskRenderer();
        
        // Connect to existing UI elements
        this._connectToExistingUI();
        
        // Enable cost tracking by default (can be overridden by parent window setting)
        this.showCostTracking = this.parentWindow?.showCostTracking !== false;
        
        // Subscribe to tracking state changes for automatic task list updates
        this._subscribeToTrackingStateChanges();
    }

    _initializeTaskManager() {
        if (this.parentWindow && this.parentWindow.dbConnection) {
            this.taskManager = new TaskManager(
                this.parentWindow.dbConnection,
                executeQuery,
                executeNonSelectCommand
            );
        } else {
            console.error('❌ No database connection available for TaskManager');
        }
    }

    _initializeTaskRenderer() {
        if (this.parentWindow && this.parentWindow.timeUtils) {
            // Pass this TasksPage as parentWindow to TaskRenderer so it can access our methods
            this.taskRenderer = new TaskRenderer(
                this.parentWindow.timeUtils,
                this.parentWindow.allProjects || [],
                this // Use TasksPage as parent for method access
            );
            
            // Ensure TasksPage has access to allProjects from main window
            this.allProjects = this.parentWindow.allProjects || [];
            
        } else {
            console.error('❌ Missing dependencies for TaskRenderer');
        }
    }

    _connectToExistingUI() {
        if (!this.parentWindow) {
            console.error('TasksPage: No parent window provided');
            return;
        }
        
        // Get references to existing UI elements from the template
        this.taskSearch = this.parentWindow._task_search;
        this.taskFilter = this.parentWindow._task_filter;
        this.taskList = this.parentWindow._task_list;
        this.prevPageBtn = this.parentWindow._prev_page_btn;
        this.nextPageBtn = this.parentWindow._next_page_btn;
        this.pageInfo = this.parentWindow._page_info;
        this.paginationBox = this.parentWindow._pagination_box;
        
        console.log('TasksPage UI elements:', {
            taskSearch: !!this.taskSearch,
            taskFilter: !!this.taskFilter,
            taskList: !!this.taskList,
            prevPageBtn: !!this.prevPageBtn,
            nextPageBtn: !!this.nextPageBtn,
            pageInfo: !!this.pageInfo,
            paginationBox: !!this.paginationBox
        });
        
        // Connect event handlers to existing UI elements
        this._connectEventHandlers();
        
    }
    
    _connectEventHandlers() {
        if (this.taskSearch) {
            this.taskSearch.connect('search-changed', () => {
                this.searchQuery = this.taskSearch.get_text();
                this._filterTasks();
            });
        }
        
        if (this.taskFilter) {
            this.taskFilter.connect('notify::selected', () => {
                this.activeFilter = this.taskFilter.get_selected();
                this._filterTasks();
            });
        }
        
        if (this.prevPageBtn) {
            this.prevPageBtn.connect('clicked', () => this._previousPage());
        }
        
        if (this.nextPageBtn) {
            this.nextPageBtn.connect('clicked', () => this._nextPage());
        }
        
    }
    
    _subscribeToTrackingStateChanges() {
        
        if (this.parentWindow && this.parentWindow.trackingStateManager) {
            // Subscribe to tracking state changes for automatic task list updates
            this.trackingUnsubscribe = this.parentWindow.trackingStateManager.subscribe((event, data) => {
                // Update task list when tracking starts, stops, task is saved, or when updateTaskList is triggered
                if (event === 'start') {
                    // Add 500ms delay for tracking start to ensure UI state is fully updated
                    setTimeout(() => {
                        this.loadTasks();
                    }, 500);
                } else if (event === 'stop' || event === 'updateTaskList' || event === 'taskStarted' || event === 'taskUpdated') {
                    this.loadTasks();
                } else if (event === 'updateTaskListRealTime') {
                    // Update only the duration of the active task without full refresh
                    this._updateActiveTaskDuration(data.taskInfo, data.elapsedTime);
                }
            });
            
        } else {
            console.warn('⚠️ TasksPage: Cannot subscribe to tracking state - trackingStateManager not available');
            console.warn('⚠️ TasksPage: parentWindow:', this.parentWindow);
            console.warn('⚠️ TasksPage: trackingStateManager:', this.parentWindow?.trackingStateManager);
        }
    }

    // This method is kept for compatibility but now connects to existing UI
    _createMainContent() {
        // This page uses existing UI template, so we don't create new content
        // Instead, we've connected to existing elements in _connectToExistingUI()
        return null;
    }

    _createSearchBar(container) {
        this.searchBar = new Gtk.SearchBar({
            visible: false
        });

        const searchEntry = new Gtk.SearchEntry({
            placeholder_text: 'Search tasks...',
            hexpand: true
        });

        searchEntry.connect('search-changed', () => {
            this.searchQuery = searchEntry.get_text();
            this._filterTasks();
        });

        this.searchBar.set_child(searchEntry);
        this.searchBar.connect_entry(searchEntry);
        
        container.append(this.searchBar);
    }

    _createFilterBar(container) {
        const filterBox = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 6,
            css_classes: ['filter-bar']
        });

        // Filter buttons
        const filters = [
            { id: 'all', label: 'All Tasks', active: true },
            { id: 'today', label: 'Today' },
            { id: 'week', label: 'This Week' },
            { id: 'active', label: 'Active Only' }
        ];

        this.filterButtons = new Map();

        filters.forEach(filter => {
            const button = new Button({
                label: filter.label,
                cssClasses: filter.active ? ['filter-button', 'suggested-action'] : ['filter-button', 'flat'],
                onClick: () => this._setFilter(filter.id)
            });

            this.filterButtons.set(filter.id, button);
            filterBox.append(button.widget);
        });

        container.append(filterBox);
    }

    _createTaskList(container) {
        // Create scrollable list for tasks
        this.taskList = WidgetFactory.createScrollableList({
            height_request: 400,
            cssClasses: ['task-list']
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
            icon_name: 'view-list-symbolic',
            pixel_size: 64,
            css_classes: ['dim-label']
        });

        const emptyLabel = new Label({
            text: 'No tasks found',
            cssClasses: ['title-2'],
            halign: Gtk.Align.CENTER
        });

        const emptySubLabel = new Label({
            text: 'Create your first task to get started',
            cssClasses: ['dim-label'],
            halign: Gtk.Align.CENTER
        });

        this.emptyState.append(emptyIcon);
        this.emptyState.append(emptyLabel.widget);
        this.emptyState.append(emptySubLabel.widget);

        // Stack to switch between list and empty state
        this.listStack = new Gtk.Stack();
        this.listStack.add_named(this.taskList.widget, 'list');
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

        this.prevButton = new Button({
            iconName: 'go-previous-symbolic',
            tooltipText: 'Previous page',
            cssClasses: ['circular'],
            onClick: () => this._previousPage()
        });

        this.pageInfo = new Label({
            text: 'Page 1 of 1',
            cssClasses: ['monospace']
        });

        this.nextButton = new Button({
            iconName: 'go-next-symbolic',
            tooltipText: 'Next page',
            cssClasses: ['circular'],
            onClick: () => this._nextPage()
        });

        paginationBox.append(this.prevButton.widget);
        paginationBox.append(this.pageInfo.widget);
        paginationBox.append(this.nextButton.widget);

        container.append(paginationBox);
    }

    // Override tracking widget events
    _onTrackingTaskChanged(text, widget) {
        // Handle task name changes
        console.log('TasksPage: Tracking task changed', text);
    }

    _onTrackingClick(widget) {
        const trackingData = widget.getTrackingData();
        
        if (!trackingData.isValid) {
            this.showError('Invalid Input', 'Please enter a task name and select a project');
            return;
        }

        if (widget.config.isTracking) {
            this._stopTracking();
        } else {
            this._startTracking(trackingData);
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
     * Set active filter
     */
    _setFilter(filterId) {
        // Update button states
        this.filterButtons.forEach((button, id) => {
            if (id === filterId) {
                button.addClass('suggested-action');
                button.removeClass('flat');
            } else {
                button.removeClass('suggested-action');
                button.addClass('flat');
            }
        });

        this.activeFilter = filterId;
        this._filterTasks();
    }

    /**
     * Filter tasks based on search and filter criteria
     */
    _filterTasks() {
        this.filteredTasks = this.tasks.filter(task => {
            // Search filter
            if (this.searchQuery) {
                const query = this.searchQuery.toLowerCase();
                if (!task.name.toLowerCase().includes(query) &&
                    !task.project_name.toLowerCase().includes(query)) {
                    return false;
                }
            }

            // Date/status filters
            switch (this.activeFilter) {
                case 'today':
                    return this._isToday(task.date);
                case 'week':
                    return this._isThisWeek(task.date);
                case 'active':
                    return task.is_active;
                default:
                    return true;
            }
        });

        this._updateTaskDisplay();
    }

    /**
     * Update task list display with original grouping logic
     */
    _updateTaskDisplay() {
        // Clear existing tasks
        if (this.taskList) {
            let child = this.taskList.get_first_child();
            while (child) {
                const next = child.get_next_sibling();
                this.taskList.remove(child);
                child = next;
            }
        }

        // Clear selection state
        this.selectedTasks.clear();
        this.selectedStacks.clear();
        this.taskRowMap.clear();
        this.stackRowMap.clear();
        
        // Clear active task tracking in TaskRenderer for real-time updates
        if (this.taskRenderer) {
            this.taskRenderer.clearAllActiveTaskTracking();
        }

        if (!this.filteredTasks || this.filteredTasks.length === 0) {
            console.log('No tasks to display');
            this._showEmptyState();
            return;
        }

        console.log(`Displaying ${this.filteredTasks.length} tasks`);

        // Store as allTasks for taskRenderer compatibility
        this.allTasks = [...this.filteredTasks];
        this.parentWindow.allTasks = this.allTasks;

        // Calculate pagination
        const totalPages = Math.ceil(this.filteredTasks.length / this.itemsPerPage);
        const start = this.currentPage * this.itemsPerPage;
        const end = Math.min(start + this.itemsPerPage, this.filteredTasks.length);
        const tasksToShow = this.filteredTasks.slice(start, end);

        // Group similar tasks and render
        const taskGroups = this._groupSimilarTasks(tasksToShow);
        this._renderTaskGroups(taskGroups);

        // Update pagination info
        this._updatePaginationInfo(totalPages);
    }

    /**
     * Group tasks by name, project, and client (original logic)
     */
    _groupSimilarTasks(tasks) {
        const groups = new Map();
        
        tasks.forEach(task => {
            // Get base name by removing numbers in parentheses
            const baseNameMatch = task.name.match(/^(.+?)\s*(?:\(\d+\))?$/);
            const baseName = baseNameMatch ? baseNameMatch[1].trim() : task.name;
            
            // Create unique key combining base name, project, and client for proper stacking
            const groupKey = `${baseName}::${task.project_name}::${task.client_name || ''}`;
            
            // Keep tracking tasks in their stack - don't separate them
            
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
     * Render task groups using TaskRenderer
     */
    _renderTaskGroups(taskGroups) {
        if (!this.taskRenderer) {
            console.error('TaskRenderer not initialized');
            return;
        }

        taskGroups.forEach(group => {
            if (group.tasks.length === 1 || group.isIndividual) {
                // Single task OR individual tracking task - render using TaskRenderer
                const row = this.taskRenderer.renderSingleTask(group.tasks[0]);
                this.taskList.append(row);
            } else {
                // Multiple tasks - render as expandable group using TaskRenderer
                const groupRow = this.taskRenderer.renderTaskGroup(group);
                this.taskList.append(groupRow);
            }
        });

        // Update all buttons to reflect current tracking state after rendering
        if (this.parentWindow && this.parentWindow.trackingStateManager) {
            this.parentWindow.trackingStateManager._updateStackButtons();
        }
    }

    // Add missing methods that TaskRenderer expects in parentWindow
    _editTask(taskId) {
        const task = this.allTasks.find(t => t.id === taskId);
        if (task) {
            this._editTaskById(task);
        }
    }

    _editTaskById(task) {
        // Use the existing edit functionality
        this._editTaskObject(task);
    }

    _startTrackingFromTask(task) {
        console.log(`🎯 _startTrackingFromTask called for: "${task.name}"`);
        
        // Set the main tracking widget context from task
        if (this.parentWindow) {
            console.log(`🎯 parentWindow exists`);
            console.log(`🎯 parentWindow properties:`, Object.getOwnPropertyNames(this.parentWindow).filter(name => name.includes('task') || name.includes('track')));
            
            // Set current project/client from task data
            if (task.project_id) {
                this.parentWindow.currentProjectId = task.project_id;
                console.log(`🎯 Set currentProjectId: ${task.project_id}`);
            }
            if (task.client_id) {
                this.parentWindow.currentClientId = task.client_id;
                console.log(`🎯 Set currentClientId: ${task.client_id}`);
            }
            
            // Update project/client buttons to reflect task context
            if (this.parentWindow._updateProjectClientButtons) {
                this.parentWindow._updateProjectClientButtons();
                console.log(`🎯 Updated project/client buttons`);
            }
            
            // Set task name in main tracking widget
            if (this.parentWindow._task_name) {
                this.parentWindow._task_name.set_text(task.name);
                console.log(`🎯 Set task name: "${task.name}"`);
            } else {
                console.log(`🎯 ERROR: _task_name not found`);
            }
            
            // Simulate clicking the main tracking button to start tracking
            if (this.parentWindow._track_button) {
                console.log(`🎯 Emitting click on _track_button`);
                this.parentWindow._track_button.emit('clicked');
            } else {
                console.log(`🎯 ERROR: _track_button not found`);
            }
        } else {
            console.log(`🎯 ERROR: parentWindow not found`);
        }
    }

    _stopCurrentTracking() {
        if (this.parentWindow.trackingStateManager) {
            const currentTracking = this.parentWindow.trackingStateManager.getCurrentTracking();
            if (currentTracking) {
                
                // Calculate elapsed time
                const startTime = new Date(currentTracking.startTime);
                const endTime = new Date();
                const elapsedSeconds = Math.floor((endTime - startTime) / 1000);
                
                console.log(`⏰ Elapsed time: ${elapsedSeconds} seconds`);
                
                // Stop tracking in state manager
                const stoppedTask = this.parentWindow.trackingStateManager.stopTracking();
                
                // Database update is now handled by trackingStateManager._updateTaskInDatabase()
                // No need to call updateTaskWhenTrackingStops again here
                if (stoppedTask) {
                    // Just refresh the task list to show updated time
                    this.loadTasks();
                } else {
                }
            }
        }
    }

    /**
     * Create widget for individual task (removed - using TaskRenderer)
     */
    _createTaskWidget_OLD(task) {
        const taskBox = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 12,
            margin_top: 8,
            margin_bottom: 8,
            margin_start: 12,
            margin_end: 12
        });

        // Template icon (if created from template)
        if (task.createdFromTemplate && task.templateIcon) {
            const templateIcon = new Gtk.Label({
                label: task.templateIcon,
                css_classes: ['template-icon', 'dim-label'],
                width_request: 24,
                height_request: 24,
                halign: Gtk.Align.CENTER,
                valign: Gtk.Align.CENTER
            });
            taskBox.append(templateIcon);
        }

        // Task info
        const infoBox = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 4,
            hexpand: true
        });

        // Task name with template indicator
        const taskNameBox = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 6,
            halign: Gtk.Align.START
        });

        const nameLabel = new Label({
            text: task.name,
            cssClasses: ['heading'],
            halign: Gtk.Align.START,
            ellipsize: Pango.EllipsizeMode.END
        });
        taskNameBox.append(nameLabel.widget);

        // Template badge if created from template
        if (task.createdFromTemplate && task.templateName) {
            const templateBadge = new Gtk.Label({
                label: task.templateName,
                css_classes: ['caption', 'dim-label', 'template-badge'],
                halign: Gtk.Align.START
            });
            taskNameBox.append(templateBadge);
        }

        let detailsText = `${task.project_name || 'No Project'} • ${this._formatDate(task.created_at)} • ${this._formatDuration(task.duration || 0)}`;
        
        // Add client information if available
        if (task.client_name) {
            detailsText = `${task.project_name || 'No Project'} • ${task.client_name} • ${this._formatDate(task.created_at)} • ${this._formatDuration(task.duration || 0)}`;
        }
        
        // Add status information
        if (task.is_active) {
            detailsText += ' • Currently Tracking';
        }

        const detailsLabel = new Label({
            text: detailsText,
            cssClasses: ['caption', 'dim-label'],
            halign: Gtk.Align.START,
            ellipsize: Pango.EllipsizeMode.END
        });

        // Tags display
        if (task.tags && task.tags.length > 0) {
            const tagsLabel = new Label({
                text: `Tags: ${task.tags.join(', ')}`,
                cssClasses: ['caption', 'dim-label'],
                halign: Gtk.Align.START,
                ellipsize: Pango.EllipsizeMode.END
            });
            infoBox.append(taskNameBox);
            infoBox.append(detailsLabel.widget);
            infoBox.append(tagsLabel.widget);
        } else {
            infoBox.append(taskNameBox);
            infoBox.append(detailsLabel.widget);
        }

        // Action buttons
        const actionsBox = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 6
        });

        const editButton = new Button({
            iconName: 'document-edit-symbolic',
            cssClasses: ['flat', 'circular'],
            tooltipText: 'Edit task',
            onClick: () => this._editTask(task)
        });

        const deleteButton = new Button({
            iconName: 'edit-delete-symbolic',
            cssClasses: ['flat', 'circular', 'destructive-action'],
            tooltipText: 'Delete task',
            onClick: () => this._deleteTask(task)
        });

        actionsBox.append(editButton.widget);
        actionsBox.append(deleteButton.widget);

        // Active indicator
        if (task.is_active) {
            const activeIndicator = new Gtk.Box({
                css_classes: ['active-indicator'],
                width_request: 4
            });
            taskBox.append(activeIndicator);
        }

        taskBox.append(infoBox);
        taskBox.append(actionsBox);

        return taskBox;
    }

    /**
     * Load tasks from database
     */
    async loadTasks() {
        if (!this.taskManager) {
            console.error('TasksPage: TaskManager not initialized');
            return;
        }

        // Refresh allProjects reference from parent window
        if (this.parentWindow && this.parentWindow.allProjects) {
            this.allProjects = this.parentWindow.allProjects;
        }

        this.showLoading('Loading tasks...');
        
        try {
            // Get tasks from database with filtering options
            const filterOptions = {
                searchQuery: this.searchQuery,
                isActive: this.activeFilter === 'active' ? true : undefined,
                limit: this.itemsPerPage * 5, // Load more for better filtering
            };
            
            // Add date filtering based on active filter
            if (this.activeFilter === 'today') {
                const today = new Date().toISOString().split('T')[0];
                filterOptions.dateFrom = today;
                filterOptions.dateTo = today;
            } else if (this.activeFilter === 'week') {
                const now = new Date();
                const monday = new Date(now);
                monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
                
                const sunday = new Date(monday);
                sunday.setDate(monday.getDate() + 6);
                
                filterOptions.dateFrom = monday.toISOString().split('T')[0];
                filterOptions.dateTo = sunday.toISOString().split('T')[0];
            }
            
            const result = this.taskManager.getFilteredTasks(filterOptions);
            
            // Ensure we always have an array
            this.tasks = Array.isArray(result) ? result : [];
            this.filteredTasks = [...this.tasks];
            this._updateTaskDisplay();
            
        } catch (error) {
            console.error('❌ Error loading tasks:', error);
            this.showError('Load Error', 'Failed to load tasks: ' + error.message);
            this.tasks = [];
            this.filteredTasks = [];
        } finally {
            this.hideLoading();
        }
    }

    /**
     * Show empty state with helpful hint
     */
    _showEmptyState() {
        if (!this.taskList) return;

        // Create empty state hint
        const emptyStateRow = new Adw.ActionRow();
        
        const hintBox = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 8,
            halign: Gtk.Align.CENTER,
            valign: Gtk.Align.CENTER,
            margin_top: 32,
            margin_bottom: 32,
            margin_start: 24,
            margin_end: 24
        });

        // Icon
        const icon = new Gtk.Image({
            icon_name: 'view-list-symbolic',
            pixel_size: 48,
            css_classes: ['dim-label']
        });

        // Main message
        const message = new Gtk.Label({
            label: this._getEmptyStateMessage(),
            css_classes: ['title-3'],
            halign: Gtk.Align.CENTER,
            wrap: true,
            wrap_mode: Pango.WrapMode.WORD_CHAR,
            justify: Gtk.Justification.CENTER
        });

        // Helpful hint
        const hint = new Gtk.Label({
            label: 'Click the + button above to create your first task, or use templates for quick setup',
            css_classes: ['caption', 'dim-label'],
            halign: Gtk.Align.CENTER,
            wrap: true,
            wrap_mode: Pango.WrapMode.WORD_CHAR,
            justify: Gtk.Justification.CENTER
        });

        hintBox.append(icon);
        hintBox.append(message);
        hintBox.append(hint);

        emptyStateRow.set_child(hintBox);
        emptyStateRow.set_activatable(false);
        emptyStateRow.set_selectable(false);

        this.taskList.append(emptyStateRow);
    }

    /**
     * Get appropriate empty state message based on current filter
     */
    _getEmptyStateMessage() {
        if (this.searchQuery) {
            return `No tasks found for "${this.searchQuery}"`;
        }

        switch (this.activeFilter) {
            case 'today':
                return 'No tasks for today';
            case 'week':
                return 'No tasks for this week';
            case 'active':
                return 'No active tasks';
            default:
                return 'No tasks yet';
        }
    }

    /**
     * Get widget (compatibility method for page components)
     */
    getWidget() {
        // Tasks page uses existing UI template, so return null
        // The content is already in place in the UI template
        return null;
    }

    /**
     * Refresh page data
     */
    async refresh() {
        try {
            await this.loadTasks();
        } catch (error) {
            console.error('TasksPage refresh failed:', error);
        }
    }

    /**
     * Show loading state
     */
    showLoading(message = 'Loading...') {
        console.log(`TasksPage: ${message}`);
        // Could show spinner in UI if needed
    }

    /**
     * Hide loading state
     */
    hideLoading() {
        console.log('TasksPage: Loading finished');
        // Could hide spinner in UI if needed
    }

    /**
     * Show error message
     */
    showError(message) {
        console.error(`TasksPage Error: ${message}`);
        // Could show error dialog in UI if needed
    }

    // Helper methods (stubs - would be implemented with actual logic)
    _fetchTasks() { return Promise.resolve([]); }
    _formatDate(date) { return new Date(date).toLocaleDateString(); }
    _formatDuration(seconds) { return `${Math.floor(seconds/60)}m`; }
    _isToday(date) { return false; }
    _isThisWeek(date) { return false; }
    _startTracking(data) { console.log('Start tracking:', data); }
    _stopTracking() { console.log('Stop tracking'); }
    _editTask(task) { 
        const dialog = new Adw.AlertDialog({
            heading: 'Edit Task',
            body: `Modify "${task.name}"`
        });

        // Create inline form layout
        const form = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 12,
            margin_top: 12,
            margin_bottom: 12,
            margin_start: 12,
            margin_end: 12,
            width_request: 600
        });

        // 1. Task name input
        const nameEntry = new Gtk.Entry({
            text: task.name || '',
            placeholder_text: 'Task name',
            hexpand: true
        });

        // 2. Project button with dropdown selector
        let selectedProject = this.parentWindow?.allProjects?.find(p => p.id === task.project_id) || 
                             { id: 1, name: 'Default', color: '#cccccc', icon: 'folder-symbolic' };

        const projectButton = new Gtk.Button({
            width_request: 150,
            css_classes: ['flat']
        });

        const updateProjectButton = (project) => {
            const projectBox = new Gtk.Box({
                orientation: Gtk.Orientation.HORIZONTAL,
                spacing: 6
            });

            // Project icon
            let projectIcon;
            if (project.icon && project.icon.startsWith('emoji:')) {
                const emoji = project.icon.substring(6);
                projectIcon = new Gtk.Label({
                    label: emoji,
                    css_classes: ['emoji-icon']
                });
            } else {
                projectIcon = new Gtk.Image({
                    icon_name: project.icon || 'folder-symbolic',
                    pixel_size: 16
                });
            }

            // Project name
            const projectLabel = new Gtk.Label({
                label: project.name,
                ellipsize: Pango.EllipsizeMode.END,
                max_width_chars: 13
            });

            // Dropdown arrow
            const arrow = new Gtk.Image({
                icon_name: 'pan-down-symbolic',
                pixel_size: 12,
                opacity: 0.7
            });

            projectBox.append(projectIcon);
            projectBox.append(projectLabel);
            projectBox.append(arrow);

            // Apply project color styling
            const iconColor = getProjectIconColor(project);
            const projectProvider = new Gtk.CssProvider();
            projectProvider.load_from_string(`
                button {
                    background-color: ${project.color};
                    border-radius: 6px;
                    padding: 6px 10px;
                }
                button:hover {
                    filter: brightness(1.1);
                }
                label {
                    color: ${iconColor};
                    font-weight: 500;
                }
            `);
            projectButton.get_style_context().add_provider(projectProvider, Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION);
            
            projectButton.set_child(projectBox);
        };

        // Initialize button display
        updateProjectButton(selectedProject);

        // Project button click handler
        projectButton.connect('clicked', () => {
            if (this.parentWindow && this.parentWindow._showProjectSelector) {
                // Create a callback to update the selection
                const originalMethod = this.parentWindow._updateProjectButtonsDisplay;
                this.parentWindow._updateProjectButtonsDisplay = (projectName) => {
                    // Find and update selected project
                    const newProject = this.parentWindow.allProjects?.find(p => p.name === projectName);
                    if (newProject) {
                        selectedProject = newProject;
                        updateProjectButton(newProject);
                    }
                    // Call original method
                    if (originalMethod) {
                        originalMethod.call(this.parentWindow, projectName);
                    }
                };
                
                this.parentWindow._showProjectSelector(projectButton);
            }
        });

        // 3. Client dropdown selector
        let selectedClient = this.parentWindow?.allClients?.find(c => c.id === task.client_id) || 
                            { id: 1, name: 'Default Client', rate: 0, currency: 'USD' };

        const clientDropdown = new ClientDropdown(
            this.parentWindow?.allClients || [],
            selectedClient.id,
            (newSelectedClient) => {
                selectedClient = newSelectedClient;
                console.log(`TasksPage client selected: ${newSelectedClient.name}`);
                if (this.parentWindow) {
                    this.parentWindow.currentClientId = newSelectedClient.id;
                    if (this.parentWindow._updateClientButtonsDisplay) {
                        this.parentWindow._updateClientButtonsDisplay(newSelectedClient.name);
                    }
                }
            }
        );

        const clientButton = clientDropdown.getWidget();
        clientButton.set_size_request(140, 36);

        // Assemble inline layout
        form.append(nameEntry);
        form.append(projectButton);
        form.append(clientButton);

        dialog.set_extra_child(form);
        dialog.add_response('cancel', 'Cancel');
        dialog.add_response('save', 'Save Changes');
        dialog.set_response_appearance('save', Adw.ResponseAppearance.SUGGESTED);

        dialog.connect('response', (dialog, response) => {
            if (response === 'save') {
                const name = nameEntry.get_text().trim();
                
                if (!name) {
                    const errorDialog = new Adw.AlertDialog({
                        heading: 'Invalid Input',
                        body: 'Task name is required'
                    });
                    errorDialog.add_response('ok', 'OK');
                    errorDialog.present(this.parentWindow);
                    return;
                }

                // Update task with new name, project, and client
                this._updateTask(task.id, { 
                    name,
                    project_id: selectedProject.id,
                    client_id: selectedClient.id
                });
            }
            dialog.close();
        });

        dialog.present(this.parentWindow);
    }
    
    _deleteTask(task) { 
        
        const dialog = new Adw.AlertDialog({
            heading: 'Delete Task',
            body: `Are you sure you want to delete "${task.name}"?\n\nThis action cannot be undone.`
        });

        dialog.add_response('cancel', 'Cancel');
        dialog.add_response('delete', 'Delete');
        dialog.set_response_appearance('delete', Adw.ResponseAppearance.DESTRUCTIVE);

        dialog.connect('response', (dialog, response) => {
            if (response === 'delete') {
                this._performDeleteTask(task.id);
            }
            dialog.close();
        });

        dialog.present(this.parentWindow);
    }

    _updateTask(taskId, taskData) {
        if (!this.taskManager) {
            console.error('TasksPage: TaskManager not initialized');
            return;
        }

        try {
            this.taskManager.updateTask(taskId, taskData);
            this.loadTasks(); // Reload to show updated task
            
            const toast = Adw.Toast.new('Task updated successfully');
            if (this.parentWindow.toast_overlay) {
                this.parentWindow.toast_overlay.add_toast(toast);
            }
            
        } catch (error) {
            console.error('❌ Error updating task:', error);
            this.showError('Update Error', 'Failed to update task: ' + error.message);
        }
    }

    _performDeleteTask(taskId) {
        if (!this.taskManager) {
            console.error('TasksPage: TaskManager not initialized');
            return;
        }

        try {
            this.taskManager.deleteTask(taskId);
            this.loadTasks(); // Reload to remove deleted task
            
            const toast = Adw.Toast.new('Task deleted successfully');
            if (this.parentWindow.toast_overlay) {
                this.parentWindow.toast_overlay.add_toast(toast);
            }
            
        } catch (error) {
            console.error('❌ Error deleting task:', error);
            this.showError('Delete Error', 'Failed to delete task: ' + error.message);
        }
    }
    
    _deleteSelectedTasks() {
        
        // TaskRenderer uses TasksPage (this) as parentWindow, so selectedTasks are stored in this.selectedTasks
        const selectedTasks = this.selectedTasks;
        
        if (!selectedTasks || selectedTasks.size === 0) {
            
            // Show a toast to inform user
            const toast = Adw.Toast.new('No tasks selected. Right-click a task to select it first.');
            if (this.parentWindow.toast_overlay) {
                this.parentWindow.toast_overlay.add_toast(toast);
            }
            return;
        }
        
        const selectedTaskIds = Array.from(selectedTasks);
        const taskCount = selectedTaskIds.length;
        
        
        // Show confirmation dialog
        const message = taskCount === 1 ? 
            'Are you sure you want to delete this task?' : 
            `Are you sure you want to delete these ${taskCount} tasks?`;
            
            
        const dialog = new Adw.MessageDialog({
            transient_for: this.parentWindow,
            modal: true,
            heading: 'Delete Tasks',
            body: message
        });
        
        dialog.add_response('cancel', 'Cancel');
        dialog.add_response('delete', 'Delete');
        dialog.set_response_appearance('delete', Adw.ResponseAppearance.DESTRUCTIVE);
        dialog.set_default_response('delete');
        
        dialog.connect('response', (dialog, response) => {
            if (response === 'delete') {
                this._performTaskDeletion(selectedTasks, selectedTaskIds, taskCount);
            } else {
            }
            dialog.close();
        });
        
        dialog.present();
    }
    
    _performTaskDeletion(selectedTasks, selectedTaskIds, taskCount) {
        
        try {
            
            // Use the taskManager's deleteTasks method for multiple deletions
            const deleteResult = this.taskManager.deleteTasks(selectedTaskIds);
            
            // Clear selection
            selectedTasks.clear();
            
            // Reload task list
            this.loadTasks();
            
            // Show success toast
            const message = taskCount === 1 ? 'Task deleted successfully' : `${taskCount} tasks deleted successfully`;
            const toast = Adw.Toast.new(message);
            if (this.parentWindow.toast_overlay) {
                this.parentWindow.toast_overlay.add_toast(toast);
            }
            
        } catch (error) {
            console.error('❌ Error deleting selected tasks:', error);
            console.error('❌ Stack trace:', error.stack);
            this.showError('Delete Error', 'Failed to delete selected tasks: ' + error.message);
        }
    }
    
    _previousPage() { if (this.currentPage > 0) { this.currentPage--; this._updateTaskDisplay(); }}
    _nextPage() { this.currentPage++; this._updateTaskDisplay(); }
    _updatePaginationInfo(totalPages) { 
        if (totalPages <= 1) {
            // Hide pagination completely when not needed
            if (this.pageInfo) this.pageInfo.set_visible(false);
            if (this.prevPageBtn) this.prevPageBtn.set_visible(false);
            if (this.nextPageBtn) this.nextPageBtn.set_visible(false);
            
            // Also hide the pagination container if accessible
            if (this.paginationBox) {
                this.paginationBox.set_visible(false);
            }
        } else {
            // Show and update pagination when needed
            if (this.pageInfo) {
                this.pageInfo.set_visible(true);
                this.pageInfo.set_label(`Page ${this.currentPage + 1} of ${totalPages}`);
            }
            
            if (this.prevPageBtn) {
                this.prevPageBtn.set_visible(true);
                this.prevPageBtn.set_sensitive(this.currentPage > 0);
            }
            
            if (this.nextPageBtn) {
                this.nextPageBtn.set_visible(true);
                this.nextPageBtn.set_sensitive(this.currentPage < totalPages - 1);
            }
            
            // Show the pagination container if accessible
            if (this.paginationBox) {
                this.paginationBox.set_visible(true);
            }
        }
    }
    showAddTaskDialog() {
        const dialog = new Adw.AlertDialog({
            heading: 'Add New Task',
            body: 'Create a new task for tracking your work'
        });

        const form = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 12,
            margin_top: 12,
            margin_bottom: 12,
            margin_start: 12,
            margin_end: 12,
            width_request: 400
        });

        // Task name
        const nameLabel = new Gtk.Label({
            label: 'Task Name:',
            halign: Gtk.Align.START
        });
        
        const nameEntry = new Gtk.Entry({
            placeholder_text: 'Enter task name...'
        });

        // Task description
        const descLabel = new Gtk.Label({
            label: 'Description (optional):',
            halign: Gtk.Align.START
        });

        const descScrolled = new Gtk.ScrolledWindow({
            height_request: 100,
            hscrollbar_policy: Gtk.PolicyType.NEVER
        });

        const descTextView = new Gtk.TextView({
            wrap_mode: Gtk.WrapMode.WORD
        });
        
        descScrolled.set_child(descTextView);

        // Project selection (if available)
        let projectCombo = null;
        if (this.parentWindow.projectManager) {
            const projectLabel = new Gtk.Label({
                label: 'Project:',
                halign: Gtk.Align.START
            });

            projectCombo = new Gtk.ComboBoxText();
            
            try {
                const projects = this.parentWindow.projectManager.getAllProjects();
                projects.forEach(project => {
                    projectCombo.append(project.id.toString(), project.name);
                });
                
                // Set current project as default
                if (this.parentWindow.currentProjectId) {
                    projectCombo.set_active_id(this.parentWindow.currentProjectId.toString());
                }
            } catch (error) {
                console.error('Error loading projects for task dialog:', error);
            }

            form.append(projectLabel);
            form.append(projectCombo);
        }

        form.append(nameLabel);
        form.append(nameEntry);
        form.append(descLabel);
        form.append(descScrolled);

        dialog.set_extra_child(form);
        dialog.add_response('cancel', 'Cancel');
        dialog.add_response('create', 'Create Task');
        dialog.set_response_appearance('create', Adw.ResponseAppearance.SUGGESTED);

        dialog.connect('response', (dialog, response) => {
            if (response === 'create') {
                const name = nameEntry.get_text().trim();
                const description = descTextView.get_buffer().get_text(
                    descTextView.get_buffer().get_start_iter(),
                    descTextView.get_buffer().get_end_iter(),
                    false
                ).trim();
                
                if (!name) {
                    const errorDialog = new Adw.AlertDialog({
                        heading: 'Invalid Input',
                        body: 'Task name is required'
                    });
                    errorDialog.add_response('ok', 'OK');
                    errorDialog.present(this.parentWindow);
                    return;
                }

                // Get selected project ID
                let projectId = this.parentWindow.currentProjectId || 1;
                if (projectCombo && projectCombo.get_active_id()) {
                    projectId = parseInt(projectCombo.get_active_id());
                }

                this._createTask({ name, description, projectId });
            }
            dialog.close();
        });

        // Focus task name entry
        nameEntry.grab_focus();
        
        dialog.present(this.parentWindow);
    }

    /**
     * Create a regular task
     */
    _createTask(taskData) {
        if (!this.taskManager) {
            console.error('TasksPage: TaskManager not initialized');
            return;
        }

        console.log('➕ Creating new task:', taskData);
        
        try {
            this.taskManager.createTask(taskData);
            
            // Reload tasks to show the new one
            this.loadTasks();
            
            
            // Show success message
            const toast = Adw.Toast.new(`Task "${taskData.name}" created successfully`);
            if (this.parentWindow.toast_overlay) {
                this.parentWindow.toast_overlay.add_toast(toast);
            }
            
        } catch (error) {
            console.error('❌ Error creating task:', error);
            this.showError('Creation Error', 'Failed to create task: ' + error.message);
        }
    }

    /**
     * Show task template selection dialog
     */
    showTaskTemplateDialog() {
        const templateDialog = new TaskTemplateDialog(this.parentWindow, (task) => {
            if (task) {
                this._createTaskFromTemplate(task);
            } else {
                // User selected blank task, show regular add dialog
                this.showAddTaskDialog();
            }
        });
        
        templateDialog.show();
    }

    /**
     * Create task from template data
     */
    _createTaskFromTemplate(templateTask) {
        if (!this.taskManager) {
            console.error('TasksPage: TaskManager not initialized');
            return;
        }

        
        try {
            // Create task data for database
            const taskData = {
                name: templateTask.name,
                description: templateTask.description,
                projectId: this.parentWindow.currentProjectId || 1 // Use current project selection
            };
            
            // Create task in database
            this.taskManager.createTask(taskData);
            
            // Reload tasks to show the new one
            this.loadTasks();
            
            
            // Show success message
            const toast = Adw.Toast.new(`Task "${templateTask.name}" created successfully`);
            if (this.parentWindow.toast_overlay) {
                this.parentWindow.toast_overlay.add_toast(toast);
            }
            
        } catch (error) {
            console.error('❌ Error creating task from template:', error);
            this.showError('Creation Error', 'Failed to create task: ' + error.message);
        }
    }
    
    /**
     * Update the duration display of the active task in real-time
     */
    _updateActiveTaskDuration(taskInfo, elapsedTime) {
        if (!taskInfo || !this.taskRenderer) return;
        
        try {
            // Format elapsed time as HH:MM:SS
            const hours = Math.floor(elapsedTime / 3600);
            const minutes = Math.floor((elapsedTime % 3600) / 60);
            const seconds = elapsedTime % 60;
            const formattedTime = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
            
            // Find and update the active task in the UI
            // The TaskRenderer should provide a method to update active task duration
            if (this.taskRenderer.updateActiveTaskDuration) {
                this.taskRenderer.updateActiveTaskDuration(taskInfo.name, formattedTime);
            }
        } catch (error) {
            console.error('❌ Error updating active task duration:', error);
        }
    }
    
    /**
     * Cleanup method to unsubscribe from tracking state changes
     */
    destroy() {
        if (this.trackingUnsubscribe) {
            this.trackingUnsubscribe();
        }
    }
}