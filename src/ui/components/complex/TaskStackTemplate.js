import Gtk from 'gi://Gtk';
import Gdk from 'gi://Gdk';
import Adw from 'gi://Adw';
import { WidgetFactory } from 'resource:///com/odnoyko/valot/ui/utils/widgetFactory.js';

/**
 * Template component for task stacks (grouped tasks)
 * Adapted to Core architecture - UI UNCHANGED
 */
export class TaskStackTemplate {
    constructor(group, parentWindow) {
        this.group = group;
        this.parentWindow = parentWindow;
        this.coreBridge = parentWindow.coreBridge;
        this.widget = this._createStackWidget();
    }

    _escapeMarkup(text) {
        if (!text) return '';
        return String(text)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;');
    }

    _formatDuration(seconds) {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;
        return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }

    _createStackWidget() {
        // Check if any task in this stack is currently being tracked
        const trackingState = this.coreBridge ? this.coreBridge.getTrackingState() : { isTracking: false };
        const isCurrentlyTracking = trackingState.isTracking &&
            this.group.tasks.some(t => t.task_id === trackingState.currentTaskId);

        // Get project color from latest task
        const groupProjectName = this.group.latestTask.project_name || 'No Project';
        const groupClientName = this.group.latestTask.client_name || 'No Client';
        const groupDotColor = this.group.latestTask.project_color || '#9a9996';

        // Create group subtitle with colored dot (SAME UI)
        const groupSubtitle = isCurrentlyTracking
            ? `<span foreground="${groupDotColor}">●</span> ${groupProjectName} • ${groupClientName} • <b>Currently Tracking</b>`
            : `<span foreground="${groupDotColor}">●</span> ${groupProjectName} • ${groupClientName}`;

        // Create main expander row (SAME UI)
        const groupRow = new Adw.ExpanderRow({
            title: `${this._escapeMarkup(this.group.baseName)} (${this.group.tasks.length} entries)`,
            subtitle: groupSubtitle,
            use_markup: true
        });

        // Apply tracking state styling (SAME UI)
        if (isCurrentlyTracking) {
            groupRow.add_css_class('tracking-active');
        }

        // Add group suffix box with time and track button
        const groupSuffixBox = this._createGroupSuffixBox();
        groupRow.add_suffix(groupSuffixBox);

        // Add individual tasks as rows within the expander
        this._addTaskRows(groupRow);

        return groupRow;
    }

    _createGroupSuffixBox() {
        let timeText = '';
        let moneyText = '';

        // Check tracking state from Core
        const trackingState = this.coreBridge ? this.coreBridge.getTrackingState() : { isTracking: false };
        const isCurrentlyTracking = trackingState.isTracking &&
            this.group.tasks.some(t => t.task_id === trackingState.currentTaskId);

        // Prepare time text (SAME UI logic)
        if (isCurrentlyTracking) {
            timeText = `● Tracking`;
        } else if (this.group.totalDuration > 0) {
            timeText = this._formatDuration(this.group.totalDuration);
        }

        // Prepare money text (SAME UI)
        if (this.group.totalCost > 0) {
            const currency = this.group.latestTask.client_currency || 'EUR';
            const currencySymbol = WidgetFactory.getCurrencySymbol(currency);
            moneyText = `${currencySymbol}${this.group.totalCost.toFixed(2)}`;
        }

        // Create suffix box (SAME UI)
        const { suffixBox } = WidgetFactory.createTaskSuffixBox({
            timeText: timeText,
            moneyText: moneyText,
            showEditButton: false,
            showTrackButton: true,
            showCostTracking: this.parentWindow.showCostTracking !== false,
            onTrackClick: async () => {
                // Use Core to start tracking latest task in stack
                if (this.coreBridge && this.group.latestTask) {
                    try {
                        await this.coreBridge.startTracking(
                            this.group.latestTask.task_id,
                            this.group.latestTask.project_id,
                            this.group.latestTask.client_id
                        );
                    } catch (error) {
                        console.error('Error starting tracking:', error);
                    }
                }
            }
        });

        return suffixBox;
    }

    _addTaskRows(groupRow) {
        // Add individual task rows to the stack (SAME UI)
        this.group.tasks.forEach(task => {
            const cost = (task.total_time / 3600) * (task.client_rate || 0);
            const timeText = task.total_time > 0 ? this._formatDuration(task.total_time) : '';
            const currency = task.client_currency || 'EUR';
            const currencySymbol = WidgetFactory.getCurrencySymbol(currency);
            const costText = cost > 0 ? ` • ${currencySymbol}${cost.toFixed(2)}` : '';

            const taskRow = new Adw.ActionRow({
                title: this._escapeMarkup(task.task_name),
                subtitle: `${timeText}${costText}`
            });

            // Add click to edit
            const gesture = new Gtk.GestureClick();
            gesture.connect('released', () => {
                if (this.parentWindow._editTaskInstance) {
                    this.parentWindow._editTaskInstance(task.id);
                }
            });
            taskRow.add_controller(gesture);

            groupRow.add_row(taskRow);
        });
    }

    getWidget() {
        return this.widget;
    }
}
