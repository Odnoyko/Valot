import Gtk from 'gi://Gtk';
import Gdk from 'gi://Gdk';
import { getCurrencySymbol } from 'resource:///com/odnoyko/valot/js/data/currencies.js';
import { getContrastTextColor, hexToGdkRGBA, gdkRGBAToHex } from 'resource:///com/odnoyko/valot/js/func/global/colorUtils.js';

/**
 * Reusable Button component with consistent styling and behavior
 */
export class Button {
    constructor(config = {}) {
        const defaultConfig = {
            label: '',
            iconName: null,
            emoji: null,
            currency: null,
            backgroundColor: null,
            currentColor: null,          // For color picker buttons
            showColorPreview: false,     // Show current color as background
            colorDialogTitle: 'Select Color',
            onColorChanged: null,        // Callback for color changes
            cssClasses: ['flat'],
            tooltipText: '',
            onClick: null,
            widthRequest: -1,
            heightRequest: -1
        };

        this.config = { ...defaultConfig, ...config };
        this.widget = this._createWidget();
        
        // Apply CSS classes
        if (this.config.cssClasses && Array.isArray(this.config.cssClasses)) {
            this.config.cssClasses.forEach(cssClass => {
                this.widget.add_css_class(cssClass);
            });
        }

        // Apply background color if specified
        if (this.config.backgroundColor) {
            this.setBackgroundColor(this.config.backgroundColor);
        }
        
        this._setupEvents();
    }

    _createWidget() {
        const buttonConfig = {
            tooltip_text: this.config.tooltipText,
            width_request: this.config.widthRequest,
            height_request: this.config.heightRequest
        };
        
        // Only add label if it's not empty
        if (this.config.label && this.config.label.trim() !== '') {
            buttonConfig.label = this.config.label;
        }
        
        const button = new Gtk.Button(buttonConfig);

        // Handle icon, emoji, or currency display
        if (this.config.iconName || this.config.emoji || this.config.currency) {
            this._setupButtonContent(button);
        }
        
        // Clear any default label if we only have icon
        if (this.config.iconName && !this.config.label && !this.config.emoji && !this.config.currency) {
            button.set_label('');
        }

        return button;
    }

