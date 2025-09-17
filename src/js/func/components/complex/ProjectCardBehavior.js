/**
 * Functionality: Project Card Business Logic and Interactions
 * Handles events, data management, and project-specific actions
 */
export class ProjectCardBehavior {
    constructor(projectCardInterface, config = {}) {
        this.interface = projectCardInterface;
        this.config = {
            onEdit: config.onEdit || null,
            onDelete: config.onDelete || null,
            onSelect: config.onSelect || null,
            onDoubleClick: config.onDoubleClick || null,
            contextMenu: config.contextMenu || null,
            selectable: config.selectable || false,
            ...config
        };

        this.isSelected = false;
        this.project = this.interface.config.project;
        
        this._setupEvents();
        this._setupButtonBehaviors();
    }

    _setupEvents() {
        const widget = this.interface.getWidget();

        // Click events
        const clickGesture = new Gtk.GestureClick();
        
        clickGesture.connect('pressed', (gesture, n_press, x, y) => {
            if (n_press === 1) {
                // Single click
                if (this.config.selectable) {
                    this.toggleSelection();
                }
            } else if (n_press === 2) {
                // Double click
                if (this.config.onDoubleClick) {
                    this.config.onDoubleClick(this.project, this);
                }
            }
        });
        
        widget.add_controller(clickGesture);

        // Context menu (right click)
        if (this.config.contextMenu) {
            const rightClickGesture = new Gtk.GestureClick({
                button: 3 // Right mouse button
            });
            
            rightClickGesture.connect('pressed', (gesture, n_press, x, y) => {
                this._showContextMenu(x, y);
            });
            
            widget.add_controller(rightClickGesture);
        }

        // Keyboard events
        const keyController = new Gtk.EventControllerKey();
        keyController.connect('key-pressed', (controller, keyval, keycode, state) => {
            return this._handleKeyPress(keyval, keycode, state);
        });
        widget.add_controller(keyController);
    }

    _setupButtonBehaviors() {
        const elements = this.interface.getElements();

        // Edit button
        if (elements.editButton && this.config.onEdit) {
            elements.editButton.widget.connect('clicked', () => {
                this.config.onEdit(this.project, this);
            });
        }

        // Delete button
        if (elements.deleteButton && this.config.onDelete) {
            elements.deleteButton.widget.connect('clicked', () => {
                this._handleDelete();
            });
        }
    }

    _handleKeyPress(keyval, keycode, state) {
        // Delete key
        if (keyval === 65535) { // Delete key
            if (this.isSelected && this.config.onDelete) {
                this._handleDelete();
                return true;
            }
        }
        
        // Enter key
        if (keyval === 65293) { // Enter key
            if (this.config.onDoubleClick) {
                this.config.onDoubleClick(this.project, this);
                return true;
            }
        }

        return false;
    }

    _handleDelete() {
        // Show confirmation before deleting
        this._showDeleteConfirmation().then((confirmed) => {
            if (confirmed && this.config.onDelete) {
                this.config.onDelete(this.project, this);
            }
        });
    }

    async _showDeleteConfirmation() {
        // This would show a proper confirmation dialog
        // For now, just return a simple confirmation
        return new Promise((resolve) => {
            const dialog = new Adw.AlertDialog({
                heading: 'Delete Project',
                body: `Are you sure you want to delete "${this.project.name}"?`
            });

            dialog.add_response('cancel', 'Cancel');
            dialog.add_response('delete', 'Delete');
            dialog.set_response_appearance('delete', Adw.ResponseAppearance.DESTRUCTIVE);

            dialog.connect('response', (dialog, response) => {
                resolve(response === 'delete');
                dialog.close();
            });

            dialog.present(this.interface.getWidget().get_root());
        });
    }

    _showContextMenu(x, y) {
        const menu = new Gtk.PopoverMenu();
        const menuModel = new Gio.Menu();

        menuModel.append('Edit Project', 'project.edit');
        menuModel.append('Duplicate Project', 'project.duplicate');
        menuModel.append('Export Project', 'project.export');
        menuModel.append('Delete Project', 'project.delete');

        menu.set_menu_model(menuModel);
        menu.set_parent(this.interface.getWidget());
        menu.popup();
    }

    // Selection management
    toggleSelection() {
        this.setSelected(!this.isSelected);
    }

    setSelected(selected) {
        this.isSelected = selected;
        this.interface.setSelected(selected);
        
        if (this.config.onSelect) {
            this.config.onSelect(this.project, selected, this);
        }
    }

    // Project data management
    updateProject(projectData) {
        this.project = { ...this.project, ...projectData };
        this.interface.updateProject(this.project);
    }

    // Statistics and time tracking
    addTime(seconds) {
        this.project.totalTime = (this.project.totalTime || 0) + seconds;
        this.interface.updateProject(this.project);
    }

    resetTime() {
        this.project.totalTime = 0;
        this.interface.updateProject(this.project);
    }

    // Theme and appearance
    applyTheme(theme) {
        const themes = {
            default: ['project-card'],
            compact: ['project-card', 'compact'],
            featured: ['project-card', 'featured'],
            archived: ['project-card', 'archived']
        };

        // Remove existing theme classes
        Object.values(themes).flat().forEach(cls => {
            this.interface.removeClass(cls);
        });

        // Apply new theme
        if (themes[theme]) {
            themes[theme].forEach(cls => {
                this.interface.addClass(cls);
            });
        }
    }

    // Animation and visual feedback
    flash() {
        this.interface.addClass('flash');
        setTimeout(() => {
            this.interface.removeClass('flash');
        }, 300);
    }

    pulse() {
        this.interface.addClass('pulse');
        setTimeout(() => {
            this.interface.removeClass('pulse');
        }, 1000);
    }

    // State management
    getState() {
        return {
            project: this.project,
            isSelected: this.isSelected,
            theme: this.currentTheme
        };
    }

    setState(state) {
        if (state.project) {
            this.updateProject(state.project);
        }
        if (state.hasOwnProperty('isSelected')) {
            this.setSelected(state.isSelected);
        }
        if (state.theme) {
            this.applyTheme(state.theme);
        }
    }

    // Cleanup
    destroy() {
        // Remove event listeners and clean up resources
        const widget = this.interface.getWidget();
        // GTK will handle automatic cleanup of controllers
        // But we can do any custom cleanup here
    }
}