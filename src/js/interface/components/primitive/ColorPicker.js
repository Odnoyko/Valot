import Gtk from 'gi://Gtk';
import Gdk from 'gi://Gdk';
import { Button } from './Button.js';

/**
 * Color picker component with predefined colors and custom selection
 */
export class ColorPicker {
    constructor(config = {}) {
        const defaultConfig = {
            selectedColor: '#3584e4',
            colors: [
                { name: 'Blue', value: '#3584e4' },
                { name: 'Green', value: '#26a269' },
                { name: 'Yellow', value: '#f5c211' },
                { name: 'Orange', value: '#ff7800' },
                { name: 'Red', value: '#e01b24' },
                { name: 'Purple', value: '#9141ac' },
                { name: 'Brown', value: '#986a44' },
                { name: 'Gray', value: '#9a9996' },
                { name: 'Light Blue', value: '#62a0ea' },
                { name: 'Light Green', value: '#8ff0a4' },
                { name: 'Light Yellow', value: '#f9f06b' },
                { name: 'Light Orange', value: '#ffbe6f' },
                { name: 'Light Red', value: '#f66151' },
                { name: 'Light Purple', value: '#dc8add' },
                { name: 'Dark Blue', value: '#1c71d8' },
                { name: 'Dark Green', value: '#2ec27e' }
            ],
            columnsPerRow: 8,
            allowCustom: true,
            onColorChanged: null,
            cssClasses: ['color-picker']
        };

        this.selectedButton = null;
    }

    _createWidget() {
        const container = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 12
        });

        return container;
    }

    _initialize() {
        super._initialize();
        this._createColorGrid();
        
        if (this.config.allowCustom) {
            this._createCustomColorButton();
        }
    }

    _createColorGrid() {
        const grid = new Gtk.Grid({
            column_spacing: 6,
            row_spacing: 6,
            column_homogeneous: true
        });

        this.config.colors.forEach((color, index) => {
            const button = new Button({
                cssClasses: ['flat', 'color-button'],
                tooltipText: color.name,
                widthRequest: 32,
                heightRequest: 32,
                onClick: () => this._selectColor(color.value, button)
            });

            // Apply color styling
            this._applyColorStyling(button, color.value);

            // Mark as selected if it matches current selection
            if (color.value === this.config.selectedColor) {
                this._markSelected(button);
                this.selectedButton = button;
            }

            const row = Math.floor(index / this.config.columnsPerRow);
            const col = index % this.config.columnsPerRow;
            
            grid.attach(button.getWidget(), col, row, 1, 1);
        });

        this.widget.append(grid);
    }

    _createCustomColorButton() {
        const separator = new Gtk.Separator({
            orientation: Gtk.Orientation.HORIZONTAL,
            margin_top: 6,
            margin_bottom: 6
        });
        this.widget.append(separator);

        const customButton = new Button({
            label: 'Custom Color...',
            iconName: 'color-select-symbolic',
            cssClasses: ['flat'],
            onClick: () => this._showCustomColorDialog()
        });

        this.widget.append(customButton.getWidget());
    }

    _applyColorStyling(button, color) {
        const css = `
            .color-button {
                background: ${color};
                border-radius: 6px;
                border: 2px solid rgba(0,0,0,0.1);
                min-height: 28px;
                min-width: 28px;
            }
            .color-button:hover {
                border: 2px solid rgba(0,0,0,0.3);
            }
            .color-button.selected {
                border: 3px solid #000000;
                box-shadow: 0 0 0 2px rgba(255,255,255,0.8);
            }
        `;

        const provider = new Gtk.CssProvider();
        provider.load_from_data(css, -1);
        button.getWidget().get_style_context().add_provider(
            provider, 
            Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION
        );
    }

    _markSelected(button) {
        // Remove selection from previous button
        if (this.selectedButton) {
            this.selectedButton.removeClass('selected');
        }

        // Mark new button as selected
        button.addClass('selected');
        this.selectedButton = button;
    }

    _selectColor(color, button) {
        this.config.selectedColor = color;
        this._markSelected(button);

        if (this.config.onColorChanged) {
            this.config.onColorChanged(color, this);
        }

        this._emit('colorChanged', color);
    }

    _showCustomColorDialog() {
        const dialog = new Gtk.ColorDialog();
        
        // Convert current color to GdkRGBA
        const rgba = new Gdk.RGBA();
        rgba.parse(this.config.selectedColor);

        dialog.choose_rgba(
            this.widget.get_root(),
            rgba,
            null,
            (source, result) => {
                try {
                    const selectedRgba = dialog.choose_rgba_finish(result);
                    const hexColor = this._rgbaToHex(selectedRgba);
                    
                    // Create temporary button for custom color
                    const customButton = new Button({
                        cssClasses: ['flat', 'color-button']
                    });
                    this._applyColorStyling(customButton, hexColor);
                    
                    this._selectColor(hexColor, customButton);
                } catch (error) {
                    // User cancelled or error occurred
                    console.log('Custom color selection cancelled');
                }
            }
        );
    }

    _rgbaToHex(rgba) {
        const r = Math.round(rgba.red * 255);
        const g = Math.round(rgba.green * 255);
        const b = Math.round(rgba.blue * 255);
        
        return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
    }

    /**
     * Get selected color
     */
    getSelectedColor() {
        return this.config.selectedColor;
    }

    /**
     * Set selected color
     */
    setSelectedColor(color) {
        this.config.selectedColor = color;
        
        // Find button with this color and mark as selected
        const colorData = this.config.colors.find(c => c.value === color);
        if (colorData) {
            // Find the button in the grid and mark it
            // This would require tracking buttons, simplified for now
            this._emit('colorChanged', color);
        }
    }

    /**
     * Add custom color to palette
     */
    addCustomColor(color, name = 'Custom') {
        this.config.colors.push({ name, value: color });
        
        // Recreate grid to include new color
        this._recreateGrid();
    }

    _recreateGrid() {
        // Clear existing grid
        let child = this.widget.get_first_child();
        while (child && !(child instanceof Gtk.Separator)) {
            const next = child.get_next_sibling();
            this.widget.remove(child);
            child = next;
        }

        // Recreate grid
        this._createColorGrid();
    }

    /**
     * Set available colors
     */
    setColors(colors) {
        this.config.colors = colors;
        this._recreateGrid();
    }
}