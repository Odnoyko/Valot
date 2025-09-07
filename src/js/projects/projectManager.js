import Gtk from 'gi://Gtk';
import Adw from 'gi://Adw';
import { InputValidator } from 'resource:///com/odnoyko/valot/js/global/inputValidation.js';
import { executeNonSelectCommand } from 'resource:///com/odnoyko/valot/js/dbinitialisation.js';

// Project management functionality
export class ProjectManager {
    constructor(dbConnection, executeQuery, executeNonSelectCommand, projectColors, projectIcons) {
        this.dbConnection = dbConnection;
        this.executeQuery = executeQuery;
        this.executeNonSelectCommand = executeNonSelectCommand;
        this.projectColors = projectColors;
        this.projectIcons = projectIcons;
    }

    createProject(name, color, icon, parentWindow, iconColorMode = 'auto') {
        try {
            console.log('Creating project:', name, color, icon, 'Icon color mode:', iconColorMode);
            
            // Input is already validated by dialog, just sanitize for SQL
            const safeName = InputValidator.sanitizeForSQL(name);
            const safeColor = color || '#cccccc';
            const safeIcon = icon || 'folder-symbolic';
            const safeIconColorMode = iconColorMode || 'auto';
            
            // First ensure the columns exist
            this._ensureDarkIconsColumn();
            this._ensureIconColorModeColumn();
            
            // Use sanitized inputs
            const sql = `INSERT INTO Project (name, color, icon, total_time, icon_color_mode) VALUES ('${safeName}', '${safeColor}', '${safeIcon}', 0, '${safeIconColorMode}')`;
            
            this.executeNonSelectCommand(this.dbConnection, sql);
            console.log('Project created successfully');
            
            // Reload projects
            parentWindow._loadProjects();
            return true;
            
        } catch (error) {
            console.error('Error creating project:', error);
            return false;
        }
    }

    _ensureDarkIconsColumn() {
        try {
            const alterSql = `ALTER TABLE Project ADD COLUMN dark_icons INTEGER DEFAULT 0`;
            this.executeNonSelectCommand(this.dbConnection, alterSql);
            console.log('Added dark_icons column to Project table');
        } catch (error) {
            // Column already exists, ignore error
            if (error.message && error.message.includes('duplicate column name')) {
                console.log('dark_icons column already exists in Project table');
            } else {
                console.log('Error adding dark_icons column:', error.message);
            }
        }
    }

    _ensureIconColorModeColumn() {
        try {
            const alterSql = `ALTER TABLE Project ADD COLUMN icon_color_mode TEXT DEFAULT 'auto'`;
            this.executeNonSelectCommand(this.dbConnection, alterSql);
            console.log('Added icon_color_mode column to Project table');
        } catch (error) {
            // Column already exists, ignore error
            if (error.message && error.message.includes('duplicate column name')) {
                console.log('icon_color_mode column already exists in Project table');
            } else {
                console.log('Error adding icon_color_mode column:', error.message);
            }
        }
    }

    updateProject(projectId, name, color, icon, parentWindow, iconColorMode = 'auto') {
        try {
            console.log('Updating project:', name, color, icon, 'Icon color mode:', iconColorMode);
            
            // Validate project ID
            const idValidation = InputValidator.validateNumber(projectId, 1);
            if (!idValidation.valid) {
                InputValidator.showValidationError(parentWindow, 'Invalid Project ID', idValidation.error);
                return false;
            }
            
            // Validate project name
            const nameValidation = InputValidator.validateProjectName(name);
            if (!nameValidation.valid) {
                InputValidator.showValidationError(parentWindow, 'Invalid Project Name', nameValidation.error);
                return false;
            }
            
            // Validate color
            const colorValidation = InputValidator.validateColor(color);
            if (!colorValidation.valid) {
                InputValidator.showValidationError(parentWindow, 'Invalid Project Color', colorValidation.error);
                return false;
            }
            
            // Use sanitized values
            const safeProjectId = idValidation.sanitized;
            const safeName = nameValidation.sanitized;
            const safeColor = colorValidation.sanitized;
            const safeIcon = icon || 'folder-symbolic';
            const safeIconColorMode = iconColorMode || 'auto';
            
            // Ensure the columns exist
            this._ensureDarkIconsColumn();
            this._ensureIconColorModeColumn();
            
            const sql = `UPDATE Project SET name = '${InputValidator.sanitizeForSQL(safeName)}', color = '${safeColor}', icon = '${safeIcon}', icon_color_mode = '${safeIconColorMode}' WHERE id = ${safeProjectId}`;
            
            this.executeNonSelectCommand(this.dbConnection, sql);
            console.log('Project updated successfully with validated inputs');
            
            // Reload projects
            parentWindow._loadProjects();
            return true;
            
        } catch (error) {
            console.error('Error updating project:', error);
            InputValidator.showValidationError(parentWindow, 'Project Update Failed', `Failed to update project: ${error.message}`);
            return false;
        }
    }

