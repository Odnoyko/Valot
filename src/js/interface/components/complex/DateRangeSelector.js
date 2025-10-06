import Gtk from 'gi://Gtk';
import Adw from 'gi://Adw';
import GLib from 'gi://GLib';
import { BUTTON } from 'resource:///com/odnoyko/valot/js/func/global/commonStrings.js';

/**
 * Custom Date Range Selector Component
 * Provides From/To date pickers and optional time controls
 */
export class DateRangeSelector {
    constructor(config = {}) {
        this.config = {
            showTimeControls: false,
            showQuickFilters: true,
            onDateRangeChanged: null,
            ...config
        };
        
        // Internal state
        this.fromDate = new Date();
        this.toDate = new Date();
        this.fromTime = { hours: 0, minutes: 0 };
        this.toTime = { hours: 23, minutes: 59 };
        
        // Initialize with current week by default
        this._setCurrentWeek();
        
        // Create the main component
        this.widget = this._createWidget();
    }

    _createWidget() {
        const box = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 8,
            margin_top: 4,
            margin_bottom: 4
        });

        // Only show date range row - no quick filters
        const dateRangeRow = this._createDateRangeRow();
        box.append(dateRangeRow);

        // Time controls row (optional)
        if (this.config.showTimeControls) {
            const timeControlsRow = this._createTimeControlsRow();
            box.append(timeControlsRow);
        }

        return box;
    }

    _createQuickFilters() {
        const box = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 8,
            halign: Gtk.Align.CENTER
        });

        const quickFilters = [
            { label: _('Today'), action: () => this._setToday() },
            { label: _('Yesterday'), action: () => this._setYesterday() },
            { label: _('This Week'), action: () => this._setCurrentWeek() },
            { label: _('Last Week'), action: () => this._setLastWeek() },
            { label: _('This Month'), action: () => this._setCurrentMonth() },
            { label: _('Last Month'), action: () => this._setLastMonth() }
        ];

        quickFilters.forEach(filter => {
            const button = new Gtk.Button({
                label: filter.label,
                css_classes: ['pill']
            });
            button.connect('clicked', () => {
                filter.action();
                this._updateDateButtons();
                this._notifyDateRangeChanged();
            });
            box.append(button);
        });

        return box;
    }

    _createDateRangeRow() {
        const box = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 12,
            halign: Gtk.Align.CENTER
        });

        // From date button
        this.fromDateButton = new Gtk.Button({
            css_classes: ['flat'],
            width_request: 120
        });
        this.fromDateButton.connect('clicked', () => this._showDatePicker('from'));

        // "to" label
        const toLabel = new Gtk.Label({
            label: _('to'),
            css_classes: ['dim-label']
        });

        // To date button
        this.toDateButton = new Gtk.Button({
            css_classes: ['flat'],
            width_request: 120
        });
        this.toDateButton.connect('clicked', () => this._showDatePicker('to'));

        box.append(this.fromDateButton);
        box.append(toLabel);
        box.append(this.toDateButton);

        // Initialize button labels
        this._updateDateButtons();

        return box;
    }

    _createTimeControlsRow() {
        const box = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 12,
            halign: Gtk.Align.CENTER
        });

        // From time controls
        const fromTimeBox = this._createTimeControls('from');

        // "to" label
        const toLabel = new Gtk.Label({
            label: _('to'),
            css_classes: ['dim-label']
        });

        // To time controls
        const toTimeBox = this._createTimeControls('to');

        box.append(fromTimeBox);
        box.append(toLabel);
        box.append(toTimeBox);

        return box;
    }

    _createTimeControls(type) {
        const box = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 4,
            css_classes: ['linked']
        });

        const time = type === 'from' ? this.fromTime : this.toTime;

        // Hours spinbutton
        const hoursSpinButton = new Gtk.SpinButton({
            adjustment: new Gtk.Adjustment({
                lower: 0,
                upper: 23,
                step_increment: 1,
                page_increment: 1,
                value: time.hours
            }),
            width_request: 60
        });

        // Colon label
        const colonLabel = new Gtk.Label({
            label: ':',
            css_classes: ['dim-label']
        });

        // Minutes spinbutton
        const minutesSpinButton = new Gtk.SpinButton({
            adjustment: new Gtk.Adjustment({
                lower: 0,
                upper: 59,
                step_increment: 15,
                page_increment: 15,
                value: time.minutes
            }),
            width_request: 60
        });

        // Connect change handlers
        hoursSpinButton.connect('value-changed', () => {
            time.hours = hoursSpinButton.get_value_as_int();
            this._notifyDateRangeChanged();
        });

        minutesSpinButton.connect('value-changed', () => {
            time.minutes = minutesSpinButton.get_value_as_int();
            this._notifyDateRangeChanged();
        });

        box.append(hoursSpinButton);
        box.append(colonLabel);
        box.append(minutesSpinButton);

        return box;
    }

    _showDatePicker(type) {
        const currentDate = type === 'from' ? this.fromDate : this.toDate;

        const calendarDialog = new Adw.AlertDialog({
            heading: type === 'from' ? _('Select Start Date') : _('Select End Date'),
            body: type === 'from' ? _('Choose the start date for the report range') : _('Choose the end date for the report range')
        });

        const calendarBox = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 12,
            margin_top: 12,
            margin_bottom: 12,
            margin_start: 12,
            margin_end: 12
        });

        const calendar = new Gtk.Calendar();
        
        // Set calendar to current date
        const gDate = GLib.DateTime.new_local(
            currentDate.getFullYear(),
            currentDate.getMonth() + 1,
            currentDate.getDate(),
            0, 0, 0
        );
        calendar.set_date(gDate);

        calendarBox.append(calendar);
        calendarDialog.set_extra_child(calendarBox);

        calendarDialog.add_response('cancel', BUTTON.CANCEL);
        calendarDialog.add_response('ok', BUTTON.OK);
        calendarDialog.set_response_appearance('ok', Adw.ResponseAppearance.SUGGESTED);

        calendarDialog.connect('response', (dialog, response) => {
            if (response === 'ok') {
                const selectedDate = calendar.get_date();
                const newDate = new Date(
                    selectedDate.get_year(),
                    selectedDate.get_month() - 1,
                    selectedDate.get_day_of_month()
                );

                if (type === 'from') {
                    this.fromDate = newDate;
                } else {
                    this.toDate = newDate;
                }

                this._updateDateButtons();
                this._notifyDateRangeChanged();
            }
        });

        // Find parent window
        let parent = this.widget;
        while (parent && !(parent instanceof Gtk.Window)) {
            parent = parent.get_parent();
        }

        if (parent) {
            calendarDialog.present(parent);
        }
    }

    _updateDateButtons() {
        if (this.fromDateButton) {
            this.fromDateButton.set_label(this._formatDate(this.fromDate));
        }
        if (this.toDateButton) {
            this.toDateButton.set_label(this._formatDate(this.toDate));
        }
    }

    _formatDate(date) {
        return date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        });
    }

    _notifyDateRangeChanged() {
        if (this.config.onDateRangeChanged) {
            this.config.onDateRangeChanged({
                fromDate: this.fromDate,
                toDate: this.toDate,
                fromTime: this.fromTime,
                toTime: this.toTime
            });
        }
    }

    // Quick filter methods
    _setToday() {
        const today = new Date();
        this.fromDate = new Date(today);
        this.toDate = new Date(today);
    }

    _setYesterday() {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        this.fromDate = new Date(yesterday);
        this.toDate = new Date(yesterday);
    }

    _setCurrentWeek() {
        const today = new Date();
        const dayOfWeek = today.getDay();
        const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
        
        this.fromDate = new Date(today);
        this.fromDate.setDate(today.getDate() - daysToMonday);
        
        this.toDate = new Date(this.fromDate);
        this.toDate.setDate(this.fromDate.getDate() + 6);
    }

    _setLastWeek() {
        this._setCurrentWeek();
        this.fromDate.setDate(this.fromDate.getDate() - 7);
        this.toDate.setDate(this.toDate.getDate() - 7);
    }

    _setCurrentMonth() {
        const today = new Date();
        this.fromDate = new Date(today.getFullYear(), today.getMonth(), 1);
        this.toDate = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    }

    _setLastMonth() {
        const today = new Date();
        this.fromDate = new Date(today.getFullYear(), today.getMonth() - 1, 1);
        this.toDate = new Date(today.getFullYear(), today.getMonth(), 0);
    }

    // Public API
    getDateRange() {
        return {
            fromDate: this.fromDate,
            toDate: this.toDate,
            fromTime: this.fromTime,
            toTime: this.toTime
        };
    }

    setDateRange(fromDate, toDate) {
        this.fromDate = new Date(fromDate);
        this.toDate = new Date(toDate);
        this._updateDateButtons();
        this._notifyDateRangeChanged();
    }

    getWidget() {
        return this.widget;
    }
}
