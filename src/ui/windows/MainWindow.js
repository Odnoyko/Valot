/**
 * Main Window - Programmatic GTK4 (migrated from window.blp)
 * Full UI structure matching old Blueprint template
 */

import GObject from 'gi://GObject';
import Adw from 'gi://Adw?version=1';
import Gtk from 'gi://Gtk?version=4.0';
import Gdk from 'gi://Gdk';
import Gio from 'gi://Gio';
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

        // Setup global keyboard shortcuts using application-level accelerators
        this._setupGlobalKeyboardShortcuts();

        // Subscribe to Core events for sidebar updates
        this._subscribeToCore();

        // Initial sidebar stats load
        this._updateSidebarStats();

        // Handle window close - check if tracking is active
        this.connect('close-request', () => this._onCloseRequest());
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
            icon_name: 'sidebar-hide-symbolic',
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
        this.application.set_accels_for_action('app.start-pomodoro', ['P']);

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

            // Select all items on current page based on page type
            switch (pageTag) {
                case 'tasks':
                    if (this.pages.tasks && this.pages.tasks._selectAllOnPage) {
                        this.pages.tasks._selectAllOnPage();
                    }
                    break;
                case 'projects':
                    if (this.pages.projects && this.pages.projects._selectAllOnPage) {
                        this.pages.projects._selectAllOnPage();
                    }
                    break;
                case 'clients':
                    if (this.pages.clients && this.pages.clients._selectAllOnPage) {
                        this.pages.clients._selectAllOnPage();
                    }
                    break;
            }
        });

        // Add action and set Shift+A accelerator
        this.application.add_action(selectAllAction);
        this.application.set_accels_for_action('app.select-all-page', ['<Alt>a']);
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
     */
    _onPageChanged() {
        const visiblePage = this.navigationView.get_visible_page();
        if (!visiblePage) return;

        const pageTag = visiblePage.get_tag();

        // Refresh tracking widget on the current page
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

        // Refresh tracking widget if page has one
        if (pageInstance && pageInstance.trackingWidget && pageInstance.trackingWidget.refresh) {
            pageInstance.trackingWidget.refresh();
        }
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

        // Update sidebar on tracking start/stop
        this.coreBridge.onUIEvent('tracking-started', () => {
            this._updateSidebarStats();
        });

        this.coreBridge.onUIEvent('tracking-stopped', () => {
            this._updateSidebarStats();

            // Update reports page chart if it's loaded
            if (this.reportsPageInstance && this.reportsPageInstance.updateChartsOnly) {
                this.reportsPageInstance.updateChartsOnly();
            }
        });

        // Real-time updates every second while tracking
        this.coreBridge.onUIEvent('tracking-updated', () => {
            this._updateSidebarStatsRealtime();
        });

        // Update sidebar when tasks are updated/deleted (affects This Week stats)
        this.coreBridge.onUIEvent('task-updated', () => {
            this._updateSidebarStats();
        });

        this.coreBridge.onUIEvent('task-deleted', () => {
            this._updateSidebarStats();
        });

        this.coreBridge.onUIEvent('tasks-deleted', () => {
            this._updateSidebarStats();
            this._refreshAllPages();
        });

        this.coreBridge.onUIEvent('projects-deleted', () => {
            this._updateSidebarStats();
            this._refreshAllPages();
        });

        this.coreBridge.onUIEvent('clients-deleted', () => {
            this._updateSidebarStats();
            this._refreshAllPages();
        });

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
     * Update sidebar statistics (full reload)
     */
    async _updateSidebarStats() {
        if (!this.coreBridge) return;

        try {
            // Get This Week stats from Core
            const weekStats = await this.coreBridge.getThisWeekStats();

            const hours = Math.floor(weekStats.totalTime / 3600);
            const minutes = Math.floor((weekStats.totalTime % 3600) / 60);
            const secs = weekStats.totalTime % 60;
            const timeStr = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

            this.weeklyTimeRow.set_subtitle(`${timeStr} • ${weekStats.taskCount} tasks`);
        } catch (error) {
            console.error('Error updating sidebar stats:', error);
        }
    }

    /**
     * Update sidebar stats in real-time (without full reload)
     */
    async _updateSidebarStatsRealtime() {
        if (!this.coreBridge) return;

        const trackingState = this.coreBridge.getTrackingState();
        if (!trackingState.isTracking) return;

        try {
            // Get This Week stats from Core
            const weekStats = await this.coreBridge.getThisWeekStats();
            const currentElapsed = trackingState.elapsedSeconds || 0;
            const totalTime = weekStats.totalTime + currentElapsed;

            const hours = Math.floor(totalTime / 3600);
            const minutes = Math.floor((totalTime % 3600) / 60);
            const secs = totalTime % 60;
            const timeStr = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

            this.weeklyTimeRow.set_subtitle(`${timeStr} • ${weekStats.taskCount} tasks`);
        } catch (error) {
            console.error('Error updating sidebar stats realtime:', error);
        }
    }
});
