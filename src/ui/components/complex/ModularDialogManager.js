import { ProjectDialog } from './ProjectDialog.js';
import { ClientDialog } from './ClientDialog.js';
import { FormDialog } from './FormDialog.js';
// TODO: Restore when migrated
// import { InputValidator } from '../../../func/global/inputValidation.js';
import { ValidationUtils } from 'resource:///com/odnoyko/valot/ui/utils/CoreImports.js';
import { LABEL } from 'resource:///com/odnoyko/valot/ui/utils/commonStrings.js';
import { getDialogPool } from '../../services/DialogPool.js';

/**
 * Modular dialog manager that replaces the old dialogManager.js
 * Provides consistent dialog creation using the new modular system
 * Now uses DialogPool for dialog reusability
 */
export class ModularDialogManager {
    constructor(parentWindow, app = null) {
        this.parentWindow = parentWindow;
        this.app = app;
        this.activeDialogs = new Map();
        this.dialogPool = getDialogPool();
    }

    /**
     * Create and show a project dialog (reusable)
     */
    showProjectDialog(config = {}) {
        const {
            mode = 'create',
            project = null,
            onSave = null,
            ...dialogConfig
        } = config;

        const dialogType = 'project-dialog';
        
        // Define create function for DialogPool
        const createFn = async () => {
            const dialog = new ProjectDialog({
                mode,
                project,
                parentWindow: this.parentWindow,
                onProjectSave: (projectData, saveMode, dialog) => {
                    if (onSave) {
                        return onSave(projectData, saveMode, dialog);
                    }
                    return this._handleProjectSave(projectData, saveMode);
                },
                ...dialogConfig
            });
            
            // Setup event subscription once
            dialog.subscribe((event, data) => {
                if (event === 'projectSaved') {
                    this._emit('projectSaved', data);
                }
            });
            
            return dialog;
        };
        
        // Define update function for DialogPool
        const updateFn = async (dialog, data) => {
            const { mode: updateMode, project: updateProject } = data;
            
            // Update the onProjectSave callback
            dialog.onProjectSave = (projectData, saveMode, dialogInstance) => {
                if (onSave) {
                    return onSave(projectData, saveMode, dialogInstance);
                }
                return this._handleProjectSave(projectData, saveMode);
            };
            
            if (updateMode === 'edit' && updateProject) {
                dialog.setProject(updateProject);
            } else {
                dialog.resetForNew();
            }
        };
        
        // Get or create dialog from pool
        const dialog = this.dialogPool.getDialog(
            dialogType,
            createFn,
            updateFn,
            { mode, project, onSave, ...dialogConfig }
        );
        
        this.activeDialogs.set('project', dialog);
        
        dialog.present(this.parentWindow);
        return dialog;
    }

    /**
     * Create and show a client dialog (reusable)
     */
    showClientDialog(config = {}) {
        const {
            mode = 'create',
            client = null,
            onSave = null,
            ...dialogConfig
        } = config;

        const dialogType = 'client-dialog';
        
        // Define create function for DialogPool
        const createFn = async () => {
            const dialog = new ClientDialog({
                mode,
                client,
                parentWindow: this.parentWindow,
                onClientSave: (clientData, saveMode, dialog) => {
                    if (onSave) {
                        return onSave(clientData, saveMode, dialog);
                    }
                    return this._handleClientSave(clientData, saveMode);
                },
                ...dialogConfig
            });
            
            // Setup event subscription once
            dialog.subscribe((event, data) => {
                if (event === 'clientSaved') {
                    this._emit('clientSaved', data);
                }
            });
            
            return dialog;
        };
        
        // Define update function for DialogPool
        const updateFn = async (dialog, data) => {
            const { mode: updateMode, client: updateClient } = data;
            
            // Update the onClientSave callback
            dialog.onClientSave = (clientData, saveMode, dialogInstance) => {
                if (onSave) {
                    return onSave(clientData, saveMode, dialogInstance);
                }
                return this._handleClientSave(clientData, saveMode);
            };
            
            if (updateMode === 'edit' && updateClient) {
                dialog.setClient(updateClient);
            } else {
                dialog.resetForNew();
            }
        };
        
        // Get or create dialog from pool
        const dialog = this.dialogPool.getDialog(
            dialogType,
            createFn,
            updateFn,
            { mode, client, onSave, ...dialogConfig }
        );
        
        this.activeDialogs.set('client', dialog);
        
        dialog.present(this.parentWindow);
        return dialog;
    }

