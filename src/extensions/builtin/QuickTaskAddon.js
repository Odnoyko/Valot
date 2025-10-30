/**
 * Quick Task Addon
 * Adds a floating action button to quickly create tasks with 00:00:00 duration
 */

import Gtk from 'gi://Gtk';
import Adw from 'gi://Adw?version=1';

export class QuickTaskAddon {
    constructor() {
        this.metadata = {
            id: 'quick-task-addon',
            name: 'Quick Task Creator',
            description: 'Add floating button to instantly create tasks with zero duration',
            version: '1.0.0',
            author: 'Valot Team',
            type: 'addon', // addon or plugin
        };

        this.floatingButton = null;
        this.overlay = null;
        this.tasksNavPage = null;
        this.originalContent = null;
        this.context = null;
        this.createdTaskInstanceId = null;
        this.selectionModeHandler = null;
        this.paginationObserver = null;
    }

    /**
     * Activate the addon
     */
    async activate(context) {
        this.context = context;

        // Add floating button to Tasks page
        this._addFloatingButton();
    }

    /**
     * Deactivate the addon
     */
    async deactivate() {
        try {
            // Clear observers
            if (this.selectionModeHandler) {
                clearInterval(this.selectionModeHandler);
                this.selectionModeHandler = null;
            }

            // Remove floating button from overlay
            if (this.floatingButton && this.overlay) {
                this.overlay.remove_overlay(this.floatingButton);
            }

            // Restore original content if we created the overlay
            if (this.tasksNavPage && this.originalContent && this.overlay) {
                // First, remove originalContent from overlay
                this.overlay.set_child(null);
                
                // Remove overlay from navigation page
                this.tasksNavPage.set_child(null);
                
                // Restore original content directly to navigation page
                this.tasksNavPage.set_child(this.originalContent);
            }

            // Clean up references
            this.floatingButton = null;
            this.overlay = null;
            this.tasksNavPage = null;
            this.originalContent = null;
            this.context = null;
            
        } catch (error) {
            console.error('QuickTaskAddon: Error during deactivation:', error);
        }
    }

    /**
     * Add floating action button to Tasks page
     */
    _addFloatingButton() {
        const mainWindow = this.context.mainWindow;
        
        if (!mainWindow) {
            console.warn('QuickTaskAddon: Main window not found, retrying...');
            setTimeout(() => this._addFloatingButton(), 500);
            return;
        }
        
        if (!mainWindow.tasksPageInstance) {
            console.warn('QuickTaskAddon: Tasks page instance not found, retrying...');
            setTimeout(() => this._addFloatingButton(), 500);
            return;
        }

        // Wait a bit for pages to load, then add button
        setTimeout(() => {
            // Find navigation page by tag in navigationView
            const navigationView = mainWindow.navigationView;
            if (!navigationView) {
                console.warn('QuickTaskAddon: Navigation view not found');
                return;
            }

            // Get navigation page for tasks
            let tasksNavPage = null;
            const navStack = navigationView.get_navigation_stack();
            for (let i = 0; i < navStack.get_n_items(); i++) {
                const page = navStack.get_item(i);
                if (page.get_tag && page.get_tag() === 'tasks') {
                    tasksNavPage = page;
                    break;
                }
            }

            if (!tasksNavPage) {
                console.warn('QuickTaskAddon: Tasks navigation page not found');
                return;
            }

            // Store reference to navigation page
            this.tasksNavPage = tasksNavPage;

            // Check if already wrapped in overlay
            const currentChild = tasksNavPage.get_child();
            
            if (currentChild && currentChild.constructor.name === 'GtkOverlay') {
                this.overlay = currentChild;
                this.floatingButton = new Gtk.Button({
                    icon_name: 'list-add-symbolic',
                    css_classes: ['circular', 'suggested-action', 'opaque'],
                    halign: Gtk.Align.END,
                    valign: Gtk.Align.END,
                    margin_end: 10,
                    margin_bottom: 10,
                    width_request: 24,
                    height_request: 24,
                    tooltip_text: 'Quick Add Task (0:00:00)',
                });
                this.floatingButton.connect('clicked', () => {
                    this._onQuickAddTask();
                });
                this.overlay.add_overlay(this.floatingButton);
                return;
            }

            if (!currentChild) {
                console.warn('QuickTaskAddon: Navigation page has no child widget');
                return;
            }

            // Store original content reference
            this.originalContent = currentChild;

            // Create floating button
            this.floatingButton = new Gtk.Button({
                icon_name: 'list-add-symbolic',
                css_classes: ['circular', 'suggested-action', 'opaque'],
                halign: Gtk.Align.END,
                valign: Gtk.Align.END,
                margin_end: 10,
                margin_bottom: 10,
                width_request: 24,
                height_request: 24,
                tooltip_text: 'Quick Add Task (0:00:00)',
            });

            this.floatingButton.connect('clicked', () => {
                this._onQuickAddTask();
            });

            // Create overlay wrapper - wrap the toolbar view (currentChild)
            this.overlay = new Gtk.Overlay();
            
            // Remove current child from navigation page
            tasksNavPage.set_child(null);
            
            // Set current child as overlay base
            this.overlay.set_child(this.originalContent);
            
            // Add floating button as overlay
            this.overlay.add_overlay(this.floatingButton);
            
            // Set overlay as navigation page child
            tasksNavPage.set_child(this.overlay);
            
            // Setup observers for selection mode and pagination
            this._setupButtonObservers();
        }, 500);
    }

