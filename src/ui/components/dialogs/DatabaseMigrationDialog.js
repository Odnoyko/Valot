/**
 * Database Migration Dialog
 * Two-step migration process:
 * Step 1: Choose action (Backup & Migrate OR Delete & Start Fresh)
 * Step 2: Show progress during migration
 */

import Gtk from 'gi://Gtk';
import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import { createRecoloredSVG } from 'resource:///com/odnoyko/valot/ui/utils/svgRecolor.js';

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

        // Create dialog (modal)
        this.dialog = new Adw.Window({
            transient_for: this.parent,
            modal: true,
            default_width: 360,
            default_height: 438,
            resizable: false,
        });

        // Header bar with title and close button (flat style)
        const headerBar = new Adw.HeaderBar({
            show_end_title_buttons: true,
            show_start_title_buttons: false,
            css_classes: ['flat'],
            title_widget: new Gtk.Label({
                label: _('Database Migration Tool'),
                css_classes: ['title'],
            }),
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
        const mainBox = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 0,
            margin_top: 32,
            margin_bottom: 32,
            margin_start: 40,
            margin_end: 40,
        });

        // Illustration area (fish bowls SVG)
        const illustrationBox = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 12,
            halign: Gtk.Align.CENTER,
            height_request: 140,
        });

        // Load SVG illustration (recolored to accent color)
        const illustration = createRecoloredSVG(
            '/com/odnoyko/valot/data/illustrations/Migration_tool.svg',
            240,
            140
        );
        illustrationBox.append(illustration);

        // Version text
        const versionBox = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 6,
            halign: Gtk.Align.CENTER,
            margin_top: 24,
        });

        const versionText1 = new Gtk.Label({
            label: _('Valot was updated to the'),
            css_classes: ['version-marker'],
        });

        const versionBadge = new Gtk.Label({
            label: ' v0.9.0 ',
            css_classes: ['pill', 'success', 'version-label'],
        });
        versionBadge.set_markup('<b> v0.9.0 </b>');

        versionBox.append(versionText1);
        versionBox.append(versionBadge);

        // Subtitle
        const subtitle = new Gtk.Label({
            label: _('Please choose your way to continue \nafter update'),
            margin_top: 8,
            halign: Gtk.Align.CENTER,
            justify: Gtk.Justification.CENTER,
            margin_bottom: 4,
            css_classes: ['subtitle'],
        });
        subtitle.add_css_class('dim-label');

        // Buttons container - fixed height to prevent resize
        this.buttonsContainer = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 12,
            margin_top: 24,
            height_request: 92, // Fixed height for 2 buttons
            valign: Gtk.Align.CENTER,
        });

        // Delete & Start Fresh button
        const deleteButton = new Gtk.Button({
            label: _('Delete & Fresh Start'),
            height_request: 40,
            css_classes: ['pill'],
        });
        deleteButton.add_css_class('destructive-action');
        deleteButton.connect('clicked', () => {
            this._startMigration('delete');
        });

        // Backup & Migrate button
        const backupButton = new Gtk.Button({
            label: _('Backup & Migrate'),
            height_request: 40,
            css_classes: ['pill', 'suggested-action'],
        });
        backupButton.connect('clicked', () => {
            this._startMigration('backup');
        });

        // Add buttons to container
        this.buttonsContainer.append(deleteButton);
        this.buttonsContainer.append(backupButton);

        // Assemble
        mainBox.append(illustrationBox);
        mainBox.append(versionBox);
        mainBox.append(subtitle);
        mainBox.append(this.buttonsContainer);

        return mainBox;
    }

    /**
     * Create progress view
     */
    _createProgressView() {
        const page = new Adw.StatusPage({
            icon_name: 'emblem-synchronizing-symbolic',
            title: _('Migrating Database'),
            description: _('Please wait while your data is being migrated...'),
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
            label: _('Initializing...'),
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
        // Replace buttons with progress bar without changing container size
        this._replaceButtonsWithProgress();

        // Wait 400ms before starting migration to show progress bar at 0%
        if (this.onChoiceMade) {
            setTimeout(() => {
                this.onChoiceMade(choice);
            }, 400);
        }
    }

    /**
     * Replace buttons with progress bar in-place
     */
    _replaceButtonsWithProgress() {
        if (!this.buttonsContainer) return;

        // Remove all children from buttons container
        let child = this.buttonsContainer.get_first_child();
        while (child) {
            const next = child.get_next_sibling();
            this.buttonsContainer.remove(child);
            child = next;
        }

        // Create progress bar with same height as buttons area
        this.progressBar = new Gtk.ProgressBar({
            show_text: true,
            text: '0%',
            height_request: 40,
            valign: Gtk.Align.CENTER,
        });

        // Add progress bar to container
        this.buttonsContainer.append(this.progressBar);
    }

    /**
     * Update progress bar
     */
    updateProgress(step, total, message) {
        if (!this.progressBar) {
            return;
        }

        const fraction = step / total;
        const percentage = Math.round(fraction * 100);

        this.progressBar.set_fraction(fraction);
        this.progressBar.set_text(`${percentage}%`);
    }

    /**
     * Show completion
     */
    showCompletion() {
        if (this.progressBar) {
            this.progressBar.set_fraction(1.0);
            this.progressBar.set_text('100%');

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
        if (this.progressBar) {
            this.progressBar.set_text(`Error: ${message}`);
            this.progressBar.add_css_class('error');
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
            this.buttonsContainer = null;
        }
    }
}
