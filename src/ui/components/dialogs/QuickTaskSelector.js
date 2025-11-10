/**
 * Quick Task Selector Dialog
 * Allows selecting task name, project, and client for tracking
 * Used by tracking widgets across the app
 */

import Gtk from 'gi://Gtk?version=4.0';
import Adw from 'gi://Adw?version=1';
import { ProjectDropdown } from 'resource:///com/odnoyko/valot/ui/utils/projectDropdown.js';
import { ClientDropdown } from 'resource:///com/odnoyko/valot/ui/utils/clientDropdown.js';

export class QuickTaskSelector {
    constructor(coreBridge, onTaskSelected) {
        this.coreBridge = coreBridge;
        this.onTaskSelected = onTaskSelected; // Callback: (taskName, projectId, clientId) => void

        // Default selections
        this.selectedProjectId = 1; // Default project
        this.selectedClientId = 1; // Default client

        this._createDialog();
    }

    _createDialog() {
        this.dialog = new Adw.AlertDialog({
            heading: _('Start Tracking'),
            body: _('Select task, project and client'),
        });

        const content = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 12,
            margin_top: 12,
            margin_bottom: 12,
            margin_start: 12,
            margin_end: 12,
            width_request: 400,
        });

        // Task name entry
        const taskRow = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 8,
        });

        const taskLabel = new Gtk.Label({
            label: _('Task:'),
            width_chars: 8,
            xalign: 0,
        });

        this.taskEntry = new Gtk.Entry({
            placeholder_text: _('Enter task name...'),
            hexpand: true,
        });

        // Auto-complete dropdown for existing tasks
        this.taskSuggestions = new Gtk.ListBox({
            css_classes: ['boxed-list'],
            visible: false,
        });

        // Show suggestions when typing
        this.taskEntry.connect('changed', () => {
            this._updateTaskSuggestions();
        });

        // Handle Enter key
        this.taskEntry.connect('activate', () => {
            this._startTracking();
        });

        taskRow.append(taskLabel);
        taskRow.append(this.taskEntry);

        // Project + Client row
        const selectorsRow = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 8,
        });

        const projectLabel = new Gtk.Label({
            label: _('Project:'),
            width_chars: 8,
            xalign: 0,
        });

        // Project dropdown
        this.projectDropdown = new ProjectDropdown(
            this.coreBridge,
            this.selectedProjectId,
            (selectedProject) => {
                this.selectedProjectId = selectedProject.id;
            }
        );

        const clientLabel = new Gtk.Label({
            label: _('Client:'),
            width_chars: 8,
            xalign: 0,
        });

        // Client dropdown
        this.clientDropdown = new ClientDropdown(
            this.coreBridge,
            this.selectedClientId,
            (selectedClient) => {
                this.selectedClientId = selectedClient.id;
            }
        );

        selectorsRow.append(projectLabel);
        selectorsRow.append(this.projectDropdown.getWidget());
        selectorsRow.append(clientLabel);
        selectorsRow.append(this.clientDropdown.getWidget());

        content.append(taskRow);
        content.append(this.taskSuggestions);
        content.append(selectorsRow);

        this.dialog.set_extra_child(content);
        this.dialog.add_response('cancel', _('Cancel'));
        this.dialog.add_response('start', _('Start Tracking'));
        this.dialog.set_response_appearance('start', Adw.ResponseAppearance.SUGGESTED);
        this.dialog.set_default_response('start');

        this.dialog.connect('response', (dialog, response) => {
            if (response === 'start') {
                this._startTracking();
            }
            // Note: AdwAlertDialog closes automatically after response, no need to call close()
        });
    }

    async _updateTaskSuggestions() {
        const query = this.taskEntry.get_text().trim().toLowerCase();

        // Clear previous suggestions
        let child = this.taskSuggestions.get_first_child();
        while (child) {
            const next = child.get_next_sibling();
            this.taskSuggestions.remove(child);
            child = next;
        }

        // Hide if empty query
        if (query.length === 0) {
            this.taskSuggestions.set_visible(false);
            return;
        }

        // Get recent tasks that match query
        try {
            const tasks = await this.coreBridge.getAllTasks();
            const matches = tasks
                .filter(t => t.name.toLowerCase().includes(query))
                .slice(0, 5); // Limit to 5 suggestions

            if (matches.length > 0) {
                matches.forEach(task => {
                    const row = new Gtk.Label({
                        label: task.name,
                        xalign: 0,
                        margin_start: 8,
                        margin_end: 8,
                        margin_top: 4,
                        margin_bottom: 4,
                    });

                    // Make row clickable
                    const button = new Gtk.Button({
                        child: row,
                        css_classes: ['flat'],
                    });
                    button.connect('clicked', () => {
                        this.taskEntry.set_text(task.name);
                        this.taskSuggestions.set_visible(false);
                    });

                    this.taskSuggestions.append(button);
                });

                this.taskSuggestions.set_visible(true);
            } else {
                this.taskSuggestions.set_visible(false);
            }
        } catch (error) {
            console.error('Error loading task suggestions:', error);
        }
    }

    async _startTracking() {
        const taskName = this.taskEntry.get_text().trim();

        if (!taskName) {
            return;
        }

        if (this.onTaskSelected) {
            this.onTaskSelected(taskName, this.selectedProjectId, this.selectedClientId);
        }
    }

    present(window) {
        // Focus task entry when dialog opens
        this.dialog.connect('map', () => {
            this.taskEntry.grab_focus();
        });

        this.dialog.present(window);
    }
}