    /**
     * Create a custom form dialog
     */
    showFormDialog(config = {}) {
        const dialog = new FormDialog({
            parentWindow: this.parentWindow,
            ...config
        });

        const dialogId = config.id || `form_${Date.now()}`;
        this.activeDialogs.set(dialogId, dialog);
        
        dialog.subscribe((event, data) => {
            if (event === 'submit' || event === 'cancel') {
                this.activeDialogs.delete(dialogId);
            }
        });

        dialog.present(this.parentWindow);
        return dialog;
    }

    /**
     * Show a task creation dialog
     */
    showTaskDialog(config = {}) {
        const {
            mode = 'create',
            task = null,
            projects = [],
            clients = [],
            onSave = null,
            ...dialogConfig
        } = config;

        const isEdit = mode === 'edit' && task;
        
        const fields = [
            {
                type: 'entry',
                name: 'name',
                label: _('Task Name'),
                placeholder: _('Enter task name...'),
                required: true,
                validator: InputValidator.validateTaskName,
                value: isEdit ? task.name : ''
            },
            {
                type: 'textarea',
                name: 'description',
                label: _('Description'),
                placeholder: _('Optional task description...'),
                validator: InputValidator.validateTaskDescription,
                value: isEdit ? (task.description || '') : '',
                height: 80
            },
            {
                type: 'dropdown',
                name: 'project',
                label: LABEL.PROJECT,
                required: true,
                options: projects.map(p => ({ value: p.id, label: p.name })),
                value: isEdit ? task.project_id : (projects[0]?.id || null)
            },
            {
                type: 'dropdown',
                name: 'client',
                label: LABEL.CLIENT,
                options: [
                    { value: null, label: _('No client') },
                    ...clients.map(c => ({ value: c.id, label: c.name }))
                ],
                value: isEdit ? (task.client_id || null) : null
            }
        ];

        return this.showFormDialog({
            title: isEdit ? 'Edit Task' : 'Create New Task',
            subtitle: isEdit ? 'Update task information' : 'Create a new task with project and client assignment',
            fields,
            submitLabel: isEdit ? 'Save Changes' : 'Create Task',
            onSubmit: (formData, dialog) => {
                const taskData = {
                    name: formData.name.trim(),
                    description: formData.description?.trim() || '',
                    project_id: formData.project,
                    client_id: formData.client || null
                };

                if (isEdit) {
                    taskData.id = task.id;
                }

                if (onSave) {
                    return onSave(taskData, mode, dialog);
                }

                return this._handleTaskSave(taskData, mode);
            },
            ...dialogConfig
        });
    }

    /**
     * Show a confirmation dialog
     */
    showConfirmDialog(config = {}) {
        const {
            title = _('Confirm Action'),
            message = _('Are you sure?'),
            confirmLabel = _('Confirm'),
            cancelLabel = _('Cancel'),
            destructive = false,
            onConfirm = null,
            onCancel = null,
            ...dialogConfig
        } = config;

        return this.showFormDialog({
            title,
            subtitle: message,
            fields: [], // No form fields for confirmation
            submitLabel: confirmLabel,
            cancelLabel,
            width: 400,
            onSubmit: (formData, dialog) => {
                if (onConfirm) {
                    return onConfirm(dialog);
                }
                return true; // Close dialog
            },
            onCancel: (dialog) => {
                if (onCancel) {
                    return onCancel(dialog);
                }
            },
            cssClasses: destructive ? ['confirmation-dialog', 'destructive'] : ['confirmation-dialog'],
            ...dialogConfig
        });
    }

