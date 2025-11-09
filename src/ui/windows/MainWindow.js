/**
 * Main Window - Programmatic GTK4 (migrated from window.blp)
 * Full UI structure matching old Blueprint template
 */

import GObject from 'gi://GObject';
import Adw from 'gi://Adw?version=1';
import Gtk from 'gi://Gtk?version=4.0';
import Gdk from 'gi://Gdk';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import { Config } from 'resource:///com/odnoyko/valot/config.js';
import { PreferencesDialog } from 'resource:///com/odnoyko/valot/ui/components/dialogs/PreferencesDialog.js';
import { GestureController } from 'resource:///com/odnoyko/valot/ui/utils/GestureController.js';

// Import pages
import { TasksPage } from 'resource:///com/odnoyko/valot/ui/windows/pages/TasksPage.js';
import { ProjectsPage } from 'resource:///com/odnoyko/valot/ui/windows/pages/ProjectsPage.js';
import { ClientsPage } from 'resource:///com/odnoyko/valot/ui/windows/pages/ClientsPage.js';
import { ReportsPage } from 'resource:///com/odnoyko/valot/ui/windows/pages/ReportsPage.js';

export const ValotMainWindow = GObject.registerClass({
    GTypeName: 'ValotMainWindow',
}, class ValotMainWindow extends Adw.ApplicationWindow {
    constructor(application, coreBridge) {
        super({
            application,
            title: _('Valot'),
            default_width: 1040,
            default_height: 700,
        });

        // Set minimum window size
        this.set_size_request(700, 500);

        this.coreBridge = coreBridge;

        // Try to load settings, but don't fail if schema not available
        try {
            this.settings = new Gio.Settings({ schema: 'com.odnoyko.valot' });
        } catch (error) {
            this.settings = null;
        }

        // Add .devel CSS class for development builds
        if (Config.APPLICATION_ID.endsWith('.Devel')) {
            this.add_css_class('devel');
        }

        // Build UI programmatically (matching window.blp structure)
        this._buildUI();

        // Apply sidebar settings
        this._applySidebarSettings();

        // Setup gesture controls
        this.gestureController = new GestureController(this);
        this.gestureController.setupAllGestures();

        // Load pages
        this._loadPages();

        // Track previous page for cleanup on navigation
        this._previousPageTag = null;

        // Setup global keyboard shortcuts using application-level accelerators
        this._setupGlobalKeyboardShortcuts();

        // Store event handlers for cleanup
        this._eventHandlers = {};

        // Subscribe to Core events for sidebar updates
        this._subscribeToCore();

        // Initial sidebar stats load
        this._updateSidebarStats();

        // Handle window close - check if tracking is active
        this.connect('close-request', () => this._onCloseRequest());
        
        // Cleanup when window is actually destroyed (not just close-request)
        this.connect('destroy', () => {
            this.cleanup();
        });
    }

    /**
     * Handle window close request - check if tracking is active
     */
    _onCloseRequest() {
        if (!this.coreBridge) return false;

        const trackingState = this.coreBridge.getTrackingState();

        // If not tracking, allow close
        if (!trackingState.isTracking) {
            return false;
        }

        // If tracking, show warning dialog
        const dialog = new Adw.AlertDialog({
            heading: _('Tracking in Progress'),
            body: _('Time tracking is currently active. Closing the app will stop the timer and save your tracked time.\n\nAre you sure you want to close?'),
        });

        dialog.add_response('cancel', _('Cancel'));
        dialog.add_response('stop', _('Stop & Close'));
        dialog.set_response_appearance('stop', Adw.ResponseAppearance.DESTRUCTIVE);
        dialog.set_default_response('cancel');
        dialog.set_close_response('cancel');

        dialog.connect('response', async (dialog, response) => {
            if (response === 'stop') {
                // Stop tracking before closing
                try {
                    await this.coreBridge.stopTracking();
                } catch (error) {
                    console.error('Error stopping tracking:', error);
                }
                // Close application
                if (this.application) {
                    this.application.quit();
                }
            }
            // If cancel, dialog just closes and window stays open
        });

        dialog.present(this);

        // Prevent window from closing until user confirms
        return true;
    }

    /**
     * Build main UI structure - programmatic version of window.blp
     */
    _buildUI() {
        // Create split view (sidebar + main content)
        this.splitView = new Adw.OverlaySplitView({
            sidebar_position: Gtk.PackType.START,
            show_sidebar: true,
            min_sidebar_width: 280,
            max_sidebar_width: 280,
        });

        // Add breakpoint for adaptive design
        const breakpoint = new Adw.Breakpoint();
        breakpoint.set_condition(Adw.BreakpointCondition.parse('max-width: 860sp'));
        breakpoint.add_setter(this.splitView, 'collapsed', true);
        this.add_breakpoint(breakpoint);

        // Create sidebar (Adw.NavigationPage)
        this._buildSidebar();

        // Create toast overlay for notifications
        this.toastOverlay = new Adw.ToastOverlay();

        // Create main content (Adw.NavigationView)
        this.navigationView = new Adw.NavigationView();
        this.toastOverlay.set_child(this.navigationView);

        // Listen for page navigation to refresh tracking widgets
        this.navigationView.connect('notify::visible-page', () => {
            this._onPageChanged();
        });

        // Set toast overlay as split view content
        this.splitView.set_content(this.toastOverlay);

        // Set split view as window content
        this.set_content(this.splitView);
    }

    /**
     * Apply sidebar visibility settings from preferences
     */
    _applySidebarSettings() {
        if (!this.settings) {
            // No settings available, use default
            this.splitView.set_show_sidebar(true);
            return;
        }

        const sidebarMode = this.settings.get_int('sidebar-mode');

        switch (sidebarMode) {
            case 0: // Always opened
                this.splitView.set_show_sidebar(true);
                break;
            case 1: // Always closed
                this.splitView.set_show_sidebar(false);
                break;
            case 2: // Dynamic - remember last state
                const lastState = this.settings.get_boolean('sidebar-last-state');
                this.splitView.set_show_sidebar(lastState);
                break;
        }

        // Save sidebar state changes if in dynamic mode
        this.splitView.connect('notify::show-sidebar', () => {
            if (this.settings && this.settings.get_int('sidebar-mode') === 2) {
                this.settings.set_boolean('sidebar-last-state', this.splitView.get_show_sidebar());
            }
        });
    }

    /**
     * Build sidebar - Adw.NavigationPage with ToolbarView
     */
    _buildSidebar() {
        const sidebarPage = new Adw.NavigationPage({
            title: _('Navigation'),
        });

        const toolbarView = new Adw.ToolbarView();

        // Sidebar header bar
        const headerBar = new Adw.HeaderBar({
            show_end_title_buttons: false,
            show_start_title_buttons: false,
        });

        // Hide sidebar button
        const hideButton = new Gtk.Button({
            icon_name: 'sidebar-show-symbolic',
            tooltip_text: _('Hide Sidebar'),
        });
        hideButton.connect('clicked', () => {
            this.splitView.set_show_sidebar(false);
        });
        headerBar.pack_start(hideButton);

        // Menu button
        const menuButton = new Gtk.Button({
            icon_name: 'open-menu-symbolic',
            tooltip_text: _('About'),
        });
        menuButton.connect('clicked', () => {
            PreferencesDialog.show(this);
        });
        headerBar.pack_end(menuButton);

        toolbarView.add_top_bar(headerBar);

        // Sidebar content box
        const contentBox = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 0,
        });

        // Navigation list
        const scrolled = new Gtk.ScrolledWindow({
            vexpand: true,
        });

        this.navigationList = new Gtk.ListBox({
            css_classes: ['navigation-sidebar'],
            selection_mode: Gtk.SelectionMode.SINGLE,
        });

        const pages = [
            { id: 'tasks', title: _('Tasks'), icon: 'view-list-symbolic' },
            { id: 'projects', title: _('Projects'), icon: 'folder-symbolic' },
            { id: 'clients', title: _('Clients'), icon: 'contact-new-symbolic' },
            { id: 'reports', title: _('Reports'), icon: 'x-office-document-symbolic' },
        ];

        pages.forEach((page, index) => {
            const row = new Adw.ActionRow({
                title: page.title,
                activatable: true,
            });

            const icon = new Gtk.Image({
                icon_name: page.icon,
            });
            row.add_prefix(icon);

            row.connect('activated', () => {
                // Navigate to page in NavigationView
                const targetPage = this.navigationView.find_page(page.id);
                if (targetPage) {
                    this.navigationView.replace([targetPage]);
                }
            });

            this.navigationList.append(row);

            if (index === 0) {
                this.navigationList.select_row(row);
            }
        });

        scrolled.set_child(this.navigationList);
        contentBox.append(scrolled);

        // Separator
        const separator = new Gtk.Separator({
            margin_top: 6,
            margin_bottom: 6,
        });
        contentBox.append(separator);

        // Quick Stats section
        const statsGroup = new Adw.PreferencesGroup({
            title: _('Quick Stats'),
            margin_start: 12,
            margin_end: 12,
            margin_bottom: 12,
        });

        this.weeklyTimeRow = new Adw.ActionRow({
            title: _('This Week'),
            subtitle: '0:00:00 • 0 tasks',
        });

        const clockIcon = new Gtk.Image({
            icon_name: 'alarm-symbolic',
            css_classes: ['accent'],
        });
        this.weeklyTimeRow.add_prefix(clockIcon);

        statsGroup.add(this.weeklyTimeRow);
        contentBox.append(statsGroup);

        toolbarView.set_content(contentBox);
        sidebarPage.set_child(toolbarView);

        this.splitView.set_sidebar(sidebarPage);
    }

    /**
     * Load pages into NavigationView
     */
    _loadPages() {
        const pages = [
            { id: 'tasks', title: _('Tasks'), class: TasksPage },
            { id: 'projects', title: _('Projects'), class: ProjectsPage },
            { id: 'clients', title: _('Clients'), class: ClientsPage },
            { id: 'reports', title: _('Reports'), class: ReportsPage },
        ];

        pages.forEach((pageInfo, index) => {
            try {
                // Create Adw.NavigationPage for each page
                const navPage = new Adw.NavigationPage({
                    title: pageInfo.title,
                    tag: pageInfo.id,
                });

                // Create page instance
                const pageInstance = new pageInfo.class({
                    app: this.application,
                    parentWindow: this,
                    coreBridge: this.coreBridge,
                });

                // Store page instance for keyboard shortcuts
                switch (pageInfo.id) {
                    case 'tasks':
                        this.tasksPageInstance = pageInstance;
                        break;
                    case 'projects':
                        this.projectsPageInstance = pageInstance;
                        break;
                    case 'clients':
                        this.clientsPageInstance = pageInstance;
                        break;
                    case 'reports':
                        this.reportsPageInstance = pageInstance;
                        break;
                }

                // Get page widget (pages provide complete ToolbarView with header)
                let pageWidget = pageInstance.getWidget ? pageInstance.getWidget() : null;
                if (!pageWidget) {
                    pageWidget = this._createPagePlaceholder(pageInfo.title);
                }

                navPage.set_child(pageWidget);

                // Add to navigation view
                this.navigationView.add(navPage);

            } catch (error) {
                console.error(`❌ Error loading page ${pageInfo.id}:`, error);
            }
        });

        // Store page instances for keyboard shortcuts
        this.pages = {
            tasks: this.tasksPageInstance,
            projects: this.projectsPageInstance,
            clients: this.clientsPageInstance,
            reports: this.reportsPageInstance,
        };
    }

    /**
     * Setup global keyboard shortcuts using application-level accelerators
     * This works like main branch - Delete key works regardless of input focus
     */
    _setupGlobalKeyboardShortcuts() {
        // Create application-level action for Delete key
        const deleteAction = new Gio.SimpleAction({
            name: 'delete-selected',
            parameter_type: null
        });

        deleteAction.connect('activate', () => {
            // Get current visible page
            const visiblePage = this.navigationView.get_visible_page();
            if (!visiblePage) return;

            const pageTag = visiblePage.get_tag();

            // Delete selected items based on current page
            switch (pageTag) {
                case 'tasks':
                    if (this.pages.tasks && this.pages.tasks.selectedTasks && this.pages.tasks.selectedTasks.size > 0) {
                        this.pages.tasks._deleteSelectedTasks();
                    }
                    break;
                case 'projects':
                    if (this.pages.projects && this.pages.projects.selectedProjects && this.pages.projects.selectedProjects.size > 0) {
                        this.pages.projects._deleteSelectedProjects();
                    }
                    break;
                case 'clients':
                    if (this.pages.clients && this.pages.clients.selectedClients && this.pages.clients.selectedClients.size > 0) {
                        this.pages.clients._deleteSelectedClients();
                    }
                    break;
            }
        });

        // Add action to application and set Delete key accelerator
        this.application.add_action(deleteAction);
        this.application.set_accels_for_action('app.delete-selected', ['Delete']);

        // Create application-level action for Pomodoro mode (P key)
        const pomodoroAction = new Gio.SimpleAction({
            name: 'start-pomodoro',
            parameter_type: null
        });

        pomodoroAction.connect('activate', () => {
            // Check if user is currently typing in an input field
            const focusedWidget = this.get_focus();
            if (focusedWidget) {
                const widgetType = focusedWidget.constructor.name;
                // Block shortcut if typing in Entry, SearchEntry, or Text widgets
                if (widgetType === 'GtkEntry' ||
                    widgetType === 'GtkSearchEntry' ||
                    widgetType === 'GtkText' ||
                    widgetType === 'GtkTextView') {
                    return;
                }
            }

            // Trigger Pomodoro mode on the current page's tracking widget
            const visiblePage = this.navigationView.get_visible_page();
            if (!visiblePage) return;

            const pageTag = visiblePage.get_tag();

            // Access tracking widget from the current page
            let trackingWidget = null;
            switch (pageTag) {
                case 'tasks':
                    trackingWidget = this.pages.tasks?.trackingWidget;
                    break;
                case 'projects':
                    trackingWidget = this.pages.projects?.trackingWidget;
                    break;
                case 'clients':
                    trackingWidget = this.pages.clients?.trackingWidget;
                    break;
                case 'reports':
                    trackingWidget = this.pages.reports?.trackingWidget;
                    break;
            }

            if (trackingWidget && trackingWidget._toggleTracking) {
                // Start Pomodoro mode (true = pomodoro)
                trackingWidget._toggleTracking(true);
            }
        });

        // Add Pomodoro action to application and set P key accelerator
        this.application.add_action(pomodoroAction);
        // DISABLED: P key conflicts with typing in input fields
        // this.application.set_accels_for_action('app.start-pomodoro', ['P']);

        // Create application-level action for Select All (Shift+A)
        const selectAllAction = new Gio.SimpleAction({
            name: 'select-all-page',
            parameter_type: null
        });

        selectAllAction.connect('activate', () => {
            // Get current visible page
            const visiblePage = this.navigationView.get_visible_page();
            if (!visiblePage) return;

            const pageTag = visiblePage.get_tag();

            // Toggle select all items on current page based on page type
            switch (pageTag) {
                case 'tasks':
                    if (this.pages.tasks && this.pages.tasks._toggleSelectAll) {
                        this.pages.tasks._toggleSelectAll();
                    }
                    break;
                case 'projects':
                    if (this.pages.projects && this.pages.projects._toggleSelectAll) {
                        this.pages.projects._toggleSelectAll();
                    }
                    break;
                case 'clients':
                    if (this.pages.clients && this.pages.clients._toggleSelectAll) {
                        this.pages.clients._toggleSelectAll();
                    }
                    break;
            }
        });

        // Add action and set Shift+A accelerator
        this.application.add_action(selectAllAction);
        this.application.set_accels_for_action('app.select-all-page', ['<Alt>a']);

        // Create application-level action for Escape (deselect all)
        const deselectAllAction = new Gio.SimpleAction({
            name: 'deselect-all-page',
            parameter_type: null
        });

        deselectAllAction.connect('activate', () => {
            // Get current visible page
            const visiblePage = this.navigationView.get_visible_page();
            if (!visiblePage) return;

            const pageTag = visiblePage.get_tag();

            // Deselect all items on current page based on page type
            switch (pageTag) {
                case 'tasks':
                    if (this.pages.tasks && this.pages.tasks._clearSelection) {
                        this.pages.tasks._clearSelection();
                    }
                    break;
                case 'projects':
                    if (this.pages.projects && this.pages.projects._clearSelection) {
                        this.pages.projects._clearSelection();
                    }
                    break;
                case 'clients':
                    if (this.pages.clients && this.pages.clients._clearSelection) {
                        this.pages.clients._clearSelection();
                    }
                    break;
            }
        });

        // Add action and set Escape accelerator
        this.application.add_action(deselectAllAction);
        this.application.set_accels_for_action('app.deselect-all-page', ['Escape']);

        // Create application-level action for Ctrl+F (focus search)
        const focusSearchAction = new Gio.SimpleAction({
            name: 'focus-search',
            parameter_type: null
        });

        focusSearchAction.connect('activate', () => {
            // Get current visible page
            const visiblePage = this.navigationView.get_visible_page();
            if (!visiblePage) {
                return;
            }

            const pageTag = visiblePage.get_tag();

            // Focus search input on current page
            switch (pageTag) {
                case 'tasks':
                    if (this.pages.tasks && this.pages.tasks._focusSearch) {
                        this.pages.tasks._focusSearch();
                    }
                    break;
                case 'projects':
                    if (this.pages.projects && this.pages.projects._focusSearch) {
                        this.pages.projects._focusSearch();
                    }
                    break;
                case 'clients':
                    if (this.pages.clients && this.pages.clients._focusSearch) {
                        this.pages.clients._focusSearch();
                    }
                    break;
            }
        });

        // Add action and set Ctrl+F accelerator
        this.application.add_action(focusSearchAction);
        this.application.set_accels_for_action('app.focus-search', ['<Primary>f']);
    }

    /**
     * Create page placeholder (fallback)
     */
    _createPagePlaceholder(title) {
        const statusPage = new Adw.StatusPage({
            title: title,
            description: _('Page content will be implemented here'),
            icon_name: 'dialog-information-symbolic',
        });
        return statusPage;
    }

    /**
     * Called when user navigates to a different page
     * Refreshes tracking widgets to sync with current state
     * CRITICAL: Refresh ALL tracking widgets, not just current page
     */
    _onPageChanged() {
        const visiblePage = this.navigationView.get_visible_page();
        if (!visiblePage) return;

        const pageTag = visiblePage.get_tag();

        // Cleanup previous page (close dialogs and clear data)
        if (this._previousPageTag && this._previousPageTag !== pageTag) {
            this._cleanupPreviousPage(this._previousPageTag);
        }

        // CRITICAL: Refresh ALL tracking widgets on ALL pages
        // This ensures all widgets are synchronized with current tracking state
        // Even if a page is hidden, its widget should be ready when shown
        // OPTIMIZED: Don't create array of objects - iterate directly to avoid object creation
        const pages = [
            this.tasksPageInstance,
            this.projectsPageInstance,
            this.clientsPageInstance,
            this.reportsPageInstance
        ];

        for (let i = 0; i < pages.length; i++) {
            const instance = pages[i];
            if (instance && instance.trackingWidget && typeof instance.trackingWidget.refresh === 'function') {
                // Refresh widget to restore subscriptions and update UI
                instance.trackingWidget.refresh();
            }
        }
        
        // CRITICAL: Call onPageShown() on the current page instance
        // This ensures pages reload data if needed (e.g., TasksPage reloads tasks)
        let currentPageInstance = null;
        switch (pageTag) {
            case 'tasks':
                currentPageInstance = this.tasksPageInstance;
                break;
            case 'projects':
                currentPageInstance = this.projectsPageInstance;
                break;
            case 'clients':
                currentPageInstance = this.clientsPageInstance;
                break;
            case 'reports':
                currentPageInstance = this.reportsPageInstance;
                break;
        }
        
        if (currentPageInstance && typeof currentPageInstance.onPageShown === 'function') {
            currentPageInstance.onPageShown();
        }

        // Store current page as previous for next navigation
        this._previousPageTag = pageTag;
    }

    /**
     * Cleanup previous page: close dialogs and clear data
     */
    _cleanupPreviousPage(pageTag) {
        let pageInstance = null;
        switch (pageTag) {
            case 'tasks':
                pageInstance = this.tasksPageInstance;
                break;
            case 'projects':
                pageInstance = this.projectsPageInstance;
                break;
            case 'clients':
                pageInstance = this.clientsPageInstance;
                break;
            case 'reports':
                pageInstance = this.reportsPageInstance;
                break;
        }

        if (!pageInstance) return;

        // Close all open dialogs
        this._closeAllDialogs();

        // Call onHide() if page has it (lightweight cleanup - clears data, keeps UI)
        if (pageInstance && typeof pageInstance.onHide === 'function') {
            pageInstance.onHide();
        }
    }

    /**
     * Close all open dialogs (TaskInstanceEditDialog, ProjectDialog, etc.)
     */
    _closeAllDialogs() {
        // Close TaskInstanceEditDialog if open
        try {
            // Use dynamic import to avoid loading module if not needed
            import('resource:///com/odnoyko/valot/ui/components/dialogs/TaskInstanceEditDialog.js').then(module => {
                if (module.TaskInstanceEditDialog && module.TaskInstanceEditDialog.closeAll) {
                    module.TaskInstanceEditDialog.closeAll();
                }
            }).catch(() => {
                // Module not loaded or no closeAll method - ignore
            });
        } catch (e) {
            // Ignore errors
        }

        // Close PreferencesDialog if open
        try {
            if (PreferencesDialog._instance && PreferencesDialog._instance.dialog) {
                PreferencesDialog._instance.dialog.close();
            }
        } catch (e) {
            // Dialog not open - ignore
        }

        // TODO: Close other dialogs (ProjectDialog, ClientDialog, etc.) if they have static close methods
    }

    /**
     * Show a simple toast notification
     */
    showToast(message) {
        const toast = new Adw.Toast({
            title: message,
            timeout: 1.5,
        });
        this.toastOverlay.add_toast(toast);
    }

    /**
     * Show a toast with an action button (e.g. Undo)
     */
    showToastWithAction(message, actionLabel, onAction) {
        const toast = new Adw.Toast({
            title: message,
            button_label: actionLabel,
            timeout: 1.5,
        });

        toast.connect('button-clicked', () => {
            if (onAction) {
                onAction();
            }
        });

        this.toastOverlay.add_toast(toast);
    }

    /**
     * Subscribe to Core events for sidebar real-time updates
     */
    _subscribeToCore() {
        if (!this.coreBridge) return;

        // Store handlers for cleanup
        this._eventHandlers['tracking-started'] = (data) => {
            
            // Check if tracked task is in current week
            if (data && data.startTime) {
                this._checkIfTrackingIsInCurrentWeek(data.startTime);
            }
            this._updateSidebarStats();
        };

        this._eventHandlers['tracking-stopped'] = () => {
            // Clear cached week stats
            this._cachedWeekStats = null;
            this._isTrackingInCurrentWeek = false;

            this._updateSidebarStats();

            // Update reports page chart if it's loaded
            if (this.reportsPageInstance && this.reportsPageInstance.updateChartsOnly) {
                this.reportsPageInstance.updateChartsOnly();
            }
        };
        
        // OPTIMIZED: Real-time sidebar updates - only update label text, no object creation
        this._eventHandlers['tracking-updated'] = (data) => {
            if (!data || data.elapsedSeconds === undefined) {
                return;
            }
            
            
            // Only update if tracking is in current week
            if (!this._isTrackingInCurrentWeek) {
                return;
            }
            
            // OPTIMIZED: Update only label text, no getTrackingState() call
            if (!this._cachedWeekStats) {
                return;
            }
            
            const totalTime = this._cachedWeekStats.totalTime + data.elapsedSeconds;
            const hours = Math.floor(totalTime / 3600);
            const minutes = Math.floor((totalTime % 3600) / 60);
            const secs = totalTime % 60;
            const timeStr = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
            
            this.weeklyTimeRow.set_subtitle(`${timeStr} • ${this._cachedWeekStats.taskCount} tasks`);
        };
        
        // IMPORTANT: After database import/replace, reload sidebar stats
        this._eventHandlers['task-updated'] = async () => {
            this._cachedWeekStats = null;
            this._isTrackingInCurrentWeek = false;
            await this._updateSidebarStats();
        };

        // DISABLED: tracking-updated handler removed - causes RAM growth
        // Even empty handler is registered and called every second
        // this._eventHandlers['tracking-updated'] = () => {
        //     // Handler removed to prevent RAM growth
        // };

        this._eventHandlers['task-updated'] = () => {
            this._updateSidebarStats();
        };

        this._eventHandlers['task-deleted'] = () => {
            this._updateSidebarStats();
        };

        this._eventHandlers['tasks-deleted'] = () => {
            this._updateSidebarStats();
            this._refreshAllPages();
        };

        this._eventHandlers['projects-deleted'] = () => {
            this._updateSidebarStats();
            this._refreshAllPages();
        };

        this._eventHandlers['clients-deleted'] = () => {
            this._updateSidebarStats();
            this._refreshAllPages();
        };

        // Subscribe with stored handlers
        Object.keys(this._eventHandlers).forEach(event => {
            this.coreBridge.onUIEvent(event, this._eventHandlers[event]);
        });
    }

    /**
     * Cleanup: unsubscribe from events and cleanup pages
     */
    cleanup() {
        // Unsubscribe from CoreBridge events
        if (this.coreBridge && this._eventHandlers) {
            Object.keys(this._eventHandlers).forEach(event => {
                this.coreBridge.offUIEvent(event, this._eventHandlers[event]);
            });
            this._eventHandlers = {};
        }

        // Cleanup pages
        if (this.tasksPageInstance && typeof this.tasksPageInstance.destroy === 'function') {
            this.tasksPageInstance.destroy();
            this.tasksPageInstance = null;
        }
        if (this.projectsPageInstance && typeof this.projectsPageInstance.destroy === 'function') {
            this.projectsPageInstance.destroy();
            this.projectsPageInstance = null;
        }
        if (this.clientsPageInstance && typeof this.clientsPageInstance.destroy === 'function') {
            this.clientsPageInstance.destroy();
            this.clientsPageInstance = null;
        }
        if (this.reportsPageInstance && typeof this.reportsPageInstance.destroy === 'function') {
            this.reportsPageInstance.destroy();
            this.reportsPageInstance = null;
        }

        // Cleanup gesture controller if exists
        if (this.gestureController && typeof this.gestureController.cleanup === 'function') {
            this.gestureController.cleanup();
            this.gestureController = null;
        }
    }

    /**
     * Refresh all pages after data changes (deletes, etc.)
     */
    async _refreshAllPages() {
        try {
            // Refresh TasksPage
            if (this.tasksPageInstance && this.tasksPageInstance.loadTasks) {
                await this.tasksPageInstance.loadTasks();
            }

            // Refresh ProjectsPage
            if (this.projectsPageInstance && this.projectsPageInstance.loadProjects) {
                await this.projectsPageInstance.loadProjects();
            }

            // Refresh ClientsPage
            if (this.clientsPageInstance && this.clientsPageInstance.loadClients) {
                await this.clientsPageInstance.loadClients();
            }

            // Refresh ReportsPage
            if (this.reportsPageInstance && this.reportsPageInstance.loadReports) {
                await this.reportsPageInstance.loadReports();
            }
        } catch (error) {
            console.error('Error refreshing pages:', error);
        }
    }

    /**
     * Check if tracking start time is in current week
     */
    _checkIfTrackingIsInCurrentWeek(startTime) {
        
        try {
            const now = GLib.DateTime.new_now_local();
            const dayOfWeek = now.get_day_of_week(); // 1=Monday, 7=Sunday
            const daysToMonday = dayOfWeek - 1;
            const monday = now.add_days(-daysToMonday);
            
            const weekStart = GLib.DateTime.new_local(
                monday.get_year(),
                monday.get_month(),
                monday.get_day_of_month(),
                0, 0, 0
            );
            
            // CRITICAL: startTime can be timestamp (number) or string format
            // Convert to ISO 8601 format with timezone for GLib
            let isoStartTime;
            if (typeof startTime === 'number') {
                // startTime is timestamp (milliseconds) - convert to ISO string
                const date = new Date(startTime);
                isoStartTime = date.toISOString(); // Already in ISO format with Z
            } else if (typeof startTime === 'string') {
                // startTime is string "2025-11-03 18:53:35" - convert to ISO 8601
                isoStartTime = startTime.replace(' ', 'T') + 'Z';
            } else {
                console.error('Invalid startTime format:', startTime);
                this._isTrackingInCurrentWeek = false;
                return;
            }
            
            const startDateTime = GLib.DateTime.new_from_iso8601(isoStartTime, null);
            
            if (!startDateTime) {
                this._isTrackingInCurrentWeek = false;
                return;
            }
            
            this._isTrackingInCurrentWeek = startDateTime.compare(weekStart) >= 0;
        } catch (error) {
            console.error('Error checking if tracking is in current week:', error);
            this._isTrackingInCurrentWeek = false;
        }
    }
    
    /**
     * Update sidebar statistics (full reload)
     */
    async _updateSidebarStats() {
        if (!this.coreBridge) return;

        try {
            // Get This Week stats from Core
            const weekStats = await this.coreBridge.getThisWeekStats();
            
            // Cache for real-time updates
            this._cachedWeekStats = weekStats;

            const hours = Math.floor(weekStats.totalTime / 3600);
            const minutes = Math.floor((weekStats.totalTime % 3600) / 60);
            const secs = weekStats.totalTime % 60;
            const timeStr = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

            this.weeklyTimeRow.set_subtitle(`${timeStr} • ${weekStats.taskCount} tasks`);
            
            // CRITICAL: Check if tracking is currently active and in current week
            const trackingState = this.coreBridge.getTrackingState();
            
            if (trackingState.isTracking && trackingState.startTime) {
                this._checkIfTrackingIsInCurrentWeek(trackingState.startTime);
            } else {
                this._isTrackingInCurrentWeek = false;
            }
        } catch (error) {
            console.error('Error updating sidebar stats:', error);
        }
    }

    /**
     * Update sidebar stats in real-time (without full reload)
     * OPTIMIZED: Cache base stats, only add current elapsed time
     */
    async _updateSidebarStatsRealtime() {
        if (!this.coreBridge) return;

        const trackingState = this.coreBridge.getTrackingState();
        if (!trackingState.isTracking) return;

        try {
            // CRITICAL FIX: Don't query DB every second!
            // Cache base stats and reuse them
            if (!this._cachedWeekStats) {
                // Load once and cache
                this._cachedWeekStats = await this.coreBridge.getThisWeekStats();
            }

            // Use cached stats + current elapsed (NO DB QUERY)
            const currentElapsed = trackingState.elapsedSeconds || 0;
            const totalTime = this._cachedWeekStats.totalTime + currentElapsed;

            const hours = Math.floor(totalTime / 3600);
            const minutes = Math.floor((totalTime % 3600) / 60);
            const secs = totalTime % 60;
            const timeStr = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

            this.weeklyTimeRow.set_subtitle(`${timeStr} • ${this._cachedWeekStats.taskCount} tasks`);
        } catch (error) {
            console.error('Error updating sidebar stats realtime:', error);
        }
    }
});
