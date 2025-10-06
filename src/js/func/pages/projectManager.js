import Gtk from 'gi://Gtk';
import Adw from 'gi://Adw';
import Gdk from 'gi://Gdk';
import { InputValidator } from 'resource:///com/odnoyko/valot/js/func/global/inputValidation.js';
import { getProjectIconColor } from 'resource:///com/odnoyko/valot/js/func/global/colorUtils.js';
import { executeNonSelectCommand } from 'resource:///com/odnoyko/valot/js/func/global/dbinitialisation.js';
import { getAllEmojis } from 'resource:///com/odnoyko/valot/js/data/emojis.js';
import { getAllIcons } from 'resource:///com/odnoyko/valot/js/data/icons.js';
import { WidgetFactory } from 'resource:///com/odnoyko/valot/js/interface/components/widgetFactory.js';
import { SelectorFactory } from 'resource:///com/odnoyko/valot/js/interface/components/selectorFactory.js';
import { BUTTON, HEADING, MESSAGE, LABEL, PLACEHOLDER, TOOLTIP, ICON_MODE, DIALOG_BODY } from 'resource:///com/odnoyko/valot/js/func/global/commonStrings.js';

// New modular dialog system
import { ProjectDialog } from 'resource:///com/odnoyko/valot/js/interface/components/complex/ProjectDialog.js';

// Project management functionality
export class ProjectManager {
    constructor(dbConnection, executeQuery, executeNonSelectCommand, projectColors, projectIcons) {
        this.dbConnection = dbConnection;
        this.executeQuery = executeQuery;
        this.executeNonSelectCommand = executeNonSelectCommand;
        this.projectColors = projectColors;
        this.projectIcons = projectIcons;
        this.parentWindow = null; // Will be set during initialization
    }

    setParentWindow(parentWindow) {
        this.parentWindow = parentWindow;
    }

    createProject(name, color, icon, parentWindow, iconColorMode = 'auto') {
        try {
            
            // Validate inputs one more time for safety
            const nameValidation = InputValidator.validateProjectName(name);
            if (!nameValidation.valid) {
                //('Project validation failed:', nameValidation.error);
                this._showError(parentWindow, HEADING.VALIDATION_ERROR, nameValidation.error);
                return false;
            }

            const colorValidation = InputValidator.validateColor(color);
            if (!colorValidation.valid) {
                //('Color validation failed:', colorValidation.error);
                this._showError(parentWindow, HEADING.VALIDATION_ERROR, colorValidation.error);
                return false;
            }
            
            // Use validated inputs
            const safeName = InputValidator.sanitizeForSQL(nameValidation.sanitized);
            const safeColor = colorValidation.sanitized;
            const safeIcon = icon || 'folder-symbolic';
            const safeIconColorMode = iconColorMode || 'auto';
            
            // Calculate icon color using ColorUtils - ONCE at creation
            const calculatedIconColor = getProjectIconColor({
                color: safeColor,
                icon_color_mode: safeIconColorMode
            });
            
            // First ensure the columns exist
            this._ensureDarkIconsColumn();
            this._ensureIconColorModeColumn();
            this._ensureIconColorColumn();
            
            // Check for duplicate project names
            if (this._projectNameExists(safeName)) {
                this._showError(parentWindow, HEADING.DUPLICATE_PROJECT, MESSAGE.PROJECT_EXISTS);
                return false;
            }
            
            // Use sanitized inputs
            const sql = `INSERT INTO Project (name, color, icon, total_time, icon_color_mode, icon_color) VALUES ('${safeName}', '${safeColor}', '${safeIcon}', 0, '${safeIconColorMode}', '${calculatedIconColor}')`;
            
            this.executeNonSelectCommand(this.dbConnection, sql);
            
            // Reload projects
            if (parentWindow && parentWindow.projectsPageComponent) {
                parentWindow.projectsPageComponent.loadProjects();
            }
            return true;
            
        } catch (error) {
            //('Error creating project:', error);
            this._showError(parentWindow, HEADING.DATABASE_ERROR, _('Failed to create project. Please try again.'));
            return false;
        }
    }

    _ensureDarkIconsColumn() {
        try {
            const alterSql = `ALTER TABLE Project ADD COLUMN dark_icons INTEGER DEFAULT 0`;
            this.executeNonSelectCommand(this.dbConnection, alterSql);
        } catch (error) {
            // Column already exists, ignore error
            if (error.message && error.message.includes('duplicate column name')) {
                // dark_icons column already exists
            } else {
            }
        }
    }

    _ensureIconColorModeColumn() {
        try {
            const alterSql = `ALTER TABLE Project ADD COLUMN icon_color_mode TEXT DEFAULT 'auto'`;
            this.executeNonSelectCommand(this.dbConnection, alterSql);
        } catch (error) {
            // Column already exists, ignore error
            if (error.message && error.message.includes('duplicate column name')) {
                // icon_color_mode column already exists
            } else {
            }
        }
    }

    _ensureIconColorColumn() {
        try {
            const alterSql = `ALTER TABLE Project ADD COLUMN icon_color TEXT DEFAULT 'white'`;
            this.executeNonSelectCommand(this.dbConnection, alterSql);
        } catch (error) {
            // Column already exists, ignore error
            if (error.message && error.message.includes('duplicate column name')) {
                // icon_color column already exists
            } else {
            }
        }
    }

    /**
     * Create project and return the new project ID
     * Used for the new creation flow where we need the ID immediately
     */
    createProjectAndGetId(name, color, icon, parentWindow, iconColorMode = 'auto') {
        try {
            
            // Validate inputs
            const nameValidation = InputValidator.validateProjectName(name);
            if (!nameValidation.valid) {
                //('Project validation failed:', nameValidation.error);
                this._showError(parentWindow, HEADING.VALIDATION_ERROR, nameValidation.error);
                return null;
            }

            const colorValidation = InputValidator.validateColor(color);
            if (!colorValidation.valid) {
                //('Color validation failed:', colorValidation.error);
                this._showError(parentWindow, HEADING.VALIDATION_ERROR, colorValidation.error);
                return null;
            }
            
            // Use validated inputs
            const safeName = InputValidator.sanitizeForSQL(nameValidation.sanitized);
            const safeColor = colorValidation.sanitized;
            const safeIcon = icon || 'folder-symbolic';
            const safeIconColorMode = iconColorMode || 'auto';
            
            // Calculate icon color
            const calculatedIconColor = getProjectIconColor({
                color: safeColor,
                icon_color_mode: safeIconColorMode
            });
            
            // Ensure columns exist
            this._ensureDarkIconsColumn();
            this._ensureIconColorModeColumn();
            this._ensureIconColorColumn();
            
            // Check for duplicate project names
            if (this._projectNameExists(safeName)) {
                this._showError(parentWindow, HEADING.DUPLICATE_PROJECT, MESSAGE.PROJECT_EXISTS);
                return null;
            }
            
            // Create project and get the new ID
            const sql = `INSERT INTO Project (name, color, icon, total_time, icon_color_mode, icon_color) VALUES ('${safeName}', '${safeColor}', '${safeIcon}', 0, '${safeIconColorMode}', '${calculatedIconColor}')`;
            
            this.executeNonSelectCommand(this.dbConnection, sql);
            
            // Get the newly created project by name (since name is unique)
            const getIdSql = `SELECT id FROM Project WHERE name = '${safeName}' ORDER BY id DESC LIMIT 1`;
            const result = this.executeQuery(this.dbConnection, getIdSql);
            
            
            if (result && result.get_n_rows() > 0) {
                const newProjectId = result.get_value_at(0, 0); // column 0, row 0
                
                // Reload projects in parent window
                if (parentWindow && parentWindow.projectsPageComponent) {
                    parentWindow.projectsPageComponent.loadProjects();
                }
                
                return newProjectId;
            } else {
                //('Failed to get new project ID, query returned rows:', result ? result.get_n_rows() : 'null');
                return null;
            }
            
        } catch (error) {
            //('Error creating project:', error);
            this._showError(parentWindow, HEADING.DATABASE_ERROR, _('Failed to create project: ') + error.message);
            return null;
        }
    }

