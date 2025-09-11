import Gtk from 'gi://Gtk';
import Pango from 'gi://Pango';
import { Button } from '../primitive/Button.js';
import { Label } from '../primitive/Label.js';

/**
 * Complex component for displaying project information in a card format
 */
export class ProjectCard {
    constructor(config = {}) {
        const defaultConfig = {
            project: null,
            showActions: true,
            showStats: true,
            onEdit: null,
            onDelete: null,
            onSelect: null,
            isSelected: false,
            cssClasses: ['project-card']
        };

        this.config = { ...defaultConfig, ...config };
        this.widget = this._createWidget();
        
        if (this.config.project) {
            this._createContent();
        }
    }

    _createWidget() {
        const card = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 12,
            margin_top: 12,
            margin_bottom: 12,
            margin_start: 12,
            margin_end: 12,
            css_classes: ['card']
        });

        return card;
    }


    _createContent() {
        const project = this.config.project;
        
        // Header with icon, name, and actions
        const header = this._createHeader(project);
        this.widget.append(header);

        // Stats section
        if (this.config.showStats) {
            const stats = this._createStats(project);
            this.widget.append(stats);
        }

        // Update selection state
        this._updateSelectionState();
    }

    _createHeader(project) {
        const header = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 12,
            hexpand: true
        });

        // Project icon with color
        const iconBox = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            css_classes: ['project-icon-container'],
            width_request: 32,
            height_request: 32
        });

        const icon = new Gtk.Image({
            icon_name: project.icon || 'folder-symbolic',
            pixel_size: 24
        });

        // Apply project color styling
        this._applyProjectColor(iconBox, project.color);
        iconBox.append(icon);

        // Project name and info
        const infoBox = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 4,
            hexpand: true
        });

        this.nameLabel = new Label({
            text: project.name,
            cssClasses: ['heading'],
            halign: Gtk.Align.START,
            ellipsize: Pango.EllipsizeMode.END
        });

        infoBox.append(this.nameLabel.widget);

        // Client info if available
        if (project.client_name) {
            this.clientLabel = Label.createCaption(`Client: ${project.client_name}`);
            infoBox.append(this.clientLabel.widget);
        }

        // Action buttons
        const actionBox = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 6
        });

        if (this.config.showActions) {
            if (this.config.onEdit) {
                this.editButton = new Button({
                    iconName: 'document-edit-symbolic',
                    cssClasses: ['flat', 'circular'],
                    tooltipText: 'Edit project',
                    widthRequest: 32,
                    heightRequest: 32,
                    onClick: () => this.config.onEdit(project, this)
                });
                actionBox.append(this.editButton.widget);
            }

            if (this.config.onDelete && project.id !== 1) { // Don't allow deleting default project
                this.deleteButton = new Button({
                    iconName: 'edit-delete-symbolic',
                    cssClasses: ['flat', 'circular', 'destructive-action'],
                    tooltipText: 'Delete project',
                    widthRequest: 32,
                    heightRequest: 32,
                    onClick: () => this.config.onDelete(project, this)
                });
                actionBox.append(this.deleteButton.widget);
            }
        }

        header.append(iconBox);
        header.append(infoBox);
        header.append(actionBox);

        return header;
    }

    _createStats(project) {
        const stats = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 16,
            css_classes: ['project-stats']
        });

        // Total time
        const totalTime = this._formatTime(project.total_time || 0);
        this.totalTimeLabel = new Label({
            text: `Total: ${totalTime}`,
            cssClasses: ['monospace', 'dim-label']
        });
        stats.append(this.totalTimeLabel.widget);

        // Task count if available
        if (project.task_count !== undefined) {
            this.taskCountLabel = new Label({
                text: `Tasks: ${project.task_count}`,
                cssClasses: ['dim-label']
            });
            stats.append(this.taskCountLabel.widget);
        }

        // Active indicator
        if (project.is_active) {
            this.activeIndicator = new Label({
                text: '●',
                cssClasses: ['success', 'heading'],
                tooltipText: 'Currently tracking'
            });
            stats.append(this.activeIndicator.widget);
        }

        return stats;
    }

    _applyProjectColor(widget, color) {
        if (!color) return;

        const css = `
            .project-icon-container {
                background: ${color};
                border-radius: 6px;
                padding: 4px;
            }
        `;

        const provider = new Gtk.CssProvider();
        provider.load_from_data(css, -1);
        widget.get_style_context().add_provider(
            provider, 
            Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION
        );
    }

    _updateSelectionState() {
        if (this.config.isSelected) {
            this.widget.add_css_class('selected');
        } else {
            this.widget.remove_css_class('selected');
        }
    }

    _formatTime(seconds) {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
    }

    /**
     * Update project data
     */
    updateProject(project) {
        this.config.project = project;
        
        // Clear existing content
        let child = this.widget.get_first_child();
        while (child) {
            const next = child.get_next_sibling();
            this.widget.remove(child);
            child = next;
        }

        // Recreate content
        this._createContent();
    }

    /**
     * Set selection state
     */
    setSelected(selected) {
        this.config.isSelected = selected;
        this._updateSelectionState();
        this._emit('selectionChanged', selected);
    }

    /**
     * Get project data
     */
    getProject() {
        return this.config.project;
    }

    /**
     * Update project stats
     */
    updateStats(stats) {
        if (stats.totalTime !== undefined) {
            if (this.totalTimeLabel) {
                this.totalTimeLabel.setText(`Total: ${this._formatTime(stats.totalTime)}`);
            }
        }

        if (stats.taskCount !== undefined) {
            if (this.taskCountLabel) {
                this.taskCountLabel.setText(`Tasks: ${stats.taskCount}`);
            }
        }

        if (stats.isActive !== undefined) {
            if (stats.isActive && !this.activeIndicator) {
                // Add active indicator
                this.activeIndicator = new Label({
                    text: '●',
                    cssClasses: ['success', 'heading'],
                    tooltipText: 'Currently tracking'
                });
                // Would need to add to stats container here if needed
            } else if (!stats.isActive && this.activeIndicator) {
                // Remove active indicator by hiding it
                this.activeIndicator.widget.set_visible(false);
                this.activeIndicator = null;
            }
        }
    }
}