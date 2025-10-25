import Gtk from 'gi://Gtk';
import Adw from 'gi://Adw?version=1';
import Gdk from 'gi://Gdk';
import { getAllIcons } from 'resource:///com/odnoyko/valot/data/icons.js';
import { getAllEmojis } from 'resource:///com/odnoyko/valot/data/emojis.js';

/**
 * Project Appearance Dialog
 * Shows color and icon picker in 2-column layout (from main branch)
 */
export class ProjectAppearanceDialog {
    constructor(config = {}) {
        this.project = config.project;
        this.parentWindow = config.parentWindow;
        this.onSave = config.onSave;
    }

    present() {
        const dialog = new Adw.AlertDialog({
            heading: _('Project Appearance'),
            body: _('Configure color and icon for "{name}"').replace('{name}', this.project.name),
        });

        // Main 2-column layout
        const mainBox = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 24,
            margin_top: 16,
            margin_bottom: 16,
            margin_start: 16,
            margin_end: 16,
            homogeneous: true,
        });

        // LEFT COLUMN - COLOR
        const colorColumn = this._createColorColumn();
        mainBox.append(colorColumn);

        // RIGHT COLUMN - ICON
        const iconColumn = this._createIconColumn();
        mainBox.append(iconColumn);

        dialog.set_extra_child(mainBox);
        dialog.add_response('cancel', _('Cancel'));
        dialog.add_response('save', _('Save'));
        dialog.set_response_appearance('save', Adw.ResponseAppearance.SUGGESTED);

        dialog.connect('response', async (dialog, response) => {
            if (response === 'save' && this.onSave) {
                await this.onSave(this.project);
            }
            dialog.close();
        });

        dialog.present(this.parentWindow);
    }

    _createColorColumn() {
        const colorColumn = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 12,
            hexpand: true,
        });

        const colorLabel = new Gtk.Label({
            label: _('Project Color:'),
            halign: Gtk.Align.START,
            css_classes: ['heading'],
        });

        this.colorPreview = new Gtk.Button({
            width_request: 48,
            height_request: 48,
            css_classes: ['flat', 'color-preview'],
            halign: Gtk.Align.CENTER,
            tooltip_text: _('Click to change color'),
        });

        this.colorProvider = new Gtk.CssProvider();
        this._updateColorPreview();
        this.colorPreview.get_style_context().add_provider(this.colorProvider, Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION);

        this.colorPreview.connect('clicked', () => {
            this._showColorPicker();
        });

        colorColumn.append(colorLabel);
        colorColumn.append(this.colorPreview);

        return colorColumn;
    }

    _createIconColumn() {
        const iconColumn = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 12,
            hexpand: true,
        });

        const iconLabel = new Gtk.Label({
            label: _('Project Symbol:'),
            halign: Gtk.Align.START,
            css_classes: ['heading'],
        });

        // Symbol preview button
        this.iconPreview = new Gtk.Button({
            width_request: 48,
            height_request: 48,
            css_classes: ['flat', 'icon-preview'],
            halign: Gtk.Align.CENTER,
            tooltip_text: _('Click to choose symbol'),
        });

        this._updateIconPreview();

        this.iconPreview.connect('clicked', () => {
            this._showSymbolPicker();
        });

        iconColumn.append(iconLabel);
        iconColumn.append(this.iconPreview);

        return iconColumn;
    }

    _updateColorPreview() {
        this.colorProvider.load_from_string(
            `.color-preview {
                background: ${this.project.color};
                border-radius: 50%;
                border: 2px solid alpha(@borders, 0.3);
            }
            .color-preview:hover {
                filter: brightness(1.1);
            }`
        );
    }

    _updateIconPreview() {
        let iconWidget;
        if (this.project.icon && this.project.icon.startsWith('emoji:')) {
            const emoji = this.project.icon.substring(6);
            iconWidget = new Gtk.Label({
                label: emoji,
                css_classes: ['emoji-preview'],
            });
        } else {
            iconWidget = new Gtk.Image({
                icon_name: this.project.icon || 'folder-symbolic',
                pixel_size: 24,
            });
        }
        this.iconPreview.set_child(iconWidget);
    }

    _showColorPicker() {
        const colorDialog = new Gtk.ColorDialog({
            title: _('Select Project Color'),
            modal: true,
            with_alpha: false,
        });

        const currentColor = new Gdk.RGBA();
        if (!currentColor.parse(this.project.color)) {
            currentColor.parse('#cccccc');
        }

        colorDialog.choose_rgba(this.parentWindow, currentColor, null, (source_object, result) => {
            try {
                const selectedColor = colorDialog.choose_rgba_finish(result);
                const hexColor = `#${Math.round(selectedColor.red * 255).toString(16).padStart(2, '0')}${Math.round(selectedColor.green * 255).toString(16).padStart(2, '0')}${Math.round(selectedColor.blue * 255).toString(16).padStart(2, '0')}`;

                this.project.color = hexColor;
                this._updateColorPreview();
            } catch (error) {
                console.error('Error selecting color:', error);
            }
        });
    }

    _showSymbolPicker() {
        const dialog = new Adw.AlertDialog({
            heading: _('Choose Symbol'),
            body: _('Select an icon or emoji for the project'),
        });

        const mainContainer = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 12,
            margin_top: 16,
            margin_bottom: 16,
            margin_start: 16,
            margin_end: 16,
        });

        // Tab bar for Icons / Emojis
        const tabBar = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 0,
            css_classes: ['linked'],
            halign: Gtk.Align.CENTER,
            margin_bottom: 12,
        });

        const iconsTabBtn = new Gtk.ToggleButton({
            label: _('Icons'),
            active: !this.project.icon || !this.project.icon.startsWith('emoji:'),
        });
        const emojisTabBtn = new Gtk.ToggleButton({
            label: _('Emojis'),
            active: this.project.icon && this.project.icon.startsWith('emoji:'),
        });

        // Tab switching logic
        let currentTab = iconsTabBtn.get_active() ? 'icons' : 'emojis';

        const updateGrid = () => {
            // Clear current grid
            let child = iconGrid.get_first_child();
            while (child) {
                const next = child.get_next_sibling();
                iconGrid.remove(child);
                child = next;
            }

            if (currentTab === 'emojis') {
                const emojis = getAllEmojis();
                emojis.forEach((emoji, index) => {
                    const emojiButton = new Gtk.Button({
                        label: emoji,
                        width_request: 48,
                        height_request: 48,
                        css_classes: ['flat'],
                    });

                    emojiButton.connect('clicked', () => {
                        this.project.icon = `emoji:${emoji}`;
                        this.project.icon_color_mode = 'auto';
                        this._updateIconPreview();
                        dialog.close();
                    });

                    iconGrid.attach(emojiButton, index % 8, Math.floor(index / 8), 1, 1);
                });
            } else {
                const icons = getAllIcons();
                icons.forEach((iconName, index) => {
                    const iconButton = new Gtk.Button({
                        width_request: 48,
                        height_request: 48,
                        css_classes: ['flat'],
                    });

                    const icon = new Gtk.Image({
                        icon_name: iconName,
                        pixel_size: 24,
                    });
                    iconButton.set_child(icon);

                    iconButton.connect('clicked', () => {
                        this.project.icon = iconName;
                        this.project.icon_color_mode = 'auto'; // Always auto
                        this._updateIconPreview();
                        dialog.close();
                    });

                    iconGrid.attach(iconButton, index % 8, Math.floor(index / 8), 1, 1);
                });
            }
        };

        iconsTabBtn.connect('toggled', () => {
            if (iconsTabBtn.get_active()) {
                emojisTabBtn.set_active(false);
                currentTab = 'icons';
                updateGrid();
            }
        });

        emojisTabBtn.connect('toggled', () => {
            if (emojisTabBtn.get_active()) {
                iconsTabBtn.set_active(false);
                currentTab = 'emojis';
                updateGrid();
            }
        });

        tabBar.append(iconsTabBtn);
        tabBar.append(emojisTabBtn);

        const scrolled = new Gtk.ScrolledWindow({
            hscrollbar_policy: Gtk.PolicyType.NEVER,
            vscrollbar_policy: Gtk.PolicyType.AUTOMATIC,
            min_content_width: 400,
            min_content_height: 300,
            max_content_height: 400,
        });

        const iconGrid = new Gtk.Grid({
            column_spacing: 4,
            row_spacing: 4,
            margin_top: 8,
            margin_bottom: 8,
            margin_start: 8,
            margin_end: 8,
            column_homogeneous: true,
        });

        scrolled.set_child(iconGrid);

        mainContainer.append(tabBar);
        mainContainer.append(scrolled);

        // Initial grid populate
        updateGrid();

        dialog.set_extra_child(mainContainer);
        dialog.add_response('cancel', _('Cancel'));
        dialog.present(this.parentWindow);
    }
}
