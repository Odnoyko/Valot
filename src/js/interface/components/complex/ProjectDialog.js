import Gtk from 'gi://Gtk';
import { FormDialog } from './FormDialog.js';
import { InputValidator } from '../../../func/global/inputValidation.js';
import { Button } from '../primitive/Button.js';
import { getProjectIconColor } from '../../../func/global/colorUtils.js';

/**
 * Project creation/editing dialog using the modular form system
 */
export class ProjectDialog extends FormDialog {
    constructor(config = {}) {
        const {
            mode = 'create',
            project = null,
            onProjectSave = null,
            ...formConfig
        } = config;

        const isEdit = mode === 'edit' && project;
        
        const dialogConfig = {
            title: isEdit ? 'Edit Project' : 'Create New Project',
            subtitle: isEdit ? 'Update project name and appearance' : 'Create a new project',
            submitLabel: isEdit ? 'Save Changes' : 'Create Project',
            fields: [],  // No form fields - we'll create custom content later
            onSubmit: (formData, dialog) => {
                return this._handleProjectSave(formData, dialog);
            },
            ...formConfig
        };

        super(dialogConfig);

        // Store project data after super call
        this.mode = mode;
        this.project = project;
        this.onProjectSave = onProjectSave;
        this.currentColor = isEdit ? (project.color || '#3584e4') : '#3584e4';
        this.currentIcon = isEdit ? (project.icon || 'folder-symbolic') : 'folder-symbolic';
        this.currentIconColorMode = isEdit ? (project.icon_color_mode || 'auto') : 'auto';

        // Now create and set the custom content
        this._setupInlineContent(isEdit, project);
    }

    _setupInlineContent(isEdit, project) {
        // Create the inline content and add it to the existing form container
        const inlineContent = this._createInlineContent(isEdit, project);
        
        // The FormDialog creates a vertical box container as extra_child
        const formContainer = this.widget.get_extra_child();
        if (formContainer) {
            // Clear any existing children and add our inline content
            let child = formContainer.get_first_child();
            while (child) {
                const next = child.get_next_sibling();
                formContainer.remove(child);
                child = next;
            }
            formContainer.append(inlineContent);
        }
    }