    /**
     * Setup observers for button visibility and position
     */
    _setupButtonObservers() {
        if (!this.context || !this.context.mainWindow) return;

        const mainWindow = this.context.mainWindow;
        const tasksPage = mainWindow.tasksPageInstance;

        if (!tasksPage) return;

        // Subscribe to task updates to refresh button state
        if (this.context.coreBridge) {
            this.context.coreBridge.onUIEvent('task-updated', () => {
                setTimeout(() => this._updateButtonVisibility(), 50);
            });
            
            this.context.coreBridge.onUIEvent('task-created', () => {
                setTimeout(() => this._updateButtonVisibility(), 50);
            });
            
            this.context.coreBridge.onUIEvent('task-deleted', () => {
                // After deletion, force button to show
                setTimeout(() => {
                    this._updateButtonVisibility();
                    // Double check after UI updates
                    setTimeout(() => this._updateButtonVisibility(), 200);
                }, 50);
            });
        }

        // Monitor selection mode and pagination changes periodically
        this.selectionModeHandler = setInterval(() => {
            this._updateButtonVisibility();
        }, 150);

        // Initial update
        setTimeout(() => {
            this._updateButtonVisibility();
        }, 100);
    }

    /**
     * Update button visibility and position based on page state
     */
    _updateButtonVisibility() {
        if (!this.floatingButton || !this.context) return;

        const mainWindow = this.context.mainWindow;
        const tasksPage = mainWindow.tasksPageInstance;

        if (!tasksPage) return;

        try {
            // Check if we are in selection mode
            let isSelectionMode = false;
            let selectedCount = 0;
            let boxVisible = false;
            
            // ONLY check: selectedTasks set size (most reliable)
            // Do NOT check selectionBox visibility as it may lag behind
            if (tasksPage.selectedTasks) {
                selectedCount = tasksPage.selectedTasks.size;
                isSelectionMode = selectedCount > 0;
            }
            
            // Read selectionBox visibility only for logging
            if (tasksPage.selectionBox) {
                try {
                    boxVisible = tasksPage.selectionBox.get_visible();
                } catch (e) {
                    // Ignore
                }
            }
            
            // Check if contextBar is visible (indicates pagination or selection mode)
            let contextBarVisible = false;
            if (tasksPage.contextBar) {
                try {
                    contextBarVisible = tasksPage.contextBar.get_visible();
                } catch (e) {
                    contextBarVisible = false;
                }
            }

            // Show button when NOT in selection mode
            const shouldShow = !isSelectionMode;
            
            // Update visibility
            try {
                this.floatingButton.set_visible(shouldShow);
            } catch (e) {
                // Fallback
                try {
                    this.floatingButton.visible = shouldShow;
                } catch (e2) {
                    // Silently ignore
                }
            }

            // Check if pagination is visible
            let hasPagination = false;
            if (tasksPage.paginationBox) {
                try {
                    hasPagination = tasksPage.paginationBox.get_visible();
                } catch (e) {
                    hasPagination = false;
                }
            }
            
            // Update margin based on pagination visibility
            // If pagination is visible (contextBar visible and NOT in selection mode), add extra margin
            const needsExtraMargin = hasPagination && contextBarVisible && !isSelectionMode;
            const targetMargin = needsExtraMargin ? 60 : 10;
            
            // Force margin update every time
            try {
                this.floatingButton.margin_bottom = targetMargin;
            } catch (e) {
                // Ignore
            }
        } catch (error) {
            console.warn('Error updating button visibility:', error);
        }
    }