    deleteProject(projectId, parentWindow) {
        try {
            console.log('Deleting project with ID:', projectId);
            
            // Validate project ID
            const idValidation = InputValidator.validateNumber(projectId, 1);
            if (!idValidation.valid) {
                InputValidator.showValidationError(parentWindow, 'Invalid Project ID', idValidation.error);
                return false;
            }
            
            // Prevent deletion of default project
            if (idValidation.sanitized === 1) {
                InputValidator.showValidationError(parentWindow, 'Cannot Delete Default Project', 'The default project cannot be deleted.');
                return false;
            }
            
            const safeProjectId = idValidation.sanitized;
            const sql = `DELETE FROM Project WHERE id = ${safeProjectId}`;
            
            this.executeNonSelectCommand(this.dbConnection, sql);
            console.log('Project deleted successfully with validation');
            
            // Reload projects
            parentWindow._loadProjects();
            
        } catch (error) {
            console.error('Error deleting project:', error);
        }
    }

    createNewProjectDialog(parentWindow) {
        const dialog = new Adw.AlertDialog({
            heading: 'Create New Project',
            body: 'Create a new project with icon and color.'
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
            label: 'Icon Mode:',
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
            label: 'Auto',
            width_request: 80,
            height_request: 36,
            css_classes: ['suggested-action'] // Default selection
        });
        const lightButton = new Gtk.Button({
            label: 'Light',
            width_request: 80,
            height_request: 36,
            css_classes: ['']
        });
        const darkButton = new Gtk.Button({
            label: 'Dark',
            width_request: 80,
            height_request: 36,
            css_classes: ['']
        });
        
        autoButton.connect('clicked', () => {
            iconColorMode = 'auto';
            console.log('Icon mode: Auto');
            // Update button styles
            autoButton.set_css_classes(['suggested-action']);
            lightButton.set_css_classes(['']);
            darkButton.set_css_classes(['']);
        });
        
        lightButton.connect('clicked', () => {
            iconColorMode = 'light';
            console.log('Icon mode: Light (white icons)');
            // Update button styles
            autoButton.set_css_classes(['']);
            lightButton.set_css_classes(['suggested-action']);
            darkButton.set_css_classes(['']);
        });
        
        darkButton.connect('clicked', () => {
            iconColorMode = 'dark';
            console.log('Icon mode: Dark (black icons)');
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
            placeholder_text: 'Project name'
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
        
        form.append(new Gtk.Label({label: 'Project Name:', halign: Gtk.Align.START}));
        form.append(nameEntry);
        
        // Icon selection
        let selectedIcon = this.projectIcons[0];
        const { iconGrid, iconSelection } = this._createIconSelection(selectedIcon);
        form.append(new Gtk.Label({label: 'Project Icon:', halign: Gtk.Align.START}));
        form.append(iconGrid);
        
        // Color selection
        let selectedColor = this.projectColors[0];
        const { colorGrid, colorSelection } = this._createColorSelection(selectedColor);
        form.append(new Gtk.Label({label: 'Project Color:', halign: Gtk.Align.START}));
        form.append(colorGrid);
        
        // Add form to main container
        mainBox.append(form);
        
        dialog.set_extra_child(mainBox);
        dialog.add_response('cancel', 'Cancel');
        dialog.add_response('create', 'Create Project');
        dialog.set_response_appearance('create', Adw.ResponseAppearance.SUGGESTED);
        
        dialog.connect('response', (dialog, response) => {
            if (response === 'create') {
                const name = nameEntry.get_text().trim();
                
                // Validate project name
                console.log('🔍 Project validation - name:', name);
                const nameValidation = InputValidator.validateProjectName(name);
                console.log('🔍 Project validation result:', nameValidation);
                
                if (!nameValidation.valid) {
                    console.log('❌ Project validation failed, blocking save');
                    InputValidator.showValidationTooltip(nameEntry, nameValidation.error, true);
                    return; // Don't close dialog
                }
                
                // Validate color
                const colorValidation = InputValidator.validateColor(selectedColor.value);
                if (!colorValidation.valid) {
                    console.log('❌ Color validation failed, blocking save');
                    InputValidator.showValidationTooltip(nameEntry, colorValidation.error, true); // Show on nameEntry as it's most visible
                    return; // Don't close dialog
                }
                
                console.log('✅ Project validation passed, proceeding to save');
                
                if (nameValidation.sanitized) {
                    this.createProject(nameValidation.sanitized, colorValidation.sanitized, selectedIcon, parentWindow, iconColorMode);
                }
            }
            dialog.close();
        });
        
        dialog.present(parentWindow);
    }

    createEditProjectDialog(project, parentWindow) {
        console.log('Creating edit project dialog for:', project.name);
        
        const dialog = new Adw.AlertDialog({
            heading: 'Edit Project',
            body: 'Update project name, icon, and color.'
        });
        
        // Main container for the entire dialog content
        const mainBox = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 0,
            margin_top: 12
        });
        
        console.log('MainBox created for edit dialog');
        
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
            label: 'Icon Mode:',
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
            label: 'Auto',
            width_request: 80,
            height_request: 36,
            css_classes: iconColorMode === 'auto' ? ['suggested-action'] : ['']
        });
        const lightButton = new Gtk.Button({
            label: 'Light',
            width_request: 80,
            height_request: 36,
            css_classes: iconColorMode === 'light' ? ['suggested-action'] : ['']
        });
        const darkButton = new Gtk.Button({
            label: 'Dark',
            width_request: 80,
            height_request: 36,
            css_classes: iconColorMode === 'dark' ? ['suggested-action'] : ['']
        });
        
        autoButton.connect('clicked', () => {
            iconColorMode = 'auto';
            console.log('Icon mode: Auto');
            // Update button styles
            autoButton.set_css_classes(['suggested-action']);
            lightButton.set_css_classes(['']);
            darkButton.set_css_classes(['']);
        });
        
        lightButton.connect('clicked', () => {
            iconColorMode = 'light';
            console.log('Icon mode: Light (white icons)');
            // Update button styles
            autoButton.set_css_classes(['']);
            lightButton.set_css_classes(['suggested-action']);
            darkButton.set_css_classes(['']);
        });
        
        darkButton.connect('clicked', () => {
            iconColorMode = 'dark';
            console.log('Icon mode: Dark (black icons)');
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
            placeholder_text: 'Project name',
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
        
        form.append(new Gtk.Label({label: 'Project Name:', halign: Gtk.Align.START}));
        form.append(nameEntry);
        
        // Icon selection
        let selectedIcon = project.icon || 'folder-symbolic';
        const { iconGrid, iconSelection } = this._createIconSelection(selectedIcon, project);
        form.append(new Gtk.Label({label: 'Project Icon:', halign: Gtk.Align.START}));
        form.append(iconGrid);
        
        // Color selection
        let selectedColor = this.projectColors.find(c => c.value === project.color) || this.projectColors[0];
        const { colorGrid, colorSelection } = this._createColorSelection(selectedColor, project);
        form.append(new Gtk.Label({label: 'Project Color:', halign: Gtk.Align.START}));
        form.append(colorGrid);
        
        // Add form to main container
        console.log('Appending form to mainBox in edit dialog...');
        mainBox.append(form);
        
        console.log('Setting mainBox as extra child in edit dialog...');
        dialog.set_extra_child(mainBox);
        dialog.add_response('cancel', 'Cancel');
        dialog.add_response('save', 'Save Changes');
        dialog.set_response_appearance('save', Adw.ResponseAppearance.SUGGESTED);
        
        dialog.connect('response', (dialog, response) => {
            if (response === 'save') {
                const name = nameEntry.get_text().trim();
                
                // Validate project name
                console.log('🔍 Project EDIT validation - name:', name);
                const nameValidation = InputValidator.validateProjectName(name);
                console.log('🔍 Project EDIT validation result:', nameValidation);
                
                if (!nameValidation.valid) {
                    console.log('❌ Project EDIT validation failed, blocking save');
                    InputValidator.showValidationTooltip(nameEntry, nameValidation.error, true);
                    return; // Don't close dialog
                }
                
                // Validate color
                const colorValidation = InputValidator.validateColor(selectedColor.value);
                if (!colorValidation.valid) {
                    console.log('❌ Color EDIT validation failed, blocking save');
                    InputValidator.showValidationTooltip(nameEntry, colorValidation.error, true);
                    return; // Don't close dialog
                }
                
                console.log('✅ Project EDIT validation passed, proceeding to save');
                
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
            
            // Apply selection styling with background highlight instead of changing icon color
            if (iconName === selectedIcon) {
                const selectionCss = `
                    button {
                        background-color: alpha(@accent_bg_color, 0.2);
                        border: 2px solid @accent_bg_color;
                        border-radius: 6px;
                    }
                `;
                const selectionProvider = new Gtk.CssProvider();
                selectionProvider.load_from_data(selectionCss, -1);
                iconButton.get_style_context().add_provider(selectionProvider, Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION);
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
                        // Clear all providers to reset styling
                        context.providers().forEach(provider => {
                            context.remove_provider(provider);
                        });
                    }
                }
                
                // Apply selection styling to clicked button
                const selectionCss = `
                    button {
                        background-color: alpha(@accent_bg_color, 0.2);
                        border: 2px solid @accent_bg_color;
                        border-radius: 6px;
                    }
                `;
                const selectionProvider = new Gtk.CssProvider();
                selectionProvider.load_from_data(selectionCss, -1);
                iconButton.get_style_context().add_provider(selectionProvider, Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION);
                
                console.log('Selected icon:', iconName);
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
            let css = `button { background: ${color.value}; border-radius: 15px; border: 2px solid rgba(0,0,0,0.1); }`;
            if (color.value === selectedColor.value) {
                css = `button { background: ${color.value}; border-radius: 15px; border: 3px solid #000000; }`;
            }
            
            const provider = new Gtk.CssProvider();
            provider.load_from_data(css, -1);
            colorButton.get_style_context().add_provider(provider, Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION);
            
            colorButton.connect('clicked', () => {
                colorSelection = color;
                console.log('Selected color:', color.name, color.value);
                
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
                        const newProvider = new Gtk.CssProvider();
                        newProvider.load_from_data(newCss, -1);
                        btn.get_style_context().add_provider(newProvider, Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION);
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
        console.log('Opening add project dialog...');
        
        const dialog = new Adw.AlertDialog({
            heading: 'Add New Project',
            body: 'Create a new project with icon and color.'
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
            placeholder_text: 'Project name'
        });
        form.append(new Gtk.Label({label: 'Project Name:', halign: Gtk.Align.START}));
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
        form.append(new Gtk.Label({label: 'Project Icon:', halign: Gtk.Align.START}));
        
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
                console.log('Selected icon:', iconName);
            });
            
            const row = Math.floor(i / 6);
            const col = i % 6;
            iconGrid.attach(iconButton, col, row, 1, 1);
        }
        
        form.append(iconGrid);
        
        // Color selection
        let selectedColor = this.projectColors[0];
        form.append(new Gtk.Label({label: 'Project Color:', halign: Gtk.Align.START}));
        
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
                console.log('Selected color:', color.name, color.value);
            });
            
            const row = Math.floor(i / 8);
            const col = i % 8;
            colorGrid.attach(colorButton, col, row, 1, 1);
        }
        
        form.append(colorGrid);
        
        dialog.set_extra_child(form);
        dialog.add_response('cancel', 'Cancel');
        dialog.add_response('create', 'Create Project');
        dialog.set_response_appearance('create', Adw.ResponseAppearance.SUGGESTED);
        
        dialog.connect('response', (dialog, response) => {
            console.log('Dialog response:', response);
            if (response === 'create') {
                const name = nameEntry.get_text().trim();
                
                // Validate project name
                const nameValidation = InputValidator.validateProjectName(name);
                if (!nameValidation.valid) {
                    InputValidator.showValidationTooltip(nameEntry, nameValidation.error, true);
                    return; // Don't close dialog
                }
                
                console.log('Creating project:', name, selectedColor.value, selectedIcon);
                if (nameValidation.sanitized) {
                    this.createProject(nameValidation.sanitized, selectedColor.value, selectedIcon, parentWindow);
                }
            }
            dialog.close();
        });
        
        dialog.present(parentWindow);
        console.log('Dialog presented');
    }

    showEditProjectDialog(projectId, parentWindow) {
        const project = parentWindow.allProjects.find(p => p.id === projectId);
        if (!project) return;
        
        console.log('Opening edit project dialog for:', project.name);
        
        const dialog = new Adw.AlertDialog({
            heading: 'Edit Project',
            body: 'Update project name, icon, and color.'
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
            placeholder_text: 'Project name',
            text: project.name
        });
        form.append(new Gtk.Label({label: 'Project Name:', halign: Gtk.Align.START}));
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
        form.append(new Gtk.Label({label: 'Project Icon:', halign: Gtk.Align.START}));
        
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
                console.log('Selected icon:', iconName);
                
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
        form.append(new Gtk.Label({label: 'Project Color:', halign: Gtk.Align.START}));
        
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
            let css = `button { background: ${color.value}; border-radius: 15px; border: 2px solid rgba(0,0,0,0.1); }`;
            if (color.value === selectedColor.value) {
                css = `button { background: ${color.value}; border-radius: 15px; border: 3px solid #000000; }`;
            }
            
            const provider = new Gtk.CssProvider();
            provider.load_from_data(css, -1);
            colorButton.get_style_context().add_provider(provider, Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION);
            
            colorButton.connect('clicked', () => {
                selectedColor = color;
                console.log('Selected color:', color.name, color.value);
                
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
                        const newProvider = new Gtk.CssProvider();
                        newProvider.load_from_data(newCss, -1);
                        btn.get_style_context().add_provider(newProvider, Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION);
                    }
                }
            });
            
            const row = Math.floor(i / 8);
            const col = i % 8;
            colorGrid.attach(colorButton, col, row, 1, 1);
        }
        
        form.append(colorGrid);
        
        dialog.set_extra_child(form);
        dialog.add_response('cancel', 'Cancel');
        dialog.add_response('save', 'Save Changes');
        dialog.set_response_appearance('save', Adw.ResponseAppearance.SUGGESTED);
        
        dialog.connect('response', (dialog, response) => {
            console.log('Edit dialog response:', response);
            if (response === 'save') {
                const name = nameEntry.get_text().trim();
                
                // Validate project name
                const nameValidation = InputValidator.validateProjectName(name);
                if (!nameValidation.valid) {
                    InputValidator.showValidationTooltip(nameEntry, nameValidation.error, true);
                    return; // Don't close dialog
                }
                
                console.log('Updating project:', name, selectedColor.value, selectedIcon);
                if (nameValidation.sanitized) {
                    this.updateProject(projectId, nameValidation.sanitized, selectedColor.value, selectedIcon, parentWindow);
                }
            }
            dialog.close();
        });
        
        dialog.present(parentWindow);
        console.log('Edit dialog presented');
    }

    // Create an inline editable project name row
    createEditableProjectRow(project, parentWindow) {
        const row = new Adw.ActionRow({
            subtitle: `Total time: ${parentWindow._formatDuration(project.totalTime)}`
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
            console.log(`Inline edit: Updating project "${project.name}" to "${validation.sanitized}"`);
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
}