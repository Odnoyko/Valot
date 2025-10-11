/**
 * Main Window - Programmatic GTK4 (migrated from window.blp)
 * Full UI structure matching old Blueprint template
 */

import GObject from 'gi://GObject';
import Adw from 'gi://Adw?version=1';
import Gtk from 'gi://Gtk?version=4.0';
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

        this.coreBridge = coreBridge;

        // Try to load settings, but don't fail if schema not available
        try {
            this.settings = new Gio.Settings({ schema: 'com.odnoyko.valot' });
        } catch (error) {
            console.warn('GSettings schema not available, using defaults:', error.message);
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

        // Create main content (Adw.NavigationView)
        this.navigationView = new Adw.NavigationView();
        this.splitView.set_content(this.navigationView);

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

                // Get page widget (pages provide complete ToolbarView with header)
                let pageWidget = pageInstance.getWidget ? pageInstance.getWidget() : null;
                if (!pageWidget) {
                    pageWidget = this._createPagePlaceholder(pageInfo.title);
                }

                navPage.set_child(pageWidget);

                // Add to navigation view
                this.navigationView.add(navPage);

                console.log(`✅ Page loaded: ${pageInfo.id}`);
            } catch (error) {
                console.error(`❌ Error loading page ${pageInfo.id}:`, error);
            }
        });
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
});