    /**
     * Get project by ID
     */
    getProjectById(projectId) {
        try {
            const sql = `SELECT * FROM Project WHERE id = ${projectId}`;
            const result = this.executeQuery(this.dbConnection, sql);
            
            if (result && result.get_n_rows() > 0) {
                // Build project object from recordset - assuming column order: id, name, color, total_time, icon, dark_icons, icon_color_mode, icon_color
                const project = {
                    id: result.get_value_at(0, 0),
                    name: String(result.get_value_at(1, 0) || ''),
                    color: String(result.get_value_at(2, 0) || '#cccccc'),
                    total_time: result.get_value_at(3, 0) || 0,
                    icon: String(result.get_value_at(4, 0) || 'folder-symbolic'),
                    dark_icons: result.get_value_at(5, 0) || 0,
                    icon_color_mode: String(result.get_value_at(6, 0) || 'auto'),
                    icon_color: String(result.get_value_at(7, 0) || 'white')
                };
                return project;
            } else {
                //('Project not found with ID:', projectId);
                return null;
            }
        } catch (error) {
            //('Error getting project by ID:', error);
            return null;
        }
    }

    updateProject(projectId, name, color, icon, parentWindow, iconColorMode = 'auto') {
        try {
                
            // Validate project ID
            const idValidation = InputValidator.validateNumber(projectId, 1);
            if (!idValidation.valid) {
                InputValidator.showValidationError(parentWindow, _('Invalid Project ID'), idValidation.error);
                return false;
            }

            // Validate project name
            const nameValidation = InputValidator.validateProjectName(name);
            if (!nameValidation.valid) {
                InputValidator.showValidationError(parentWindow, _('Invalid Project Name'), nameValidation.error);
                return false;
            }

            // Validate color
            const colorValidation = InputValidator.validateColor(color);
            if (!colorValidation.valid) {
                InputValidator.showValidationError(parentWindow, _('Invalid Project Color'), colorValidation.error);
                return false;
            }
            
            // Use sanitized values
            const safeProjectId = idValidation.sanitized;
            const safeName = nameValidation.sanitized;
            const safeColor = colorValidation.sanitized;
            const safeIcon = icon || 'folder-symbolic';
            const safeIconColorMode = iconColorMode || 'auto';
            
            // Calculate icon color using ColorUtils - ONCE at update
            const calculatedIconColor = getProjectIconColor({
                color: safeColor,
                icon_color_mode: safeIconColorMode
            });
            
            // Ensure the columns exist
            this._ensureDarkIconsColumn();
            this._ensureIconColorModeColumn();
            this._ensureIconColorColumn();
            
            const sql = `UPDATE Project SET name = '${InputValidator.sanitizeForSQL(safeName)}', color = '${safeColor}', icon = '${safeIcon}', icon_color_mode = '${safeIconColorMode}', icon_color = '${calculatedIconColor}' WHERE id = ${safeProjectId}`;
            
            this.executeNonSelectCommand(this.dbConnection, sql);
            
            // Immediately update header buttons if this is the current project
            if (parentWindow && parentWindow.currentProjectId === safeProjectId) {
                // Reload projects first to get updated data
                if (parentWindow._loadProjects) {
                    parentWindow._loadProjects();
                }
                // Update header buttons for the updated project
                if (parentWindow._updateProjectButtonsDisplay) {
                    parentWindow._updateProjectButtonsDisplay(safeName);
                }
            }
            
            // Reload projects page
            if (parentWindow && parentWindow.projectsPageComponent) {
                parentWindow.projectsPageComponent.loadProjects();
            }
            return true;
            
        } catch (error) {
            //('Error updating project:', error);
            InputValidator.showValidationError(parentWindow, _('Project Update Failed'), _('Failed to update project: ') + error.message);
            return false;
        }
    }

    deleteProject(projectId, parentWindow) {
        try {
                
            // Validate project ID
            const idValidation = InputValidator.validateNumber(projectId, 1);
            if (!idValidation.valid) {
                InputValidator.showValidationError(parentWindow, _('Invalid Project ID'), idValidation.error);
                return false;
            }

            // Prevent deletion of default project
            if (idValidation.sanitized === 1) {
                InputValidator.showValidationError(parentWindow, _('Cannot Delete Default Project'), _('The default project cannot be deleted.'));
                return false;
            }
            
            const safeProjectId = idValidation.sanitized;
            const sql = `DELETE FROM Project WHERE id = ${safeProjectId}`;
            
            this.executeNonSelectCommand(this.dbConnection, sql);
            
            // Reload projects
            if (parentWindow && parentWindow.projectsPageComponent) {
                parentWindow.projectsPageComponent.loadProjects();
            }
            
        } catch (error) {
            //('Error deleting project:', error);
        }
    }