    /**
     * Handle quick add task
     */
    async _onQuickAddTask() {
        try {
            const coreBridge = this.context.coreBridge;
            const mainWindow = this.context.mainWindow;

            // Create a task with auto-generated name
            const task = await coreBridge.createAutoIndexedTask(1, 1);

            // Create task instance
            const taskInstance = await coreBridge.createTaskInstance({
                task_id: task.id,
                project_id: 1,
                client_id: 1,
            });

            this.createdTaskInstanceId = taskInstance.id;

            // Create a time entry with 0 duration (start_time = end_time = now)
            const { TimeUtils } = await import('resource:///com/odnoyko/valot/core/utils/TimeUtils.js');
            const now = TimeUtils.getCurrentTimestamp();
            
            await coreBridge.core.services.tracking.createTimeEntry({
                task_instance_id: taskInstance.id,
                start_time: now,
                end_time: now,
                duration: 0,
            });

            // Refresh task list
            if (mainWindow.tasksPageInstance && mainWindow.tasksPageInstance.loadTasks) {
                await mainWindow.tasksPageInstance.loadTasks();
            }

            // Open edit dialog
            await this._openEditDialog(taskInstance);

        } catch (error) {
            console.error('Error creating quick task:', error);
        }
    }

    /**
     * Open task edit dialog
     */
    async _openEditDialog(taskInstance) {
        try {
            const { TaskInstanceEditDialog } = await import('resource:///com/odnoyko/valot/ui/components/dialogs/TaskInstanceEditDialog.js');
            
            const mainWindow = this.context.mainWindow;
            const tasksPage = mainWindow.tasksPageInstance;

            // Get full task instance view
            const fullTaskInstance = await this.context.coreBridge.getTaskInstance(taskInstance.id);

            const dialogInstance = new TaskInstanceEditDialog(
                fullTaskInstance,
                tasksPage,
                this.context.coreBridge
            );

            // Wait for dialog to be initialized
            await dialogInstance._initPromise;

            // Store original time entries to check if user made changes
            const originalTimeEntries = await this.context.coreBridge.getTimeEntriesByInstance(taskInstance.id);
            const originalTotalTime = fullTaskInstance.total_time || 0;

            // Handle dialog response - delete task if user cancels without changes
            dialogInstance.dialog.connect('response', async (dialog, response) => {
                if (response === 'cancel') {
                    // Check if task still has 0 duration (no real changes made)
                    const updatedInstance = await this.context.coreBridge.getTaskInstance(taskInstance.id);
                    
                    if (updatedInstance && 
                        updatedInstance.total_time === 0 && 
                        this.createdTaskInstanceId === taskInstance.id) {
                        
                        // Delete the task instance and task if empty
                        await this.context.coreBridge.deleteTaskInstance(taskInstance.id);
                        
                        // Refresh task list
                        if (mainWindow.tasksPageInstance && mainWindow.tasksPageInstance.loadTasks) {
                            await mainWindow.tasksPageInstance.loadTasks();
                        }
                    }
                }
                
                // Clear tracking
                this.createdTaskInstanceId = null;
            });

            // Present dialog
            dialogInstance.present(mainWindow);

        } catch (error) {
            console.error('Error opening edit dialog:', error);
        }
    }

    /**
     * Create settings page for this addon (optional)
     */
    createSettingsPage = () => {
        const page = new Adw.PreferencesPage({
            title: this.metadata.name,
            icon_name: 'list-add-symbolic',
        });

        const group = new Adw.PreferencesGroup({
            title: _('Quick Task Settings'),
            description: _('Configure the quick task addon'),
        });

        const infoRow = new Adw.ActionRow({
            title: _('About Quick Task'),
            subtitle: _('Adds a floating button to quickly create tasks with 0:00:00 duration'),
        });

        group.add(infoRow);
        page.add(group);

        return page;
    };
}

