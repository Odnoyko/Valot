/**
 * List Render Service
 * Centralized service for rendering tasks/projects/clients lists with proper cleanup
 * Prevents memory leaks by ensuring old widgets are destroyed before creating new ones
 */


/**
 * Base class for list rendering with cleanup
 */
export class ListRenderService {
    constructor() {
        // Track widgets for cleanup
        this._widgets = new Map(); // key -> widget
        this._templates = new Map(); // key -> template
    }

    /**
     * Clear all widgets and templates
     * Must be called before rendering new content
     */
    clear() {
        // Destroy all templates
        this._templates.forEach((template, key) => {
            try {
                if (template && typeof template.destroy === 'function') {
                    template.destroy();
                }
            } catch (e) {
                console.log('[ListRenderService] Error destroying template:', e);
            }
        });
        this._templates.clear();

        // Destroy all widgets
        this._widgets.forEach((widget, key) => {
            try {
                if (widget && typeof widget.destroy === 'function') {
                    widget.destroy();
                }
            } catch (e) {
                console.log('[ListRenderService] Error destroying widget:', e);
            }
        });
        this._widgets.clear();
    }

    /**
     * Register widget for cleanup tracking
     */
    registerWidget(key, widget) {
        if (this._widgets.has(key)) {
            // Destroy old widget first
            try {
                const oldWidget = this._widgets.get(key);
                if (oldWidget && typeof oldWidget.destroy === 'function') {
                    oldWidget.destroy();
                }
            } catch (e) {
                console.log('[ListRenderService] Error destroying old widget:', e);
            }
        }
        this._widgets.set(key, widget);
    }

    /**
     * Register template for cleanup tracking
     */
    registerTemplate(key, template) {
        if (this._templates.has(key)) {
            // Destroy old template first
            try {
                const oldTemplate = this._templates.get(key);
                if (oldTemplate && typeof oldTemplate.destroy === 'function') {
                    oldTemplate.destroy();
                }
            } catch (e) {
                console.log('[ListRenderService] Error destroying old template:', e);
            }
        }
        this._templates.set(key, template);
    }

    /**
     * Remove specific widget/template
     */
    remove(key) {
        const widget = this._widgets.get(key);
        if (widget) {
            try {
                if (typeof widget.destroy === 'function') {
                    widget.destroy();
                }
            } catch (e) {
                console.log('[ListRenderService] Error destroying widget:', e);
            }
            this._widgets.delete(key);
        }

        const template = this._templates.get(key);
        if (template) {
            try {
                if (typeof template.destroy === 'function') {
                    template.destroy();
                }
            } catch (e) {
                console.log('[ListRenderService] Error destroying template:', e);
            }
            this._templates.delete(key);
        }
    }

    /**
     * Cleanup: destroy all tracked objects
     */
    destroy() {
        this.clear();
    }
}

