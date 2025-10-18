import Gtk from 'gi://Gtk';
import Gdk from 'gi://Gdk';
import Adw from 'gi://Adw';
import { WidgetFactory } from 'resource:///com/odnoyko/valot/ui/utils/widgetFactory.js';

/**
 * Template component for individual task rows
 * Adapted to Core architecture - UI UNCHANGED
 */
export class TaskRowTemplate {
    constructor(task, parentWindow) {
        this.task = task;
        this.parentWindow = parentWindow;
        this.coreBridge = parentWindow.coreBridge;
        this.widget = this._createTaskWidget();
    }

    // Simple markup escaper (replaces InputValidator)
    _escapeMarkup(text) {
        if (!text) return '';
        return String(text)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;');
    }

    // Simple time formatter (replaces timeUtils)
    _formatDuration(seconds) {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;
        return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }

    _formatDate(dateStr) {
        if (!dateStr) return '';
        const date = new Date(dateStr);
        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const year = date.getFullYear();
        return `${day}.${month}.${year}`;
    }

    _createTaskWidget() {
        // Calculate cost (using total_time from TaskInstance)
        const cost = (this.task.total_time / 3600) * (this.task.client_rate || 0);
        const currency = this.task.client_currency || 'EUR';
        const currencySymbol = WidgetFactory.getCurrencySymbol(currency);

        // Get project and client names (always show real name from DB, even for default)
        const projectName = this.task.project_name || 'No Project';
        const clientName = this.task.client_name || 'No Client';
        const dotColor = this.task.project_color || '#9a9996';

        // Check if currently tracking (use Core)
        // Must match unique combination of task + project + client
        const trackingState = this.coreBridge ? this.coreBridge.getTrackingState() : { isTracking: false };
        const isCurrentlyTracking = trackingState.isTracking &&
            trackingState.currentTaskId === this.task.task_id &&
            trackingState.currentProjectId === this.task.project_id &&
            trackingState.currentClientId === this.task.client_id;

        // Create subtitle with colored dot (SAME UI as before)
        const dateText = this._formatDate(this.task.last_used_at);
        const subtitle = isCurrentlyTracking
            ? `<span foreground="${dotColor}">●</span> ${projectName} • ${clientName} • <b>Currently Tracking</b> • ${dateText}`
            : `<span foreground="${dotColor}">●</span> ${projectName} • ${clientName} • ${dateText}`;

        // Create main row (SAME UI)
        const row = new Adw.ActionRow({
            title: this._escapeMarkup(this.task.task_name),
            subtitle: subtitle,
            use_markup: true,
            css_classes: ['bright-subtitle']
        });

        // Apply tracking state styling (SAME UI)
        if (isCurrentlyTracking) {
            row.add_css_class('tracking-active');
        }

        // Create and add suffix box
        const suffixBox = this._createSuffixBox(cost);
        row.add_suffix(suffixBox);

        // Add click gesture to edit task
        const gesture = new Gtk.GestureClick();
        gesture.connect('released', () => {
            if (this.parentWindow._editTaskInstance) {
                this.parentWindow._editTaskInstance(this.task.id);
            }
        });
        row.add_controller(gesture);

        return row;
    }