    _setupButtonContent(button) {
        // If only icon (no label, emoji, or currency), add image directly
        if (this.config.iconName && !this.config.label && !this.config.emoji && !this.config.currency) {
            const icon = new Gtk.Image({
                icon_name: this.config.iconName,
                pixel_size: Math.max(1, this.config.iconSize || 16)
            });
            button.set_child(icon);
            button.set_label('');
            return;
        }
        
        // For multiple elements, use Box (Label inside button)
        const box = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 4,
            halign: Gtk.Align.CENTER,
            width_request: 22,
            height_request: 23
        });

        // Add icon if specified (Icon inside label)
        if (this.config.iconName) {
            const icon = new Gtk.Image({
                icon_name: this.config.iconName,
                pixel_size: Math.max(1, this.config.iconSize || 16),
                width_request: 23,
                height_request: 23
            });
            box.append(icon);
        }

        // Add emoji if specified
        if (this.config.emoji) {
            const emojiLabel = new Gtk.Label({
                label: this.config.emoji,
                css_classes: ['emoji-label']
            });
            box.append(emojiLabel);
        }

        // Add currency if specified
        if (this.config.currency) {
            const currencyLabel = new Gtk.Label({
                label: getCurrencySymbol(this.config.currency),
                css_classes: ['currency-label', 'caption']
            });
            box.append(currencyLabel);
        }

        // Add text if specified
        if (this.config.label) {
            const textLabel = new Gtk.Label({
                label: this.config.label
            });
            box.append(textLabel);
        }

        button.set_child(box);
        button.set_label('');
    }

    _setupEvents() {
        if (this.config.onClick) {
            this.widget.connect('clicked', () => {
                this.config.onClick(this);
            });
        }
    }

    /**
     * Set button label
     */
    setLabel(label) {
        if (this.config.iconName && label) {
            // Update box content for icon+text buttons
            const box = this.widget.get_child();
            if (box instanceof Gtk.Box) {
                const labelWidget = box.get_last_child();
                if (labelWidget instanceof Gtk.Label) {
                    labelWidget.set_text(label);
                }
            }
        } else {
            this.widget.set_label(label);
        }
        this.config.label = label;
    }

    /**
     * Set button icon
     */
    setIcon(iconName, size = 16) {
        this.config.iconName = iconName;
        this.config.iconSize = size;
        
        // Try to find existing icon and update it
        const child = this.widget.get_first_child();
        if (child instanceof Gtk.Box) {
            // Button has a box (icon + text or multiple elements)
            let icon = child.get_first_child();
            if (icon instanceof Gtk.Image) {
                // Update existing icon
                icon.set_from_icon_name(iconName);
                icon.set_pixel_size(size);
                return;
            }
        } else if (child instanceof Gtk.Image) {
            // Button has direct icon
            child.set_from_icon_name(iconName);
            child.set_pixel_size(size);
            return;
        }
        
        // Fallback: create new structure
        const newIcon = new Gtk.Image({
            icon_name: iconName,
            pixel_size: size
        });

        if (this.config.label) {
            const box = new Gtk.Box({
                orientation: Gtk.Orientation.HORIZONTAL,
                spacing: 6
            });
            box.append(newIcon);
            box.append(new Gtk.Label({ label: this.config.label }));
            this.widget.set_child(box);
            this.widget.set_label('');
        } else {
            this.widget.set_child(newIcon);
        }
    }

    /**
     * Set button icon (compatibility method for trackingStateManager)
     */
    set_icon_name(iconName) {
        this.setIcon(iconName);
    }

    /**
     * Set tooltip text (compatibility method for trackingStateManager)
     */
    set_tooltip_text(text) {
        this.setTooltip(text);
    }

    /**
     * Set button enabled state
     */
    setEnabled(enabled) {
        this.widget.set_sensitive(enabled);
    }

    /**
     * Add CSS class
     */
    addClass(className) {
        this.widget.add_css_class(className);
    }

    /**
     * Remove CSS class
     */
    removeClass(className) {
        this.widget.remove_css_class(className);
    }

    /**
     * Set tooltip
     */
    setTooltip(text) {
        this.widget.set_tooltip_text(text);
        this.config.tooltipText = text;
    }

    /**
     * Set background color
     */
    setBackgroundColor(color) {
        const css = `button { background: ${color}; }`;
        const provider = new Gtk.CssProvider();
        provider.load_from_string(css);
        this.widget.get_style_context().add_provider(provider, Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION);
        this.config.backgroundColor = color;
    }

    /**
     * Set emoji
     */
    setEmoji(emoji) {
        this.config.emoji = emoji;
        this._setupButtonContent(this.widget);
    }

    /**
     * Set currency
     */
    setCurrency(currency) {
        this.config.currency = currency;
        
        // Create new button content with updated currency
        const box = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 4,
            halign: Gtk.Align.CENTER
        });

        // Add icon if specified
        if (this.config.iconName) {
            const icon = new Gtk.Image({
                icon_name: this.config.iconName,
                pixel_size: Math.max(1, this.config.iconSize || 16)
            });
            box.append(icon);
        }

        // Add emoji if specified
        if (this.config.emoji) {
            const emojiLabel = new Gtk.Label({
                label: this.config.emoji,
                css_classes: ['emoji-label']
            });
            box.append(emojiLabel);
        }

        // Add currency symbol
        if (currency) {
            const currencyLabel = new Gtk.Label({
                label: getCurrencySymbol(currency),
                css_classes: ['currency-label', 'caption']
            });
            box.append(currencyLabel);
        }

        // Add text label if specified
        if (this.config.label) {
            const textLabel = new Gtk.Label({
                label: this.config.label
            });
            box.append(textLabel);
        }

        this.widget.set_child(box);
        this.widget.set_label('');
    }
}