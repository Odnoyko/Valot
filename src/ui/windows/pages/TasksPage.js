import Gtk from 'gi://Gtk';
import Adw from 'gi://Adw?version=1';
import Gdk from 'gi://Gdk';
import GLib from 'gi://GLib';
import { TaskRowTemplate } from '../../components/complex/TaskRowTemplate.js';
import { TaskStackTemplate } from '../../components/complex/TaskStackTemplate.js';
import { ProjectDropdown } from 'resource:///com/odnoyko/valot/ui/utils/projectDropdown.js';
import { ClientDropdown } from 'resource:///com/odnoyko/valot/ui/utils/clientDropdown.js';
import { getCurrencySymbol } from 'resource:///com/odnoyko/valot/data/currencies.js';
import { AdvancedTrackingWidget } from 'resource:///com/odnoyko/valot/ui/components/complex/AdvancedTrackingWidget.js';
import { MultipleTasksEditDialog } from 'resource:///com/odnoyko/valot/ui/components/dialogs/MultipleTasksEditDialog.js';
import { createRecoloredSVG } from 'resource:///com/odnoyko/valot/ui/utils/svgRecolor.js';

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
        this.currentTasksPage = 0;
        this.tasksPerPage = 25;

        // Selection state for stacks and tasks
        this.selectedTasks = new Set();  // Task IDs
        this.selectedStacks = new Set(); // Stack groupKeys

        // Row tracking for selection
        this.taskRowMap = new Map(); // taskId -> row widget
        this.stackRowMap = new Map(); // groupKey -> row widget

        // Template tracking for real-time updates
        this.taskTemplates = new Map(); // taskInstanceId -> template instance

        // Track the currently tracking task row for real-time updates
        this.trackingTaskTimeLabel = null; // Reference to time label of tracking task
        this.trackingTaskId = null; // ID of currently tracking task

        // Track expanded stacks to preserve state after reload
        this.expandedStacks = new Set(); // groupKey -> expanded state

        // Current tracking context (project/client selection)
        this.currentProjectId = 1;
        this.currentClientId = 1;

        // Subscribe to Core events for automatic updates
        this._subscribeToCore();

        // Validate context and initialize (async)
        this._initializeAsync();
    }

    /**
     * Async initialization - validate context before building UI
     */
    async _initializeAsync() {
        // Validate that current project/client exist
        await this._validateCurrentContext();
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

        // Real-time tracking updates (every second)
        this.coreBridge.onUIEvent('tracking-updated', (data) => {
            this._updateTrackingTimeDisplay();

            // If task name, project, or client changed, reload full list
            // Note: taskId and elapsedSeconds are sent every second, but we ignore them
            if (data && (data.taskName || data.projectId !== undefined || data.clientId !== undefined)) {
                this.loadTasks();
            } else {
                // Otherwise, just update the currently tracking task row's duration
                this._updateTrackingTaskRow();
            }
        });

        // Subscribe to project updates to refresh colors/icons
        this.coreBridge.onUIEvent('project-updated', (data) => {
            this._onProjectUpdated(data);
        });

        // Dropdowns subscribe to Core events themselves, no need to update them here
    }

    /**
     * Update time display for currently tracking task in real-time
     */
    async _updateTrackingTimeDisplay() {
        if (!this.coreBridge) return;

        const trackingState = this.coreBridge.getTrackingState();
        if (!trackingState.isTracking || !trackingState.currentTaskInstanceId) return;

        // Find the task instance that is being tracked
        const trackingTask = this.tasks.find(t =>
            t.task_id === trackingState.currentTaskId &&
            t.project_id === trackingState.currentProjectId &&
            t.client_id === trackingState.currentClientId
        );

        if (!trackingTask) return;

        try {
            // Get old completed time for this task instance
            const oldTime = await this.coreBridge.getCurrentTaskOldTime();
            const currentElapsed = trackingState.elapsedSeconds || 0;
            const totalTime = oldTime + currentElapsed;

            // Find the stack this task belongs to
            const taskGroups = this._groupSimilarTasks(this.filteredTasks);
            const taskGroup = taskGroups.find(group =>
                group.tasks.some(t => t.id === trackingTask.id)
            );

            if (taskGroup) {
                // Check if it's a stack (multiple tasks) or standalone task (single task)
                if (taskGroup.tasks.length === 1) {
                    // Standalone task - update TaskRowTemplate
                    const taskTemplate = this.taskTemplates.get(trackingTask.id);
                    if (taskTemplate) {
                        const timeLabel = taskTemplate.getTimeLabel();
                        const moneyLabel = taskTemplate.getMoneyLabel();
                        const trackButton = taskTemplate.getTrackButton();

                        if (timeLabel) {
                            const hours = Math.floor(totalTime / 3600);
                            const minutes = Math.floor((totalTime % 3600) / 60);
                            const secs = totalTime % 60;
                            const timeStr = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

                            timeLabel.set_label('● ' + timeStr);
                            timeLabel.remove_css_class('dim-label');
                            if (!timeLabel.has_css_class('caption')) {
                                timeLabel.add_css_class('caption');
                            }

                            // Update money
                            if (moneyLabel && trackingTask.client_rate > 0) {
                                const totalCost = (totalTime / 3600) * trackingTask.client_rate;
                                const currencySymbol = getCurrencySymbol(trackingTask.client_currency || 'EUR');
                                moneyLabel.set_label(`${currencySymbol}${totalCost.toFixed(2)}`);
                                moneyLabel.set_visible(true);
                                moneyLabel.remove_css_class('dim-label');
                                if (!moneyLabel.has_css_class('caption')) {
                                    moneyLabel.add_css_class('caption');
                                }
                            }

                            // Update track button icon to stop
                            if (trackButton) {
                                trackButton.set_icon_name('media-playback-stop-symbolic');
                                trackButton.set_tooltip_text(_('Stop tracking'));
                            }
                        }
                    }
                } else {
                    // Stack - update TaskStackTemplate
                    const stackTemplate = this.taskTemplates.get(`stack:${taskGroup.groupKey}`);
                    if (stackTemplate) {
                        const stackTimeLabel = stackTemplate.getTimeLabel();
                        const stackMoneyLabel = stackTemplate.getMoneyLabel();
                        const stackTrackButton = stackTemplate.getTrackButton();

                        if (stackTimeLabel) {
                            // Stack total time = all completed tasks + current tracking
                            const stackTotalTime = taskGroup.totalDuration + currentElapsed;
                            const hours = Math.floor(stackTotalTime / 3600);
                            const minutes = Math.floor((stackTotalTime % 3600) / 60);
                            const secs = stackTotalTime % 60;
                            const timeStr = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

                            stackTimeLabel.set_label('● ' + timeStr);
                            stackTimeLabel.remove_css_class('dim-label');
                            if (!stackTimeLabel.has_css_class('caption')) {
                                stackTimeLabel.add_css_class('caption');
                            }

                            // Update stack money
                            if (stackMoneyLabel && trackingTask.client_rate > 0) {
                                const stackTotalCost = taskGroup.totalCost + ((currentElapsed / 3600) * trackingTask.client_rate);
                                const currencySymbol = getCurrencySymbol(trackingTask.client_currency || 'EUR');
                                stackMoneyLabel.set_label(`${currencySymbol}${stackTotalCost.toFixed(2)}`);
                                stackMoneyLabel.set_visible(true);
                                stackMoneyLabel.remove_css_class('dim-label');
                                if (!stackMoneyLabel.has_css_class('caption')) {
                                    stackMoneyLabel.add_css_class('caption');
                                }
                            }

                            // Update track button icon to stop
                            if (stackTrackButton) {
                                stackTrackButton.set_icon_name('media-playback-stop-symbolic');
                                stackTrackButton.set_tooltip_text(_('Stop tracking'));
                            }
                        }
                    }
                }
            }
        } catch (error) {
            console.error('Error updating tracking time display:', error);
        }
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

        // Add keyboard shortcut: Enter to start/stop tracking
        this._setupKeyboardShortcuts(page);

        // Load tasks on initialization
        this.loadTasks();

        // Prevent search input from auto-focusing on startup
        if (this.taskList) {
            // Set focus to the task list instead of search
            this.taskList.set_can_focus(true);
            this.taskList.grab_focus();
        }

        return page;
    }

    /**
     * Setup keyboard shortcuts for the page
     */
    _setupKeyboardShortcuts(page) {
        const keyController = new Gtk.EventControllerKey();

        keyController.connect('key-pressed', (controller, keyval, keycode, state) => {
            // Enter key to toggle tracking
            if (keyval === Gdk.KEY_Return || keyval === Gdk.KEY_KP_Enter) {
                // Only if not typing in search or other inputs
                const focus = this.parentWindow ? this.parentWindow.get_focus() : null;

                // Allow Enter in task name entry (it has its own handler)
                if (focus === this.taskNameEntry) {
                    return false; // Let task name entry handle it
                }

                // Allow Enter in search entry
                if (focus && focus.constructor.name === 'GtkSearchEntry') {
                    return false;
                }

                // Otherwise, toggle tracking
                this._toggleTracking();
                return true; // Event handled
            }

            // Delete key is now handled at application level (MainWindow)
            // No need to handle it here

            return false; // Let other handlers process the event
        });

        page.add_controller(keyController);
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
            this.parentWindow.splitView.connect('notify::show-sidebar', updateSidebarButtonVisibility);
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

            // Get current keyboard state for Shift detection
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
                console.error('❌ No application reference!');
            }
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

        // Debounce timer for automatic name updates
        this.taskNameDebounceTimer = null;
        this._blockTaskNameUpdate = false;

        // Auto-update task name while typing (if tracking)
        this.taskNameEntry.connect('changed', () => {
            // Don't trigger update during programmatic changes
            if (this._blockTaskNameUpdate) return;

            const state = this.coreBridge?.getTrackingState();
            if (!state || !state.isTracking) return;

            // Clear previous timer
            if (this.taskNameDebounceTimer) {
                GLib.Source.remove(this.taskNameDebounceTimer);
            }

            // Set new timer - update after 250ms of no typing
            this.taskNameDebounceTimer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 250, () => {
                this.taskNameDebounceTimer = null;
                this._updateTaskNameFromInput();
                return false;
            });
        });

        // Enter key - start/stop tracking
        this.taskNameEntry.connect('activate', () => {
            this._toggleTracking();
        });

        box.append(this.taskNameEntry);

        // Project dropdown
        this._setupProjectDropdown();
        box.append(this.projectDropdown.getWidget());

        // Client dropdown
        this._setupClientDropdown();
        box.append(this.clientDropdown.getWidget());

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

    }

    /**
     * Update UI from Core state (no local state!)
     */
    _updateTrackingUIFromCore() {
        if (!this.coreBridge) return;

        const state = this.coreBridge.getTrackingState();

        if (state.isTracking) {
            // Tracking active - allow editing!
            const cursorPosition = this.taskNameEntry.get_position();
            const oldText = this.taskNameEntry.get_text();
            const newText = state.currentTaskName || '';

            this.taskNameEntry.set_text(newText);
            this.taskNameEntry.set_sensitive(true);

            // Restore cursor position if text didn't change, otherwise move to end
            if (oldText === newText && cursorPosition >= 0) {
                this.taskNameEntry.set_position(cursorPosition);
            } else {
                this.taskNameEntry.set_position(-1); // -1 = end of text
            }

            // Update dropdowns with current tracking context
            if (state.currentProjectId && this.projectDropdown) {
                this.currentProjectId = state.currentProjectId;
                this.projectDropdown.setCurrentProject(state.currentProjectId);
            }
            if (state.currentClientId && this.clientDropdown) {
                this.currentClientId = state.currentClientId;
                this.clientDropdown.setSelectedClient(state.currentClientId);
            }

            // Change icon to stop, but keep green color
            this.trackButton.set_icon_name('media-playback-stop-symbolic');
            this.trackButton.set_tooltip_text(_('Stop tracking'));
            // Keep suggested-action (green)
            if (!this.trackButton.has_css_class('suggested-action')) {
                this.trackButton.add_css_class('suggested-action');
            }

            this.actualTimeLabel.set_label(this._formatDuration(state.elapsedSeconds));

            // Start UI update timer
            this._startTrackingUITimer();
        } else {
            // Tracking idle - KEEP task name in input (don't clear it)
            this.taskNameEntry.set_sensitive(true);

            // Reset to default project/client
            this.currentProjectId = 1;
            this.currentClientId = 1;
            if (this.projectDropdown) {
                this.projectDropdown.setCurrentProject(1);
            }
            if (this.clientDropdown) {
                this.clientDropdown.setSelectedClient(1);
            }

            // Change icon to play, keep green
            this.trackButton.set_icon_name('media-playback-start-symbolic');
            this.trackButton.set_tooltip_text(_('Start tracking'));
            if (!this.trackButton.has_css_class('suggested-action')) {
                this.trackButton.add_css_class('suggested-action');
            }

            this.actualTimeLabel.set_label('00:00:00');

            // Stop UI update timer
            this._stopTrackingUITimer();
        }
    }

    /**
     * Core event: tracking started
     */
    _onTrackingStarted(data) {
        this._updateTrackingUIFromCore();
    }

    /**
     * Core event: tracking stopped
     */
    _onTrackingStopped(data) {
        this._updateTrackingUIFromCore();
    }

    /**
     * Core event: tracking updated (every second)
     */
    _onTrackingUpdated(data) {
        const state = this.coreBridge.getTrackingState();
        this.actualTimeLabel.set_label(this._formatDuration(state.elapsedSeconds));

        // Don't auto-update task name from state - user might be editing it
        // Name updates only on Enter key (activate event)
    }

    /**
     * User clicked track button
     */
    async _toggleTracking(pomodoroMode = false) {
        // Delegate to AdvancedTrackingWidget
        if (this.trackingWidget && this.trackingWidget._toggleTracking) {
            this.trackingWidget._toggleTracking(pomodoroMode);
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

    /**
     * Update task name from input (called automatically after typing stops)
     */
    async _updateTaskNameFromInput() {
        if (!this.coreBridge) return;

        const state = this.coreBridge.getTrackingState();
        if (!state.isTracking) return;

        const newName = this.taskNameEntry.get_text().trim();

        if (newName && newName !== state.currentTaskName) {
            try {
                // Temporarily block the changed event to prevent loop
                this._blockTaskNameUpdate = true;

                await this.coreBridge.updateCurrentTaskName(newName);

                // Reload tasks to show updated name
                await this.loadTasks();

                this._blockTaskNameUpdate = false;
            } catch (error) {
                console.error('❌ Error updating task name:', error);
                this._blockTaskNameUpdate = false;
            }
        }
    }

    /**
     * Setup project dropdown (loads data from Core itself)
     */
    _setupProjectDropdown() {
        this.projectDropdown = new ProjectDropdown(
            this.coreBridge,
            this.currentProjectId,
            async (selectedProject) => {
                this.currentProjectId = selectedProject.id;

                // If tracking, update Core with new project/client
                const state = this.coreBridge.getTrackingState();
                if (state.isTracking) {
                    await this.coreBridge.updateCurrentProjectClient(
                        this.currentProjectId === 1 ? null : this.currentProjectId,
                        this.currentClientId === 1 ? null : this.currentClientId
                    );
                    // Reload tasks to show updated project
                    await this.loadTasks();
                }
            }
        );
    }

    /**
     * Setup client dropdown (loads data from Core itself)
     */
    _setupClientDropdown() {
        this.clientDropdown = new ClientDropdown(
            this.coreBridge,
            this.currentClientId,
            async (selectedClient) => {
                this.currentClientId = selectedClient.id;

                // If tracking, update Core with new project/client
                const state = this.coreBridge.getTrackingState();
                if (state.isTracking) {
                    await this.coreBridge.updateCurrentProjectClient(
                        this.currentProjectId === 1 ? null : this.currentProjectId,
                        this.currentClientId === 1 ? null : this.currentClientId
                    );
                    // Reload tasks to show updated client
                    await this.loadTasks();
                }
            }
        );
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

        // Context bar (pagination or selection mode)
        const contextBar = this._createContextBar();
        contentBox.append(contextBar);

        return contentBox;
    }

    _createFilterSearchBox() {
        const box = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 0,
            margin_bottom: 12,
            css_classes: ['search-button-box'],
        });

        // Search entry
        this.taskSearch = new Gtk.SearchEntry({
            placeholder_text: _('Search tasks...'),
            hexpand: true,
        });

        this.taskSearch.connect('search-changed', () => {
            const query = this.taskSearch.get_text();
            this.currentTasksPage = 0;
            this._filterTasks(query).catch(err => {
                console.error('Error filtering tasks:', err);
            });
        });

        box.append(this.taskSearch);

        // Filter dropdown
        this.taskFilter = new Gtk.DropDown({
            model: Gtk.StringList.new([_('All'), _('Today'), _('This Week'), _('This Month')]),
            selected: 0,
        });
        this.taskFilter.connect('notify::selected', () => {
            this.currentTasksPage = 0;
            this._filterTasks(this.taskSearch.get_text());
        });
        box.append(this.taskFilter);

        return box;
    }

    _createTasksList() {
        // Container for both list and empty state
        this.tasksContainer = new Gtk.Stack({
            vexpand: true,
        });

        // Scrolled window with task list
        const scrolledWindow = new Gtk.ScrolledWindow({
            vexpand: true,
            hscrollbar_policy: Gtk.PolicyType.NEVER,
        });

        this.taskList = new Gtk.ListBox({
            css_classes: ['content-box'],
            selection_mode: Gtk.SelectionMode.NONE,
            overflow: Gtk.Overflow.HIDDEN,
        });

        scrolledWindow.set_child(this.taskList);

        // Empty state with custom layout
        const emptyStateBox = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 0,
            vexpand: true,
            valign: Gtk.Align.CENTER,
            halign: Gtk.Align.CENTER,
        });

        // Illustration (recolored to accent)
        const illustration = createRecoloredSVG(
            '/com/odnoyko/valot/data/illustrations/Task Page.svg',
            357.8,  // width
            171.04   // height
        );
        emptyStateBox.append(illustration);

        // Title
        const titleLabel = new Gtk.Label({
            label: _('No Tasks Yet'),
            css_classes: ['title-1'],
            margin_top: 0,
            margin_bottom: 0,
        });
        emptyStateBox.append(titleLabel);

        // Description
        const descLabel = new Gtk.Label({
            label: _('Start tracking time to create your tasks'),
            css_classes: ['dim-label'],
            margin_bottom: 0,
            margin_top: 0,
        });
        emptyStateBox.append(descLabel);

        // Circular play button
        const startButton = new Gtk.Button({
            icon_name: 'media-playback-start-symbolic',
            css_classes: ['circular', 'suggested-action'],
            halign: Gtk.Align.CENTER,
            margin_top: 14,
            width_request: 44,
            height_request: 44,
        });

        startButton.connect('clicked', async () => {
            try {
                // Create auto-indexed task (like "1", "2", etc.) with default project/client
                const task = await this.coreBridge.createAutoIndexedTask(
                    this.currentProjectId,
                    this.currentClientId
                );

                // Start tracking with the created task
                await this.coreBridge.startTracking(
                    task.id,
                    this.currentProjectId,
                    this.currentClientId
                );

                // Wait a bit for database to update
                await new Promise(resolve => GLib.timeout_add(GLib.PRIORITY_DEFAULT, 100, () => {
                    resolve();
                    return GLib.SOURCE_REMOVE;
                }));

                // Reload tasks to show the new task and hide empty state
                await this.loadTasks();
            } catch (error) {
                console.error('[TasksPage] Error starting tracking:', error);
            }
        });

        emptyStateBox.append(startButton);

        // Bottom Tasks illustration at the bottom of empty state
        const bottomTasksIllustration = createRecoloredSVG(
            '/com/odnoyko/valot/data/illustrations/Bottom Tasks.svg',
            440,  // width
            150   // height
        );
        bottomTasksIllustration.set_halign(Gtk.Align.CENTER);
        bottomTasksIllustration.set_margin_top(8);
        emptyStateBox.append(bottomTasksIllustration);

        // Add both to stack
        this.tasksContainer.add_named(scrolledWindow, 'tasks-list');
        this.tasksContainer.add_named(emptyStateBox, 'empty-state');

        return this.tasksContainer;
    }

    /**
     * Create context bar (pagination or selection mode)
     */
    _createContextBar() {
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

        this.prevTasksButton = new Gtk.Button({
            label: _('Back'),
            css_classes: ['flat'],
        });
        this.prevTasksButton.connect('clicked', () => this._previousPage());

        this.tasksPageInfo = new Gtk.Label({
            label: _('Page 1 of 1'),
            css_classes: ['dim-label'],
            hexpand: true,
        });

        this.nextTasksButton = new Gtk.Button({
            label: _('Next'),
            css_classes: ['flat'],
        });
        this.nextTasksButton.connect('clicked', () => this._nextPage());

        this.paginationBox.append(this.prevTasksButton);
        this.paginationBox.append(this.tasksPageInfo);
        this.paginationBox.append(this.nextTasksButton);

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

        const editBtn = new Gtk.Button({
            icon_name: 'document-edit-symbolic',
            tooltip_text: _('Edit Selected'),
            css_classes: ['flat'],
        });
        editBtn.connect('clicked', () => this._editSelectedTasks());

        const deleteBtn = new Gtk.Button({
            label: _('Delete'),
            css_classes: ['destructive-action'],
        });
        deleteBtn.connect('clicked', () => this._deleteSelectedTasks());

        this.selectionBox.append(cancelBtn);
        this.selectionBox.append(this.selectionLabel);
        this.selectionBox.append(editBtn);
        this.selectionBox.append(deleteBtn);

        // Add both to context bar
        this.contextBar.append(this.paginationBox);
        this.contextBar.append(this.selectionBox);

        return this.contextBar;
    }

    /**
     * Load tasks from Core (TaskInstances with time entries)
     */
    async loadTasks() {
        if (!this.coreBridge) {
            console.error('No coreBridge available');
            return;
        }

        // Clear tracking task reference since we're rebuilding the list
        this.trackingTaskTimeLabel = null;
        this.trackingTaskId = null;

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
     * Filter tasks based on search query and date filter
     */
    async _filterTasks(query = '') {
        let filtered = [...this.tasks];

        // Apply date filter (0=All, 1=Today, 2=This Week, 3=This Month)
        const selectedFilter = this.taskFilter?.get_selected() ?? 0;

        if (selectedFilter > 0) {
            const now = GLib.DateTime.new_now_local();
            let startDate, endDate;

            switch (selectedFilter) {
                case 1: // Today
                    startDate = GLib.DateTime.new_local(
                        now.get_year(),
                        now.get_month(),
                        now.get_day_of_month(),
                        0, 0, 0
                    );
                    endDate = GLib.DateTime.new_local(
                        now.get_year(),
                        now.get_month(),
                        now.get_day_of_month(),
                        23, 59, 59
                    );
                    break;

                case 2: // This Week (Monday to Sunday)
                    const dayOfWeek = now.get_day_of_week(); // 1=Monday, 7=Sunday
                    const daysToMonday = dayOfWeek - 1;
                    const monday = now.add_days(-daysToMonday);

                    startDate = GLib.DateTime.new_local(
                        monday.get_year(),
                        monday.get_month(),
                        monday.get_day_of_month(),
                        0, 0, 0
                    );

                    const sunday = monday.add_days(6);
                    endDate = GLib.DateTime.new_local(
                        sunday.get_year(),
                        sunday.get_month(),
                        sunday.get_day_of_month(),
                        23, 59, 59
                    );
                    break;

                case 3: // This Month (1st to last day)
                    startDate = GLib.DateTime.new_local(
                        now.get_year(),
                        now.get_month(),
                        1,
                        0, 0, 0
                    );

                    // Get last day of month
                    const nextMonth = now.add_months(1);
                    const firstDayNextMonth = GLib.DateTime.new_local(
                        nextMonth.get_year(),
                        nextMonth.get_month(),
                        1,
                        0, 0, 0
                    );
                    const lastDayThisMonth = firstDayNextMonth.add_days(-1);

                    endDate = GLib.DateTime.new_local(
                        lastDayThisMonth.get_year(),
                        lastDayThisMonth.get_month(),
                        lastDayThisMonth.get_day_of_month(),
                        23, 59, 59
                    );
                    break;
            }

            if (startDate && endDate) {
                // Get task instance IDs that have time entries with end_time in this period (from Core)
                const taskInstanceIds = await this.coreBridge.getTaskInstanceIdsForPeriod({ startDate, endDate });
                const taskIdsSet = new Set(taskInstanceIds);

                // Filter tasks by IDs
                filtered = filtered.filter(task => taskIdsSet.has(task.id));
            }
        }

        // Apply search query filter
        if (query.trim()) {
            const lowerQuery = query.toLowerCase();
            filtered = filtered.filter(task =>
                (task.name && task.name.toLowerCase().includes(lowerQuery)) ||
                (task.project_name && task.project_name.toLowerCase().includes(lowerQuery))
            );
        }

        this.filteredTasks = filtered;
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

        // Clear row maps (but keep selections)
        this.taskRowMap.clear();
        this.stackRowMap.clear();

        // Clear template map
        this.taskTemplates.clear();

        if (!this.filteredTasks || this.filteredTasks.length === 0) {
            this.currentTasksPage = 0;
            this._showEmptyState();
            this._updatePaginationInfo();
            this._updateSelectionUI();
            return;
        }

        // Show tasks list (switch away from empty state)
        if (this.tasksContainer) {
            this.tasksContainer.set_visible_child_name('tasks-list');
        }

        // Group all tasks first
        const allTaskGroups = this._groupSimilarTasks(this.filteredTasks);

        // Calculate pagination based on GROUPS
        const totalPages = Math.ceil(allTaskGroups.length / this.tasksPerPage);

        // Adjust current page if needed
        if (this.currentTasksPage >= totalPages && totalPages > 0) {
            this.currentTasksPage = totalPages - 1;
        }

        const start = this.currentTasksPage * this.tasksPerPage;
        const end = Math.min(start + this.tasksPerPage, allTaskGroups.length);
        const groupsToShow = allTaskGroups.slice(start, end);

        // Render paginated groups
        this._renderTaskGroups(groupsToShow);

        // Update pagination/selection UI
        this._updatePaginationInfo();
        this._updateSelectionUI();

        // Update tracking time display for currently tracking task
        this._updateTrackingTimeDisplay();
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

                // Store template for real-time updates
                this.taskTemplates.set(task.id, template);

                // Add to task row map for selection tracking
                this.taskRowMap.set(task.id, row);

                // Add right-click selection handler
                this._addTaskSelectionHandlers(row, task);

                // Apply selection styling if selected
                if (this.selectedTasks.has(task.id)) {
                    row.add_css_class('selected-task');
                }
            } else {
                // Multiple tasks - use TaskStackTemplate (stack/expander)
                const template = new TaskStackTemplate(group, this);
                row = template.getWidget();

                // Store template for real-time updates by groupKey (for stacks)
                this.taskTemplates.set(`stack:${group.groupKey}`, template);

                // Add to stack row map for selection tracking
                this.stackRowMap.set(group.groupKey, row);

                // Add right-click selection handler
                this._addStackSelectionHandlers(row, group);

                // Apply selection styling if selected
                if (this.selectedStacks.has(group.groupKey)) {
                    row.add_css_class('selected-task');
                }

                // Restore expanded state if was previously expanded
                if (this.expandedStacks.has(group.groupKey)) {
                    row.set_expanded(true);
                }

                // Handle collapse/expand events
                row.connect('notify::expanded', () => {
                    this._onStackExpandedChanged(row, group);
                });
            }

            if (row) {
                this.taskList.append(row);
            }
        });
    }

    _showEmptyState() {
        if (!this.taskList) {
            return;
        }

        // Check if we have tasks
        if (this.filteredTasks.length === 0) {
            // Show empty state page
            if (this.tasksContainer) {
                this.tasksContainer.set_visible_child_name('empty-state');
            }
        } else {
            // Show tasks list
            if (this.tasksContainer) {
                this.tasksContainer.set_visible_child_name('tasks-list');
            }

            // Add tasks to list
            this.filteredTasks.forEach(task => {
                const row = this._createTaskRow(task);
                this.taskList.append(row);
            });
        }
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
            label: `${task.project_name || 'No project'} • ${this._formatDate(task.last_used_at)}`,
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

        // Store reference if this is the currently tracking task
        const trackingState = this.coreBridge.getTrackingState();
        if (trackingState.isTracking && trackingState.taskInstanceId === task.id) {
            this.trackingTaskTimeLabel = timeLabel;
            this.trackingTaskId = task.id;
        }

        row.set_child(mainBox);
        return row;
    }

    /**
     * Update only the tracking task row's duration (called every second)
     */
    _updateTrackingTaskRow() {
        const trackingState = this.coreBridge.getTrackingState();

        // If not tracking or no reference, nothing to update
        if (!trackingState.isTracking || !this.trackingTaskTimeLabel) {
            return;
        }

        // Get task instance to calculate total duration
        const taskInstance = this.coreBridge.getTaskInstance(trackingState.taskInstanceId);
        if (!taskInstance) return;

        // Calculate total duration: existing duration + current elapsed time
        const totalDuration = (taskInstance.duration || 0) + (trackingState.elapsedSeconds || 0);

        // Update just the time label
        this.trackingTaskTimeLabel.set_label(this._formatDurationHMS(totalDuration));
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
        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const year = date.getFullYear();
        return `${day}.${month}.${year}`;
    }

    /**
     * Handle stack expand/collapse
     */
    _onStackExpandedChanged(row, group) {
        const isExpanded = row.get_expanded();

        // Save expanded state
        if (isExpanded) {
            this.expandedStacks.add(group.groupKey);
        } else {
            this.expandedStacks.delete(group.groupKey);

            // Collapsing - if not all tasks are selected, deselect all tasks in this stack
            if (!this.selectedStacks.has(group.groupKey)) {
                group.tasks.forEach(task => {
                    this.selectedTasks.delete(task.id);
                });
                this._updateSelectionUI();
            }
        }
        // When expanding, TaskStackTemplate already applies selection styling to individual tasks
    }

    /**
     * Add right-click selection handlers for single task
     */
    _addTaskSelectionHandlers(row, task) {
        const rightClick = new Gtk.GestureClick({
            button: 3, // Right mouse button
        });

        rightClick.connect('pressed', (gesture, n_press, x, y) => {
            this._toggleTaskSelection(task.id, row);
            gesture.set_state(Gtk.EventSequenceState.CLAIMED);
        });

        row.add_controller(rightClick);
    }

    /**
     * Add right-click selection handlers for task stack
     */
    _addStackSelectionHandlers(row, group) {
        const rightClick = new Gtk.GestureClick({
            button: 3, // Right mouse button
        });

        rightClick.connect('pressed', (gesture, n_press, x, y) => {
            this._toggleStackSelection(group.groupKey, row);
            gesture.set_state(Gtk.EventSequenceState.CLAIMED);
        });

        row.add_controller(rightClick);
    }

    /**
     * Toggle single task selection
     */
    _toggleTaskSelection(taskId, row) {
        if (this.selectedTasks.has(taskId)) {
            this.selectedTasks.delete(taskId);
            row.remove_css_class('selected-task');

            // Check if this task belongs to a selected stack and deselect the stack
            const taskGroups = this._groupSimilarTasks(this.filteredTasks);
            for (const group of taskGroups) {
                if (group.tasks.some(t => t.id === taskId) && this.selectedStacks.has(group.groupKey)) {
                    this.selectedStacks.delete(group.groupKey);
                    // Also remove visual selection from stack row if visible
                    const stackRow = this.stackRowMap.get(group.groupKey);
                    if (stackRow) {
                        stackRow.remove_css_class('selected-task');
                    }
                    break;
                }
            }
        } else {
            this.selectedTasks.add(taskId);
            row.add_css_class('selected-task');

            // Check if all tasks in the stack are now selected
            const taskGroups = this._groupSimilarTasks(this.filteredTasks);
            for (const group of taskGroups) {
                if (group.tasks.some(t => t.id === taskId)) {
                    const allSelected = group.tasks.every(t => this.selectedTasks.has(t.id));
                    if (allSelected && group.tasks.length > 1) {
                        this.selectedStacks.add(group.groupKey);
                        const stackRow = this.stackRowMap.get(group.groupKey);
                        if (stackRow) {
                            stackRow.add_css_class('selected-task');
                        }
                    }
                    break;
                }
            }
        }

        this._updateSelectionUI();
    }

    /**
     * Toggle stack selection - selects/deselects ALL tasks in stack
     */
    _toggleStackSelection(groupKey, row) {
        const taskGroups = this._groupSimilarTasks(this.filteredTasks);
        const group = taskGroups.find(g => g.groupKey === groupKey);

        if (!group) return;

        if (this.selectedStacks.has(groupKey)) {
            // DESELECT stack and all its tasks
            this.selectedStacks.delete(groupKey);
            row.remove_css_class('selected-task');

            // Remove all tasks from this stack
            group.tasks.forEach(task => {
                this.selectedTasks.delete(task.id);
                // Also update visual state of task rows if they're visible
                const taskRow = this.taskRowMap.get(task.id);
                if (taskRow) {
                    taskRow.remove_css_class('selected-task');
                }
            });
        } else {
            // SELECT stack and all its tasks
            this.selectedStacks.add(groupKey);
            row.add_css_class('selected-task');

            // Add all tasks from this stack
            group.tasks.forEach(task => {
                this.selectedTasks.add(task.id);
                // Also update visual state of task rows if they're visible
                const taskRow = this.taskRowMap.get(task.id);
                if (taskRow) {
                    taskRow.add_css_class('selected-task');
                }
            });
        }

        this._updateSelectionUI();
    }

    /**
     * Clear all selections
     */
    _clearSelection() {
        this.selectedTasks.clear();
        this.selectedStacks.clear();
        this._updateTasksDisplay();
    }

    /**
     * Toggle select all tasks on current page (select all or deselect all)
     */
    _toggleSelectAll() {
        // Get all groups on current page
        const allTaskGroups = this._groupSimilarTasks(this.filteredTasks);
        const start = this.currentTasksPage * this.tasksPerPage;
        const end = Math.min(start + this.tasksPerPage, allTaskGroups.length);
        const groupsOnPage = allTaskGroups.slice(start, end);

        // Check if all tasks on current page are already selected
        let allSelected = true;
        for (const group of groupsOnPage) {
            for (const task of group.tasks) {
                if (!this.selectedTasks.has(task.id)) {
                    allSelected = false;
                    break;
                }
            }
            if (!allSelected) break;
        }

        if (allSelected) {
            // All are selected - deselect all on current page
            groupsOnPage.forEach(group => {
                group.tasks.forEach(task => {
                    this.selectedTasks.delete(task.id);
                });
                if (group.tasks.length > 1) {
                    this.selectedStacks.delete(group.groupKey);
                }
            });
        } else {
            // Not all selected - select all on current page
            groupsOnPage.forEach(group => {
                group.tasks.forEach(task => {
                    this.selectedTasks.add(task.id);
                });
                if (group.tasks.length > 1) {
                    this.selectedStacks.add(group.groupKey);
                }
            });
        }

        // Update display
        this._updateTasksDisplay();
    }

    /**
     * Update selection UI (show/hide selection bar)
     */
    _updateSelectionUI() {
        // Count only selectedTasks (selectedStacks is just a marker)
        const selectedCount = this.selectedTasks.size;
        const totalPages = Math.ceil(
            this._groupSimilarTasks(this.filteredTasks).length / this.tasksPerPage
        );

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
     * Update pagination info
     */
    _updatePaginationInfo() {
        const totalGroups = this._groupSimilarTasks(this.filteredTasks).length;
        const totalPages = Math.max(1, Math.ceil(totalGroups / this.tasksPerPage));
        const currentPage = Math.min(this.currentTasksPage + 1, totalPages);

        this.tasksPageInfo.set_label(_('Page %d of %d').format(currentPage, totalPages));
        this.prevTasksButton.set_sensitive(this.currentTasksPage > 0);
        this.nextTasksButton.set_sensitive(this.currentTasksPage < totalPages - 1);
    }

    /**
     * Previous page
     */
    _previousPage() {
        if (this.currentTasksPage > 0) {
            this._clearSelection(); // Clear selection BEFORE changing pages
            this.currentTasksPage--;
            this._updateTasksDisplay();
        }
    }

    /**
     * Next page
     */
    _nextPage() {
        const totalGroups = this._groupSimilarTasks(this.filteredTasks).length;
        const totalPages = Math.ceil(totalGroups / this.tasksPerPage);
        if (this.currentTasksPage < totalPages - 1) {
            this._clearSelection(); // Clear selection BEFORE changing pages
            this.currentTasksPage++;
            this._updateTasksDisplay();
        }
    }

    /**
     * Delete selected tasks
     */
    async _deleteSelectedTasks() {
        if (this.selectedTasks.size === 0) return;

        // Collect all tasks to delete (only from selectedTasks)
        const tasksToDelete = [];

        this.selectedTasks.forEach(taskId => {
            const task = this.filteredTasks.find(t => t.id === taskId);
            if (task) tasksToDelete.push(task);
        });

        if (tasksToDelete.length === 0) return;

        // Show confirmation dialog
        const dialog = new Adw.AlertDialog({
            heading: _('Delete Tasks'),
            body: `Are you sure you want to delete ${tasksToDelete.length} task(s)?`,
        });

        dialog.add_response('cancel', _('Cancel'));
        dialog.add_response('delete', _('Delete'));
        dialog.set_response_appearance('delete', Adw.ResponseAppearance.DESTRUCTIVE);

        dialog.connect('response', async (dialog, response) => {
            if (response === 'delete') {
                try {
                    // Check if any of the tasks being deleted is currently tracked
                    const trackingState = this.coreBridge.getTrackingState();
                    if (trackingState.isTracking) {
                        const isTrackingDeleted = tasksToDelete.some(t =>
                            t.task_id === trackingState.currentTaskId &&
                            t.project_id === trackingState.currentProjectId &&
                            t.client_id === trackingState.currentClientId
                        );

                        // Stop tracking if deleting currently tracked task
                        if (isTrackingDeleted) {
                            await this.coreBridge.stopTracking();
                        }
                    }

                    // Save task instance data for undo (without TimeEntries for now)
                    const deletedTaskInstances = tasksToDelete.map(t => ({
                        id: t.id,
                        task_id: t.task_id,
                        project_id: t.project_id,
                        client_id: t.client_id,
                        task_name: t.task_name,
                        last_used_at: t.last_used_at,
                        total_time: t.total_time,
                    }));
                    const idsToDelete = deletedTaskInstances.map(t => t.id);

                    // Delete TaskInstances via Core (will CASCADE delete TimeEntries)
                    await this.coreBridge.deleteMultipleTaskInstances(idsToDelete);

                    // Clean up orphaned tasks (tasks with no instances)
                    await this.coreBridge.cleanupOrphanedTasks();

                    // Emit event to refresh all pages
                    this.coreBridge.emitUIEvent('tasks-deleted');

                    // Clear selection
                    this.selectedTasks.clear();
                    this.selectedStacks.clear();

                    // Reload tasks
                    await this.loadTasks();

                    // Show toast with Undo
                    const message = idsToDelete.length === 1
                        ? _('Task deleted')
                        : _(`${idsToDelete.length} tasks deleted`);

                    if (this.parentWindow && this.parentWindow.showToastWithAction) {
                        this.parentWindow.showToastWithAction(message, _('Undo'), async () => {
                            try {
                                // Restore deleted task instances
                                for (const taskInstance of deletedTaskInstances) {
                                    // First, recreate the Task template if it was deleted
                                    const task = await this.coreBridge.findOrCreateTask(taskInstance.task_name);

                                    // Then restore TaskInstance with preserved timestamps
                                    await this.coreBridge.restoreTaskInstance({
                                        task_id: task.id,
                                        project_id: taskInstance.project_id,
                                        client_id: taskInstance.client_id,
                                        last_used_at: taskInstance.last_used_at,
                                        total_time: taskInstance.total_time,
                                    });
                                }
                                await this.loadTasks();
                            } catch (error) {
                                console.error('Error restoring task instances:', error);
                            }
                        });
                    }
                } catch (error) {
                    console.error('Error deleting tasks:', error);
                }
            }
            dialog.close();
        });

        dialog.present(this.parentWindow);
    }

    /**
     * Edit selected tasks
     */
    async _editSelectedTasks() {
        if (this.selectedTasks.size === 0 && this.selectedStacks.size === 0) return;

        // Collect all selected task instances
        const tasksToEdit = [];

        // Add individual tasks
        this.selectedTasks.forEach(taskId => {
            const task = this.filteredTasks.find(t => t.id === taskId);
            if (task) tasksToEdit.push(task);
        });

        // Add tasks from selected stacks
        this.selectedStacks.forEach(stackKey => {
            const taskGroups = this._groupSimilarTasks(this.filteredTasks);
            const stack = taskGroups.find(group => {
                const key = `${group.latestTask.task_id}-${group.latestTask.project_id}-${group.latestTask.client_id}`;
                return key === stackKey;
            });

            if (stack && stack.tasks) {
                // Add all tasks from the stack
                tasksToEdit.push(...stack.tasks);
            }
        });

        if (tasksToEdit.length === 0) return;

        // Open MultipleTasksEditDialog
        const dialog = new MultipleTasksEditDialog(tasksToEdit, this, this.coreBridge);
        dialog.present(this.parentWindow);

        // Clear selection after opening dialog
        this._clearSelection();
    }

    /**
     * Handle project update event - update colors in displayed tasks
     */
    _onProjectUpdated(data) {
        if (!data || !data.id) return;

        const projectId = data.id;
        const newColor = data.color;

        if (!newColor) return;

        // Update all templates that use this project
        this.taskTemplates.forEach((template, key) => {
            const keyStr = String(key);
            if (keyStr.startsWith('stack:')) {
                // Stack template
                const stack = template.group;
                if (stack && stack.latestTask && stack.latestTask.project_id === projectId) {
                    template.updateProjectColor(newColor);
                }
            } else {
                // Single task template
                const task = template.task;
                if (task && task.project_id === projectId) {
                    template.updateProjectColor(newColor);
                }
            }
        });
    }

    /**
     * Edit task instance
     */
    async _editTaskInstance(instanceId) {
        try {
            // Dynamically import dialog
            const { TaskInstanceEditDialog } = await import('resource:///com/odnoyko/valot/ui/components/dialogs/TaskInstanceEditDialog.js');

            // Get full task instance data
            const taskInstance = this.filteredTasks.find(t => t.id === instanceId);
            if (!taskInstance) {
                console.error('Task instance not found:', instanceId);
                return;
            }

            // Show edit dialog - pass TasksPage as parent so it can call loadTasks()
            const dialog = new TaskInstanceEditDialog(taskInstance, this, this.coreBridge);
            await dialog.present(this.parentWindow);

        } catch (error) {
            console.error('Error opening edit dialog:', error);
        }
    }

    /**
     * Refresh page data
     */
    async refresh() {
        await this.loadTasks();
        // Dropdowns reload themselves automatically via Core events
    }

    /**
     * Focus search input (called by Ctrl+F shortcut)
     */
    _focusSearch() {
        if (this.taskSearch) {
            this.taskSearch.grab_focus();
        }
    }

    /**
     * Validate that current project/client IDs exist in database
     * Reset to first available if they don't exist
     */
    async _validateCurrentContext() {
        try {
            // Get all projects and clients
            const projects = await this.coreBridge.getAllProjects();
            const clients = await this.coreBridge.getAllClients();

            // Validate project ID
            const projectExists = projects.some(p => p.id === this.currentProjectId);
            if (!projectExists && projects.length > 0) {
                this.currentProjectId = projects[0].id;
                console.warn('[TasksPage] Reset to default project:', this.currentProjectId);
            }

            // Validate client ID
            const clientExists = clients.some(c => c.id === this.currentClientId);
            if (!clientExists && clients.length > 0) {
                this.currentClientId = clients[0].id;
                console.warn('[TasksPage] Reset to default client:', this.currentClientId);
            }
        } catch (error) {
            console.error('[TasksPage] Error validating context:', error);
            // Fallback to ID 1 if validation fails
            this.currentProjectId = 1;
            this.currentClientId = 1;
        }
    }
}
