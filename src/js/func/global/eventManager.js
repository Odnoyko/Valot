import Gtk from 'gi://Gtk';
import Gdk from 'gi://Gdk';
import Gio from 'gi://Gio';
import GObject from 'gi://GObject';

/**
 * Centralized event handling system for reusable patterns
 */
export class EventManager {
    constructor(parentWindow) {
        this.parentWindow = parentWindow;
        this.registeredHandlers = new Map();
        this.eventListeners = new Map();
    }

    /**
     * Register a reusable event handler pattern
     */
    registerHandler(handlerName, handler) {
        this.registeredHandlers.set(handlerName, handler);
    }

    /**
     * Create standardized click handler
     */
    createClickHandler(action, context = null) {
        return () => {
            try {
                if (context) {
                    action.call(context);
                } else {
                    action();
                }
            } catch (error) {
                console.error(`Click handler error:`, error);
                this.showErrorToast(`Action failed: ${error.message}`);
            }
        };
    }

    /**
     * Create debounced input handler
     */
    createDebouncedHandler(handler, delay = 300) {
        let timeout;
        return (widget, ...args) => {
            clearTimeout(timeout);
            timeout = setTimeout(() => {
                try {
                    handler(widget, ...args);
                } catch (error) {
                    console.error(`Debounced handler error:`, error);
                }
            }, delay);
        };
    }

    /**
     * Setup form submission handler with validation
     */
    setupFormSubmission(config = {}) {
        const {
            dialog,
            fields = {},
            validators = {},
            onSubmit,
            onCancel = null,
            submitResponse = 'submit',
            cancelResponse = 'cancel'
        } = config;

        return dialog.connect('response', (dialog, response) => {
            if (response === submitResponse) {
                // Extract form data
                const formData = {};
                let hasErrors = false;

                Object.entries(fields).forEach(([key, widget]) => {
                    const value = this.extractWidgetValue(widget);
                    formData[key] = value;

                    // Validate if validator provided
                    if (validators[key]) {
                        const validation = validators[key](value);
                        if (!validation.valid) {
                            this.showFieldError(widget, validation.error);
                            hasErrors = true;
                        } else {
                            this.clearFieldError(widget);
                        }
                    }
                });

                // If validation errors, don't close dialog
                if (hasErrors) {
                    return;
                }

                // Submit
                try {
                    const success = onSubmit ? onSubmit(formData) : true;
                    if (!success) {
                        return; // Keep dialog open
                    }
                } catch (error) {
                    console.error('Form submission error:', error);
                    this.showErrorToast(`Submission failed: ${error.message}`);
                    return;
                }
            } else if (response === cancelResponse && onCancel) {
                onCancel();
            }

            dialog.close();
        });
    }

    /**
     * Setup list selection handler
     */
    setupListSelection(config = {}) {
        const {
            listBox,
            onSelectionChanged = null,
            selectionMode = 'single',
            allowDeselect = false
        } = config;

        let lastSelected = null;

        return listBox.connect('row-selected', (listBox, row) => {
            if (!row) {
                if (onSelectionChanged) {
                    onSelectionChanged(null, -1);
                }
                return;
            }

            const index = row.get_index();
            
            // Handle deselection for single mode
            if (selectionMode === 'single' && allowDeselect && lastSelected === row) {
                listBox.unselect_row(row);
                lastSelected = null;
                if (onSelectionChanged) {
                    onSelectionChanged(null, -1);
                }
                return;
            }

            lastSelected = row;
            
            if (onSelectionChanged) {
                onSelectionChanged(row, index);
            }
        });
    }

    /**
     * Setup keyboard shortcuts
     */
    setupKeyboardShortcuts(config = {}) {
        const {
            widget,
            shortcuts = {}
        } = config;

        const controller = new Gtk.EventControllerKey();

        controller.connect('key-pressed', (controller, keyval, keycode, state) => {
            const key = Gdk.keyval_name(keyval);
            const ctrl = (state & Gdk.ModifierType.CONTROL_MASK) !== 0;
            const shift = (state & Gdk.ModifierType.SHIFT_MASK) !== 0;
            const alt = (state & Gdk.ModifierType.ALT_MASK) !== 0;

            const shortcutKey = this.buildShortcutKey(key, ctrl, shift, alt);
            
            if (shortcuts[shortcutKey]) {
                try {
                    shortcuts[shortcutKey]();
                    return true; // Consume event
                } catch (error) {
                    console.error(`Keyboard shortcut error (${shortcutKey}):`, error);
                }
            }

            return false; // Let event propagate
        });

        widget.add_controller(controller);
        return controller;
    }

    /**
     * Setup drag and drop handler
     */
    setupDragAndDrop(config = {}) {
        const {
            sourceWidget,
            targetWidget,
            onDragStart = null,
            onDragData = null,
            onDropReceived = null,
            dragType = 'text/plain'
        } = config;

        // Setup drag source
        if (sourceWidget && onDragData) {
            const dragSource = new Gtk.DragSource();
            dragSource.set_actions(Gdk.DragAction.COPY);

            dragSource.connect('prepare', (source, x, y) => {
                if (onDragStart) {
                    onDragStart(x, y);
                }
                
                const dragData = onDragData();
                if (dragData) {
                    const content = Gdk.ContentProvider.new_for_value(dragData);
                    return content;
                }
                return null;
            });

            sourceWidget.add_controller(dragSource);
        }

        // Setup drop target
        if (targetWidget && onDropReceived) {
            const dropTarget = new Gtk.DropTarget({
                actions: Gdk.DragAction.COPY,
                formats: Gdk.ContentFormats.new([GObject.TYPE_STRING])
            });

            dropTarget.connect('drop', (target, value, x, y) => {
                try {
                    return onDropReceived(value, x, y);
                } catch (error) {
                    console.error('Drop handler error:', error);
                    return false;
                }
            });

            targetWidget.add_controller(dropTarget);
        }
    }

