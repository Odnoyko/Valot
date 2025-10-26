import Gtk from 'gi://Gtk';
import Adw from 'gi://Adw';
import { taskTemplateManager } from './TaskTemplate.js';
import { BUTTON } from 'resource:///com/odnoyko/valot/ui/utils/commonStrings.js';

/**
 * Task Template Selection Dialog
 * Allows users to select from predefined task templates for quick task creation
 */
export class TaskTemplateDialog {
    constructor(parentWindow, onTemplateSelected = null) {
        this.parentWindow = parentWindow;
        this.onTemplateSelected = onTemplateSelected;
        this.selectedTemplate = null;
        
        this._createDialog();
    }

    _createDialog() {
        this.dialog = new Adw.AlertDialog({
            heading: _('Choose Task Template'),
            body: _('Select a template to quickly create a new task with predefined content')
        });

        const content = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 12,
            margin_top: 12,
            margin_bottom: 12,
            margin_start: 12,
            margin_end: 12,
            width_request: 600,
            height_request: 400
        });

        // Search entry
        const searchEntry = new Gtk.SearchEntry({
            placeholder_text: _('Search templates...'),
            margin_bottom: 12
        });

        // Templates list
        const scrolled = new Gtk.ScrolledWindow({
            vexpand: true,
            hscrollbar_policy: Gtk.PolicyType.NEVER,
            vscrollbar_policy: Gtk.PolicyType.AUTOMATIC
        });

        this.templatesList = new Gtk.ListBox({
            css_classes: ['boxed-list'],
            selection_mode: Gtk.SelectionMode.SINGLE
        });

        scrolled.set_child(this.templatesList);

        // Template details
        this.detailsLabel = new Gtk.Label({
            label: _('Select a template to see details'),
            css_classes: ['dim-label'],
            wrap: true,
            wrap_mode: 2, // WORD_CHAR
            height_request: 100,
            valign: Gtk.Align.START,
            margin_top: 12
        });

        content.append(searchEntry);
        content.append(scrolled);
        content.append(this.detailsLabel);

        // Connect search
        searchEntry.connect('search-changed', () => {
            const query = searchEntry.get_text();
            this._filterTemplates(query);
        });

        // Connect template selection
        this.templatesList.connect('row-selected', (list, row) => {
            if (row) {
                const templateId = row.templateId;
                this.selectedTemplate = taskTemplateManager.getTemplate(templateId);
                this._updateDetails();
            }
        });

        this.dialog.set_extra_child(content);
        this.dialog.add_response('cancel', BUTTON.CANCEL);
        this.dialog.add_response('blank', _('Create Blank Task'));
        this.dialog.add_response('use_template', _('Use Template'));

        this.dialog.set_response_appearance('blank', Adw.ResponseAppearance.DEFAULT);
        this.dialog.set_response_appearance('use_template', Adw.ResponseAppearance.SUGGESTED);

        this.dialog.connect('response', (dialog, response) => {
            if (response === 'use_template' && this.selectedTemplate) {
                if (this.onTemplateSelected) {
                    // Show template customization dialog
                    this._showCustomizationDialog();
                }
            } else if (response === 'blank') {
                if (this.onTemplateSelected) {
                    this.onTemplateSelected(null); // null means blank task
                }
            }
            
            if (response !== 'use_template') {
                dialog.close();
            }
        });

        this._populateTemplates();
    }

    _populateTemplates(templates = null) {
        // Clear existing items
        let child = this.templatesList.get_first_child();
        while (child) {
            const next = child.get_next_sibling();
            this.templatesList.remove(child);
            child = next;
        }

        const templatesToShow = templates || taskTemplateManager.getAllTemplates();

        templatesToShow.forEach(template => {
            const row = new Gtk.ListBoxRow();
            row.templateId = template.id;

            const box = new Gtk.Box({
                orientation: Gtk.Orientation.HORIZONTAL,
                spacing: 12,
                margin_top: 8,
                margin_bottom: 8,
                margin_start: 12,
                margin_end: 12
            });

            // Icon
            const iconLabel = new Gtk.Label({
                label: template.icon,
                css_classes: ['template-icon'],
                width_request: 32,
                height_request: 32,
                halign: Gtk.Align.CENTER,
                valign: Gtk.Align.CENTER
            });

            // Info
            const infoBox = new Gtk.Box({
                orientation: Gtk.Orientation.VERTICAL,
                spacing: 4,
                hexpand: true
            });

            const nameLabel = new Gtk.Label({
                label: template.name,
                css_classes: ['heading'],
                halign: Gtk.Align.START,
                ellipsize: 3 // END
            });

            const descriptionLabel = new Gtk.Label({
                label: template.fields.name,
                css_classes: ['dim-label'],
                halign: Gtk.Align.START,
                ellipsize: 3 // END
            });

            // Tags
            const tagsLabel = new Gtk.Label({
                label: template.fields.tags ? template.fields.tags.join(', ') : '',
                css_classes: ['caption', 'dim-label'],
                halign: Gtk.Align.START,
                ellipsize: 3 // END
            });

            infoBox.append(nameLabel);
            infoBox.append(descriptionLabel);
            infoBox.append(tagsLabel);

            box.append(iconLabel);
            box.append(infoBox);
            row.set_child(box);

            this.templatesList.append(row);
        });
    }

    _filterTemplates(query) {
        if (!query.trim()) {
            this._populateTemplates();
        } else {
            const filtered = taskTemplateManager.searchTemplates(query);
            this._populateTemplates(filtered);
        }
    }

    _updateDetails() {
        if (this.selectedTemplate) {
            const details = `**${this.selectedTemplate.name}**

${this.selectedTemplate.fields.description.slice(0, 200)}${this.selectedTemplate.fields.description.length > 200 ? '...' : ''}

**Estimated Hours:** ${this.selectedTemplate.fields.estimatedHours}
**Priority:** ${this.selectedTemplate.fields.priority}
**Tags:** ${this.selectedTemplate.fields.tags.join(', ')}`;

            this.detailsLabel.set_markup(details.replace(/\*\*/g, '<b>').replace(/\*\*/g, '</b>'));
        }
    }

    _showCustomizationDialog() {
        const customDialog = new Adw.AlertDialog({
            heading: _('Customize Template'),
            body: _('Customize the "%s" template').format(this.selectedTemplate.name)
        });

        const form = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 12,
            margin_top: 12,
            margin_bottom: 12,
            margin_start: 12,
            margin_end: 12,
            width_request: 500
        });

        // Replacement fields (detect [placeholders] in template)
        const placeholders = this._extractPlaceholders(this.selectedTemplate);
        const replacementEntries = {};

        placeholders.forEach(placeholder => {
            const label = new Gtk.Label({
                label: `${placeholder}:`,
                halign: Gtk.Align.START
            });

            const entry = new Gtk.Entry({
                placeholder_text: _('Enter %s...').format(placeholder.toLowerCase())
            });

            replacementEntries[placeholder] = entry;

            form.append(label);
            form.append(entry);
        });

        // Show preview checkbox
        const previewCheck = new Gtk.CheckButton({
            label: _('Show preview before creating'),
            active: false
        });

        form.append(previewCheck);

        customDialog.set_extra_child(form);
        customDialog.add_response('cancel', BUTTON.CANCEL);
        customDialog.add_response('create', BUTTON.CREATE_TASK);
        customDialog.set_response_appearance('create', Adw.ResponseAppearance.SUGGESTED);

        customDialog.connect('response', (dialog, response) => {
            if (response === 'create') {
                // Collect replacements
                const replacements = {};
                Object.keys(replacementEntries).forEach(placeholder => {
                    const value = replacementEntries[placeholder].get_text().trim();
                    if (value) {
                        replacements[placeholder] = value;
                    }
                });

                // Create task from template
                const task = taskTemplateManager.createTaskFromTemplate(
                    this.selectedTemplate.id, 
                    replacements
                );

                if (this.onTemplateSelected) {
                    this.onTemplateSelected(task);
                }
            }

            dialog.close();
            this.dialog.close();
        });

        customDialog.present(this.parentWindow);
    }

    _extractPlaceholders(template) {
        const placeholders = new Set();
        const text = template.fields.name + ' ' + template.fields.description;
        const matches = text.match(/\[([^\]]+)\]/g);
        
        if (matches) {
            matches.forEach(match => {
                const placeholder = match.slice(1, -1); // Remove [ and ]
                placeholders.add(placeholder);
            });
        }

        return Array.from(placeholders);
    }

    show() {
        this.dialog.present(this.parentWindow);
    }
}
