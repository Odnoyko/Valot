import Gtk from 'gi://Gtk';
import Gdk from 'gi://Gdk';
import Adw from 'gi://Adw';
import { WidgetFactory } from 'resource:///com/odnoyko/valot/ui/utils/widgetFactory.js';
import { DurationAnimator } from 'resource:///com/odnoyko/valot/ui/utils/DurationAnimator.js';

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

        // Create subtitle with colored dot (same for all tasks)
        const dateText = this._formatDate(this.task.last_used_at);
        const subtitle = `<span foreground="${dotColor}">●</span> ${projectName} • ${clientName} • ${dateText}`;

        // Create main row (same for all tasks)
        const row = new Adw.ActionRow({
            title: this._escapeMarkup(this.task.task_name),
            subtitle: subtitle,
            use_markup: true,
            css_classes: ['bright-subtitle']
        });

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
            timeText = '● ' + this._formatDuration(this.task.total_time);
        } else if (this.task.total_time > 0) {
            timeText = this._formatDuration(this.task.total_time);
        }

        // Prepare separate money text
        if (cost > 0) {
            const currency = this.task.client_currency || 'EUR';
            const currencySymbol = WidgetFactory.getCurrencySymbol(currency);
            moneyText = `${currencySymbol}${cost.toFixed(2)}`;
        }

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
     * Update time label in real-time during tracking (elapsed seconds only)
     * OPTIMIZED: Updates only time text, no state changes, no object creation
     * CRITICAL: Uses base time from tracking start to prevent accumulation
     */
    updateTimeLabel(elapsedSeconds) {
        if (!this.timeLabel || elapsedSeconds === undefined) return;
        
        // CRITICAL: Use base time from start (prevents accumulation)
        // _baseTimeOnStart is set when tracking starts in TasksPage
        const baseTime = this.task._baseTimeOnStart !== undefined ? this.task._baseTimeOnStart : (this.task.total_time || 0);
        const currentTotal = baseTime + elapsedSeconds;
        
        // Create animator if not exists (for when task starts tracking mid-session)
        if (!this.durationAnimator && this.timeLabel) {
            this.durationAnimator = new DurationAnimator(this.timeLabel, '● ');
        }
        
        // Update via animator (smooth, with pulse effect on every second)
        if (this.durationAnimator) {
            this.durationAnimator.setDirect(currentTotal);
        } else {
            // Fallback to direct update if animator not available
            const timeText = '● ' + this._formatDuration(currentTotal);
            this.timeLabel.set_text(timeText);
        }
        
        // Ensure green dot is visible (remove dim-label)
        if (this.timeLabel.has_css_class('dim-label')) {
            this.timeLabel.remove_css_class('dim-label');
        }
        
        // CRITICAL: Update money label (currency) in real-time during tracking
        if (this.moneyLabel) {
            const cost = (currentTotal / 3600) * (this.task.client_rate || 0);
            if (cost > 0) {
                const currency = this.task.client_currency || 'EUR';
                const currencySymbol = WidgetFactory.getCurrencySymbol(currency);
                const moneyText = `${currencySymbol}${cost.toFixed(2)}`;
                this.moneyLabel.set_text(moneyText);
                
                // CRITICAL: Make label visible (was created with visible=false if moneyText was empty)
                if (!this.moneyLabel.get_visible()) {
                    this.moneyLabel.set_visible(true);
                }
                
                // Remove dim-label to show normal color when tracking
                if (this.moneyLabel.has_css_class('dim-label')) {
                    this.moneyLabel.remove_css_class('dim-label');
                }
            } else {
                // No cost - hide money label
                this.moneyLabel.set_text('');
                this.moneyLabel.set_visible(false);
            }
        }
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

        // Keep original design with "Currently Tracking" text
        const subtitle = isCurrentlyTracking
            ? `<span foreground="${newColor}">●</span> ${projectName} • ${clientName} • <b>Currently Tracking</b> • ${dateText}`
            : `<span foreground="${newColor}">●</span> ${projectName} • ${clientName} • ${dateText}`;

        // Update subtitle in widget
        this.widget.set_subtitle(subtitle);
    }

    /**
     * Update tracking state (icon, time label, and subtitle)
     * Called when tracking starts/stops to update UI without recreating widget
     */
    updateTrackingState() {
        if (!this.coreBridge) return;

        const trackingState = this.coreBridge.getTrackingState();
        const isCurrentlyTracking = trackingState.isTracking &&
            trackingState.currentTaskId === this.task.task_id &&
            trackingState.currentProjectId === this.task.project_id &&
            trackingState.currentClientId === this.task.client_id;

        // Update button icon
        if (this.trackButton) {
            if (isCurrentlyTracking) {
                this.trackButton.set_icon_name('media-playback-stop-symbolic');
                this.trackButton.set_tooltip_text(_('Stop tracking'));
            } else {
                this.trackButton.set_icon_name('media-playback-start-symbolic');
                this.trackButton.set_tooltip_text(_('Start tracking'));
            }
        }

        // Update time label (remove/add green dot and dim-label)
        if (this.timeLabel) {
            if (isCurrentlyTracking) {
                // Create animator with green dot prefix if starting tracking
                if (!this.durationAnimator) {
                    this.durationAnimator = new DurationAnimator(this.timeLabel, '● ');
                    // Animate from current total_time to current total_time (will show with glitch effect)
                    // Pass fromSeconds = current time to initialize animator properly
                    this.durationAnimator.animateTo(this.task.total_time, true, this.task.total_time);
                }
                // Remove dim-label to show green color
                if (this.timeLabel.has_css_class('dim-label')) {
                    this.timeLabel.remove_css_class('dim-label');
                }
            } else {
                // Cleanup animator when stopping tracking
                if (this.durationAnimator) {
                    this.durationAnimator.destroy();
                    this.durationAnimator = null;
                }
                // Set text without animator (not tracking)
                const timeText = this._formatDuration(this.task.total_time);
                this.timeLabel.set_text(timeText);
                // Add dim-label if not tracking
                if (!this.timeLabel.has_css_class('dim-label')) {
                    this.timeLabel.add_css_class('dim-label');
                }
            }
        }
        
        // CRITICAL: Update money label (currency) based on tracking state
        if (this.moneyLabel) {
            const cost = (this.task.total_time / 3600) * (this.task.client_rate || 0);
            if (cost > 0) {
                const currency = this.task.client_currency || 'EUR';
                const currencySymbol = WidgetFactory.getCurrencySymbol(currency);
                const moneyText = `${currencySymbol}${cost.toFixed(2)}`;
                this.moneyLabel.set_text(moneyText);
                
                // CRITICAL: Make label visible (was created with visible=false if moneyText was empty)
                if (!this.moneyLabel.get_visible()) {
                    this.moneyLabel.set_visible(true);
                }
                
                // Update CSS classes based on tracking state
                if (isCurrentlyTracking) {
                    // Remove dim-label to show normal color when tracking
                    if (this.moneyLabel.has_css_class('dim-label')) {
                        this.moneyLabel.remove_css_class('dim-label');
                    }
                } else {
                    // Add dim-label if not tracking
                    if (!this.moneyLabel.has_css_class('dim-label')) {
                        this.moneyLabel.add_css_class('dim-label');
                    }
                }
            } else {
                // No cost - hide money label
                this.moneyLabel.set_text('');
                this.moneyLabel.set_visible(false);
            }
        }

        // Update subtitle with "Currently Tracking" text (original design)
        if (this.widget) {
            const projectName = this.task.project_name || 'No Project';
            const clientName = this.task.client_name || 'No Client';
            const dotColor = this.task.project_color || '#9a9996';
            const dateText = this._formatDate(this.task.last_used_at);

            const subtitle = isCurrentlyTracking
                ? `<span foreground="${dotColor}">●</span> ${projectName} • ${clientName} • <b>Currently Tracking</b> • ${dateText}`
                : `<span foreground="${dotColor}">●</span> ${projectName} • ${clientName} • ${dateText}`;

            this.widget.set_subtitle(subtitle);
        }
    }

    /**
     * Update time directly (without recreating widget)
     * OPTIMIZED: Updates time label text when total_time changes
     * CRITICAL: Always updates time text, tracking state checked separately
     */
    updateTime(newTotalTime) {
        if (!this.timeLabel) return;
        
        // CRITICAL: Validate newTotalTime
        if (newTotalTime === undefined || newTotalTime === null || isNaN(newTotalTime)) {
            console.warn(`[TaskRowTemplate] updateTime: Invalid newTotalTime=${newTotalTime}, using 0`);
            newTotalTime = 0;
        }
        
        // Ensure newTotalTime is a number
        newTotalTime = Number(newTotalTime);
        
        // Update task object
        this.task.total_time = newTotalTime;
        
        // Update time label text
        const trackingState = this.coreBridge ? this.coreBridge.getTrackingState() : { isTracking: false };
        const isCurrentlyTracking = trackingState.isTracking &&
            trackingState.currentTaskId === this.task.task_id &&
            trackingState.currentProjectId === this.task.project_id &&
            trackingState.currentClientId === this.task.client_id;
        
        
        // CRITICAL: Always show time, even if 0 or tracking state
        let timeText = '';
        if (isCurrentlyTracking) {
            timeText = '● ' + this._formatDuration(newTotalTime);
            // Remove dim-label to show green color
            if (this.timeLabel.has_css_class('dim-label')) {
                this.timeLabel.remove_css_class('dim-label');
            }
        } else {
            // NOT tracking - show time WITHOUT green dot
            timeText = this._formatDuration(newTotalTime);
            // Add dim-label if not tracking
            if (!this.timeLabel.has_css_class('dim-label')) {
                this.timeLabel.add_css_class('dim-label');
            }
        }
        
        this.timeLabel.set_text(timeText);
        
        // CRITICAL: Update money label (currency) based on new total_time
        if (this.moneyLabel) {
            const cost = (newTotalTime / 3600) * (this.task.client_rate || 0);
            if (cost > 0) {
                const currency = this.task.client_currency || 'EUR';
                const currencySymbol = WidgetFactory.getCurrencySymbol(currency);
                const moneyText = `${currencySymbol}${cost.toFixed(2)}`;
                this.moneyLabel.set_text(moneyText);
                
                // CRITICAL: Make label visible (was created with visible=false if moneyText was empty)
                if (!this.moneyLabel.get_visible()) {
                    this.moneyLabel.set_visible(true);
                }
                
                // Update CSS classes based on tracking state
                if (isCurrentlyTracking) {
                    // Remove dim-label to show normal color when tracking
                    if (this.moneyLabel.has_css_class('dim-label')) {
                        this.moneyLabel.remove_css_class('dim-label');
                    }
                } else {
                    // Add dim-label if not tracking
                    if (!this.moneyLabel.has_css_class('dim-label')) {
                        this.moneyLabel.add_css_class('dim-label');
                    }
                }
            } else {
                // No cost - hide money label
                this.moneyLabel.set_text('');
                this.moneyLabel.set_visible(false);
            }
        }
    }

    /**
     * Cleanup: destroy widget and clear references to free RAM
     */
    destroy() {
        // Cleanup duration animator
        if (this.durationAnimator) {
            this.durationAnimator.destroy();
            this.durationAnimator = null;
        }
        
        if (this.widget) {
            try {
                if (typeof this.widget.destroy === 'function') {
                    this.widget.destroy();
                }
            } catch (e) {
                // Widget may already be destroyed
            }
            this.widget = null;
        }
        this.task = null;
        this.parentWindow = null;
        this.coreBridge = null;
    }
}
