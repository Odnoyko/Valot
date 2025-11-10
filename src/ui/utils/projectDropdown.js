import Gtk from 'gi://Gtk';
import Gdk from 'gi://Gdk';
import { PLACEHOLDER } from 'resource:///com/odnoyko/valot/ui/utils/commonStrings.js';
import { createProjectIconWidget } from 'resource:///com/odnoyko/valot/ui/utils/widgetFactory.js';

/**
 * Custom project dropdown with search functionality and color preview
 */
export class ProjectDropdown {
    constructor(coreBridge, currentProjectId = 1, onProjectSelected = null) {
        this.coreBridge = coreBridge;
        this.projects = [];
        this.currentProjectId = currentProjectId;
        this.onProjectSelected = onProjectSelected;
        this.isUpdatingSelection = false;

        // Store event handlers for cleanup
        this._eventHandlers = {};

        this.dropdown = this._createSearchableDropdown();

        // Load projects from Core
        this._loadProjects();

        // Subscribe to Core events for updates
        this._subscribeToCore();
    }

    async _loadProjects() {
        try {
            this.projects = await this.coreBridge.getAllProjects();
            this._updateButtonAppearance();
            this._populateProjectList();
        } catch (error) {
            console.error('Error loading projects:', error);
            this.projects = [];
        }
    }

    _subscribeToCore() {
        if (!this.coreBridge) return;

        // Store handlers for cleanup
        this._eventHandlers['project-created'] = () => this._loadProjects();
        this._eventHandlers['project-updated'] = () => this._loadProjects();
        this._eventHandlers['project-deleted'] = () => this._loadProjects();

        // Subscribe with stored handlers
        Object.keys(this._eventHandlers).forEach(event => {
            this.coreBridge.onUIEvent(event, this._eventHandlers[event]);
        });
    }

    /**
     * Cleanup: unsubscribe from events
     * CRITICAL: Must unparent popover BEFORE button is finalized
     */
    destroy() {
        // FIRST: Close and unparent popover from button (prevents GTK warnings)
        if (this.popover) {
            try {
                if (!this.popover.is_destroyed?.()) {
                    this.popover.popdown();
                    // CRITICAL: Unparent FIRST to detach from button before any destruction
                    this.popover.unparent();
                }
            } catch (e) {
                // Popover may already be destroyed or unparented
            }
        }
        
        // SECOND: Destroy button (now safe, popover is detached)
        if (this.dropdownButton) {
            try {
                if (!this.dropdownButton.is_destroyed?.()) {
                    this.dropdownButton.destroy();
                }
            } catch (e) {
                // Button may already be destroyed
            }
            this.dropdownButton = null;
        }
        
        // THIRD: Now destroy popover widget itself
        if (this.popover) {
            try {
                if (!this.popover.is_destroyed?.()) {
                    this.popover.destroy();
                }
            } catch (e) {
                // Popover may already be destroyed
            }
            this.popover = null;
        }
        
        // Unsubscribe from events
        if (this.coreBridge && this._eventHandlers) {
            Object.keys(this._eventHandlers).forEach(event => {
                this.coreBridge.offUIEvent(event, this._eventHandlers[event]);
            });
            this._eventHandlers = {};
        }
        
        // Clear data
        this.projects = [];
    }