    /**
     * Show an error dialog
     */
    showErrorDialog(title, message, details = null) {
        const fields = [];

        if (details) {
            fields.push({
                type: 'textarea',
                name: 'details',
                label: _('Error Details'),
                value: details,
                height: 120
            });
        }

        return this.showFormDialog({
            title: title || _('Error'),
            subtitle: message,
            fields,
            submitLabel: _('OK'),
            cancelLabel: null, // Hide cancel button
            width: 450,
            cssClasses: ['error-dialog'],
            onSubmit: () => true // Just close
        });
    }

    /**
     * Close all active dialogs
     */
    closeAll() {
        this.activeDialogs.forEach(dialog => {
            if (dialog.close) {
                dialog.close();
            }
        });
        this.activeDialogs.clear();
    }

    /**
     * Close specific dialog
     */
    close(dialogId) {
        const dialog = this.activeDialogs.get(dialogId);
        if (dialog && dialog.close) {
            dialog.close();
            this.activeDialogs.delete(dialogId);
        }
    }

    /**
     * Get active dialog by ID
     */
    getDialog(dialogId) {
        return this.activeDialogs.get(dialogId);
    }

    // Default save handlers (to be overridden or replaced with actual logic)
    
    _handleProjectSave(projectData, mode) {
        
        // This would integrate with the actual project manager
        if (this.parentWindow && this.parentWindow.projectManager) {
            if (mode === 'create') {
                return this.parentWindow.projectManager.createProject(
                    projectData.name,
                    projectData.color,
                    projectData.icon,
                    this.parentWindow,
                    projectData.iconColorMode
                );
            } else if (mode === 'edit') {
                return this.parentWindow.projectManager.updateProject(
                    projectData.id,
                    projectData.name,
                    projectData.color,
                    projectData.icon,
                    this.parentWindow,
                    projectData.iconColorMode
                );
            }
        }
        
        return true; // Success
    }

    _handleClientSave(clientData, mode) {
        
        // This would integrate with the actual client manager
        if (this.parentWindow && this.parentWindow.clientManager) {
            if (mode === 'create') {
                return this.parentWindow.clientManager.createClient(clientData, this.parentWindow);
            } else if (mode === 'edit') {
                return this.parentWindow.clientManager.updateClient(clientData, this.parentWindow);
            }
        }
        
        return true; // Success
    }

    _handleTaskSave(taskData, mode) {
        
        // This would integrate with the actual task management system
        // Implementation would depend on the existing task management logic
        
        return true; // Success
    }

    // Event system for dialog events
    _emit(event, data) {
        if (this.parentWindow && this.parentWindow._emit) {
            this.parentWindow._emit(`dialog_${event}`, data);
        }
    }

    /**
     * Factory methods for common dialog patterns
     */
    static create(parentWindow, app = null) {
        return new ModularDialogManager(parentWindow, app);
    }

    /**
     * Quick project creation dialog
     */
    createProject(onSave = null) {
        return this.showProjectDialog({ mode: 'create', onSave });
    }

    /**
     * Quick project edit dialog
     */
    editProject(project, onSave = null) {
        return this.showProjectDialog({ mode: 'edit', project, onSave });
    }

    /**
     * Quick client creation dialog
     */
    createClient(onSave = null) {
        return this.showClientDialog({ mode: 'create', onSave });
    }

    /**
     * Quick client edit dialog
     */
    editClient(client, onSave = null) {
        return this.showClientDialog({ mode: 'edit', client, onSave });
    }

    /**
     * Quick delete confirmation
     */
    confirmDelete(itemType, itemName, onConfirm = null) {
        return this.showConfirmDialog({
            title: _('Delete %s').format(itemType),
            message: _('Are you sure you want to delete "%s"? This action cannot be undone.').format(itemName),
            confirmLabel: _('Delete'),
            destructive: true,
            onConfirm
        });
    }
}
