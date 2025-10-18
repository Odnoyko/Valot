import Gtk from 'gi://Gtk';
import Adw from 'gi://Adw?version=1';
import Gdk from 'gi://Gdk';
import GLib from 'gi://GLib';
import { AdvancedTrackingWidget } from 'resource:///com/odnoyko/valot/ui/components/complex/AdvancedTrackingWidget.js';

/**
 * Reports management page
 * Recreates the old UI from window.blp programmatically
 */
export class ReportsPage {
    constructor(config = {}) {
        this.app = config.app;
        this.parentWindow = config.parentWindow;
        this.coreBridge = config.coreBridge;

        // Report-specific state
        this.reports = [];
    }

    /**
     * Create and return the main widget for this page
     */
    getWidget() {
        // Main page container
        const page = new Adw.ToolbarView();

        // Create header bar
        const headerBar = this._createHeaderBar();
        page.add_top_bar(headerBar);

        // Create content
        const content = this._createContent();
        page.set_content(content);

        return page;
    }

    _createHeaderBar() {
        const headerBar = new Adw.HeaderBar();

        // Show sidebar button (start)
        const showSidebarBtn = new Gtk.Button({
            icon_name: 'sidebar-show-symbolic',
            tooltip_text: _('Show Sidebar'),
        });
        showSidebarBtn.connect('clicked', () => {
            if (this.parentWindow && this.parentWindow.splitView) {
                this.parentWindow.splitView.set_show_sidebar(true);
            }
        });
        headerBar.pack_start(showSidebarBtn);

        // Tracking widget (title area)
        this.trackingWidget = new AdvancedTrackingWidget(this.coreBridge, this.parentWindow);
        headerBar.set_title_widget(this.trackingWidget.getWidget());

        // Compact tracker button (end)
        const compactTrackerBtn = new Gtk.Button({
            icon_name: 'view-restore-symbolic',
            css_classes: ['flat', 'circular'],
            tooltip_text: _('Open Compact Tracker (Shift: keep main window)'),
        });

        compactTrackerBtn.connect('clicked', () => {

            const display = Gdk.Display.get_default();
            const seat = display?.get_default_seat();
            const keyboard = seat?.get_keyboard();

            let shiftPressed = false;
            if (keyboard) {
                const state = keyboard.get_modifier_state();
                shiftPressed = !!(state & Gdk.ModifierType.SHIFT_MASK);
            }


            if (this.parentWindow?.application) {
                this.parentWindow.application._launchCompactTracker(shiftPressed);
            } else {
                console.error('❌ No application reference!');
            }
        });

        headerBar.pack_end(compactTrackerBtn);

        return headerBar;
    }