    _createSearchableDropdown() {
        // Create container for the dropdown button + popover
        const container = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL
        });

        // Create the main button with project color and icon
        this.dropdownButton = new Gtk.Button({
            width_request: 36,
            height_request: 36,
            halign: Gtk.Align.CENTER,
            valign: Gtk.Align.CENTER
        });

        // Create icon widget once and reuse it (prevents "snapshot symbolic icon" messages)
        this._iconWidget = null;

        // Update button appearance with current project
        this._updateButtonAppearance();

        // Create popover for search dropdown
        this.popover = new Gtk.Popover({
            width_request: 320,
            height_request: 350,
        });

        // Create search entry
        const searchEntry = new Gtk.SearchEntry({
            placeholder_text: PLACEHOLDER.SEARCH_PROJECTS,
            margin_top: 6,
            margin_bottom: 6,
            margin_start: 6,
            margin_end: 6
        });

        // Create scrolled list
        const scrolled = new Gtk.ScrolledWindow({
            vexpand: true,
            hscrollbar_policy: Gtk.PolicyType.NEVER,
            vscrollbar_policy: Gtk.PolicyType.AUTOMATIC
        });

        // Create list box for projects
        this.projectList = new Gtk.ListBox({
            css_classes: ['content-box'],
            selection_mode: Gtk.SelectionMode.NONE
        });

        // Connect row activation signal
        this.projectList.connect('row-activated', (listBox, row) => {
            if (this.isUpdatingSelection) return;

            const project = row.projectData;
            if (project) {
                this.currentProjectId = project.id;
                this._updateButtonAppearance();
                this._populateProjectList(); // Refresh to show new selection

                if (this.onProjectSelected) {
                    this.onProjectSelected(project);
                }

                this.popover.popdown();
            }
        });

        scrolled.set_child(this.projectList);

        // Popover content
        const popoverContent = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL
        });
        popoverContent.append(searchEntry);
        popoverContent.append(scrolled);

        this.popover.set_child(popoverContent);
        this.popover.set_parent(this.dropdownButton);

        // Connect button to show popover
        this.dropdownButton.connect('clicked', () => {
            this._populateProjectList();
            this.popover.popup();
            searchEntry.grab_focus();
        });

        // Search functionality
        searchEntry.connect('search-changed', () => {
            const query = searchEntry.get_text().toLowerCase();
            this._filterProjects(query);
        });

        // Store references and populate initial list
        this._populateProjectList();

        container.append(this.dropdownButton);

        return container;
    }

    _updateButtonAppearance() {
        const currentProject = this.projects.find(p => p.id === this.currentProjectId) || {
            id: 1,
            name: 'Default Project',
            color: '#9a9996',
            icon: 'folder-symbolic'
        };

        // Reuse existing icon widget or create it once
        if (!this._iconWidget || this._iconWidget.is_destroyed?.()) {
            // First creation: create widget once
            this._iconWidget = createProjectIconWidget(currentProject, 16);
            this.dropdownButton.set_child(this._iconWidget);
        } else {
            // Update existing widget instead of creating new one
            const child = this.dropdownButton.get_child();
            if (child !== this._iconWidget) {
                // Widget was replaced, restore reference
                this._iconWidget = child;
            }

            // Update icon if it's a Gtk.Image (not emoji label)
            if (this._iconWidget instanceof Gtk.Image) {
                if (currentProject.icon && !currentProject.icon.startsWith('emoji:')) {
                    // Update icon using set_from_icon_name (reuses widget, avoids snapshot)
                    this._iconWidget.set_from_icon_name(currentProject.icon);
                }
            } else if (this._iconWidget instanceof Gtk.Label && currentProject.icon?.startsWith('emoji:')) {
                // Update emoji label
                const emoji = currentProject.icon.substring(6);
                this._iconWidget.set_label(emoji);
            } else {
                // Type mismatch - need to recreate (rare case: switching between emoji and icon)
                this._iconWidget = createProjectIconWidget(currentProject, 16);
                this.dropdownButton.set_child(this._iconWidget);
            }
        }

        // Get icon color (auto, white, black based on background)
        const iconColor = this._getProjectIconColor(currentProject);

        // Apply background color and icon color
        const provider = new Gtk.CssProvider();
        provider.load_from_string(
            `.project-dropdown-button {
                background: ${currentProject.color};
                border-radius: 6px;
                color: ${iconColor};
                min-width: 36px;
                min-height: 36px;
                padding: 0;
                filter: none;
                opacity: 1;
            }
            .project-dropdown-button:hover {
                filter: brightness(1.1);
            }
            .emoji-icon {
                font-size: 16px;
            }`
        );

        this.dropdownButton.get_style_context().add_provider(provider, Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION);
        this.dropdownButton.add_css_class('project-dropdown-button');
        this.dropdownButton.set_tooltip_text(`Project: ${currentProject.name}`);
    }

    _getProjectIconColor(project) {
        // Use stored icon_color if available and icon_color_mode is manual
        if (project.icon_color_mode === 'manual' && project.icon_color) {
            return project.icon_color;
        }

        // Auto mode - calculate based on background brightness
        const color = project.color || '#9a9996';
        const hex = color.replace('#', '');
        const r = parseInt(hex.substr(0, 2), 16);
        const g = parseInt(hex.substr(2, 2), 16);
        const b = parseInt(hex.substr(4, 2), 16);
        const brightness = (r * 299 + g * 587 + b * 114) / 1000;
        return brightness > 128 ? '#000000' : '#ffffff';
    }

    _populateProjectList() {
        this.isUpdatingSelection = true;


        // Clear existing rows
        let child = this.projectList.get_first_child();
        while (child) {
            const next = child.get_next_sibling();
            this.projectList.remove(child);
            child = next;
        }

        // Add projects to list
        this.projects.forEach(project => {
            const row = this._createProjectRow(project);
            this.projectList.append(row);
        });

        this.isUpdatingSelection = false;
    }

    _createProjectRow(project) {
        const row = new Gtk.ListBoxRow({
            activatable: true
        });
        row.projectData = project;

        const box = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 12,
            margin_start: 12,
            margin_end: 12,
            margin_top: 8,
            margin_bottom: 8
        });

        // Color preview square with icon
        const colorPreview = new Gtk.Button({
            width_request: 32,
            height_request: 32,
            halign: Gtk.Align.CENTER,
            valign: Gtk.Align.CENTER,
            sensitive: false,
        });

        // Create icon for preview
        const previewIcon = createProjectIconWidget(project, 14);

        const iconColor = this._getProjectIconColor(project);
        const previewProvider = new Gtk.CssProvider();
        previewProvider.load_from_string(
            `.project-preview {
                background: ${project.color};
                border-radius: 4px;
                color: ${iconColor};
                min-width: 32px;
                min-height: 32px;
                padding: 0;
                filter: none;
                opacity: 1;
            }
            .emoji-icon-small {
                font-size: 14px;
            }`
        );
        colorPreview.get_style_context().add_provider(previewProvider, Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION);
        colorPreview.add_css_class('project-preview');
        colorPreview.set_child(previewIcon);

        // Project name
        const nameLabel = new Gtk.Label({
            label: project.name,
            halign: Gtk.Align.START,
            hexpand: true,
            ellipsize: 3 // PANGO_ELLIPSIZE_END
        });

        // Selection indicator
        if (project.id === this.currentProjectId) {
            const checkIcon = new Gtk.Image({
                icon_name: 'object-select-symbolic',
                pixel_size: 16
            });
            box.append(colorPreview);
            box.append(nameLabel);
            box.append(checkIcon);
        } else {
            box.append(colorPreview);
            box.append(nameLabel);
        }

        row.set_child(box);
        return row;
    }

    _filterProjects(query) {
        let child = this.projectList.get_first_child();
        while (child) {
            const project = child.projectData;
            if (project) {
                const matches = project.name.toLowerCase().includes(query);
                child.set_visible(matches);
            }
            child = child.get_next_sibling();
        }
    }

    /**
     * Update the projects list (when projects change)
     */
    updateProjects(projects) {
        this.projects = projects;
        this._updateButtonAppearance();
    }

    /**
     * Update current selection
     */
    setCurrentProject(projectId) {
        this.currentProjectId = projectId;
        this._updateButtonAppearance();
    }

    /**
     * Get the widget
     */
    getWidget() {
        return this.dropdown;
    }
}