    _createSuffixBox(cost) {
        let timeText = '';
        let moneyText = '';

        // Check tracking state from Core
        // Must match unique combination of task + project + client
        const trackingState = this.coreBridge ? this.coreBridge.getTrackingState() : { isTracking: false };
        const isCurrentlyTracking = trackingState.isTracking &&
            trackingState.currentTaskId === this.task.task_id &&
            trackingState.currentProjectId === this.task.project_id &&
            trackingState.currentClientId === this.task.client_id;

        // Prepare time text
        if (isCurrentlyTracking) {
            // Show total time (will be updated in real-time by _updateTrackingTimeDisplay)
            timeText = this._formatDuration(this.task.total_time);
        } else if (this.task.total_time > 0) {
            timeText = this._formatDuration(this.task.total_time);
        }

        // Prepare separate money text
        if (cost > 0) {
            const currency = this.task.client_currency || 'EUR';
            const currencySymbol = WidgetFactory.getCurrencySymbol(currency);
            moneyText = `${currencySymbol}${cost.toFixed(2)}`;
        }

        // Store references for real-time updates
        this.timeLabel = null;
        this.moneyLabel = null;

        // Use accent color for time when tracking
        const timeCssClasses = isCurrentlyTracking ? ['caption'] : ['caption', 'dim-label'];

        // Create suffix box using WidgetFactory (SAME UI)
        const { suffixBox, timeLabel, moneyLabel, trackButton } = WidgetFactory.createTaskSuffixBox({
            timeText: timeText,
            moneyText: moneyText,
            css_classes: timeCssClasses,
            showEditButton: false, // Removed - click on row to edit
            showTrackButton: true,
            showCostTracking: true, // Always show cost tracking
            onTrackClick: async () => {
                // Handle task tracking - check if currently tracking
                if (this.coreBridge) {
                    try {
                        const trackingState = this.coreBridge.getTrackingState();

                        // Check unique combination of task + project + client
                        if (trackingState.isTracking &&
                            trackingState.currentTaskId === this.task.task_id &&
                            trackingState.currentProjectId === this.task.project_id &&
                            trackingState.currentClientId === this.task.client_id) {
                            // Stop tracking if this exact task instance is currently being tracked
                            await this.coreBridge.stopTracking();

                            // Immediately update button icon
                            if (this.trackButton) {
                                this.trackButton.set_icon_name('media-playback-start-symbolic');
                                this.trackButton.set_tooltip_text(_('Start tracking'));
                            }
                        } else {
                            // Start tracking this task instance
                            await this.coreBridge.startTracking(
                                this.task.task_id,
                                this.task.project_id,
                                this.task.client_id
                            );

                            // Immediately update button icon
                            if (this.trackButton) {
                                this.trackButton.set_icon_name('media-playback-stop-symbolic');
                                this.trackButton.set_tooltip_text(_('Stop tracking'));
                            }
                        }
                    } catch (error) {
                        console.error('Error toggling tracking:', error);
                    }
                }
            }
        });

        // Store label and button references for real-time updates
        this.timeLabel = timeLabel;
        this.moneyLabel = moneyLabel;
        this.trackButton = trackButton;

        // Set track button icon based on tracking state
        if (trackButton) {
            if (isCurrentlyTracking) {
                trackButton.set_icon_name('media-playback-stop-symbolic');
                trackButton.set_tooltip_text(_('Stop tracking'));
            } else {
                trackButton.set_icon_name('media-playback-start-symbolic');
                trackButton.set_tooltip_text(_('Start tracking'));
            }
        }

        // Add accent color to money label when tracking
        if (isCurrentlyTracking && moneyLabel) {
            moneyLabel.remove_css_class('dim-label');
        }

        return suffixBox;
    }

    getWidget() {
        return this.widget;
    }

    getTimeLabel() {
        return this.timeLabel;
    }

    getMoneyLabel() {
        return this.moneyLabel;
    }

    getTrackButton() {
        return this.trackButton;
    }

    /**
     * Update project color for this task row
     */
    updateProjectColor(newColor) {
        if (!this.widget || !newColor) return;

        // Update task data
        this.task.project_color = newColor;

        // Recreate subtitle with new color
        const projectName = this.task.project_name || 'No Project';
        const clientName = this.task.client_name || 'No Client';
        const dateText = this._formatDate(this.task.last_used_at);

        const trackingState = this.coreBridge ? this.coreBridge.getTrackingState() : { isTracking: false };
        const isCurrentlyTracking = trackingState.isTracking &&
            trackingState.currentTaskId === this.task.task_id &&
            trackingState.currentProjectId === this.task.project_id &&
            trackingState.currentClientId === this.task.client_id;

        const subtitle = isCurrentlyTracking
            ? `<span foreground="${newColor}">●</span> ${projectName} • ${clientName} • <b>Currently Tracking</b> • ${dateText}`
            : `<span foreground="${newColor}">●</span> ${projectName} • ${clientName} • ${dateText}`;

        // Update subtitle in widget
        this.widget.set_subtitle(subtitle);
    }
}