    _createTrackingWidget() {
        // Original design adapted to Core architecture
        const box = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 8,
            hexpand: true,
            hexpand_set: true,
        });

        // Task name entry
        this.taskNameEntry = new Gtk.Entry({
            placeholder_text: _('Task name'),
            hexpand: true,
            hexpand_set: true,
        });
        box.append(this.taskNameEntry);

        // Project context button
        this.projectBtn = new Gtk.Button({
            icon_name: 'folder-symbolic',
            css_classes: ['flat'],
            tooltip_text: _('Project'),
            width_request: 36,
            height_request: 36,
        });
        this.projectBtn.connect('clicked', () => this._selectProject());
        box.append(this.projectBtn);

        // Client context button
        this.clientBtn = new Gtk.Button({
            icon_name: 'contact-new-symbolic',
            css_classes: ['flat'],
            tooltip_text: _('Client'),
            width_request: 36,
            height_request: 36,
        });
        this.clientBtn.connect('clicked', () => this._selectClient());
        box.append(this.clientBtn);

        // Actual time label
        this.actualTimeLabel = new Gtk.Label({
            label: '00:00:00',
            css_classes: ['title-4'],
            margin_start: 8,
        });
        box.append(this.actualTimeLabel);

        // Track button
        this.trackButton = new Gtk.Button({
            icon_name: 'media-playback-start-symbolic',
            css_classes: ['suggested-action', 'circular'],
            tooltip_text: _('Start tracking'),
        });
        this.trackButton.connect('clicked', () => this._toggleTracking());
        box.append(this.trackButton);

        // Connect to Core for synchronization
        this._connectTrackingToCore();

        return box;
    }

    /**
     * Connect tracking widget to Core for state synchronization
     */
    _connectTrackingToCore() {
        if (!this.coreBridge) {
            return;
        }

        // Subscribe to Core events
        this.coreBridge.onUIEvent('tracking-started', (data) => {
            this._onTrackingStarted(data);
        });

        this.coreBridge.onUIEvent('tracking-stopped', (data) => {
            this._onTrackingStopped(data);
        });

        this.coreBridge.onUIEvent('tracking-updated', (data) => {
            this._onTrackingUpdated(data);
        });

        // Load initial state
        this._updateTrackingUIFromCore();

    }

    /**
     * Update UI from Core state (no local state!)
     */
    _updateTrackingUIFromCore() {
        if (!this.coreBridge) return;

        const state = this.coreBridge.getTrackingState();

        if (state.isTracking) {
            // Tracking active
            this.taskNameEntry.set_text(state.currentTaskName || '');
            this.taskNameEntry.set_sensitive(false);
            this.projectBtn.set_sensitive(false);
            this.clientBtn.set_sensitive(false);

            this.trackButton.set_icon_name('media-playback-stop-symbolic');
            this.trackButton.set_tooltip_text(_('Stop tracking'));
            this.trackButton.remove_css_class('suggested-action');
            this.trackButton.add_css_class('destructive-action');

            this.actualTimeLabel.set_label(this._formatDuration(state.elapsedSeconds));

            // Start UI update timer
            this._startTrackingUITimer();
        } else {
            // Tracking idle
            this.taskNameEntry.set_text('');
            this.taskNameEntry.set_sensitive(true);
            this.projectBtn.set_sensitive(true);
            this.clientBtn.set_sensitive(true);

            this.trackButton.set_icon_name('media-playback-start-symbolic');
            this.trackButton.set_tooltip_text(_('Start tracking'));
            this.trackButton.remove_css_class('destructive-action');
            this.trackButton.add_css_class('suggested-action');

            this.actualTimeLabel.set_label('00:00:00');

            // Stop UI update timer
            this._stopTrackingUITimer();
        }
    }

    /**
     * Core event: tracking started
     */
    _onTrackingStarted(data) {
        this._updateTrackingUIFromCore();
    }

    /**
     * Core event: tracking stopped
     */
    _onTrackingStopped(data) {
        this._updateTrackingUIFromCore();
    }

    /**
     * Core event: tracking updated (every second)
     */
    _onTrackingUpdated(data) {
        const state = this.coreBridge.getTrackingState();
        this.actualTimeLabel.set_label(this._formatDuration(state.elapsedSeconds));
    }

    /**
     * User clicked track button
     */
    async _toggleTracking() {
        if (!this.coreBridge) return;

        const state = this.coreBridge.getTrackingState();

        if (state.isTracking) {
            // Stop tracking
            try {
                await this.coreBridge.stopTracking();
            } catch (error) {
                console.error('Error stopping tracking:', error);
            }
        } else {
            // Start tracking - create or find task (ALL LOGIC IN CORE!)
            try {
                const taskName = this.taskNameEntry.get_text().trim();
                let task;

                if (taskName === '' || taskName.length === 0) {
                    // Empty input - create auto-indexed task via Core
                    task = await this.coreBridge.createAutoIndexedTask();
                } else {
                    // Has text - find or create task via Core
                    task = await this.coreBridge.findOrCreateTask(taskName);
                }

                // Start tracking with task ID
                await this.coreBridge.startTracking(task.id, null, null);
            } catch (error) {
                console.error('Error starting tracking:', error);
            }
        }
    }

    /**
     * UI update timer - refreshes time display from Core
     */
    _startTrackingUITimer() {
        if (this.trackingTimerId) return;

        this.trackingTimerId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1000, () => {
            const state = this.coreBridge.getTrackingState();
            if (state.isTracking) {
                this.actualTimeLabel.set_label(this._formatDuration(state.elapsedSeconds));
                return true; // Continue
            } else {
                this.trackingTimerId = null;
                return false; // Stop
            }
        });
    }

    _stopTrackingUITimer() {
        if (this.trackingTimerId) {
            GLib.Source.remove(this.trackingTimerId);
            this.trackingTimerId = null;
        }
    }

    _formatDuration(seconds) {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;
        return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }

    _selectProject() {
        // TODO: Open project selector
    }

    _selectClient() {
        // TODO: Open client selector
    }

    _createContent() {
        const contentBox = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 12,
            margin_top: 12,
            margin_bottom: 12,
            margin_start: 12,
            margin_end: 12,
        });

        // Statistics cards
        const statsBox = this._createStatsBox();
        contentBox.append(statsBox);

        // Export buttons
        const exportBox = this._createExportBox();
        contentBox.append(exportBox);

        return contentBox;
    }

    _createStatsBox() {
        const box = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 12,
            homogeneous: true,
            margin_bottom: 12,
        });

        // Total time card
        const timeCard = this._createStatCard(_('Total Time'), '0:00:00', 'alarm-symbolic');
        box.append(timeCard);

        // Total projects card
        const projectsCard = this._createStatCard(_('Active Projects'), '0', 'folder-symbolic');
        box.append(projectsCard);

        // Total tasks card
        const tasksCard = this._createStatCard(_('Tracked Tasks'), '0', 'checkbox-checked-symbolic');
        box.append(tasksCard);

        return box;
    }

    _createStatCard(title, value, iconName) {
        const card = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 6,
            css_classes: ['card'],
            margin_start: 6,
            margin_end: 6,
            margin_top: 12,
            margin_bottom: 12,
        });

        const icon = new Gtk.Image({
            icon_name: iconName,
            pixel_size: 32,
            css_classes: ['accent'],
        });

        const titleLabel = new Gtk.Label({
            label: title,
            css_classes: ['caption', 'dim-label'],
        });

        const valueLabel = new Gtk.Label({
            label: value,
            css_classes: ['title-2'],
        });

        card.append(icon);
        card.append(titleLabel);
        card.append(valueLabel);

        return card;
    }

    _createExportBox() {
        const box = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 12,
            halign: Gtk.Align.CENTER,
            margin_top: 12,
        });

        // Export PDF button
        const pdfBtn = new Gtk.Button({
            label: _('Export PDF'),
            css_classes: ['suggested-action'],
        });
        pdfBtn.connect('clicked', () => {
            this.exportPDFReport();
        });
        box.append(pdfBtn);

        // Export HTML button
        const htmlBtn = new Gtk.Button({
            label: _('Export HTML'),
            css_classes: ['flat'],
        });
        htmlBtn.connect('clicked', () => {
            this.exportHTMLReport();
        });
        box.append(htmlBtn);

        return box;
    }

    /**
     * Load reports from Core
     */
    async loadReports() {
        if (!this.coreBridge) {
            console.error('No coreBridge available');
            return;
        }

        try {
            // Get reports data from Core
            const reports = await this.coreBridge.getReports();
            this.reports = reports || [];
        } catch (error) {
            console.error('Error loading reports:', error);
        }
    }

    /**
     * Export PDF report
     */
    exportPDFReport() {
        // TODO: Implement via Core
    }

    /**
     * Export HTML report
     */
    exportHTMLReport() {
        // TODO: Implement via Core
    }

    /**
     * Refresh page data
     */
    async refresh() {
        await this.loadReports();
    }
}