    _createInlineContent(isEdit, project) {
        // Create horizontal box for inline layout
        const inlineBox = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 12,
            margin_top: 12,
            margin_bottom: 12,
            margin_start: 12,
            margin_end: 12
        });

        // Project appearance button (similar to the one in project list)
        this.projectButton = new Button({
            cssClasses: ['project-button', 'project-appearance-btn', 'inline-dialog-btn'],
            onClick: () => this._openProjectAppearanceDialog()
        });

        // Update button appearance based on current project data
        this._updateProjectButton();

        // Name input - use initialName from config if provided
        const initialText = isEdit ? (project.name || '') : (this.config.initialName || '');
        this.nameEntry = new Gtk.Entry({
            placeholder_text: 'Enter project name...',
            text: initialText,
            hexpand: true,
            valign: Gtk.Align.CENTER,
            css_classes: ['project-name-input', 'inline-dialog-input', 'project-entry']
        });

        // Add widgets to inline box
        inlineBox.append(this.projectButton.widget);
        inlineBox.append(this.nameEntry);

        return inlineBox;
    }

    _updateProjectButton() {
        if (!this.projectButton) return;

        // Create icon widget similar to the one in ProjectsPage
        const iconWidget = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 0,
            valign: Gtk.Align.CENTER,
            halign: Gtk.Align.CENTER
        });

        // Handle emoji vs icon
        if (this.currentIcon && this.currentIcon.length <= 4 && /[\u{1F000}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u.test(this.currentIcon)) {
            // It's an emoji
            const emojiLabel = new Gtk.Label({
                label: this.currentIcon,
                css_classes: ['emoji-icon'],
                valign: Gtk.Align.CENTER,
                halign: Gtk.Align.CENTER
            });
            iconWidget.append(emojiLabel);
        } else {
            // It's an icon name
            const tempProject = {
                color: this.currentColor,
                icon_color_mode: this.currentIconColorMode || 'auto'
            };
            const iconColor = getProjectIconColor(tempProject);
            
            const icon = new Gtk.Image({
                icon_name: this.currentIcon || 'folder-symbolic',
                icon_size: Gtk.IconSize.NORMAL,
                valign: Gtk.Align.CENTER,
                halign: Gtk.Align.CENTER
            });
            
            // Apply color styling based on the calculated icon color
            if (iconColor === 'white') {
                icon.add_css_class('icon-light');
            } else {
                icon.add_css_class('icon-dark');
            }
            
            iconWidget.append(icon);
        }

        // Apply CSS styling for the button
        const provider = new Gtk.CssProvider();
        provider.load_from_string(
            `.project-button { 
                background: ${this.currentColor}; 
                border-radius: 9px; 
                min-width: 42px; 
                min-height: 42px; 
            }
            .emoji-icon {
                font-size: 18px;
            }`
        );
        this.projectButton.widget.get_style_context().add_provider(provider, Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION);
        this.projectButton.widget.set_child(iconWidget);
    }

    _openProjectAppearanceDialog() {
        // Get the project manager from parent window to open the same appearance dialog
        const parentWindow = this.config.parentWindow;
        if (parentWindow && parentWindow.projectManager) {
            const tempProject = {
                id: this.project ? this.project.id : null,
                name: this.nameEntry.get_text() || 'New Project',
                color: this.currentColor,
                icon: this.currentIcon,
                icon_color_mode: this.currentIconColorMode
            };

            // Use the same appearance dialog as in the project list
            parentWindow.projectManager._showProjectAppearanceDialog(tempProject, (updatedProject) => {
                // Callback when appearance is changed
                this.currentColor = updatedProject.color;
                this.currentIcon = updatedProject.icon;
                this.currentIconColorMode = updatedProject.icon_color_mode;
                this._updateProjectButton();
            });
        }
    }

    _handleProjectSave(formData, dialog) {
        // Get data from our custom inputs
        const customFormData = {
            name: this.nameEntry ? this.nameEntry.get_text() : '',
            color: this.currentColor,
            icon: this.currentIcon,
            iconColorMode: this.currentIconColorMode
        };

        // Additional validation
        if (!this._validateProjectData(customFormData)) {
            return false; // Keep dialog open
        }

        // Prepare project data
        const projectData = {
            name: customFormData.name.trim(),
            description: '', // No description field in inline version
            color: customFormData.color,
            icon: customFormData.icon,
            iconColorMode: customFormData.iconColorMode
        };

        // Add ID for edit mode
        if (this.mode === 'edit' && this.project) {
            projectData.id = this.project.id;
        }

        // Call the save handler
        if (this.onProjectSave) {
            try {
                const result = this.onProjectSave(projectData, this.mode, this);
                
                // If save handler returns false, keep dialog open
                if (result === false) {
                    return false;
                }
                
                // Emit success event
                this._emit('projectSaved', { data: projectData, mode: this.mode });
                return true; // Close dialog
                
            } catch (error) {
                console.error('Error saving project:', error);
                this.showFieldError('name', 'Failed to save project. Please try again.');
                return false;
            }
        }

        return true; // Close dialog if no handler
    }

    _validateProjectData(formData) {
        // Project name validation
        const nameValidation = InputValidator.validateProjectName(formData.name);
        if (!nameValidation.valid) {
            this._showNameError(nameValidation.error);
            return false;
        }

        // Color validation (basic check)
        if (!formData.color || !formData.color.startsWith('#')) {
            this._showNameError('Invalid color selected');
            return false;
        }

        this._clearNameError();
        return true;
    }

    _showNameError(message) {
        if (this.nameEntry) {
            this.nameEntry.add_css_class('error');
            this.nameEntry.set_tooltip_text(message);
        }
    }

    _clearNameError() {
        if (this.nameEntry) {
            this.nameEntry.remove_css_class('error');
            this.nameEntry.set_tooltip_text('');
        }
    }

    /**
     * Update project data for edit mode
     */
    setProject(project) {
        this.project = project;
        this.mode = 'edit';
        
        // Update dialog title
        this.config.title = 'Edit Project';
        this.config.subtitle = 'Update project name and appearance';
        this.config.submitLabel = 'Save Changes';
        
        // Update custom inputs
        if (this.nameEntry) {
            this.nameEntry.set_text(project.name || '');
        }
        this.currentColor = project.color || '#3584e4';
        this.currentIcon = project.icon || 'folder-symbolic';
        this.currentIconColorMode = project.icon_color_mode || 'auto';
        this._updateProjectButton();
    }

    /**
     * Reset dialog for creating new project
     */
    resetForNew() {
        this.project = null;
        this.mode = 'create';
        
        // Update dialog title
        this.config.title = 'Create New Project';
        this.config.subtitle = 'Create a new project';
        this.config.submitLabel = 'Create Project';
        
        // Clear custom inputs
        if (this.nameEntry) {
            this.nameEntry.set_text('');
        }
        this.currentColor = '#3584e4';
        this.currentIcon = 'folder-symbolic';
        this.currentIconColorMode = 'auto';
        this._updateProjectButton();
        this._clearNameError();
    }

    /**
     * Show project duplicate error
     */
    showDuplicateError() {
        this._showNameError('A project with this name already exists');
    }

    /**
     * Get project data preview
     */
    getProjectPreview() {
        return {
            name: this.nameEntry ? this.nameEntry.get_text() || 'Untitled Project' : 'Untitled Project',
            description: '', // No description in inline version
            color: this.currentColor || '#3584e4',
            icon: this.currentIcon || 'folder-symbolic',
            iconColorMode: this.currentIconColorMode || 'auto'
        };
    }

    /**
     * Create a project dialog factory method
     */
    static create(config = {}) {
        return new ProjectDialog(config);
    }

    /**
     * Create dialog for new project
     */
    static createNew(config = {}) {
        return new ProjectDialog({
            mode: 'create',
            ...config
        });
    }

    /**
     * Create dialog for editing existing project
     */
    static createEdit(project, config = {}) {
        return new ProjectDialog({
            mode: 'edit',
            project,
            ...config
        });
    }
}