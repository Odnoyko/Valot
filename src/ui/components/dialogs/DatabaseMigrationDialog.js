/**
 * Database Migration Dialog
 * Two-step migration process:
 * Step 1: Choose action (Backup & Migrate OR Delete & Start Fresh)
 * Step 2: Show progress during migration
 */

import Gtk from 'gi://Gtk';
import Adw from 'gi://Adw';

export class DatabaseMigrationDialog {
    constructor(parent, oldDbPath) {
        this.parent = parent;
        this.oldDbPath = oldDbPath;
        this.dialog = null;
        this.choiceView = null;
        this.progressView = null;
        this.contentStack = null;
        this.progressBar = null;
        this.statusLabel = null;
        this.onChoiceMade = null;
    }

    /**
     * Show migration dialog
     * @param {Function} onChoice - Callback (choice) => void where choice is 'backup' or 'delete'
     */
    show(onChoice) {
        this.onChoiceMade = onChoice;

        // Create window
        this.dialog = new Adw.Window({
            transient_for: this.parent,
            modal: true,
            default_width: 550,
            default_height: 450,
            resizable: false,
        });

        // Header bar
        const headerBar = new Adw.HeaderBar({
            show_end_title_buttons: false,
            show_start_title_buttons: false,
        });

        // Stack for switching between choice and progress
        this.contentStack = new Gtk.Stack({
            transition_type: Gtk.StackTransitionType.CROSSFADE,
            transition_duration: 200,
        });

        // Create choice view
        this.choiceView = this._createChoiceView();
        this.contentStack.add_named(this.choiceView, 'choice');

        // Create progress view
        this.progressView = this._createProgressView();
        this.contentStack.add_named(this.progressView, 'progress');

        // Show choice view by default
        this.contentStack.set_visible_child_name('choice');

        // Main container
        const mainBox = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 0,
        });

        mainBox.append(headerBar);
        mainBox.append(this.contentStack);

        this.dialog.set_content(mainBox);
        this.dialog.present();
    }

    /**
     * Create choice view
     */
    _createChoiceView() {
        const page = new Adw.StatusPage({
            icon_name: 'dialog-warning-symbolic',
            title: 'Database Migration Required',
            description: `Valot 0.9.0 uses a new database structure.\n\nOld database:\n${this.oldDbPath}\n\nChoose how to proceed:`,
        });

        // Buttons container
        const buttonsBox = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 16,
            halign: Gtk.Align.CENTER,
            margin_top: 24,
            margin_bottom: 24,
            margin_start: 48,
            margin_end: 48,
        });

        // Backup & Migrate button
        const backupButton = new Gtk.Button({
            label: 'Backup & Migrate',
            css_classes: ['pill', 'suggested-action'],
        });
        backupButton.connect('clicked', () => {
            this._startMigration('backup');
        });

        const backupLabel = new Gtk.Label({
            label: 'Create backup and migrate your data to new structure',
            wrap: true,
            justify: Gtk.Justification.CENTER,
        });
        backupLabel.add_css_class('dim-label');

        const backupBox = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 6,
        });
        backupBox.append(backupButton);
        backupBox.append(backupLabel);

        // Delete & Start Fresh button
        const deleteButton = new Gtk.Button({
            label: 'Delete & Start Fresh',
            css_classes: ['pill', 'destructive-action'],
        });
        deleteButton.connect('clicked', () => {
            this._startMigration('delete');
        });

        const deleteLabel = new Gtk.Label({
            label: 'Remove old database and start with empty new one',
            wrap: true,
            justify: Gtk.Justification.CENTER,
        });
        deleteLabel.add_css_class('dim-label');

        const deleteBox = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 6,
        });
        deleteBox.append(deleteButton);
        deleteBox.append(deleteLabel);

        // Add to container
        buttonsBox.append(backupBox);
        buttonsBox.append(deleteBox);

        page.set_child(buttonsBox);
        return page;
    }

    /**
     * Create progress view
     */
    _createProgressView() {
        const page = new Adw.StatusPage({
            icon_name: 'emblem-synchronizing-symbolic',
            title: 'Migrating Database',
            description: 'Please wait while your data is being migrated...',
        });

        // Progress container
        const progressBox = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 16,
            halign: Gtk.Align.CENTER,
            valign: Gtk.Align.CENTER,
            margin_top: 24,
            margin_bottom: 24,
            margin_start: 48,
            margin_end: 48,
        });

        // Progress bar
        this.progressBar = new Gtk.ProgressBar({
            show_text: true,
            text: '0%',
            hexpand: true,
        });
        progressBox.append(this.progressBar);

        // Status label
        this.statusLabel = new Gtk.Label({
            label: 'Initializing...',
            wrap: true,
            justify: Gtk.Justification.CENTER,
            margin_top: 8,
        });
        this.statusLabel.add_css_class('dim-label');
        progressBox.append(this.statusLabel);

        page.set_child(progressBox);
        return page;
    }

    /**
     * Start migration process
     */
    _startMigration(choice) {
        // Switch to progress view
        this.contentStack.set_visible_child_name('progress');

        // Trigger callback
        if (this.onChoiceMade) {
            this.onChoiceMade(choice);
        }
    }

    /**
     * Update progress bar
     */
    updateProgress(step, total, message) {
        if (!this.progressBar || !this.statusLabel) {
            return;
        }

        const fraction = step / total;
        const percentage = Math.round(fraction * 100);

        this.progressBar.set_fraction(fraction);
        this.progressBar.set_text(`${percentage}%`);
        this.statusLabel.set_label(message);
    }

    /**
     * Show completion
     */
    showCompletion() {
        if (this.progressBar && this.statusLabel) {
            this.progressBar.set_fraction(1.0);
            this.progressBar.set_text('100%');
            this.statusLabel.set_label('✅ Migration completed successfully!');

            // Auto-close after delay
            setTimeout(() => {
                this.close();
            }, 1500);
        }
    }

    /**
     * Show error
     */
    showError(message) {
        if (this.statusLabel) {
            this.statusLabel.set_label(`❌ Error: ${message}`);
        }

        // Auto-close after delay
        setTimeout(() => {
            this.close();
        }, 3000);
    }

    /**
     * Close dialog
     */
    close() {
        if (this.dialog) {
            this.dialog.close();
            this.dialog = null;
            this.choiceView = null;
            this.progressView = null;
            this.contentStack = null;
            this.progressBar = null;
            this.statusLabel = null;
        }
    }
}