    /**
     * Setup context menu
     */
    setupContextMenu(config = {}) {
        const {
            widget,
            menuItems = [],
            onItemSelected = null
        } = config;

        const popoverMenu = new Gtk.PopoverMenu();
        const menu = new Gio.Menu();

        menuItems.forEach((item, index) => {
            const { label, action, icon = null, enabled = true } = item;
            
            if (label === 'separator') {
                // Add separator (not directly supported in Gio.Menu, use different approach)
                return;
            }

            const actionName = `context-action-${index}`;
            menu.append(label, actionName);

            // Setup action
            const simpleAction = new Gio.SimpleAction({
                name: actionName,
                enabled: enabled
            });

            simpleAction.connect('activate', () => {
                try {
                    if (onItemSelected) {
                        onItemSelected(action, item);
                    } else if (typeof action === 'function') {
                        action();
                    }
                } catch (error) {
                    console.error('Context menu action error:', error);
                }
            });

            // Add action to application (simplified approach)
            if (this.parentWindow.get_application) {
                this.parentWindow.get_application().add_action(simpleAction);
            }
        });

        popoverMenu.set_menu_model(menu);
        popoverMenu.set_parent(widget);

        // Setup right-click to show menu
        const gesture = new Gtk.GestureClick();
        gesture.set_button(3); // Right click

        gesture.connect('pressed', (gesture, n_press, x, y) => {
            popoverMenu.set_pointing_to({ x: x, y: y, width: 0, height: 0 });
            popoverMenu.popup();
        });

        widget.add_controller(gesture);

        return popoverMenu;
    }

    /**
     * Setup window state management
     */
    setupWindowStateHandlers(window, config = {}) {
        const {
            onMinimize = null,
            onMaximize = null,
            onRestore = null,
            onClose = null,
            onFocusChange = null
        } = config;

        // Minimize/iconify
        if (onMinimize) {
            window.connect('notify::minimized', () => {
                if (window.minimized) {
                    onMinimize();
                }
            });
        }

        // Maximize
        if (onMaximize || onRestore) {
            window.connect('notify::maximized', () => {
                if (window.maximized && onMaximize) {
                    onMaximize();
                } else if (!window.maximized && onRestore) {
                    onRestore();
                }
            });
        }

        // Close
        if (onClose) {
            window.connect('close-request', () => {
                try {
                    return onClose(); // Return true to prevent close, false to allow
                } catch (error) {
                    console.error('Window close handler error:', error);
                    return false; // Allow close on error
                }
            });
        }

        // Focus change
        if (onFocusChange) {
            window.connect('notify::is-active', () => {
                onFocusChange(window.is_active);
            });
        }
    }

    /**
     * Batch connect multiple handlers
     */
    batchConnect(connections = []) {
        const handlers = [];
        
        connections.forEach(connection => {
            const { widget, signal, handler, context = null } = connection;
            
            try {
                const handlerId = widget.connect(signal, context ? 
                    (...args) => handler.call(context, ...args) : 
                    handler
                );
                
                handlers.push({ widget, handlerId });
            } catch (error) {
                console.error(`Failed to connect ${signal} handler:`, error);
            }
        });

        return handlers;
    }

    /**
     * Disconnect batch handlers
     */
    batchDisconnect(handlers = []) {
        handlers.forEach(({ widget, handlerId }) => {
            try {
                widget.disconnect(handlerId);
            } catch (error) {
                console.error('Failed to disconnect handler:', error);
            }
        });
    }

    // Helper methods

    extractWidgetValue(widget) {
        if (widget.get_text) {
            return widget.get_text();
        } else if (widget.get_value) {
            return widget.get_value();
        } else if (widget.get_selected !== undefined) {
            const selected = widget.get_selected();
            const model = widget.get_model();
            return model ? model.get_string(selected) : null;
        } else if (widget.get_active !== undefined) {
            return widget.get_active();
        }
        return null;
    }

    showFieldError(widget, message) {
        widget.add_css_class('error');
        widget.set_tooltip_text(message);
        
        // Auto-clear error after typing
        const clearHandler = widget.connect('changed', () => {
            this.clearFieldError(widget);
            widget.disconnect(clearHandler);
        });
    }

    clearFieldError(widget) {
        widget.remove_css_class('error');
        widget.set_tooltip_text('');
    }

    showErrorToast(message) {
        if (this.parentWindow.show_toast) {
            this.parentWindow.show_toast(message);
        } else {
            console.error('Toast Error:', message);
        }
    }

    buildShortcutKey(key, ctrl, shift, alt) {
        let shortcut = '';
        if (ctrl) shortcut += 'Ctrl+';
        if (shift) shortcut += 'Shift+';
        if (alt) shortcut += 'Alt+';
        shortcut += key;
        return shortcut;
    }

    // Cleanup
    cleanup() {
        this.registeredHandlers.clear();
        this.eventListeners.clear();
    }
}