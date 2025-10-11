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
        return date.toLocaleDateString();
    }

    _createTaskWidget() {
        // Calculate cost (using total_time from TaskInstance)
        const cost = (this.task.total_time / 3600) * (this.task.client_rate || 0);
        const currency = this.task.client_currency || 'EUR';
        const currencySymbol = WidgetFactory.getCurrencySymbol(currency);

        // Get project color (task has project_color from TaskInstance view)
        const projectName = this.task.project_name || 'No Project';
        const clientName = this.task.client_name || 'No Client';
        const dotColor = this.task.project_color || '#9a9996';

        // Check if currently tracking (use Core)
        const trackingState = this.coreBridge ? this.coreBridge.getTrackingState() : { isTracking: false };
        const isCurrentlyTracking = trackingState.isTracking &&
            trackingState.currentTaskId === this.task.task_id;

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
        const trackingState = this.coreBridge ? this.coreBridge.getTrackingState() : { isTracking: false };
        const isCurrentlyTracking = trackingState.isTracking &&
            trackingState.currentTaskId === this.task.task_id;

        // Prepare time text (SAME UI logic as before)
        if (isCurrentlyTracking) {
            // Show live time with dot indicator for active tracking
            timeText = '● Tracking';
        } else if (this.task.total_time > 0) {
            timeText = this._formatDuration(this.task.total_time);
        }

        // Prepare separate money text (SAME UI)
        if (cost > 0) {
            const currency = this.task.client_currency || 'EUR';
            const currencySymbol = WidgetFactory.getCurrencySymbol(currency);
            moneyText = `${currencySymbol}${cost.toFixed(2)}`;
        }

        // Create suffix box using WidgetFactory (SAME UI)
        const { suffixBox, timeLabel, moneyLabel } = WidgetFactory.createTaskSuffixBox({
            timeText: timeText,
            moneyText: moneyText,
            showEditButton: true,
            showTrackButton: true,
            showCostTracking: this.parentWindow.showCostTracking !== false,
            onEditClick: () => {
                if (this.parentWindow._editTaskInstance) {
                    this.parentWindow._editTaskInstance(this.task.id);
                }
            },
            onTrackClick: async () => {
                // Use Core to start tracking this task instance
                if (this.coreBridge) {
                    try {
                        await this.coreBridge.startTracking(
                            this.task.task_id,
                            this.task.project_id,
                            this.task.client_id
                        );
                    } catch (error) {
                        console.error('Error starting tracking:', error);
                    }
                }
            }
        });

        return suffixBox;
    }

    getWidget() {
        return this.widget;
    }
}
