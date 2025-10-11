import Gtk from 'gi://Gtk';
import Adw from 'gi://Adw?version=1';
import Gdk from 'gi://Gdk';
import GLib from 'gi://GLib';
import { TaskRowTemplate } from '../../components/complex/TaskRowTemplate.js';
import { TaskStackTemplate } from '../../components/complex/TaskStackTemplate.js';

/**
 * Tasks management page
 * Recreates the old UI from window.blp programmatically
 */
export class TasksPage {
    constructor(config = {}) {
        this.app = config.app;
        this.parentWindow = config.parentWindow;
        this.coreBridge = config.coreBridge;

        // Task-specific state
        this.tasks = [];
        this.filteredTasks = [];

        // Subscribe to Core events for automatic updates
        this._subscribeToCore();
    }

    /**
     * Subscribe to Core events to auto-update task list
     */
    _subscribeToCore() {
        if (!this.coreBridge) return;

        // Reload tasks when tracking starts/stops (creates new time entries)
        this.coreBridge.onUIEvent('tracking-started', () => {
            // Delay to ensure DB is updated
            setTimeout(() => this.loadTasks(), 300);
        });

        this.coreBridge.onUIEvent('tracking-stopped', () => {
            this.loadTasks();
        });

        // Reload when tasks are created/updated
        this.coreBridge.onUIEvent('task-created', () => {
            this.loadTasks();
        });

        this.coreBridge.onUIEvent('task-updated', () => {
            this.loadTasks();
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

        // Load tasks on initialization
        this.loadTasks();

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
        // Original design adapted to Core architecture
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
        // Allow editing task name during tracking (update on Enter)
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
     * Connect tracking widget to Core for state synchronization
     */
    _connectTrackingToCore() {
        if (!this.coreBridge) {
            console.warn('⚠️ CoreBridge not available - tracking disabled');
            return;
        }

        // Subscribe to Core events
        this.coreBridge.onUIEvent('tracking-started', (data) => {
            this._onTrackingStarted(data);
        });

        this.coreBridge.onUIEvent('tracking-stopped', (data) => {
            this._onTrackingStopped(data);
        });

        this.coreBridge.onUIEvent('tracking-updated', (data) => {
            this._onTrackingUpdated(data);
        });

        // Load initial state
        this._updateTrackingUIFromCore();

        console.log('✅ TasksPage tracking widget connected to Core');
    }

    /**
     * Update UI from Core state (no local state!)
     */
    _updateTrackingUIFromCore() {
        if (!this.coreBridge) return;

        const state = this.coreBridge.getTrackingState();

        if (state.isTracking) {
            // Tracking active - allow editing!
            this.taskNameEntry.set_text(state.currentTaskName || '');
            // Keep editable during tracking
            this.taskNameEntry.set_sensitive(true);
            this.projectBtn.set_sensitive(true);
            this.clientBtn.set_sensitive(true);

            this.trackButton.set_icon_name('media-playback-stop-symbolic');
            this.trackButton.set_tooltip_text(_('Stop tracking'));
            this.trackButton.remove_css_class('suggested-action');
            this.trackButton.add_css_class('destructive-action');

            this.actualTimeLabel.set_label(this._formatDuration(state.elapsedSeconds));

            // Start UI update timer
            this._startTrackingUITimer();
        } else {
            // Tracking idle
            this.taskNameEntry.set_text('');
            this.taskNameEntry.set_sensitive(true);
            this.projectBtn.set_sensitive(true);
            this.clientBtn.set_sensitive(true);

            this.trackButton.set_icon_name('media-playback-start-symbolic');
            this.trackButton.set_tooltip_text(_('Start tracking'));
            this.trackButton.remove_css_class('destructive-action');
            this.trackButton.add_css_class('suggested-action');

            this.actualTimeLabel.set_label('00:00:00');

            // Stop UI update timer
            this._stopTrackingUITimer();
        }
    }

    /**
     * Core event: tracking started
     */
    _onTrackingStarted(data) {
        console.log('📡 TasksPage: Tracking started');
        this._updateTrackingUIFromCore();
    }

    /**
     * Core event: tracking stopped
     */
    _onTrackingStopped(data) {
        console.log('📡 TasksPage: Tracking stopped');
        this._updateTrackingUIFromCore();
    }

    /**
     * Core event: tracking updated (every second)
     */
    _onTrackingUpdated(data) {
        const state = this.coreBridge.getTrackingState();
        this.actualTimeLabel.set_label(this._formatDuration(state.elapsedSeconds));

        // Update task name if changed (from other pages)
        if (state.currentTaskName && this.taskNameEntry.get_text() !== state.currentTaskName) {
            this.taskNameEntry.set_text(state.currentTaskName);
        }
    }

    /**
     * User clicked track button
     */
    async _toggleTracking() {
        if (!this.coreBridge) return;

        const state = this.coreBridge.getTrackingState();

        if (state.isTracking) {
            // Stop tracking
            try {
                await this.coreBridge.stopTracking();
            } catch (error) {
                console.error('Error stopping tracking:', error);
            }
        } else {
            // Start tracking - create or find task (ALL LOGIC IN CORE!)
            try {
                const taskName = this.taskNameEntry.get_text().trim();
                let task;

                if (taskName === '' || taskName.length === 0) {
                    // Empty input - create auto-indexed task via Core
                    task = await this.coreBridge.createAutoIndexedTask();
                    console.log(`Created auto-indexed task: ${task.name}`);
                } else {
                    // Has text - find or create task via Core
                    task = await this.coreBridge.findOrCreateTask(taskName);
                    console.log(`Using task: ${task.name}`);
                }

                // Start tracking with task ID
                await this.coreBridge.startTracking(task.id, null, null);
            } catch (error) {
                console.error('Error starting tracking:', error);
            }
        }
    }

    /**
     * UI update timer - refreshes time display from Core
     */
    _startTrackingUITimer() {
        if (this.trackingTimerId) return;

        this.trackingTimerId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1000, () => {
            const state = this.coreBridge.getTrackingState();
            if (state.isTracking) {
                this.actualTimeLabel.set_label(this._formatDuration(state.elapsedSeconds));
                return true; // Continue
            } else {
                this.trackingTimerId = null;
                return false; // Stop
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
        if (!state.isTracking) return; // Only update during tracking

        const newName = this.taskNameEntry.get_text().trim();
        if (!newName || newName === state.currentTaskName) return;

        try {
            await this.coreBridge.updateCurrentTaskName(newName);
            console.log(`✏️ Task name updated: ${newName}`);
        } catch (error) {
            console.error('Error updating task name:', error);
        }
    }

    _selectProject() {
        // TODO: Open project selector
        console.log('TODO: Select project');
    }

    _selectClient() {
        // TODO: Open client selector
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

        // Filter and search box
        const filterSearchBox = this._createFilterSearchBox();
        contentBox.append(filterSearchBox);

        // Tasks list
        const scrolledWindow = this._createTasksList();
        contentBox.append(scrolledWindow);

        return contentBox;
    }

    _createFilterSearchBox() {
        const box = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 0,
            margin_bottom: 12,
            css_classes: ['search-button-box'],
        });

        // Filter dropdown
        this.taskFilter = new Gtk.DropDown({
            model: Gtk.StringList.new([_('All'), _('Today'), _('This Week'), _('This Month')]),
            selected: 0,
        });
        box.append(this.taskFilter);

        // Search entry
        this.taskSearch = new Gtk.SearchEntry({
            placeholder_text: _('Search tasks...'),
            hexpand: true,
        });

        this.taskSearch.connect('search-changed', () => {
            const query = this.taskSearch.get_text();
            this._filterTasks(query);
        });

        box.append(this.taskSearch);

        return box;
    }

    _createTasksList() {
        const scrolledWindow = new Gtk.ScrolledWindow({
            vexpand: true,
            hscrollbar_policy: Gtk.PolicyType.NEVER,
        });

        this.taskList = new Gtk.ListBox({
            css_classes: ['content-box'],
            selection_mode: Gtk.SelectionMode.SINGLE,
        });

        scrolledWindow.set_child(this.taskList);

        return scrolledWindow;
    }

    /**
     * Load tasks from Core (TaskInstances with time entries)
     */
    async loadTasks() {
        if (!this.coreBridge) {
            console.error('No coreBridge available');
            return;
        }

        try {
            // Get TaskInstances from Core (these include task_name, project_name, client_name, total_time)
            const taskInstances = await this.coreBridge.getAllTaskInstances({
                sortBy: 'last_used_at' // Show recent first
            });

            this.tasks = taskInstances || [];
            this.filteredTasks = [...this.tasks];
            this._updateTasksDisplay();
        } catch (error) {
            console.error('Error loading tasks:', error);
        }
    }

    /**
     * Filter tasks based on search query
     */
    _filterTasks(query = '') {
        if (!query.trim()) {
            this.filteredTasks = [...this.tasks];
        } else {
            const lowerQuery = query.toLowerCase();
            this.filteredTasks = this.tasks.filter(task =>
                task.name.toLowerCase().includes(lowerQuery) ||
                (task.project_name && task.project_name.toLowerCase().includes(lowerQuery))
            );
        }
        this._updateTasksDisplay();
    }

    /**
     * Update tasks display with grouping (original UI design)
     */
    _updateTasksDisplay() {
        // Clear existing tasks
        let child = this.taskList.get_first_child();
        while (child) {
            const next = child.get_next_sibling();
            this.taskList.remove(child);
            child = next;
        }

        if (!this.filteredTasks || this.filteredTasks.length === 0) {
            // Show empty state
            this._showEmptyState();
            return;
        }

        // Group similar tasks by name+project+client (old design)
        const taskGroups = this._groupSimilarTasks(this.filteredTasks);

        // Render task groups
        this._renderTaskGroups(taskGroups);
    }

    /**
     * Group tasks by base name, project, and client (original logic from main branch)
     */
    _groupSimilarTasks(tasks) {
        const groups = new Map();

        tasks.forEach(taskInstance => {
            // Group by task name + project + client (like old system)
            // Now TaskInstance is created for each session, so stacking works
            const baseName = taskInstance.task_name;
            const projectName = taskInstance.project_name || '';
            const clientName = taskInstance.client_name || '';
            const groupKey = `${baseName}::${projectName}::${clientName}`;

            if (!groups.has(groupKey)) {
                groups.set(groupKey, {
                    groupKey: groupKey,
                    baseName: baseName,
                    tasks: [],
                    totalDuration: 0,
                    totalCost: 0,
                    latestTask: null
                });
            }

            const group = groups.get(groupKey);
            group.tasks.push(taskInstance);
            group.totalDuration += taskInstance.total_time || 0;

            // Calculate cost for this task instance
            const instanceCost = (taskInstance.total_time / 3600) * (taskInstance.client_rate || 0);
            group.totalCost += instanceCost;

            // Keep track of the most recently used task
            if (!group.latestTask ||
                new Date(taskInstance.last_used_at) > new Date(group.latestTask.last_used_at)) {
                group.latestTask = taskInstance;
            }
        });

        return Array.from(groups.values());
    }

    /**
     * Render task groups using templates (SAME UI as main branch)
     */
    _renderTaskGroups(taskGroups) {
        taskGroups.forEach(group => {
            let row;

            if (group.tasks.length === 1) {
                // Single task - use TaskRowTemplate
                const task = group.tasks[0];
                const template = new TaskRowTemplate(task, this);
                row = template.getWidget();
            } else {
                // Multiple tasks - use TaskStackTemplate (stack/expander)
                const template = new TaskStackTemplate(group, this);
                row = template.getWidget();
            }

            if (row) {
                this.taskList.append(row);
            }
        });
    }

    _showEmptyState() {
        if (!this.taskList) {
            // Show empty state
            const emptyRow = new Adw.ActionRow({
                title: _('No tasks found'),
                subtitle: _('Start tracking to create your first task'),
                sensitive: false,
            });
            this.taskList.append(emptyRow);
            return;
        }

        // Add tasks to list
        this.filteredTasks.forEach(task => {
            const row = this._createTaskRow(task);
            this.taskList.append(row);
        });
    }

    /**
     * Create a task row
     */
    _createTaskRow(task) {
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

        // Task info
        const infoBox = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 4,
            hexpand: true,
        });

        const nameLabel = new Gtk.Label({
            label: task.name,
            halign: Gtk.Align.START,
            valign: Gtk.Align.CENTER,
            css_classes: ['task-name-label'],
        });
        infoBox.append(nameLabel);

        const detailsLabel = new Gtk.Label({
            label: `${task.project_name || 'No project'} • ${this._formatDate(task.start)}`,
            halign: Gtk.Align.START,
            valign: Gtk.Align.CENTER,
            css_classes: ['caption', 'dim-label'],
        });
        infoBox.append(detailsLabel);

        mainBox.append(infoBox);

        // Time display
        const timeLabel = new Gtk.Label({
            label: this._formatDurationHMS(task.duration || 0),
            css_classes: ['time-display', 'monospace', 'dim-label'],
            valign: Gtk.Align.CENTER,
            halign: Gtk.Align.END,
            width_request: 100,
        });
        mainBox.append(timeLabel);

        row.set_child(mainBox);
        return row;
    }

    /**
     * Format duration in HH:MM:SS format
     */
    _formatDurationHMS(seconds) {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;
        return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }

    /**
     * Format date
     */
    _formatDate(dateStr) {
        if (!dateStr) return '';
        const date = new Date(dateStr);
        return date.toLocaleDateString();
    }

    /**
     * Refresh page data
     */
    async refresh() {
        await this.loadTasks();
    }
}
