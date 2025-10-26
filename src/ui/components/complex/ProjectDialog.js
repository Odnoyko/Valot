import Gtk from 'gi://Gtk';
import { FormDialog } from './FormDialog.js';
import { ValidationUtils, ColorUtils } from 'resource:///com/odnoyko/valot/ui/utils/CoreImports.js';
import { Button } from '../primitive/Button.js';
import { TOOLTIP } from 'resource:///com/odnoyko/valot/ui/utils/commonStrings.js';
import { ProjectAppearanceDialog } from './ProjectAppearanceDialog.js';

/**
 * Get icon color based on background brightness and mode
 */
function getProjectIconColor(project) {
    const mode = project.icon_color_mode || 'auto';

    if (mode === 'light') {
        return '#ffffff';
    } else if (mode === 'dark') {
        return '#000000';
    }

    // Auto mode: calculate based on color brightness
    const color = project.color || '#3584e4';
    const hex = color.replace('#', '');
    const r = parseInt(hex.substr(0, 2), 16);
    const g = parseInt(hex.substr(2, 2), 16);
    const b = parseInt(hex.substr(4, 2), 16);
    const brightness = (r * 299 + g * 587 + b * 114) / 1000;
    return brightness > 128 ? '#000000' : '#ffffff';
}

/**
 * Project creation/editing dialog using the modular form system
 */
export class ProjectDialog extends FormDialog {
    constructor(config = {}) {
        const {
            mode = 'create',
            project = null,
            onProjectSave = null,
            forceCreateAppearance = false, // New parameter to force "create" appearance
            ...formConfig
        } = config;

        const isEdit = mode === 'edit' && project;
        const showAsCreate = !isEdit || forceCreateAppearance;

        const dialogConfig = {
            title: showAsCreate ? 'Create New Project' : 'Create Project',
            subtitle: showAsCreate ? 'Create a new project' : 'Update project name and appearance',
            submitLabel: showAsCreate ? 'Create Project' : 'Save Changes',
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
        this.currentIcon = isEdit ? project.icon : null;
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

        // Project appearance button (same as project-settings-button)
        this.projectButton = new Gtk.Button({
            width_request: 40,
            height_request: 40,
            halign: Gtk.Align.CENTER,
            valign: Gtk.Align.CENTER,
            css_classes: ['project-settings-button', 'flat'],
            tooltip_text: TOOLTIP.CHANGE_APPEARANCE
        });
        
        this.projectButton.connect('clicked', () => this._openProjectAppearanceDialog());

        // Update button appearance based on current project data
        this._updateProjectButton();

        // Name input - use initialName from config if provided
        const initialText = isEdit ? (project.name || '') : (this.config.initialName || '');
        this.nameEntry = new Gtk.Entry({
            placeholder_text: _('Enter project name...'),
            text: initialText,
            hexpand: true,
            valign: Gtk.Align.CENTER,
            css_classes: ['project-name-input', 'inline-dialog-input', 'project-entry']
        });

        // Add widgets to inline box
        inlineBox.append(this.projectButton);
        inlineBox.append(this.nameEntry);

        return inlineBox;
    }

    _updateProjectButton() {
        if (!this.projectButton) return;

        // Remove old CSS provider if exists
        if (this.cssProvider) {
            this.projectButton.get_style_context().remove_provider(this.cssProvider);
        }

        // Create icon widget (handle both emoji and system icons)
        let iconWidget;
        if (this.currentIcon && this.currentIcon.startsWith('emoji:')) {
            const emoji = this.currentIcon.substring(6);
            iconWidget = new Gtk.Label({
                label: emoji,
                css_classes: ['emoji-icon'],
                halign: Gtk.Align.CENTER,
                valign: Gtk.Align.CENTER
            });
        } else {
            iconWidget = new Gtk.Image({
                icon_name: this.currentIcon || null,
                pixel_size: 20
            });
        }
        
        // Apply background color and icon color (same as project list)
        const tempProject = {
            color: this.currentColor,
            icon_color_mode: this.currentIconColorMode || 'auto'
        };
        const iconColor = getProjectIconColor(tempProject);
        
        // Create new CSS provider and store reference
        this.cssProvider = new Gtk.CssProvider();
        this.cssProvider.load_from_string(
            `.project-settings-button { 
                background-color: ${this.currentColor}; 
                border-radius: 6px; 
                color: ${iconColor}; 
                min-width: 40px;
                min-height: 40px;
                padding: 0;
            }
            .project-settings-button:hover {
                filter: brightness(1.1);
                box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            }
            .emoji-icon {
                font-size: 18px;
            }`
        );
        this.projectButton.get_style_context().add_provider(this.cssProvider, Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION);
        
        this.projectButton.set_child(iconWidget);
    }

    _openProjectAppearanceDialog() {
        // Create temporary project object for appearance dialog
        const tempProject = {
            id: this.project ? this.project.id : null,
            name: this.nameEntry.get_text() || 'New Project',
            color: this.currentColor,
            icon: this.currentIcon,
            icon_color_mode: this.currentIconColorMode
        };

        // Open ProjectAppearanceDialog directly
        const appearanceDialog = new ProjectAppearanceDialog({
            project: tempProject,
            parentWindow: this.config.parentWindow || this.widget,
            onSave: async (updatedProject) => {
                // Update current project appearance values
                this.currentColor = updatedProject.color;
                this.currentIcon = updatedProject.icon;
                this.currentIconColorMode = updatedProject.icon_color_mode;
                this._updateProjectButton();
            }
        });

        appearanceDialog.present();
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

        // Add ID based on mode
        if (this.mode === 'edit' && this.project) {
            projectData.id = this.project.id;
        } else if (this.mode === 'create') {
            // Generate temporary ID for validation purposes
            projectData.tempId = Date.now(); // Temporary ID that will be replaced by DB auto-increment
            projectData.isTemporary = true; // Flag to indicate this is a temporary ID
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
                this.showFieldError('name', _('Failed to save project. Please try again.'));
                return false;
            }
        }

        return true; // Close dialog if no handler
    }

    _validateProjectData(formData) {
        // Project name validation
        if (!formData.name || formData.name.trim().length === 0) {
            this._showNameError('Project name is required');
            return false;
        }

        if (formData.name.trim().length > 100) {
            this._showNameError('Project name is too long (max 100 characters)');
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
        this.config.title = _('Create Project');
        this.config.subtitle = _('Update project name and appearance');
        this.config.submitLabel = _('Save Changes');
        
        // Update custom inputs
        if (this.nameEntry) {
            this.nameEntry.set_text(project.name || '');
        }
        this.currentColor = project.color || '#3584e4';
        this.currentIcon = project.icon;
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
        this.config.title = _('Create New Project');
        this.config.subtitle = _('Create a new project');
        this.config.submitLabel = _('Create Project');
        
        // Clear custom inputs
        if (this.nameEntry) {
            this.nameEntry.set_text('');
        }
        this.currentColor = '#3584e4';
        this.currentIcon = null;
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
            icon: this.currentIcon,
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
