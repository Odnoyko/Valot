/**
 * Functionality: Button Behavior and Business Logic
 * Handles events, state management, and interactions
 */
export class ButtonBehavior {
    constructor(buttonInterface, config = {}) {
        this.interface = buttonInterface;
        this.config = {
            onClick: config.onClick || null,
            onHover: config.onHover || null,
            disabled: config.disabled || false,
            loading: config.loading || false,
            ...config
        };

        this.isLoading = false;
        this.originalLabel = this.interface.config.label;
        this.originalIcon = this.interface.config.iconName;
        
        this._setupEvents();
        this._applyInitialState();
    }

    _setupEvents() {
        // Click handler
        if (this.config.onClick) {
            this.interface.widget.connect('clicked', () => {
                if (!this.isLoading && !this.config.disabled) {
                    this.config.onClick(this);
                }
            });
        }

        // Hover handlers
        if (this.config.onHover) {
            const motionController = new Gtk.EventControllerMotion();
            motionController.connect('enter', () => {
                if (!this.isLoading && !this.config.disabled) {
                    this.config.onHover(this, 'enter');
                }
            });
            motionController.connect('leave', () => {
                if (!this.isLoading && !this.config.disabled) {
                    this.config.onHover(this, 'leave');
                }
            });
            this.interface.widget.add_controller(motionController);
        }
    }

    _applyInitialState() {
        if (this.config.disabled) {
            this.disable();
        }
        if (this.config.loading) {
            this.setLoading(true);
        }
    }

    // Behavior methods
    enable() {
        this.config.disabled = false;
        this.interface.setEnabled(true);
        this.interface.removeClass('disabled');
    }

    disable() {
        this.config.disabled = true;
        this.interface.setEnabled(false);
        this.interface.addClass('disabled');
    }

    setLoading(loading) {
        this.isLoading = loading;
        
        if (loading) {
            // Show loading state
            this.interface.setIcon('process-working-symbolic', this.interface.config.iconSize);
            this.interface.addClass('loading');
            this.interface.widget.set_sensitive(false);
        } else {
            // Restore original state
            if (this.originalIcon) {
                this.interface.setIcon(this.originalIcon, this.interface.config.iconSize);
            }
            this.interface.removeClass('loading');
            this.interface.widget.set_sensitive(!this.config.disabled);
        }
    }

    // State management
    getState() {
        return {
            disabled: this.config.disabled,
            loading: this.isLoading,
            label: this.interface.config.label,
            icon: this.interface.config.iconName
        };
    }

    setState(state) {
        if (state.hasOwnProperty('disabled')) {
            state.disabled ? this.disable() : this.enable();
        }
        if (state.hasOwnProperty('loading')) {
            this.setLoading(state.loading);
        }
        if (state.hasOwnProperty('label')) {
            this.interface.setLabel(state.label);
        }
        if (state.hasOwnProperty('icon')) {
            this.interface.setIcon(state.icon);
        }
    }

    // Theme and styling functionality
    applyTheme(theme) {
        const themes = {
            primary: ['suggested-action'],
            secondary: ['flat'],
            destructive: ['destructive-action'],
            success: ['success'],
            warning: ['warning']
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

    // Project-specific functionality
    applyProjectColor(projectColor) {
        // This is where project-specific button coloring would go
        if (projectColor) {
            this.interface.widget.get_style_context().add_provider(
                this._createColorProvider(projectColor),
                Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION
            );
        }
    }

    _createColorProvider(color) {
        const css = `
            button.project-colored {
                background-color: ${color};
                border-color: ${color};
            }
            button.project-colored:hover {
                background-color: ${this._darkenColor(color, 0.1)};
            }
        `;
        
        const provider = new Gtk.CssProvider();
        provider.load_from_data(css, css.length);
        return provider;
    }

    _darkenColor(color, amount) {
        // Simple color darkening - could be more sophisticated
        return color.replace('#', '#').substring(0, 7) + '88';
    }
}