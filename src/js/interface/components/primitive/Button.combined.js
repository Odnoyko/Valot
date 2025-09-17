import { ButtonInterface } from './Button.js';
import { ButtonBehavior } from '../../../func/components/primitive/ButtonBehavior.js';

/**
 * Combined Button Component
 * Brings together Interface (UI) + Functionality (Behavior)
 */
export class Button {
    constructor(config = {}) {
        // Create interface (UI structure)
        this.interface = new ButtonInterface(config);
        
        // Add functionality (behavior and logic)
        this.behavior = new ButtonBehavior(this.interface, config);
        
        // Expose common interface methods
        this.widget = this.interface.widget;
    }

    // Delegate to interface methods
    getWidget() {
        return this.interface.getWidget();
    }

    setLabel(label) {
        return this.interface.setLabel(label);
    }

    setIcon(iconName, size) {
        return this.interface.setIcon(iconName, size);
    }

    setTooltip(text) {
        return this.interface.setTooltip(text);
    }

    addClass(className) {
        return this.interface.addClass(className);
    }

    removeClass(className) {
        return this.interface.removeClass(className);
    }

    // Delegate to behavior methods
    enable() {
        return this.behavior.enable();
    }

    disable() {
        return this.behavior.disable();
    }

    setLoading(loading) {
        return this.behavior.setLoading(loading);
    }

    applyTheme(theme) {
        return this.behavior.applyTheme(theme);
    }

    applyProjectColor(color) {
        return this.behavior.applyProjectColor(color);
    }

    getState() {
        return this.behavior.getState();
    }

    setState(state) {
        return this.behavior.setState(state);
    }

    // Direct access to interface and behavior for advanced usage
    getInterface() {
        return this.interface;
    }

    getBehavior() {
        return this.behavior;
    }
}