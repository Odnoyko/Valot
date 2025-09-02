import Gtk from 'gi://Gtk';
import Adw from 'gi://Adw';

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
            
            // First ensure the columns exist
            this._ensureDarkIconsColumn();
            this._ensureIconColorModeColumn();
            
            const sql = `INSERT INTO Project (name, color, icon, total_time, icon_color_mode) VALUES ('${name.replace(/'/g, "''")}', '${color}', '${icon}', 0, '${iconColorMode}')`;
            
            this.executeNonSelectCommand(this.dbConnection, sql);
            console.log('Project created successfully');
            
            // Reload projects
            parentWindow._loadProjects();
            
        } catch (error) {
            console.error('Error creating project:', error);
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
            
            // Ensure the columns exist
            this._ensureDarkIconsColumn();
            this._ensureIconColorModeColumn();
            
            const sql = `UPDATE Project SET name = '${name.replace(/'/g, "''")}', color = '${color}', icon = '${icon}', icon_color_mode = '${iconColorMode}' WHERE id = ${projectId}`;
            
            this.executeNonSelectCommand(this.dbConnection, sql);
            console.log('Project updated:', name, color, icon, 'Icon color mode:', iconColorMode);
            
            // Reload projects
            parentWindow._loadProjects();
            
        } catch (error) {
            console.error('Error updating project:', error);
        }
    }

    deleteProject(projectId, parentWindow) {
        try {
            console.log('Deleting project with ID:', projectId);
            
            const sql = `DELETE FROM Project WHERE id = ${projectId}`;
            
            this.executeNonSelectCommand(this.dbConnection, sql);
            console.log('Project deleted successfully');
            
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
                if (name) {
                    this.createProject(name, selectedColor.value, selectedIcon, parentWindow, iconColorMode);
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
                if (name) {
                    this.updateProject(project.id, name, selectedColor.value, selectedIcon, parentWindow, iconColorMode);
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
}