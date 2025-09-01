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

    createProject(name, color, icon, parentWindow) {
        try {
            console.log('Creating project:', name, color, icon);
            
            const sql = `INSERT INTO Project (name, color, icon, total_time) VALUES ('${name.replace(/'/g, "''")}', '${color}', '${icon}', 0)`;
            
            this.executeNonSelectCommand(this.dbConnection, sql);
            console.log('Project created successfully');
            
            // Reload projects
            parentWindow._loadProjects();
            
        } catch (error) {
            console.error('Error creating project:', error);
        }
    }

    updateProject(projectId, name, color, icon, parentWindow) {
        try {
            console.log('Updating project:', name, color, icon);
            
            const sql = `UPDATE Project SET name = '${name.replace(/'/g, "''")}', color = '${color}', icon = '${icon}' WHERE id = ${projectId}`;
            
            this.executeNonSelectCommand(this.dbConnection, sql);
            console.log('Project updated:', name, color, icon);
            
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
        
        const form = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 12,
            margin_top: 12
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
        
        dialog.set_extra_child(form);
        dialog.add_response('cancel', 'Cancel');
        dialog.add_response('create', 'Create Project');
        dialog.set_response_appearance('create', Adw.ResponseAppearance.SUGGESTED);
        
        dialog.connect('response', (dialog, response) => {
            if (response === 'create') {
                const name = nameEntry.get_text().trim();
                if (name) {
                    this.createProject(name, selectedColor.value, selectedIcon, parentWindow);
                }
            }
            dialog.close();
        });
        
        dialog.present(parentWindow);
    }

    createEditProjectDialog(project, parentWindow) {
        const dialog = new Adw.AlertDialog({
            heading: 'Edit Project',
            body: 'Update project name, icon, and color.'
        });
        
        const form = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 12,
            margin_top: 12
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
        
        dialog.set_extra_child(form);
        dialog.add_response('cancel', 'Cancel');
        dialog.add_response('save', 'Save Changes');
        dialog.set_response_appearance('save', Adw.ResponseAppearance.SUGGESTED);
        
        dialog.connect('response', (dialog, response) => {
            if (response === 'save') {
                const name = nameEntry.get_text().trim();
                if (name) {
                    this.updateProject(project.id, name, selectedColor.value, selectedIcon, parentWindow);
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
            
            // Highlight selected icon
            if (iconName === selectedIcon) {
                iconButton.add_css_class('suggested-action');
            }
            
            iconButton.connect('clicked', () => {
                iconSelection = iconName;
                
                // Update visual selection
                for (let j = 0; j < 12 && j < this.projectIcons.length; j++) {
                    const row = Math.floor(j / 6);
                    const col = j % 6;
                    const btn = iconGrid.get_child_at(col, row);
                    if (btn) {
                        btn.remove_css_class('suggested-action');
                    }
                }
                iconButton.add_css_class('suggested-action');
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