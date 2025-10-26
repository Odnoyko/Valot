/**
 * Multiple Tasks Edit Dialog
 * Allows editing multiple task instances at once
 * Fields: Name, Project, Client, Duration
 */

import Gtk from 'gi://Gtk?version=4.0';
import Adw from 'gi://Adw?version=1';
import { ProjectDropdown } from 'resource:///com/odnoyko/valot/ui/utils/projectDropdown.js';
import { ClientDropdown } from 'resource:///com/odnoyko/valot/ui/utils/clientDropdown.js';
import { TimeUtils } from 'resource:///com/odnoyko/valot/core/utils/TimeUtils.js';

export class MultipleTasksEditDialog {
    constructor(taskInstances, parent, coreBridge) {
        this.taskInstances = taskInstances; // Array of selected task instances
        this.parent = parent;
        this.coreBridge = coreBridge;

        // Selected values (will be applied to all tasks)
        this.selectedProjectId = null; // null = don't change
        this.selectedClientId = null; // null = don't change
        this.newTaskName = null; // null = don't change
        this.newDuration = null; // null = don't change

        this._createDialog();
    }

    _createDialog() {
        const count = this.taskInstances.length;

        this.dialog = new Adw.AlertDialog({
            heading: _(`Edit ${count} task${count > 1 ? 's' : ''}`),
        });

        const form = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            width_request: 350,
        });

        // Calculate total duration of selected tasks (use Core TimeUtils)
        const totalDuration = this._calculateTotalDuration();

        // Subtitle - "Duration"
        const subtitleLabel = new Gtk.Label({
            label: _('Duration'),
            css_classes: ['subtitle'],
            halign: Gtk.Align.CENTER,
        });

        // Duration counter (use Core TimeUtils for formatting)
        this.durationLabel = new Gtk.Label({
            label: TimeUtils.formatDuration(totalDuration),
            halign: Gtk.Align.CENTER,
            css_classes: ['duration_counter'],
        });

        // Inline row: name + project + client
        const inlineRow = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 10,
            margin_bottom: 15,
        });

        // Task name entry (optional)
        this.nameEntry = new Gtk.Entry({
            placeholder_text: _('Task name....'),
            hexpand: true,
        });

        // Project dropdown (use ID=1 for default, not null)
        this.projectDropdown = new ProjectDropdown(
            this.coreBridge,
            1, // Default project
            (selectedProject) => {
                this.selectedProjectId = selectedProject ? selectedProject.id : null;
            }
        );

        // Client dropdown (use ID=1 for default, not null)
        this.clientDropdown = new ClientDropdown(
            this.coreBridge,
            1, // Default client
            (selectedClient) => {
                this.selectedClientId = selectedClient ? selectedClient.id : null;
            }
        );

        inlineRow.append(this.nameEntry);
        inlineRow.append(this.projectDropdown.getWidget());
        inlineRow.append(this.clientDropdown.getWidget());

        // Help text
        const helpLabel = new Gtk.Label({
            label: _('Changes will be applied to all selected tasks'),
            css_classes: ['dim-label', 'caption'],
            halign: Gtk.Align.CENTER,
        });

        form.append(subtitleLabel);
        form.append(this.durationLabel);
        form.append(inlineRow);
        form.append(helpLabel);

        this.dialog.set_extra_child(form);

        // Add buttons
        this.dialog.add_response('cancel', _('Cancel'));
        this.dialog.add_response('save', _('Save changes'));
        this.dialog.set_response_appearance('save', Adw.ResponseAppearance.SUGGESTED);

        // Handle responses
        this.dialog.connect('response', (dialog, response) => {
            if (response === 'save') {
                this._saveChanges();
            }
        });
    }

    async _saveChanges() {
        try {
            // Get new task name if provided
            const newName = this.nameEntry.get_text().trim();
            if (newName) {
                this.newTaskName = newName;
            }

            // Check if any of the edited tasks is currently being tracked
            const trackingState = this.coreBridge.getTrackingState();
            let isEditingTrackedTask = false;

            if (trackingState.isTracking) {
                isEditingTrackedTask = this.taskInstances.some(t =>
                    t.task_id === trackingState.currentTaskId &&
                    t.project_id === trackingState.currentProjectId &&
                    t.client_id === trackingState.currentClientId
                );
            }

            // Apply changes to all selected tasks
            await this._applyChangesToAll();

            // If editing currently tracked task, update tracking state in Core
            if (isEditingTrackedTask) {
                // Update task name in tracking state if changed
                if (this.newTaskName) {
                    await this.coreBridge.updateCurrentTaskName(this.newTaskName);
                }

                // Update project/client in tracking state if changed
                if (this.selectedProjectId !== null || this.selectedClientId !== null) {
                    await this.coreBridge.updateCurrentProjectClient(
                        this.selectedProjectId !== null ? this.selectedProjectId : trackingState.currentProjectId,
                        this.selectedClientId !== null ? this.selectedClientId : trackingState.currentClientId
                    );
                }

                // Emit event to update AdvancedTrackingWidget UI
                this.coreBridge.emitUIEvent('tracking-updated', {
                    taskName: this.newTaskName || undefined,
                    projectId: this.selectedProjectId !== null ? this.selectedProjectId : undefined,
                    clientId: this.selectedClientId !== null ? this.selectedClientId : undefined,
                });
            }

            // Notify parent to refresh
            if (this.parent) {
                if (this.parent.loadTasks) {
                    await this.parent.loadTasks();
                } else if (this.parent.refresh) {
                    this.parent.refresh();
                }
            }

            // Emit global event for any other listeners (e.g., ReportsPage)
            this.coreBridge.emitUIEvent('task-updated', {
                count: this.taskInstances.length
            });

        } catch (error) {
            console.error('Error saving multiple tasks:', error);
            const errorDialog = new Adw.AlertDialog({
                heading: _('Error'),
                body: error.message || _('Failed to save changes'),
            });
            errorDialog.add_response('ok', _('OK'));
            errorDialog.present(this.parent);
        }
    }

    async _applyChangesToAll() {
        for (const taskInstance of this.taskInstances) {
            const updates = {};

            // Update task name if provided
            if (this.newTaskName) {
                // Find or create task with new name
                const newTask = await this.coreBridge.findOrCreateTask(this.newTaskName);
                updates.task_id = newTask.id;
            }

            // Update project if selected
            if (this.selectedProjectId !== null) {
                updates.project_id = this.selectedProjectId;
            }

            // Update client if selected
            if (this.selectedClientId !== null) {
                updates.client_id = this.selectedClientId;
            }

            // Apply updates to task instance
            if (Object.keys(updates).length > 0) {
                await this.coreBridge.updateTaskInstance(taskInstance.id, updates);
            }
        }
    }

    _calculateTotalDuration() {
        // Sum up total_time from all selected task instances
        return this.taskInstances.reduce((total, task) => {
            return total + (task.total_time || 0);
        }, 0);
    }

    present(parent) {
        this.dialog.present(parent || this.parent);
    }
}