    createNewProjectDialog(parentWindow) {
        const dialog = new Adw.AlertDialog({
            heading: HEADING.CREATE_PROJECT,
            body: DIALOG_BODY.CREATE_PROJECT
        });
        
        // Main container for the entire dialog content
        const mainBox = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 0,
            margin_top: 12
        });
        
        // Icon color switcher (Light/Dark)
        let iconColorMode = 'auto'; // 'auto', 'light', 'dark'

        // Create visible tab-style switcher at the top
        const tabLabel = new Gtk.Label({
            label: LABEL.ICON_MODE,
            halign: Gtk.Align.CENTER,
            margin_bottom: 8,
            css_classes: ['heading']
        });
        mainBox.append(tabLabel);

        const tabBox = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 4,
            halign: Gtk.Align.CENTER,
            margin_bottom: 20,
            height_request: 40
        });

        const autoButton = new Gtk.Button({
            label: ICON_MODE.AUTO,
            width_request: 80,
            height_request: 36,
            css_classes: ['suggested-action'] // Default selection
        });
        const lightButton = new Gtk.Button({
            label: ICON_MODE.LIGHT,
            width_request: 80,
            height_request: 36,
            css_classes: ['']
        });
        const darkButton = new Gtk.Button({
            label: ICON_MODE.DARK,
            width_request: 80,
            height_request: 36,
            css_classes: ['']
        });
        
        autoButton.connect('clicked', () => {
            iconColorMode = 'auto';
            // Update button styles
            autoButton.set_css_classes(['suggested-action']);
            lightButton.set_css_classes(['']);
            darkButton.set_css_classes(['']);
        });
        
        lightButton.connect('clicked', () => {
            iconColorMode = 'light';
            // Update button styles
            autoButton.set_css_classes(['']);
            lightButton.set_css_classes(['suggested-action']);
            darkButton.set_css_classes(['']);
        });
        
        darkButton.connect('clicked', () => {
            iconColorMode = 'dark';
            // Update button styles
            autoButton.set_css_classes(['']);
            lightButton.set_css_classes(['']);
            darkButton.set_css_classes(['suggested-action']);
        });
        
        tabBox.append(autoButton);
        tabBox.append(lightButton);
        tabBox.append(darkButton);
        mainBox.append(tabBox);
        
        // Form content below the tabs
        const form = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 12
        });
        
        // Project name input
        const nameEntry = new Gtk.Entry({
            placeholder_text: PLACEHOLDER.PROJECT_NAME
        });

        // Add real-time validation while typing
        nameEntry.connect('changed', () => {
            const currentText = nameEntry.get_text();
            const validation = InputValidator.validateProjectName(currentText);

            if (currentText.length > 0 && !validation.valid) {
                // Show error styling
                InputValidator.showValidationTooltip(nameEntry, validation.error, true);
            } else {
                // Clear error styling when input is empty or valid
                InputValidator.showValidationTooltip(nameEntry, null, false);
            }
        });

        form.append(new Gtk.Label({label: LABEL.PROJECT_NAME, halign: Gtk.Align.START}));
        form.append(nameEntry);

        // Icon selection
        let selectedIcon = this.projectIcons[0];
        const { iconGrid, iconSelection } = this._createIconSelection(selectedIcon);
        form.append(new Gtk.Label({label: LABEL.PROJECT_ICON, halign: Gtk.Align.START}));
        form.append(iconGrid);

        // Color selection
        let selectedColor = this.projectColors[0];
        const { colorGrid, colorSelection } = this._createColorSelection(selectedColor);
        form.append(new Gtk.Label({label: LABEL.PROJECT_COLOR, halign: Gtk.Align.START}));
        form.append(colorGrid);
        
        // Add form to main container
        mainBox.append(form);

        dialog.set_extra_child(mainBox);
        dialog.add_response('cancel', BUTTON.CANCEL);
        dialog.add_response('create', BUTTON.CREATE_PROJECT);
        dialog.set_response_appearance('create', Adw.ResponseAppearance.SUGGESTED);
        
        dialog.connect('response', (dialog, response) => {
            if (response === 'create') {
                const name = nameEntry.get_text().trim();
                
                // Validate project name
                const nameValidation = InputValidator.validateProjectName(name);
                
                if (!nameValidation.valid) {
                    InputValidator.showValidationTooltip(nameEntry, nameValidation.error, true);
                    return; // Don't close dialog
                }
                
                // Validate color
                const colorValidation = InputValidator.validateColor(selectedColor.value);
                if (!colorValidation.valid) {
                    InputValidator.showValidationTooltip(nameEntry, colorValidation.error, true); // Show on nameEntry as it's most visible
                    return; // Don't close dialog
                }
                
                
                if (nameValidation.sanitized) {
                    this.createProject(nameValidation.sanitized, colorValidation.sanitized, selectedIcon, parentWindow, iconColorMode);
                }
            }
            dialog.close();
        });
        
        dialog.present(parentWindow);
    }

    createEditProjectDialog(project, parentWindow) {

        const dialog = new Adw.AlertDialog({
            heading: HEADING.EDIT_PROJECT,
            body: DIALOG_BODY.UPDATE_PROJECT
        });
        
        // Main container for the entire dialog content
        const mainBox = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 0,
            margin_top: 12
        });
        

        // Icon color switcher (Light/Dark) - determine current mode from project data
        let iconColorMode = 'auto'; // Default
        if (project.icon_color_mode) {
            iconColorMode = project.icon_color_mode;
        } else if (project.dark_icons === 1) {
            iconColorMode = 'dark'; // Legacy support
        } else if (project.dark_icons === 2) {
            iconColorMode = 'light'; // Legacy support
        }

        // Create visible tab-style switcher at the top
        const tabLabel = new Gtk.Label({
            label: LABEL.ICON_MODE,
            halign: Gtk.Align.CENTER,
            margin_bottom: 8,
            css_classes: ['heading']
        });
        mainBox.append(tabLabel);

        const tabBox = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 4,
            halign: Gtk.Align.CENTER,
            margin_bottom: 20,
            height_request: 40
        });

        const autoButton = new Gtk.Button({
            label: ICON_MODE.AUTO,
            width_request: 80,
            height_request: 36,
            css_classes: iconColorMode === 'auto' ? ['suggested-action'] : ['']
        });
        const lightButton = new Gtk.Button({
            label: ICON_MODE.LIGHT,
            width_request: 80,
            height_request: 36,
            css_classes: iconColorMode === 'light' ? ['suggested-action'] : ['']
        });
        const darkButton = new Gtk.Button({
            label: ICON_MODE.DARK,
            width_request: 80,
            height_request: 36,
            css_classes: iconColorMode === 'dark' ? ['suggested-action'] : ['']
        });
        
        autoButton.connect('clicked', () => {
            iconColorMode = 'auto';
            // Update button styles
            autoButton.set_css_classes(['suggested-action']);
            lightButton.set_css_classes(['']);
            darkButton.set_css_classes(['']);
        });
        
        lightButton.connect('clicked', () => {
            iconColorMode = 'light';
            // Update button styles
            autoButton.set_css_classes(['']);
            lightButton.set_css_classes(['suggested-action']);
            darkButton.set_css_classes(['']);
        });
        
        darkButton.connect('clicked', () => {
            iconColorMode = 'dark';
            // Update button styles
            autoButton.set_css_classes(['']);
            lightButton.set_css_classes(['']);
            darkButton.set_css_classes(['suggested-action']);
        });
        
        tabBox.append(autoButton);
        tabBox.append(lightButton);
        tabBox.append(darkButton);
        mainBox.append(tabBox);
        
        // Form content below the tabs
        const form = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 12
        });
        
        // Project name input
        const nameEntry = new Gtk.Entry({
            placeholder_text: PLACEHOLDER.PROJECT_NAME,
            text: project.name
        });

        // Add real-time validation while typing
        nameEntry.connect('changed', () => {
            const currentText = nameEntry.get_text();
            const validation = InputValidator.validateProjectName(currentText);

            if (currentText.length > 0 && !validation.valid) {
                // Show error styling
                InputValidator.showValidationTooltip(nameEntry, validation.error, true);
            } else {
                // Clear error styling when input is empty or valid
                InputValidator.showValidationTooltip(nameEntry, null, false);
            }
        });

        form.append(new Gtk.Label({label: LABEL.PROJECT_NAME, halign: Gtk.Align.START}));
        form.append(nameEntry);

        // Icon selection
        let selectedIcon = project.icon || 'folder-symbolic';
        const { iconGrid, iconSelection } = this._createIconSelection(selectedIcon, project);
        form.append(new Gtk.Label({label: LABEL.PROJECT_ICON, halign: Gtk.Align.START}));
        form.append(iconGrid);

        // Color selection
        let selectedColor = this.projectColors.find(c => c.value === project.color) || this.projectColors[0];
        const { colorGrid, colorSelection } = this._createColorSelection(selectedColor, project);
        form.append(new Gtk.Label({label: LABEL.PROJECT_COLOR, halign: Gtk.Align.START}));
        form.append(colorGrid);
        
        // Add form to main container
        mainBox.append(form);

        dialog.set_extra_child(mainBox);
        dialog.add_response('cancel', BUTTON.CANCEL);
        dialog.add_response('save', BUTTON.SAVE_CHANGES);
        dialog.set_response_appearance('save', Adw.ResponseAppearance.SUGGESTED);
        
        dialog.connect('response', (dialog, response) => {
            if (response === 'save') {
                const name = nameEntry.get_text().trim();
                
                // Validate project name
                const nameValidation = InputValidator.validateProjectName(name);
                
                if (!nameValidation.valid) {
                    InputValidator.showValidationTooltip(nameEntry, nameValidation.error, true);
                    return; // Don't close dialog
                }
                
                // Validate color
                const colorValidation = InputValidator.validateColor(selectedColor.value);
                if (!colorValidation.valid) {
                    InputValidator.showValidationTooltip(nameEntry, colorValidation.error, true);
                    return; // Don't close dialog
                }
                
                
                if (nameValidation.sanitized) {
                    this.updateProject(project.id, nameValidation.sanitized, colorValidation.sanitized, selectedIcon, parentWindow, iconColorMode);
                }
            }
            dialog.close();
        });
        
        dialog.present(parentWindow);
    }

    _createIconSelection(selectedIcon, project = null) {
        const iconGrid = new Gtk.Grid({
            column_spacing: 6,
            row_spacing: 6,
            margin_bottom: 12
        });
        
        let iconSelection = selectedIcon;
        
        // Add first 12 icons (2 rows of 6)
        for (let i = 0; i < 12 && i < this.projectIcons.length; i++) {
            const iconName = this.projectIcons[i];
            const iconButton = new Gtk.Button({
                width_request: 40,
                height_request: 40,
                css_classes: ['flat']
            });
            
            const icon = new Gtk.Image({
                icon_name: iconName,
                pixel_size: 24
            });
            iconButton.set_child(icon);
            
            // Apply selection styling with background highlight
            if (iconName === selectedIcon) {
                iconButton.add_css_class('selected-icon');
            }
            
            iconButton.connect('clicked', () => {
                iconSelection = iconName;
                
                // Update visual selection - remove highlighting from all buttons
                for (let j = 0; j < 12 && j < this.projectIcons.length; j++) {
                    const row = Math.floor(j / 6);
                    const col = j % 6;
                    const btn = iconGrid.get_child_at(col, row);
                    if (btn) {
                        // Remove any previous selection styling
                        const context = btn.get_style_context();
                        // Clear selection classes
                        btn.remove_css_class('selected-icon');
                    }
                }
                
                // Apply selection styling to clicked button
                iconButton.add_css_class('selected-icon');
                
            });
            
            const row = Math.floor(i / 6);
            const col = i % 6;
            iconGrid.attach(iconButton, col, row, 1, 1);
        }
        
        return { iconGrid, iconSelection };
    }

    _createColorSelection(selectedColor, project = null) {
        const colorGrid = new Gtk.Grid({
            column_spacing: 6,
            row_spacing: 6,
            margin_bottom: 12
        });
        
        let colorSelection = selectedColor;
        const colorProviders = new Map(); // Reuse providers per button

        // Add all colors (2 rows of 8)
        for (let i = 0; i < 16 && i < this.projectColors.length; i++) {
            const color = this.projectColors[i];
            const colorButton = new Gtk.Button({
                width_request: 30,
                height_request: 30,
                css_classes: ['flat'],
                tooltip_text: color.name
            });

            // Create and store provider once per button
            const provider = new Gtk.CssProvider();
            colorProviders.set(colorButton, provider);

            // Set background color with CSS
            let css = `button { background: ${color.value}; border-radius: 15px; border: 2px solid rgba(0,0,0,0.1); }`;
            if (color.value === selectedColor.value) {
                css = `button { background: ${color.value}; border-radius: 15px; border: 3px solid #000000; }`;
            }

            provider.load_from_data(css, -1);
            colorButton.get_style_context().add_provider(provider, Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION);

            colorButton.connect('clicked', () => {
                colorSelection = color;

                // Update visual selection for all color buttons
                for (let j = 0; j < 16 && j < this.projectColors.length; j++) {
                    const row = Math.floor(j / 8);
                    const col = j % 8;
                    const btn = colorGrid.get_child_at(col, row);
                    if (btn) {
                        const currentColor = this.projectColors[j];
                        const newCss = j === i
                            ? `button { background: ${currentColor.value}; border-radius: 15px; border: 3px solid #000000; }`
                            : `button { background: ${currentColor.value}; border-radius: 15px; border: 2px solid rgba(0,0,0,0.1); }`;
                        // Reuse existing provider instead of creating new one
                        const btnProvider = colorProviders.get(btn);
                        if (btnProvider) {
                            btnProvider.load_from_data(newCss, -1);
                        }
                    }
                }
            });

            const row = Math.floor(i / 8);
            const col = i % 8;
            colorGrid.attach(colorButton, col, row, 1, 1);
        }
        
        return { colorGrid, colorSelection };
    }

    // Main dialog methods for project management
    showCreateProjectDialog(parentWindow) {

        const dialog = new Adw.AlertDialog({
            heading: HEADING.CREATE_PROJECT,
            body: DIALOG_BODY.CREATE_PROJECT
        });
        
        // Form
        const form = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 12,
            margin_top: 12,
            margin_bottom: 12,
            margin_start: 12,
            margin_end: 12
        });
        
        // Project name
        const nameEntry = new Gtk.Entry({
            placeholder_text: PLACEHOLDER.PROJECT_NAME
        });
        form.append(new Gtk.Label({label: LABEL.PROJECT_NAME, halign: Gtk.Align.START}));
        form.append(nameEntry);
        
        // Real-time validation for name entry
        nameEntry.connect('changed', () => {
            const text = nameEntry.get_text().trim();
            if (text.length > 0) {
                const validation = InputValidator.validateProjectName(text);
                if (!validation.valid) {
                    InputValidator.showValidationTooltip(nameEntry, validation.error, true);
                } else {
                    InputValidator.showValidationTooltip(nameEntry, null, false);
                }
            } else {
                InputValidator.showValidationTooltip(nameEntry, null, false);
            }
        });
        
        // Icon selection
        let selectedIcon = this.projectIcons[0];
        form.append(new Gtk.Label({label: LABEL.PROJECT_ICON, halign: Gtk.Align.START}));

        const iconGrid = new Gtk.Grid({
            column_spacing: 6,
            row_spacing: 6,
            margin_bottom: 12
        });
        
        // Add first 12 icons in a 6x2 grid
        for (let i = 0; i < 12 && i < this.projectIcons.length; i++) {
            const iconName = this.projectIcons[i];
            const iconButton = new Gtk.Button({
                width_request: 40,
                height_request: 40,
                css_classes: ['flat']
            });
            
            const icon = new Gtk.Image({
                icon_name: iconName,
                pixel_size: 20
            });
            iconButton.set_child(icon);
            
            iconButton.connect('clicked', () => {
                selectedIcon = iconName;
            });
            
            const row = Math.floor(i / 6);
            const col = i % 6;
            iconGrid.attach(iconButton, col, row, 1, 1);
        }
        
        form.append(iconGrid);
        
        // Color selection
        let selectedColor = this.projectColors[0];
        form.append(new Gtk.Label({label: LABEL.PROJECT_COLOR, halign: Gtk.Align.START}));

        const colorGrid = new Gtk.Grid({
            column_spacing: 6,
            row_spacing: 6,
            margin_bottom: 12
        });
        
        // Add all colors (2 rows of 8)
        for (let i = 0; i < 16 && i < this.projectColors.length; i++) {
            const color = this.projectColors[i];
            const colorButton = new Gtk.Button({
                width_request: 30,
                height_request: 30,
                css_classes: ['flat'],
                tooltip_text: color.name
            });
            
            // Set background color with CSS
            const css = `button { background: ${color.value}; border-radius: 15px; border: 2px solid rgba(0,0,0,0.1); }`;
            const provider = new Gtk.CssProvider();
            provider.load_from_data(css, -1);
            colorButton.get_style_context().add_provider(provider, Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION);
            
            colorButton.connect('clicked', () => {
                selectedColor = color;
            });
            
            const row = Math.floor(i / 8);
            const col = i % 8;
            colorGrid.attach(colorButton, col, row, 1, 1);
        }
        
        form.append(colorGrid);

        dialog.set_extra_child(form);
        dialog.add_response('cancel', BUTTON.CANCEL);
        dialog.add_response('create', BUTTON.CREATE_PROJECT);
        dialog.set_response_appearance('create', Adw.ResponseAppearance.SUGGESTED);
        
        dialog.connect('response', (dialog, response) => {
            if (response === 'create') {
                const name = nameEntry.get_text().trim();
                
                // Validate project name
                const nameValidation = InputValidator.validateProjectName(name);
                if (!nameValidation.valid) {
                    InputValidator.showValidationTooltip(nameEntry, nameValidation.error, true);
                    return; // Don't close dialog
                }
                
                if (nameValidation.sanitized) {
                    this.createProject(nameValidation.sanitized, selectedColor.value, selectedIcon, parentWindow);
                }
            }
            dialog.close();
        });
        
        dialog.present(parentWindow);
    }

    showEditProjectDialog(projectId, parentWindow) {
        const project = parentWindow.allProjects.find(p => p.id === projectId);
        if (!project) return;


        const dialog = new Adw.AlertDialog({
            heading: HEADING.EDIT_PROJECT,
            body: DIALOG_BODY.UPDATE_PROJECT
        });
        
        // Form
        const form = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 12,
            margin_top: 12,
            margin_bottom: 12,
            margin_start: 12,
            margin_end: 12
        });
        
        // Project name
        const nameEntry = new Gtk.Entry({
            placeholder_text: PLACEHOLDER.PROJECT_NAME,
            text: project.name
        });
        form.append(new Gtk.Label({label: LABEL.PROJECT_NAME, halign: Gtk.Align.START}));
        form.append(nameEntry);
        
        // Real-time validation for name entry
        nameEntry.connect('changed', () => {
            const text = nameEntry.get_text().trim();
            if (text.length > 0) {
                const validation = InputValidator.validateProjectName(text);
                if (!validation.valid) {
                    InputValidator.showValidationTooltip(nameEntry, validation.error, true);
                } else {
                    InputValidator.showValidationTooltip(nameEntry, null, false);
                }
            } else {
                InputValidator.showValidationTooltip(nameEntry, null, false);
            }
        });
        
        // Icon selection
        let selectedIcon = project.icon || 'folder-symbolic';
        form.append(new Gtk.Label({label: LABEL.PROJECT_ICON, halign: Gtk.Align.START}));

        const iconGrid = new Gtk.Grid({
            column_spacing: 6,
            row_spacing: 6,
            margin_bottom: 12
        });
        
        // Add first 12 icons in a 6x2 grid
        for (let i = 0; i < 12 && i < this.projectIcons.length; i++) {
            const iconName = this.projectIcons[i];
            const iconButton = new Gtk.Button({
                width_request: 40,
                height_request: 40,
                css_classes: ['flat']
            });
            
            const icon = new Gtk.Image({
                icon_name: iconName,
                pixel_size: 20
            });
            iconButton.set_child(icon);
            
            // Highlight if this is the current icon
            if (iconName === selectedIcon) {
                iconButton.add_css_class('suggested-action');
            }
            
            iconButton.connect('clicked', () => {
                selectedIcon = iconName;
                
                // Update visual selection
                for (let j = 0; j < 12 && j < this.projectIcons.length; j++) {
                    const btn = iconGrid.get_child_at(j % 6, Math.floor(j / 6));
                    if (btn) {
                        btn.remove_css_class('suggested-action');
                    }
                }
                iconButton.add_css_class('suggested-action');
            });
            
            const row = Math.floor(i / 6);
            const col = i % 6;
            iconGrid.attach(iconButton, col, row, 1, 1);
        }
        
        form.append(iconGrid);
        
        // Color selection
        let selectedColor = this.projectColors.find(c => c.value === project.color) || this.projectColors[0];
        form.append(new Gtk.Label({label: LABEL.PROJECT_COLOR, halign: Gtk.Align.START}));

        const colorGrid = new Gtk.Grid({
            column_spacing: 6,
            row_spacing: 6,
            margin_bottom: 12
        });

        const colorProviders = new Map(); // Reuse providers per button

        // Add all colors (2 rows of 8)
        for (let i = 0; i < 16 && i < this.projectColors.length; i++) {
            const color = this.projectColors[i];
            const colorButton = new Gtk.Button({
                width_request: 30,
                height_request: 30,
                css_classes: ['flat'],
                tooltip_text: color.name
            });

            // Create and store provider once per button
            const provider = new Gtk.CssProvider();
            colorProviders.set(colorButton, provider);

            // Set background color with CSS
            let css = `button { background: ${color.value}; border-radius: 15px; border: 2px solid rgba(0,0,0,0.1); }`;
            if (color.value === selectedColor.value) {
                css = `button { background: ${color.value}; border-radius: 15px; border: 3px solid #000000; }`;
            }

            provider.load_from_data(css, -1);
            colorButton.get_style_context().add_provider(provider, Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION);

            colorButton.connect('clicked', () => {
                selectedColor = color;

                // Update visual selection for all color buttons
                for (let j = 0; j < 16 && j < this.projectColors.length; j++) {
                    const row = Math.floor(j / 8);
                    const col = j % 8;
                    const btn = colorGrid.get_child_at(col, row);
                    if (btn) {
                        const currentColor = this.projectColors[j];
                        const newCss = j === i
                            ? `button { background: ${currentColor.value}; border-radius: 15px; border: 3px solid #000000; }`
                            : `button { background: ${currentColor.value}; border-radius: 15px; border: 2px solid rgba(0,0,0,0.1); }`;
                        // Reuse existing provider instead of creating new one
                        const btnProvider = colorProviders.get(btn);
                        if (btnProvider) {
                            btnProvider.load_from_data(newCss, -1);
                        }
                    }
                }
            });

            const row = Math.floor(i / 8);
            const col = i % 8;
            colorGrid.attach(colorButton, col, row, 1, 1);
        }
        
        form.append(colorGrid);

        dialog.set_extra_child(form);
        dialog.add_response('cancel', BUTTON.CANCEL);
        dialog.add_response('save', BUTTON.SAVE_CHANGES);
        dialog.set_response_appearance('save', Adw.ResponseAppearance.SUGGESTED);
        
        dialog.connect('response', (dialog, response) => {
            if (response === 'save') {
                const name = nameEntry.get_text().trim();
                
                // Validate project name
                const nameValidation = InputValidator.validateProjectName(name);
                if (!nameValidation.valid) {
                    InputValidator.showValidationTooltip(nameEntry, nameValidation.error, true);
                    return; // Don't close dialog
                }
                
                if (nameValidation.sanitized) {
                    this.updateProject(projectId, nameValidation.sanitized, selectedColor.value, selectedIcon, parentWindow);
                }
            }
            dialog.close();
        });
        
        dialog.present(parentWindow);
    }

    // Create an inline editable project name row
    createEditableProjectRow(project, parentWindow) {
        const row = new Adw.ActionRow({
            subtitle: `Total time: ${parentWindow._formatDuration(project.totalTime)}`,
            css_classes: ['bright-subtitle']
        });

        // Create title container with inline editable entry
        const titleBox = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 6,
            hexpand: true
        });

        // Create editable entry instead of fixed title
        const nameEntry = new Gtk.Entry({
            text: project.name,
            css_classes: ['inline-editable'],
            hexpand: true,
            valign: Gtk.Align.CENTER
        });

        // Add real-time validation
        nameEntry.connect('changed', () => {
            const text = nameEntry.get_text().trim();
            if (text.length > 0 && text !== project.name) {
                const validation = InputValidator.validateProjectName(text);
                if (!validation.valid) {
                    InputValidator.showValidationTooltip(nameEntry, validation.error, true);
                } else {
                    InputValidator.showValidationTooltip(nameEntry, null, false);
                }
            } else {
                InputValidator.showValidationTooltip(nameEntry, null, false);
            }
        });

        // Handle Enter key or focus loss to save changes
        const saveEdit = () => {
            const newName = nameEntry.get_text().trim();
            
            // If name unchanged, just clear validation
            if (newName === project.name) {
                InputValidator.showValidationTooltip(nameEntry, null, false);
                return;
            }

            // Validate before saving
            const validation = InputValidator.validateProjectName(newName);
            if (!validation.valid) {
                InputValidator.showValidationTooltip(nameEntry, validation.error, true);
                // Revert to original name
                nameEntry.set_text(project.name);
                return;
            }

            // Save the change
            this.updateProject(project.id, validation.sanitized, project.color, project.icon, parentWindow);
            InputValidator.showValidationTooltip(nameEntry, null, false);
        };

        nameEntry.connect('activate', saveEdit);
        
        // Use GTK4 focus-leave signal (not focus-out-event)
        const focusController = new Gtk.EventControllerFocus();
        focusController.connect('leave', saveEdit);
        nameEntry.add_controller(focusController);

        // Handle Escape key to cancel edit (GTK4 way)
        const keyController = new Gtk.EventControllerKey();
        keyController.connect('key-pressed', (controller, keyval, keycode, state) => {
            if (keyval === 65307) { // Escape key
                nameEntry.set_text(project.name); // Revert
                InputValidator.showValidationTooltip(nameEntry, null, false);
                nameEntry.get_root().grab_focus(); // Remove focus
                return true;
            }
            return false;
        });
        nameEntry.add_controller(keyController);

        // Add entry to title box and set as prefix
        titleBox.append(nameEntry);
        row.add_prefix(titleBox);

        return { row, nameEntry };
    }

    // ====== PROJECT DISPLAY METHODS ======

    updateProjectsList() {
        // Use filtering function to display all projects (empty search = show all)
        this.filterProjects();
    }

    getProjectIconColor(project) {
        return WidgetFactory.calculateProjectIconColor(project);
    }

    calculateColorBrightness(hexColor) {
        return WidgetFactory.calculateColorBrightness(hexColor);
    }

    filterProjects() {
        if (!this.parentWindow) {
            //('Parent window not set for ProjectManager');
            return;
        }

        const searchText = this.parentWindow._project_search.get_text().toLowerCase().trim();
        
        // Clear existing projects
        while (this.parentWindow._project_list.get_first_child()) {
            this.parentWindow._project_list.remove(this.parentWindow._project_list.get_first_child());
        }
        
        // Initialize selected projects set if it doesn't exist
        if (!this.parentWindow.selectedProjects) {
            this.parentWindow.selectedProjects = new Set();
        }
        
        // Filter projects by search text
        this.parentWindow.filteredProjects = searchText.length === 0 
            ? this.parentWindow.allProjects 
            : this.parentWindow.allProjects.filter(project => 
                project.name.toLowerCase().includes(searchText)
            );
        
        // Reset to first page when search changes
        if (searchText !== this.lastSearchText) {
            this.parentWindow.currentProjectsPage = 0;
            this.lastSearchText = searchText;
        }
        
        // Apply pagination
        const start = this.parentWindow.currentProjectsPage * this.parentWindow.projectsPerPage;
        const end = Math.min(start + this.parentWindow.projectsPerPage, this.parentWindow.filteredProjects.length);
        const paginatedProjects = this.parentWindow.filteredProjects.slice(start, end);
        
        
        // Display projects for current page
        paginatedProjects.forEach(project => {
            this.renderProjectRow(project);
        });
        
        // Update pagination
        this.parentWindow._updateProjectsPaginationControls();
        
        // Update selection UI
        this.parentWindow._updateProjectSelectionUI();
    }

    renderProjectRow(project) {
        if (!this.parentWindow) {
            //('Parent window not set for ProjectManager');
            return;
        }

        // Create ListBoxRow with custom content
        const row = new Gtk.ListBoxRow({
            activatable: false,
            selectable: false
        });
        
        // Create main horizontal container
        const mainBox = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 12,
            height_request: 50,
            hexpand: true
        });
        
        // Create project icon button using factory
        const iconButton = WidgetFactory.createProjectColorButton(
            project, 
            () => this._showProjectAppearanceDialog(project)
        );
        
        // Set tooltip text
        iconButton.set_tooltip_text(_('Click to change color and icon'));
        
        // Create and set icon widget
        const iconWidget = WidgetFactory.createProjectIconWidget(project);
        iconButton.set_child(iconWidget);
        
        // Editable project name
        const nameLabel = new Gtk.EditableLabel({
            text: project.name,
            hexpand: true,
            valign: Gtk.Align.CENTER
        });
        
        // Handle name changes
        nameLabel.connect('changed', () => {
            const newName = nameLabel.get_text().trim();
            if (newName && newName !== project.name) {
                this.parentWindow._handleProjectNameChange(project.id, newName);
            }
        });
        
        // Add right click to editable label for selection (without context menu)
        const labelRightClick = new Gtk.GestureClick({
            button: 3, // Right mouse button
            propagation_phase: Gtk.PropagationPhase.CAPTURE
        });
        
        labelRightClick.connect('pressed', (gesture, n_press, x, y) => {
            this.parentWindow._toggleProjectSelection(project.id, row);
            
            // Prevent context menu from appearing
            gesture.set_state(Gtk.EventSequenceState.CLAIMED);
            return Gdk.EVENT_STOP;
        });
        
        nameLabel.add_controller(labelRightClick);
        
        // Time information on the right
        const timeLabel = new Gtk.Label({
            label: this.parentWindow._formatDuration(project.totalTime),
            css_classes: ['time-display', 'monospace', 'title-4'],
            valign: Gtk.Align.CENTER,
            halign: Gtk.Align.END
        });
        
        // Assemble everything
        mainBox.append(iconButton);
        mainBox.append(nameLabel);
        mainBox.append(timeLabel);
        row.set_child(mainBox);
        
        // Add selection logic (right click for select/deselect)
        this.parentWindow._addProjectSelectionHandlers(row, project);
        
        // Apply selection style if selected
        if (this.parentWindow.selectedProjects.has(project.id)) {
            row.add_css_class('selected-task'); // Use same class as for tasks
        }
        
        this.parentWindow._project_list.append(row);
    }

    _showProjectAppearanceDialog(project, callback = null) {
        const dialog = new Adw.AlertDialog({
            heading: _('Project Appearance'),
            body: _('Configure color and icon for ') + `"${project.name}"`
        });

        // Create main container with 2-column layout
        const mainBox = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 24,
            margin_top: 16,
            margin_bottom: 16,
            margin_start: 16,
            margin_end: 16,
            homogeneous: true
        });

        // === LEFT COLUMN - COLOR ===
        const colorColumn = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 12,
            hexpand: true
        });

        const colorLabel = new Gtk.Label({
            label: LABEL.PROJECT_COLOR,
            halign: Gtk.Align.START,
            css_classes: ['heading']
        });

        // Color preview - clickable
        const colorPreview = new Gtk.Button({
            width_request: 48,
            height_request: 48,
            css_classes: ['flat', 'color-preview'],
            halign: Gtk.Align.CENTER,
            tooltip_text: TOOLTIP.CHANGE_COLOR
        });

        // Apply current project color
        const colorProvider = new Gtk.CssProvider();
        colorProvider.load_from_string(`
            .color-preview {
                background: ${project.color};
                border-radius: 50%;
                border: 2px solid alpha(@borders, 0.3);
            }
            .color-preview:hover {
                filter: brightness(1.1);
                transform: scale(1.05);
            }
        `);
        colorPreview.get_style_context().add_provider(colorProvider, Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION);

        // Color selection handler - directly on preview
        colorPreview.connect('clicked', () => {
            this._showColorPicker(project, colorPreview, colorProvider);
        });

        colorColumn.append(colorLabel);
        colorColumn.append(colorPreview);

        // === RIGHT COLUMN - ICON ===
        const iconColumn = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 12,
            hexpand: true
        });

        const iconLabel = new Gtk.Label({
            label: LABEL.PROJECT_ICON,
            halign: Gtk.Align.START,
            css_classes: ['heading']
        });

        // Icon preview - clickable
        const iconPreview = new Gtk.Button({
            width_request: 48,
            height_request: 48,
            css_classes: ['flat', 'icon-preview'],
            halign: Gtk.Align.CENTER,
            tooltip_text: TOOLTIP.CHANGE_ICON
        });

        let previewIconWidget;
        if (project.icon && project.icon.startsWith('emoji:')) {
            const emoji = project.icon.substring(6);
            previewIconWidget = new Gtk.Label({
                label: emoji,
                css_classes: ['emoji-preview']
            });
        } else {
            previewIconWidget = new Gtk.Image({
                icon_name: project.icon || 'folder-symbolic',
                pixel_size: 24
            });
        }
        iconPreview.set_child(previewIconWidget);

        // Icon type toggles with icons
        const iconTypeGroup = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 0,
            css_classes: ['toggle-project-icon-box'],
            halign: Gtk.Align.CENTER
        });

        // Icons button with icon
        const iconsButtonBox = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 6
        });
        const iconsIcon = new Gtk.Image({
            icon_name: 'applications-graphics-symbolic',
            pixel_size: 16
        });
        iconsButtonBox.append(iconsIcon);

        const iconsButton = new Gtk.ToggleButton({
            child: iconsButtonBox,
            active: !project.icon || !project.icon.startsWith('emoji:')
        });

        // Emoji button with emoji
        const emojiButtonBox = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 6
        });
        const emojiIcon = new Gtk.Label({
            label: '😀',
            css_classes: ['emoji-display']
        });
        emojiButtonBox.append(emojiIcon);

        const emojiButton = new Gtk.ToggleButton({
            child: emojiButtonBox,
            active: project.icon && project.icon.startsWith('emoji:')
        });

        // Group toggles
        iconsButton.connect('toggled', () => {
            if (iconsButton.get_active()) {
                emojiButton.set_active(false);
            }
        });

        emojiButton.connect('toggled', () => {
            if (emojiButton.get_active()) {
                iconsButton.set_active(false);
            }
        });

        iconTypeGroup.append(iconsButton);
        iconTypeGroup.append(emojiButton);

        // Icon preview click handler - opens picker based on selected type
        iconPreview.connect('clicked', () => {
            const isEmoji = emojiButton.get_active();
            this._showIconPicker(project, iconPreview, previewIconWidget, isEmoji);
        });

        iconColumn.append(iconLabel);
        iconColumn.append(iconPreview);
        iconColumn.append(iconTypeGroup);

        // Assemble columns
        mainBox.append(colorColumn);
        mainBox.append(iconColumn);

        dialog.set_extra_child(mainBox);
        dialog.add_response('cancel', BUTTON.CANCEL);
        dialog.add_response('save', BUTTON.SAVE);
        dialog.set_response_appearance('save', Adw.ResponseAppearance.SUGGESTED);

        dialog.connect('response', (dialog, response) => {
            if (response === 'save') {
                // Save changes - color already updated in project.color
                // Icon already updated in project.icon
                if (project.id) {
                    // For existing projects, update in database
                    this.updateProject(project.id, project.name, project.color, project.icon, this.parentWindow, project.icon_color_mode);
                    // Header will update automatically via _loadProjects
                }
                
                // Call callback if provided (for ProjectDialog integration)
                if (callback && typeof callback === 'function') {
                    callback(project);
                }
            }
            dialog.close();
        });

        dialog.present(this.parentWindow);
    }

    _showColorPicker(project, previewButton, cssProvider) {
        // Use GTK4 ColorDialog
        const colorDialog = new Gtk.ColorDialog({
            title: _('Select Project Color'),
            modal: true,
            with_alpha: false
        });

        // Parse current color
        const currentColor = new Gdk.RGBA();
        if (!currentColor.parse(project.color)) {
            currentColor.parse('#cccccc'); // Fallback color
        }

        colorDialog.choose_rgba(this.parentWindow, currentColor, null, (source_object, result) => {
            try {
                const selectedColor = colorDialog.choose_rgba_finish(result);
                const hexColor = `#${Math.round(selectedColor.red * 255).toString(16).padStart(2, '0')}${Math.round(selectedColor.green * 255).toString(16).padStart(2, '0')}${Math.round(selectedColor.blue * 255).toString(16).padStart(2, '0')}`;
                
                // Обновляем превью
                cssProvider.load_from_string(`
                    .color-preview {
                        background: ${hexColor};
                        border-radius: 50%;
                        border: 2px solid alpha(@borders, 0.3);
                    }
                    .color-preview:hover {
                        filter: brightness(1.1);
                    }
                `);

                // Обновляем цвет проекта
                project.color = hexColor;
                
            } catch (error) {
            }
        });
    }

    _showIconPicker(project, previewButton, previewWidget, isEmoji) {
        const dialog = new Adw.AlertDialog({
            heading: isEmoji ? _('Select Emoji') : _('Select Icon'),
            body: isEmoji ? _('Choose from our comprehensive emoji collection') : _('Choose an appropriate icon for the project')
        });

        let iconColor = 'default'; // 'default', 'white', 'black'

        // Create main container for icon color selector and content
        const mainContainer = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 12,
            margin_top: 16,
            margin_bottom: 16,
            margin_start: 16,
            margin_end: 16
        });

        // Icon color selector (only for system icons)
        if (!isEmoji) {
            const colorSelectorLabel = new Gtk.Label({
                label: LABEL.ICON_COLOR,
                halign: Gtk.Align.START,
                css_classes: ['heading']
            });

            const colorButtonsBox = new Gtk.Box({
                orientation: Gtk.Orientation.HORIZONTAL,
                spacing: 6,
                halign: Gtk.Align.CENTER,
                css_classes: ['linked'],
                margin_bottom: 12
            });

            const defaultColorBtn = new Gtk.ToggleButton({
                label: ICON_MODE.DEFAULT,
                active: true
            });

            const whiteColorBtn = new Gtk.ToggleButton({
                label: ICON_MODE.WHITE
            });

            const blackColorBtn = new Gtk.ToggleButton({
                label: ICON_MODE.BLACK
            });

            // Color button handlers
            defaultColorBtn.connect('toggled', () => {
                if (defaultColorBtn.get_active()) {
                    iconColor = 'default';
                    whiteColorBtn.set_active(false);
                    blackColorBtn.set_active(false);
                    updateIconColors();
                }
            });

            whiteColorBtn.connect('toggled', () => {
                if (whiteColorBtn.get_active()) {
                    iconColor = 'white';
                    defaultColorBtn.set_active(false);
                    blackColorBtn.set_active(false);
                    updateIconColors();
                }
            });

            blackColorBtn.connect('toggled', () => {
                if (blackColorBtn.get_active()) {
                    iconColor = 'black';
                    defaultColorBtn.set_active(false);
                    whiteColorBtn.set_active(false);
                    updateIconColors();
                }
            });

            colorButtonsBox.append(defaultColorBtn);
            colorButtonsBox.append(whiteColorBtn);
            colorButtonsBox.append(blackColorBtn);
            
            mainContainer.append(colorSelectorLabel);
            mainContainer.append(colorButtonsBox);
        }

        // Create scrolled window for large emoji collection
        const scrolled = new Gtk.ScrolledWindow({
            hscrollbar_policy: Gtk.PolicyType.NEVER,
            vscrollbar_policy: Gtk.PolicyType.AUTOMATIC,
            min_content_width: 400,
            min_content_height: 300,
            max_content_height: 400
        });

        const iconGrid = new Gtk.Grid({
            column_spacing: 4,
            row_spacing: 4,
            margin_top: 8,
            margin_bottom: 8,
            margin_start: 8,
            margin_end: 8,
            column_homogeneous: true
        });

        // Function to update icon colors
        const updateIconColors = () => {
            if (isEmoji) return;
            
            // Find all icon buttons and update their CSS classes
            let child = iconGrid.get_first_child();
            while (child) {
                if (child instanceof Gtk.Button) {
                    // Remove existing color classes
                    child.remove_css_class('icon-white');
                    child.remove_css_class('icon-black');
                    
                    // Add appropriate color class
                    if (iconColor === 'white') {
                        child.add_css_class('icon-white');
                    } else if (iconColor === 'black') {
                        child.add_css_class('icon-black');
                    }
                }
                child = child.get_next_sibling();
            }
        };

        // Add CSS for icon coloring
        const cssProvider = new Gtk.CssProvider();
        cssProvider.load_from_string(`
            .icon-white {
                color: white;
                -gtk-icon-style: symbolic;
            }
            .icon-black {
                color: black;
                -gtk-icon-style: symbolic;
            }
        `);
        
        // Apply CSS to the dialog
        const styleContext = dialog.get_style_context();
        styleContext.add_provider(cssProvider, Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION);

        if (isEmoji) {
            // Comprehensive emoji collection from JSON data
            const emojis = getAllEmojis();
            emojis.forEach((emoji, index) => {
                const emojiButton = new Gtk.Button({
                    label: emoji,
                    width_request: 48,
                    height_request: 48,
                    css_classes: ['flat']
                });
                
                emojiButton.connect('clicked', () => {
                    // Обновляем превью в диалоге
                    const emojiLabel = new Gtk.Label({
                        label: emoji,
                        css_classes: ['emoji-preview']
                    });
                    previewButton.set_child(emojiLabel);
                    project.icon = `emoji:${emoji}`;
                    dialog.close();
                });
                
                iconGrid.attach(emojiButton, index % 8, Math.floor(index / 8), 1, 1);
            });
        } else {
            // Comprehensive system icons collection from JSON data
            const icons = getAllIcons();
            icons.forEach((iconName, index) => {
                const iconButton = new Gtk.Button({
                    width_request: 48,
                    height_request: 48,
                    css_classes: ['flat']
                });
                
                const icon = new Gtk.Image({
                    icon_name: iconName,
                    pixel_size: 24
                });
                iconButton.set_child(icon);
                
                iconButton.connect('clicked', () => {
                    // Обновляем превью в диалоге для обычной иконки
                    const iconImage = new Gtk.Image({
                        icon_name: iconName,
                        pixel_size: 24
                    });
                    previewButton.set_child(iconImage);
                    project.icon = iconName;
                    dialog.close();
                });
                
                iconGrid.attach(iconButton, index % 8, Math.floor(index / 8), 1, 1);
            });
        }

        // Set up the scrolled window and container
        scrolled.set_child(iconGrid);
        mainContainer.append(scrolled);

        // Use main container as dialog content
        dialog.set_extra_child(mainContainer);
        dialog.add_response('cancel', BUTTON.CANCEL);
        dialog.present(this.parentWindow);
    }

    /**
     * Check if a project name already exists
     * @private
     */
    _projectNameExists(name) {
        try {
            const sql = `SELECT COUNT(*) as count FROM Project WHERE name = '${InputValidator.sanitizeForSQL(name)}'`;
            const result = this.executeQuery(this.dbConnection, sql);
            return result.length > 0 && result[0].count > 0;
        } catch (error) {
            //('Error checking project name:', error);
            return false; // Assume doesn't exist if query fails
        }
    }

    /**
     * Show error dialog to user
     * @private
     */
    _showError(parentWindow, title, message) {
        if (!parentWindow) {
            //(`${title}: ${message}`);
            return;
        }

        try {
            const errorDialog = new Adw.AlertDialog({
                heading: title,
                body: message
            });
            
            errorDialog.add_response('ok', _('OK'));
            errorDialog.set_response_appearance('ok', Adw.ResponseAppearance.SUGGESTED);
            errorDialog.present(parentWindow);
        } catch (error) {
            //('Failed to show error dialog:', error);
            //('Original error:', title, '-', message);
        }
    }

    // =====================================
    // MODULAR DIALOG SYSTEM METHODS
    // =====================================

    /**
     * Show create project dialog using modular system
     */
    showCreateProjectDialogModular(parentWindow = null) {
        
        const dialog = new ProjectDialog({
            mode: 'create',
            parentWindow: parentWindow || this.parentWindow,
            onProjectSave: (projectData, mode, dialog) => {
                
                const success = this.createProject(
                    projectData.name,
                    projectData.color,
                    projectData.icon,
                    parentWindow || this.parentWindow,
                    projectData.iconColorMode
                );
                
                if (!success) {
                    dialog.showFieldError('name', 'Failed to create project. Please try again.');
                    return false; // Keep dialog open
                }
                
                return true; // Close dialog
            }
        });
        
        dialog.present(parentWindow || this.parentWindow);
        return dialog;
    }

    /**
     * Show edit project dialog using modular system
     */
    showEditProjectDialogModular(project, parentWindow = null) {
        
        const dialog = new ProjectDialog({
            mode: 'edit',
            project,
            parentWindow: parentWindow || this.parentWindow,
            onProjectSave: (projectData, mode, dialog) => {
                
                const success = this.updateProject(
                    projectData.id,
                    projectData.name,
                    projectData.color,
                    projectData.icon,
                    parentWindow || this.parentWindow,
                    projectData.iconColorMode
                );
                
                if (!success) {
                    dialog.showFieldError('name', 'Failed to update project. Please try again.');
                    return false; // Keep dialog open
                }
                
                return true; // Close dialog
            }
        });
        
        dialog.present(parentWindow || this.parentWindow);
        return dialog;
    }

    /**
     * Factory method to create a project dialog with callback
     */
    createProjectDialog(config = {}) {
        const {
            mode = 'create',
            project = null,
            onSave = null,
            parentWindow = null,
            ...dialogConfig
        } = config;

        const dialog = new ProjectDialog({
            mode,
            project,
            parentWindow: parentWindow || this.parentWindow,
            onProjectSave: (projectData, mode, dialog) => {
                // Use custom callback if provided, otherwise use default logic
                if (onSave) {
                    return onSave(projectData, mode, dialog);
                }

                // Default behavior
                let success;
                if (mode === 'create') {
                    // Clean project data for creation (remove temporary fields)
                    const { id, tempId, isTemporary, ...createData } = projectData;
                    
                    
                    try {
                        success = this.createProject(
                            createData.name,
                            createData.color,
                            createData.icon,
                            parentWindow || this.parentWindow,
                            createData.iconColorMode
                        );
                        
                        if (success) {
                        } else {
                        }
                    } catch (error) {
                        //('Project creation error, removing temporary ID:', tempId, error);
                        success = false;
                    }
                } else if (mode === 'edit') {
                    // Ensure we have a valid ID for edit mode
                    if (!projectData.id || projectData.id < 1) {
                        //('Invalid project ID for edit mode:', projectData.id);
                        return false;
                    }
                    success = this.updateProject(
                        projectData.id,
                        projectData.name,
                        projectData.color,
                        projectData.icon,
                        parentWindow || this.parentWindow,
                        projectData.iconColorMode
                    );
                }

                if (!success) {
                    const action = mode === 'create' ? 'create' : 'update';
                    dialog.showFieldError('name', `Failed to ${action} project. Please try again.`);
                    return false;
                }

                return true;
            },
            ...dialogConfig
        });

        return dialog;
    }

    /**
     * Migrate method - gradually replace old dialog calls with new ones
     * This allows for progressive migration without breaking existing code
     */
    useModularDialogs(enabled = true) {
        this.modularDialogsEnabled = enabled;
        
        if (enabled) {
            // Replace old dialog methods with new ones
            this.showCreateProjectDialog = this.showCreateProjectDialogModular.bind(this);
            this.showEditProjectDialog = this.showEditProjectDialogModular.bind(this);
        } else {
        }
    }
}