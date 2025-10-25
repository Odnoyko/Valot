import Gtk from 'gi://Gtk';
import Adw from 'gi://Adw?version=1';
import Gdk from 'gi://Gdk';
import GLib from 'gi://GLib';
import { AdvancedTrackingWidget } from 'resource:///com/odnoyko/valot/ui/components/complex/AdvancedTrackingWidget.js';
import { getCurrencySymbol } from 'resource:///com/odnoyko/valot/data/currencies.js';
import { ReportExporter } from 'resource:///com/odnoyko/valot/ui/utils/export/reportExporter.js';
import { PDFExportPreferencesDialog } from 'resource:///com/odnoyko/valot/ui/components/dialogs/PDFExportPreferencesDialog.js';

/**
 * Reports Page - Restored UI from main branch
 * Full chart, statistics, and recent tasks list
 */
export class ReportsPage {
    constructor(config = {}) {
        this.app = config.app;
        this.parentWindow = config.parentWindow;
        this.coreBridge = config.coreBridge;

        // Chart filters state
        this.chartFilters = {
            period: 'week',
            projectId: null,
            clientId: null,
            customDateRange: null // {fromDate, toDate}
        };

        // Data cache
        this.allTasks = [];
        this.allProjects = [];
        this.allClients = [];

        // Subscribe to UI events for real-time updates
        this._subscribeToEvents();
    }

    /**
     * Subscribe to Core events for real-time updates
     */
    _subscribeToEvents() {
        if (!this.coreBridge) return;

        // Reload when tracking starts/stops (creates new time entries)
        this.coreBridge.onUIEvent('tracking-started', () => {
            setTimeout(() => this.updateChartsOnly(), 300);
        });

        this.coreBridge.onUIEvent('tracking-stopped', () => {
            this.updateChartsOnly();
        });

        // Reload when tasks are created/updated/deleted
        this.coreBridge.onUIEvent('task-created', () => {
            this.updateChartsOnly();
        });

        this.coreBridge.onUIEvent('task-updated', () => {
            this.updateChartsOnly();
        });

        this.coreBridge.onUIEvent('tasks-deleted', () => {
            this.updateChartsOnly();
        });

        // Reload when projects/clients are updated
        this.coreBridge.onUIEvent('project-updated', () => {
            this.updateChartsOnly();
        });

        this.coreBridge.onUIEvent('client-updated', () => {
            this.updateChartsOnly();
        });

        // Update on tracking changes (task name, project, client changes)
        this.coreBridge.onUIEvent('tracking-updated', (data) => {
            console.log('[ReportsPage] tracking-updated event received', data);

            // Update statistics in real-time (Total Time, etc.)
            this._updateStatisticsRealtime();

            // Update charts if task/project/client changed
            if (data.taskName || data.taskId || data.projectId !== undefined || data.clientId !== undefined) {
                this.updateChartsOnly();
            }
        });
    }

    /**
     * Create and return the main widget for this page
     */
    getWidget() {
        const page = new Adw.ToolbarView();

        // Create header bar
        const headerBar = this._createHeaderBar();
        page.add_top_bar(headerBar);

        // Create content
        const content = this._createContent();
        page.set_content(content);

        // Subscribe to sidebar visibility changes
        if (this.parentWindow && this.parentWindow.splitView) {
            this.parentWindow.splitView.connect('notify::show-sidebar', () => {
                this._updateSidebarToggleButton();
            });
        }

        // Load initial data
        this.loadReports();

        return page;
    }

    /**
     * Called when page becomes visible
     */
    onPageShown() {
        this._updateSidebarToggleButton();
    }

    /**
     * Update sidebar toggle button visibility based on sidebar state
     */
    _updateSidebarToggleButton() {
        if (this.sidebarToggleBtn && this.parentWindow && this.parentWindow.splitView) {
            const sidebarVisible = this.parentWindow.splitView.get_show_sidebar();
            this.sidebarToggleBtn.set_visible(!sidebarVisible);
        }
    }

    _createHeaderBar() {
        const headerBar = new Adw.HeaderBar();

        // Sidebar toggle button (only visible when sidebar is hidden)
        this.sidebarToggleBtn = new Gtk.Button({
            icon_name: 'sidebar-show-symbolic',
            tooltip_text: _('Show Sidebar'),
            css_classes: ['flat'],
            visible: false
        });
        this.sidebarToggleBtn.connect('clicked', () => {
            if (this.parentWindow && this.parentWindow.splitView) {
                this.parentWindow.splitView.set_show_sidebar(true);
            }
        });
        headerBar.pack_start(this.sidebarToggleBtn);

        // PDF Export button (start - left side)
        const pdfExportBtn = new Gtk.Button({
            icon_name: 'document-save-symbolic',
            tooltip_text: _('Export PDF Report'),
            css_classes: ['flat'],
        });
        pdfExportBtn.connect('clicked', () => {
            this._exportPDF();
        });
        headerBar.pack_start(pdfExportBtn);

        // Tracking widget (title area)
        this.trackingWidget = new AdvancedTrackingWidget(this.coreBridge, this.parentWindow);
        headerBar.set_title_widget(this.trackingWidget.getWidget());

        // Compact tracker button (end - right side)
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

    _createContent() {
        const scrolled = new Gtk.ScrolledWindow();

        const mainBox = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 24,
            margin_top: 24,
            margin_bottom: 24,
            margin_start: 24,
            margin_end: 24,
        });

        // Page title
        const titleLabel = new Gtk.Label({
            label: _('Task Reports'),
            css_classes: ['title-1'],
            halign: Gtk.Align.CENTER,
        });
        mainBox.append(titleLabel);

        // Chart section with filters
        const chartSection = this._createChartSection();
        mainBox.append(chartSection);

        // Summary statistics
        const statsSection = this._createSummaryStatistics();
        mainBox.append(statsSection);

        // Recent tasks list
        const tasksSection = this._createRecentTasksList();
        mainBox.append(tasksSection);

        scrolled.set_child(mainBox);
        return scrolled;
    }

    /**
     * Create chart section with filters
     */
    _createChartSection() {
        const group = new Adw.PreferencesGroup();

        const contentBox = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 12,
        });

        // Chart filters
        const filtersBox = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 12,
            halign: Gtk.Align.CENTER,
            margin_bottom: 12,
        });

        // Period filter dropdown
        const periodModel = new Gtk.StringList();
        periodModel.append(_('Week'));
        periodModel.append(_('Month'));
        periodModel.append(_('Year'));
        periodModel.append(_('Custom Range'));

        this.periodFilter = new Gtk.DropDown({
            model: periodModel,
            selected: 0,
            tooltip_text: _('Select time period'),
        });

        this.periodFilter.connect('notify::selected', () => {
            const selected = this.periodFilter.get_selected();
            const periods = ['week', 'month', 'year', 'custom'];
            this.chartFilters.period = periods[selected];

            // Show/hide custom date buttons
            if (this.chartFilters.period === 'custom') {
                this.customDateBox.set_visible(true);
                // Set default range if not set
                if (!this.chartFilters.customDateRange) {
                    const now = GLib.DateTime.new_now_local();
                    const fromDate = now.add_days(-30);
                    this.chartFilters.customDateRange = { fromDate, toDate: now };
                    this._updateCustomDateButtons();
                }
            } else {
                this.customDateBox.set_visible(false);
            }

            this._updateReports();
        });

        // Project filter dropdown
        this.projectFilter = new Gtk.DropDown({
            tooltip_text: _('Filter by project'),
        });

        // Client filter dropdown
        this.clientFilter = new Gtk.DropDown({
            tooltip_text: _('Filter by client'),
        });

        filtersBox.append(this.periodFilter);
        filtersBox.append(this.projectFilter);
        filtersBox.append(this.clientFilter);

        // Custom date range buttons (hidden by default)
        this.customDateBox = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 12,
            halign: Gtk.Align.CENTER,
            margin_bottom: 12,
            visible: false,
        });

        // "bis" label between dates
        const bisLabel = new Gtk.Label({
            label: _('bis'),
            css_classes: ['dim-label'],
        });

        // Start date button
        this.startDateButton = new Gtk.Button({
            css_classes: ['flat'],
        });
        this.startDateButton.connect('clicked', () => {
            this._showDatePickerDialog(true); // true = start date
        });

        // End date button
        this.endDateButton = new Gtk.Button({
            css_classes: ['flat'],
        });
        this.endDateButton.connect('clicked', () => {
            this._showDatePickerDialog(false); // false = end date
        });

        this.customDateBox.append(this.startDateButton);
        this.customDateBox.append(bisLabel);
        this.customDateBox.append(this.endDateButton);

        contentBox.append(filtersBox);
        contentBox.append(this.customDateBox);

        // Chart container
        this.chartContainer = this._createChart();

        contentBox.append(this.chartContainer);

        group.add(contentBox);
        return group;
    }

    /**
     * Create chart placeholder container
     */
    _createChart() {
        const chartBox = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 12,
            halign: Gtk.Align.FILL,
            valign: Gtk.Align.START,
        });

        // Empty placeholder - will be populated when data loads
        const placeholderLabel = new Gtk.Label({
            label: _('Loading chart...'),
            css_classes: ['dim-label'],
            halign: Gtk.Align.CENTER,
            valign: Gtk.Align.CENTER,
        });
        chartBox.append(placeholderLabel);

        return chartBox;
    }

    /**
     * Create summary statistics section (4 cards)
     */
    _createSummaryStatistics() {
        const group = new Adw.PreferencesGroup();

        const statsBox = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 24,
            homogeneous: true,
        });

        // Total Time card
        const totalTimeCard = this._createStatCard(
            'alarm-symbolic',
            '00:00:00',
            _('Total Time')
        );
        this.totalTimeLabel = totalTimeCard.valueLabel;

        // Active Projects card
        const activeProjectsCard = this._createStatCard(
            'folder-symbolic',
            '0',
            _('Active Projects')
        );
        this.activeProjectsLabel = activeProjectsCard.valueLabel;

        // Total Earnings card (with carousel)
        const earningsCard = this._createEarningsCard();

        // Tracked Tasks card
        const trackedTasksCard = this._createStatCard(
            'view-list-symbolic',
            '0',
            _('Tracked Tasks')
        );
        this.trackedTasksLabel = trackedTasksCard.valueLabel;

        statsBox.append(totalTimeCard.card);
        statsBox.append(activeProjectsCard.card);
        statsBox.append(earningsCard);
        statsBox.append(trackedTasksCard.card);

        group.add(statsBox);
        return group;
    }

    /**
     * Create a statistics card
     */
    _createStatCard(iconName, defaultValue, label) {
        const card = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            css_classes: ['card'],
        });

        const contentBox = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 12,
            margin_top: 16,
            margin_bottom: 16,
            margin_start: 16,
            margin_end: 16,
        });

        const icon = new Gtk.Image({
            icon_name: iconName,
            pixel_size: 32,
            css_classes: ['accent'],
        });

        const valueLabel = new Gtk.Label({
            label: defaultValue,
            // Remove css_classes for real-time updateable labels
            // css_classes: ['title-1'],
        });

        // Apply title-1 CSS manually to avoid GTK render cache issues
        valueLabel.add_css_class('title-1');

        const descLabel = new Gtk.Label({
            label: label,
            css_classes: ['caption'],
        });

        contentBox.append(icon);
        contentBox.append(valueLabel);
        contentBox.append(descLabel);

        card.append(contentBox);

        return { card, valueLabel, contentBox };
    }

    /**
     * Create earnings card with currency carousel
     */
    _createEarningsCard() {
        const card = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            css_classes: ['card'],
        });

        const contentBox = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 8,
            margin_top: 12,
            margin_bottom: 12,
            margin_start: 12,
            margin_end: 12,
        });

        // Currency carousel
        this.currencyCarousel = new Adw.Carousel({
            halign: Gtk.Align.CENTER,
            valign: Gtk.Align.CENTER,
            height_request: 80,
            allow_long_swipes: true,
            allow_scroll_wheel: false, // Disable built-in scroll, we'll handle it manually
        });

        // Add scroll event controller to card to change slides on scroll
        const scrollController = new Gtk.EventControllerScroll({
            flags: Gtk.EventControllerScrollFlags.VERTICAL | Gtk.EventControllerScrollFlags.DISCRETE,
        });

        // Track last scroll time to debounce
        let lastScrollTime = 0;

        scrollController.connect('scroll', (controller, dx, dy) => {
            const nPages = this.currencyCarousel.get_n_pages();

            if (nPages <= 1) return false;

            // Debounce: ignore if scrolled less than 300ms ago
            const now = Date.now();
            if (now - lastScrollTime < 300) {
                return true;
            }
            lastScrollTime = now;

            // Round to nearest page
            const currentPage = Math.round(this.currencyCarousel.get_position());

            if (dy > 0) {
                // Scroll down - next page
                const nextPage = (currentPage + 1) % nPages;
                this.currencyCarousel.scroll_to(this.currencyCarousel.get_nth_page(nextPage), true);
            } else if (dy < 0) {
                // Scroll up - previous page
                const prevPage = currentPage - 1 < 0 ? nPages - 1 : currentPage - 1;
                this.currencyCarousel.scroll_to(this.currencyCarousel.get_nth_page(prevPage), true);
            }

            return true; // Stop event propagation
        });

        card.add_controller(scrollController);

        // Auto-advance carousel every 10 seconds
        this._startCarouselAutoAdvance();

        const descLabel = new Gtk.Label({
            label: _('Total Earnings'),
            css_classes: ['caption'],
        });

        contentBox.append(this.currencyCarousel);
        contentBox.append(descLabel);

        card.append(contentBox);

        // Initialize with 0.00
        this._updateCurrencyCarousel(new Map());

        return card;
    }

    /**
     * Create recent tasks list
     */
    _createRecentTasksList() {
        const group = new Adw.PreferencesGroup({
            title: _('Recent Tasks'),
            description: _('Your most recent completed tasks'),
        });

        this.recentTasksList = new Gtk.ListBox({
            css_classes: ['boxed-list'],
            selection_mode: Gtk.SelectionMode.NONE,
        });

        // Empty state
        const emptyRow = new Adw.ActionRow({
            title: _('No tasks yet'),
            subtitle: _('Start tracking time to see your tasks here'),
            sensitive: false,
        });
        this.recentTasksList.append(emptyRow);

        group.add(this.recentTasksList);
        return group;
    }

    /**
     * Load reports data
     */
    async loadReports() {
        try {
            // Load all data from Core
            this.allTasks = await this.coreBridge.getAllTaskInstances() || [];
            this.allTimeEntries = await this.coreBridge.getAllTimeEntries() || [];
            this.allProjects = await this.coreBridge.getAllProjects() || [];
            this.allClients = await this.coreBridge.getAllClients() || [];

            // Initialize report exporter with current data
            this.reportExporter = new ReportExporter(this.allTasks, this.allProjects, this.allClients);

            // Update filters dropdowns
            this._updateFilterDropdowns();

            // Update all reports
            this._updateReports();
        } catch (error) {
            console.error('Error loading reports:', error);
        }
    }

    /**
     * Update filter dropdowns with projects and clients
     */
    _updateFilterDropdowns() {
        // Project filter
        const projectModel = new Gtk.StringList();
        projectModel.append(_('All Projects'));
        this.allProjects.forEach(project => {
            projectModel.append(project.name);
        });
        this.projectFilter.set_model(projectModel);

        this.projectFilter.connect('notify::selected', () => {
            const selected = this.projectFilter.get_selected();
            this.chartFilters.projectId = selected === 0 ? null : this.allProjects[selected - 1]?.id;
            this._updateReports();
        });

        // Client filter
        const clientModel = new Gtk.StringList();
        clientModel.append(_('All Clients'));
        this.allClients.forEach(client => {
            clientModel.append(client.name);
        });
        this.clientFilter.set_model(clientModel);

        this.clientFilter.connect('notify::selected', () => {
            const selected = this.clientFilter.get_selected();
            this.chartFilters.clientId = selected === 0 ? null : this.allClients[selected - 1]?.id;
            this._updateReports();
        });
    }

    /**
     * Update all report sections
     */
    async _updateReports() {
        const filteredTasks = this._getFilteredTasks();

        // Update statistics (async - calls Core)
        await this._updateStatistics(filteredTasks);

        // Update recent tasks list
        this._updateRecentTasksList(filteredTasks);

        // Update chart visualization
        this._updateChartVisualization();
    }

    /**
     * Update chart visualization with current data
     */
    _updateChartVisualization() {
        if (!this.chartContainer) return;

        // Clear chart container
        while (this.chartContainer.get_first_child()) {
            this.chartContainer.remove(this.chartContainer.get_first_child());
        }

        const filteredTasks = this._getFilteredTasks();

        if (filteredTasks.length === 0) {
            const emptyLabel = new Gtk.Label({
                label: _('📊 No data for selected period\nStart tracking time to see your chart'),
                css_classes: ['dim-label'],
                justify: Gtk.Justification.CENTER,
                halign: Gtk.Align.CENTER,
                valign: Gtk.Align.CENTER,
            });
            this.chartContainer.append(emptyLabel);
            return;
        }

        // Create simple bar chart visualization
        const chartData = this._prepareChartData(filteredTasks);
        this._renderSimpleChart(chartData);
    }

    /**
     * Parse end_time from database entry handling both ISO8601 and local format
     * @param {string} dateString - Date string from database
     * @returns {GLib.DateTime|null} Parsed date or null
     */
    _parseEndTime(dateString) {
        if (!dateString) return null;

        // Check if date is in ISO8601 format (with T) or local format (YYYY-MM-DD HH:MM:SS)
        if (dateString.includes('T')) {
            // ISO8601 format - parse as UTC
            return GLib.DateTime.new_from_iso8601(dateString, null);
        } else {
            // Local format YYYY-MM-DD HH:MM:SS - parse as local time
            const parts = dateString.split(' ');
            if (parts.length === 2) {
                const [datePart, timePart] = parts;
                const [year, month, day] = datePart.split('-').map(Number);
                const [hours, minutes, seconds] = timePart.split(':').map(Number);

                return GLib.DateTime.new_local(
                    year, month, day,
                    hours || 0, minutes || 0, seconds || 0
                );
            }
        }

        return null;
    }

    /**
     * Prepare chart data from filtered time entries
     */
    _prepareChartData(filteredTasks) {
        const now = GLib.DateTime.new_now_local();
        const dataMap = new Map();

        // Get all time entries for filtered tasks
        const taskIds = new Set(filteredTasks.map(t => t.id));
        const relevantEntries = (this.allTimeEntries || []).filter(entry =>
            taskIds.has(entry.task_instance_id)
        );

        if (this.chartFilters.period === 'week') {
            // For week view, create entries for all 7 days (Mon-Sun)
            const dayOfWeek = now.get_day_of_week(); // 1=Monday, 7=Sunday
            const daysToMonday = dayOfWeek - 1;
            const monday = now.add_days(-daysToMonday);

            // Initialize all days with 0
            const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
            for (let i = 0; i < 7; i++) {
                const day = monday.add_days(i);
                const key = `${day.get_year()}-${String(day.get_month()).padStart(2, '0')}-${String(day.get_day_of_month()).padStart(2, '0')}`;
                dataMap.set(key, {
                    label: dayNames[i],
                    hours: 0,
                    projectSegments: []
                });
            }

            // Track time by project for each day (using END TIME from database)
            relevantEntries.forEach(entry => {
                if (!entry.end_time || !entry.duration) return;

                const entryEndDate = this._parseEndTime(entry.end_time);
                if (!entryEndDate) return;

                const key = `${entryEndDate.get_year()}-${String(entryEndDate.get_month()).padStart(2, '0')}-${String(entryEndDate.get_day_of_month()).padStart(2, '0')}`;

                if (dataMap.has(key)) {
                    const dayData = dataMap.get(key);
                    const hours = (entry.duration || 0) / 3600;
                    dayData.hours += hours;

                    // Find task to get project_id
                    const task = filteredTasks.find(t => t.id === entry.task_instance_id);
                    if (task) {
                        const projectId = task.project_id || 1;

                        // Add or update project segment
                        let segment = dayData.projectSegments.find(s => s.projectId === projectId);
                        if (!segment) {
                            segment = { projectId, hours: 0 };
                            dayData.projectSegments.push(segment);
                        }
                        segment.hours += hours;
                    }
                }
            });

            // Sort project segments by hours (descending)
            dataMap.forEach(dayData => {
                dayData.projectSegments.sort((a, b) => b.hours - a.hours);
            });

            return Array.from(dataMap.values());
        } else if (this.chartFilters.period === 'month') {
            // For month view, group by last 4 weeks (KW)
            const today = new Date(now.get_year(), now.get_month() - 1, now.get_day_of_month());

            // Get last 4 weeks
            for (let week = 3; week >= 0; week--) {
                const weekStart = new Date(today);
                weekStart.setDate(today.getDate() - (week * 7 + 6));

                const weekStartGLib = GLib.DateTime.new_local(
                    weekStart.getFullYear(),
                    weekStart.getMonth() + 1,
                    weekStart.getDate(),
                    0, 0, 0
                );

                const germanWeekNumber = this._getWeekNumber(weekStartGLib);
                const key = `KW${germanWeekNumber}`;

                dataMap.set(key, {
                    label: key,
                    hours: 0,
                    projectSegments: [],
                    weekStart: weekStart,
                    weekEnd: new Date(weekStart.getTime() + 6 * 24 * 60 * 60 * 1000)
                });
            }

            // Add time entries to corresponding weeks (using END TIME from database)
            relevantEntries.forEach(entry => {
                if (!entry.end_time || !entry.duration) return;

                const entryEndDate = this._parseEndTime(entry.end_time);
                if (!entryEndDate) return;

                const entryJsDate = new Date(entryEndDate.get_year(), entryEndDate.get_month() - 1, entryEndDate.get_day_of_month());

                // Find which week this entry belongs to
                for (const [key, weekData] of dataMap) {
                    if (entryJsDate >= weekData.weekStart && entryJsDate <= weekData.weekEnd) {
                        const hours = (entry.duration || 0) / 3600;
                        weekData.hours += hours;

                        const task = filteredTasks.find(t => t.id === entry.task_instance_id);
                        if (task) {
                            const projectId = task.project_id || 1;
                            let segment = weekData.projectSegments.find(s => s.projectId === projectId);
                            if (!segment) {
                                segment = { projectId, hours: 0 };
                                weekData.projectSegments.push(segment);
                            }
                            segment.hours += hours;
                        }
                        break;
                    }
                }
            });

            // Sort project segments
            dataMap.forEach(weekData => {
                weekData.projectSegments.sort((a, b) => b.hours - a.hours);
            });

            return Array.from(dataMap.values());
        } else if (this.chartFilters.period === 'year') {
            // For year view, group by last 12 months
            const months = ['Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct'];

            // Initialize last 12 months
            for (let i = 11; i >= 0; i--) {
                const monthDate = GLib.DateTime.new_local(
                    now.get_year(),
                    now.get_month(),
                    1, 0, 0, 0
                ).add_months(-i);

                const monthName = months[monthDate.get_month() - 1];
                const key = `${monthDate.get_year()}-${String(monthDate.get_month()).padStart(2, '0')}`;

                dataMap.set(key, {
                    label: monthName,
                    hours: 0,
                    projectSegments: [],
                    year: monthDate.get_year(),
                    month: monthDate.get_month()
                });
            }

            // Add time entries to corresponding months (using END TIME from database)
            relevantEntries.forEach(entry => {
                if (!entry.end_time || !entry.duration) return;

                const entryEndDate = this._parseEndTime(entry.end_time);
                if (!entryEndDate) return;

                const key = `${entryEndDate.get_year()}-${String(entryEndDate.get_month()).padStart(2, '0')}`;

                if (dataMap.has(key)) {
                    const monthData = dataMap.get(key);
                    const hours = (entry.duration || 0) / 3600;
                    monthData.hours += hours;

                    const task = filteredTasks.find(t => t.id === entry.task_instance_id);
                    if (task) {
                        const projectId = task.project_id || 1;
                        let segment = monthData.projectSegments.find(s => s.projectId === projectId);
                        if (!segment) {
                            segment = { projectId, hours: 0 };
                            monthData.projectSegments.push(segment);
                        }
                        segment.hours += hours;
                    }
                }
            });

            // Sort project segments
            dataMap.forEach(monthData => {
                monthData.projectSegments.sort((a, b) => b.hours - a.hours);
            });

            return Array.from(dataMap.values());
        } else if (this.chartFilters.period === 'custom') {
            // For custom range, determine grouping based on range length
            if (!this.chartFilters.customDateRange) {
                return [];
            }

            const fromDate = this.chartFilters.customDateRange.fromDate;
            const toDate = this.chartFilters.customDateRange.toDate;

            // Calculate days in range
            const daysDiff = Math.floor((toDate.to_unix() - fromDate.to_unix()) / (24 * 60 * 60));

            if (daysDiff < 14) {
                // Group by days
                return this._prepareCustomByDays(relevantEntries, filteredTasks, fromDate, toDate);
            } else if (daysDiff <= 90) {
                // Group by weeks
                return this._prepareCustomByWeeks(relevantEntries, filteredTasks, fromDate, toDate);
            } else {
                // Group by months
                return this._prepareCustomByMonths(relevantEntries, filteredTasks, fromDate, toDate);
            }
        }

        return [];
    }

    /**
     * Get week number from GLib.DateTime
     */
    _getWeekNumber(dateTime) {
        const year = dateTime.get_year();
        const month = dateTime.get_month();
        const day = dateTime.get_day_of_month();

        const date = new Date(year, month - 1, day);
        const firstDay = new Date(date.getFullYear(), 0, 1);
        const days = Math.floor((date - firstDay) / (24 * 60 * 60 * 1000));
        return Math.ceil((days + firstDay.getDay() + 1) / 7);
    }

    /**
     * Prepare custom range data grouped by days (< 14 days)
     */
    _prepareCustomByDays(entries, filteredTasks, fromDate, toDate) {
        const dataMap = new Map();

        // Initialize all days in range
        let currentDate = fromDate;
        while (currentDate.to_unix() <= toDate.to_unix()) {
            const month = currentDate.get_month();
            const day = currentDate.get_day_of_month();
            const label = `${month}/${day}`;
            const key = `${currentDate.get_year()}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

            dataMap.set(key, {
                label: label,
                hours: 0,
                projectSegments: []
            });

            currentDate = currentDate.add_days(1);
        }

        // Add time entries (using END TIME from database)
        entries.forEach(entry => {
            if (!entry.end_time || !entry.duration) return;

            const entryEndDate = this._parseEndTime(entry.end_time);
            if (!entryEndDate) return;

            const key = `${entryEndDate.get_year()}-${String(entryEndDate.get_month()).padStart(2, '0')}-${String(entryEndDate.get_day_of_month()).padStart(2, '0')}`;

            if (dataMap.has(key)) {
                const dayData = dataMap.get(key);
                const hours = (entry.duration || 0) / 3600;
                dayData.hours += hours;

                const task = filteredTasks.find(t => t.id === entry.task_instance_id);
                if (task) {
                    const projectId = task.project_id || 1;
                    let segment = dayData.projectSegments.find(s => s.projectId === projectId);
                    if (!segment) {
                        segment = { projectId, hours: 0 };
                        dayData.projectSegments.push(segment);
                    }
                    segment.hours += hours;
                }
            }
        });

        // Sort project segments
        dataMap.forEach(dayData => {
            dayData.projectSegments.sort((a, b) => b.hours - a.hours);
        });

        return Array.from(dataMap.values());
    }

    /**
     * Prepare custom range data grouped by weeks (14-90 days)
     */
    _prepareCustomByWeeks(entries, filteredTasks, fromDate, toDate) {
        const dataMap = new Map();
        const weeks = [];

        // Find all weeks in range
        let currentDate = fromDate;
        while (currentDate.to_unix() <= toDate.to_unix()) {
            const weekNum = this._getWeekNumber(currentDate);
            const key = `KW${weekNum}`;

            if (!dataMap.has(key)) {
                // Find Monday of this week
                const dayOfWeek = currentDate.get_day_of_week(); // 1=Monday
                const daysToMonday = dayOfWeek - 1;
                const monday = currentDate.add_days(-daysToMonday);
                const sunday = monday.add_days(6);

                dataMap.set(key, {
                    label: key,
                    hours: 0,
                    projectSegments: [],
                    weekStart: monday,
                    weekEnd: sunday
                });

                weeks.push(key);
            }

            currentDate = currentDate.add_days(1);
        }

        // Add time entries (using END TIME from database)
        entries.forEach(entry => {
            if (!entry.end_time || !entry.duration) return;

            const entryEndDate = this._parseEndTime(entry.end_time);
            if (!entryEndDate) return;

            const weekNum = this._getWeekNumber(entryEndDate);
            const key = `KW${weekNum}`;

            if (dataMap.has(key)) {
                const weekData = dataMap.get(key);
                const hours = (entry.duration || 0) / 3600;
                weekData.hours += hours;

                const task = filteredTasks.find(t => t.id === entry.task_instance_id);
                if (task) {
                    const projectId = task.project_id || 1;
                    let segment = weekData.projectSegments.find(s => s.projectId === projectId);
                    if (!segment) {
                        segment = { projectId, hours: 0 };
                        weekData.projectSegments.push(segment);
                    }
                    segment.hours += hours;
                }
            }
        });

        // Sort project segments
        dataMap.forEach(weekData => {
            weekData.projectSegments.sort((a, b) => b.hours - a.hours);
        });

        return Array.from(dataMap.values());
    }

    /**
     * Prepare custom range data grouped by months (> 90 days)
     */
    _prepareCustomByMonths(entries, filteredTasks, fromDate, toDate) {
        const dataMap = new Map();
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

        // Find all months in range
        let currentDate = GLib.DateTime.new_local(
            fromDate.get_year(),
            fromDate.get_month(),
            1, 0, 0, 0
        );

        while (currentDate.to_unix() <= toDate.to_unix()) {
            const monthName = months[currentDate.get_month() - 1];
            const key = `${currentDate.get_year()}-${String(currentDate.get_month()).padStart(2, '0')}`;

            if (!dataMap.has(key)) {
                dataMap.set(key, {
                    label: monthName,
                    hours: 0,
                    projectSegments: [],
                    year: currentDate.get_year(),
                    month: currentDate.get_month()
                });
            }

            currentDate = currentDate.add_months(1);
        }

        // Add time entries (using END TIME from database)
        entries.forEach(entry => {
            if (!entry.end_time || !entry.duration) return;

            const entryEndDate = this._parseEndTime(entry.end_time);
            if (!entryEndDate) return;

            const key = `${entryEndDate.get_year()}-${String(entryEndDate.get_month()).padStart(2, '0')}`;

            if (dataMap.has(key)) {
                const monthData = dataMap.get(key);
                const hours = (entry.duration || 0) / 3600;
                monthData.hours += hours;

                const task = filteredTasks.find(t => t.id === entry.task_instance_id);
                if (task) {
                    const projectId = task.project_id || 1;
                    let segment = monthData.projectSegments.find(s => s.projectId === projectId);
                    if (!segment) {
                        segment = { projectId, hours: 0 };
                        monthData.projectSegments.push(segment);
                    }
                    segment.hours += hours;
                }
            }
        });

        // Sort project segments
        dataMap.forEach(monthData => {
            monthData.projectSegments.sort((a, b) => b.hours - a.hours);
        });

        return Array.from(dataMap.values());
    }

    /**
     * Render simple bar chart
     */
    _renderSimpleChart(chartData) {
        if (chartData.length === 0) return;

        const chartBox = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 12,
            margin_top: 12,
            margin_bottom: 12,
        });

        // Chart title with period-specific formatting
        let titleText = _('📊 Weekly Activity');
        if (this.chartFilters.period === 'week') {
            const now = GLib.DateTime.new_now_local();
            const weekNum = this._getWeekNumber(now);
            titleText = `📊 ${_('Weekly Activity')} (KW ${weekNum})`;
        } else if (this.chartFilters.period === 'month') {
            titleText = _('📊 Monthly Activity (4 weeks)');
        } else if (this.chartFilters.period === 'year') {
            titleText = _('📊 Yearly Activity (12 months)');
        } else if (this.chartFilters.period === 'custom' && this.chartFilters.customDateRange) {
            const fromDate = this.chartFilters.customDateRange.fromDate;
            const toDate = this.chartFilters.customDateRange.toDate;

            // Format dates as "Oct 1" or "Dec 1"
            const fromMonth = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][fromDate.get_month() - 1];
            const toMonth = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][toDate.get_month() - 1];

            const fromStr = `${fromMonth} ${fromDate.get_day_of_month()}`;
            const toStr = `${toMonth} ${toDate.get_day_of_month()}`;

            titleText = `📊 Custom Range (${fromStr} - ${toStr})`;
        }

        const titleLabel = new Gtk.Label({
            label: titleText,
            css_classes: ['title-4'],
            halign: Gtk.Align.CENTER,
            margin_bottom: 8,
        });
        chartBox.append(titleLabel);

        // Find max hours for scaling
        const maxHours = Math.max(...chartData.map(d => d.hours), 1);

        // Calculate total hours for display
        const totalHours = chartData.reduce((sum, d) => sum + d.hours, 0);

        // Calculate chart dimensions
        const minBarWidth = 48; // 40px bar + 8px spacing
        const calculatedWidth = chartData.length * minBarWidth;
        const maxWidthForCentering = 400; // Maximum width before switching to scrollable mode

        // Create horizontal bar chart container
        const barsContainer = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 8,
            height_request: 120,
        });

        // Create vertical bars for each day
        chartData.forEach(dayData => {
            const barContainer = new Gtk.Box({
                orientation: Gtk.Orientation.VERTICAL,
                spacing: 4,
                width_request: 40,
            });

            // Bar box with fixed height
            const barBox = new Gtk.Box({
                width_request: 24,
                height_request: 80,
                halign: Gtk.Align.CENTER,
                valign: Gtk.Align.END,
            });

            if (dayData.projectSegments && dayData.projectSegments.length > 0) {
                // Create stacked bar with project colors
                const totalBarHeight = Math.max((dayData.hours / maxHours) * 80, 2);

                const stackedBar = new Gtk.Box({
                    orientation: Gtk.Orientation.VERTICAL,
                    width_request: 24,
                    height_request: totalBarHeight,
                    halign: Gtk.Align.CENTER,
                    valign: Gtk.Align.END,
                    css_classes: ['chart-bar-stack'],
                });

                // Reverse segments for bottom-to-top stacking
                const reversedSegments = [...dayData.projectSegments].reverse();

                reversedSegments.forEach((segment, index) => {
                    if (segment.hours > 0) {
                        const segmentHeight = (segment.hours / dayData.hours) * totalBarHeight;

                        const segmentBar = new Gtk.Box({
                            width_request: 24,
                            height_request: segmentHeight,
                            halign: Gtk.Align.FILL,
                            valign: Gtk.Align.FILL,
                        });

                        // Get project color
                        const project = this.allProjects.find(p => p.id === segment.projectId);
                        const projectColor = project ? project.color : '#9a9996';

                        // Apply inline CSS for color with border-radius
                        const isFirst = index === 0;
                        const isLast = index === reversedSegments.length - 1;
                        const borderRadius = isFirst && isLast ? '4px' :
                                           isFirst ? '4px 4px 0 0' :
                                           isLast ? '0 0 4px 4px' : '0';

                        const provider = new Gtk.CssProvider();
                        provider.load_from_data(`* {
                            background: ${projectColor};
                            border-radius: ${borderRadius};
                            ${index > 0 ? 'border-top: 1px solid rgba(255,255,255,0.3);' : ''}
                        }`, -1);
                        segmentBar.get_style_context().add_provider(provider, Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION);

                        stackedBar.append(segmentBar);
                    }
                });

                // Add overflow hidden CSS
                const stackProvider = new Gtk.CssProvider();
                stackProvider.load_from_data(`.chart-bar-stack { overflow: hidden; }`, -1);
                stackedBar.get_style_context().add_provider(stackProvider, Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION);

                barBox.append(stackedBar);
            } else {
                // Empty day - show gray placeholder
                const emptyBar = new Gtk.Box({
                    width_request: 24,
                    height_request: 2,
                    halign: Gtk.Align.CENTER,
                    valign: Gtk.Align.END,
                });

                const emptyProvider = new Gtk.CssProvider();
                emptyProvider.load_from_data(`* { background: #deddda; border-radius: 2px; }`, -1);
                emptyBar.get_style_context().add_provider(emptyProvider, Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION);

                barBox.append(emptyBar);
            }

            barContainer.append(barBox);

            // Day label
            const periodLabel = new Gtk.Label({
                label: dayData.label,
                css_classes: ['caption'],
                halign: Gtk.Align.CENTER,
            });
            barContainer.append(periodLabel);

            // Hours label
            const hoursLabel = new Gtk.Label({
                label: dayData.hours > 0 ? `${dayData.hours.toFixed(1)}h` : '0h',
                css_classes: ['caption', 'dim-label'],
                halign: Gtk.Align.CENTER,
            });
            barContainer.append(hoursLabel);

            barsContainer.append(barContainer);
        });

        // Wrap bars in scrolled window if needed
        const centeringContainer = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            halign: Gtk.Align.CENTER,
            valign: Gtk.Align.CENTER,
            hexpand: true,
        });

        if (calculatedWidth <= maxWidthForCentering) {
            // Few elements - simple centered layout
            barsContainer.set_halign(Gtk.Align.CENTER);
            centeringContainer.append(barsContainer);
        } else {
            // Many elements - use scrollable container with dragging
            const maxScrollWidth = Math.min(calculatedWidth, 600); // Max 600px or content width

            const scrolledWindow = new Gtk.ScrolledWindow({
                hscrollbar_policy: Gtk.PolicyType.AUTOMATIC,
                vscrollbar_policy: Gtk.PolicyType.NEVER,
                height_request: 140, // Slightly larger to accommodate scrollbar
                width_request: maxScrollWidth,
                kinetic_scrolling: true, // Enable smooth kinetic scrolling/dragging
                overlay_scrolling: true,  // Use overlay scrollbars for cleaner look
            });

            barsContainer.set_halign(Gtk.Align.START);
            barsContainer.set_size_request(calculatedWidth, -1);

            scrolledWindow.set_child(barsContainer);

            // Add touch/drag gesture support for better dragging experience
            const dragGesture = new Gtk.GestureDrag();
            dragGesture.set_button(1); // Primary mouse button

            let startScrollX = 0;
            let startDragX = 0;

            dragGesture.connect('drag-begin', (gesture, startX, startY) => {
                const adjustment = scrolledWindow.get_hadjustment();
                startScrollX = adjustment.get_value();
                startDragX = startX;
            });

            dragGesture.connect('drag-update', (gesture, offsetX, offsetY) => {
                const adjustment = scrolledWindow.get_hadjustment();
                const newValue = startScrollX - offsetX;
                adjustment.set_value(Math.max(0, Math.min(newValue, adjustment.get_upper() - adjustment.get_page_size())));
            });

            scrolledWindow.add_controller(dragGesture);
            centeringContainer.append(scrolledWindow);
        }

        chartBox.append(centeringContainer);

        // Total time summary with period-specific text
        let summaryText = `Total: ${totalHours.toFixed(1)} hours`;
        if (this.chartFilters.period === 'week') {
            const weekNum = this._getWeekNumber(GLib.DateTime.new_now_local());
            summaryText = `Total: ${totalHours.toFixed(1)} hours in KW ${weekNum}`;
        } else if (this.chartFilters.period === 'month') {
            summaryText = `Total: ${totalHours.toFixed(1)} hours in last 4 weeks`;
        } else if (this.chartFilters.period === 'year') {
            summaryText = `Total: ${totalHours.toFixed(1)} hours this year`;
        } else if (this.chartFilters.period === 'custom' && this.chartFilters.customDateRange) {
            const fromDate = this.chartFilters.customDateRange.fromDate;
            const toDate = this.chartFilters.customDateRange.toDate;

            const fromMonth = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][fromDate.get_month() - 1];
            const toMonth = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][toDate.get_month() - 1];

            const fromStr = `${fromMonth} ${fromDate.get_day_of_month()}`;
            const toStr = `${toMonth} ${toDate.get_day_of_month()}`;

            summaryText = `Total: ${totalHours.toFixed(1)} hours (${fromStr} - ${toStr})`;
        }

        const summaryLabel = new Gtk.Label({
            label: summaryText,
            css_classes: ['caption'],
            halign: Gtk.Align.CENTER,
            margin_top: 8,
        });
        chartBox.append(summaryLabel);

        this.chartContainer.append(chartBox);
    }

    /**
     * Get filtered tasks based on current filters
     */
    _getFilteredTasks() {
        let filtered = [...this.allTasks];

        // Filter by project
        if (this.chartFilters.projectId) {
            filtered = filtered.filter(t => t.project_id === this.chartFilters.projectId);
        }

        // Filter by client
        if (this.chartFilters.clientId) {
            filtered = filtered.filter(t => t.client_id === this.chartFilters.clientId);
        }

        // Filter by period
        filtered = this._filterByPeriod(filtered, this.chartFilters.period);

        return filtered;
    }

    /**
     * Filter tasks by time period
     */
    _filterByPeriod(tasks, period) {
        const now = GLib.DateTime.new_now_local();

        let startDate, endDate;
        switch (period) {
            case 'week': {
                // Current week (Monday to Sunday)
                const dayOfWeek = now.get_day_of_week(); // 1=Monday
                const daysToMonday = dayOfWeek - 1;
                const monday = now.add_days(-daysToMonday);
                startDate = GLib.DateTime.new_local(
                    monday.get_year(),
                    monday.get_month(),
                    monday.get_day_of_month(),
                    0, 0, 0
                );
                const sunday = monday.add_days(6);
                endDate = GLib.DateTime.new_local(
                    sunday.get_year(),
                    sunday.get_month(),
                    sunday.get_day_of_month(),
                    23, 59, 59
                );
                break;
            }
            case 'month': {
                // Last 4 weeks
                startDate = now.add_days(-28);
                startDate = GLib.DateTime.new_local(
                    startDate.get_year(),
                    startDate.get_month(),
                    startDate.get_day_of_month(),
                    0, 0, 0
                );
                endDate = now;
                break;
            }
            case 'year': {
                // Last 12 months
                startDate = now.add_months(-12);
                startDate = GLib.DateTime.new_local(
                    startDate.get_year(),
                    startDate.get_month(),
                    startDate.get_day_of_month(),
                    0, 0, 0
                );
                endDate = now;
                break;
            }
            case 'custom': {
                // Use custom date range
                if (!this.chartFilters.customDateRange) {
                    return tasks;
                }
                startDate = this.chartFilters.customDateRange.fromDate;
                endDate = this.chartFilters.customDateRange.toDate;
                break;
            }
            default:
                return tasks;
        }

        const startTimestamp = startDate.to_unix();
        const endTimestamp = endDate ? endDate.to_unix() : null;

        return tasks.filter(task => {
            if (!task.last_used_at) return false;

            let dateString = task.last_used_at;
            if (!dateString.endsWith('Z') && !dateString.includes('+')) {
                dateString = dateString + 'Z';
            }

            const taskDate = GLib.DateTime.new_from_iso8601(dateString, null);
            if (!taskDate) return false;

            const taskTimestamp = taskDate.to_unix();
            if (endTimestamp) {
                return taskTimestamp >= startTimestamp && taskTimestamp <= endTimestamp;
            }
            return taskTimestamp >= startTimestamp;
        });
    }

    /**
     * Update custom date button labels
     */
    _updateCustomDateButtons() {
        if (!this.chartFilters.customDateRange) return;

        const fromDate = this.chartFilters.customDateRange.fromDate;
        const toDate = this.chartFilters.customDateRange.toDate;

        // Format dates as "Dec 1, 2024"
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

        const fromStr = `${months[fromDate.get_month() - 1]} ${fromDate.get_day_of_month()}, ${fromDate.get_year()}`;
        const toStr = `${months[toDate.get_month() - 1]} ${toDate.get_day_of_month()}, ${toDate.get_year()}`;

        this.startDateButton.set_label(fromStr);
        this.endDateButton.set_label(toStr);
    }

    /**
     * Show date picker dialog for start or end date
     */
    _showDatePickerDialog(isStartDate) {
        const dialog = new Adw.AlertDialog({
            heading: isStartDate ? _('Select Start Date') : _('Select End Date'),
        });

        const content = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 12,
            margin_top: 12,
            margin_bottom: 12,
            margin_start: 12,
            margin_end: 12,
        });

        // Get current date or default
        let currentDate;
        if (this.chartFilters.customDateRange) {
            currentDate = isStartDate ? this.chartFilters.customDateRange.fromDate : this.chartFilters.customDateRange.toDate;
        } else {
            currentDate = GLib.DateTime.new_now_local();
        }

        const calendar = new Gtk.Calendar({
            day: currentDate.get_day_of_month(),
            month: currentDate.get_month() - 1,
            year: currentDate.get_year(),
        });

        content.append(calendar);

        dialog.set_extra_child(content);
        dialog.add_response('cancel', _('Cancel'));
        dialog.add_response('apply', _('Apply'));
        dialog.set_response_appearance('apply', Adw.ResponseAppearance.SUGGESTED);

        dialog.connect('response', (dlg, response) => {
            if (response === 'apply') {
                const gDate = calendar.get_date();

                const selectedDate = GLib.DateTime.new_local(
                    gDate.get_year(),
                    gDate.get_month(),
                    gDate.get_day_of_month(),
                    isStartDate ? 0 : 23,
                    isStartDate ? 0 : 59,
                    isStartDate ? 0 : 59
                );

                // Initialize range if not exists
                if (!this.chartFilters.customDateRange) {
                    const now = GLib.DateTime.new_now_local();
                    this.chartFilters.customDateRange = {
                        fromDate: isStartDate ? selectedDate : now.add_days(-30),
                        toDate: isStartDate ? now : selectedDate
                    };
                } else {
                    // Update selected date
                    if (isStartDate) {
                        this.chartFilters.customDateRange.fromDate = selectedDate;
                    } else {
                        this.chartFilters.customDateRange.toDate = selectedDate;
                    }
                }

                this._updateCustomDateButtons();
                this._updateReports();
            }
            dlg.close();
        });

        dialog.present(this.parentWindow);
    }

    /**
     * Update statistics cards
     */
    async _updateStatistics(tasks) {
        // Get date range for current filter period
        const now = GLib.DateTime.new_now_local();
        let startDate, endDate;

        switch (this.chartFilters.period) {
            case 'week': {
                const dayOfWeek = now.get_day_of_week();
                const daysToMonday = dayOfWeek - 1;
                const monday = now.add_days(-daysToMonday);
                startDate = GLib.DateTime.new_local(
                    monday.get_year(),
                    monday.get_month(),
                    monday.get_day_of_month(),
                    0, 0, 0
                );
                const sunday = monday.add_days(6);
                endDate = GLib.DateTime.new_local(
                    sunday.get_year(),
                    sunday.get_month(),
                    sunday.get_day_of_month(),
                    23, 59, 59
                );
                break;
            }
            case 'month': {
                startDate = now.add_days(-28);
                startDate = GLib.DateTime.new_local(
                    startDate.get_year(),
                    startDate.get_month(),
                    startDate.get_day_of_month(),
                    0, 0, 0
                );
                endDate = now;
                break;
            }
            case 'year': {
                startDate = now.add_months(-12);
                startDate = GLib.DateTime.new_local(
                    startDate.get_year(),
                    startDate.get_month(),
                    startDate.get_day_of_month(),
                    0, 0, 0
                );
                endDate = now;
                break;
            }
            case 'custom': {
                if (this.chartFilters.customDateRange) {
                    startDate = this.chartFilters.customDateRange.fromDate;
                    endDate = this.chartFilters.customDateRange.toDate;
                }
                break;
            }
        }

        if (!startDate || !endDate) {
            // Fallback to simple calculation if no date range
            this.totalTimeLabel.set_label('00:00:00');
            this.activeProjectsLabel.set_label('0');
            this.trackedTasksLabel.set_label('0');
            this._updateCurrencyCarousel(new Map());
            return;
        }

        // Store current date range for real-time updates
        this._currentDateRange = { startDate, endDate };
        this._currentTaskInstanceIds = null;

        // Only pass task IDs if we're filtering by project or client
        // Don't filter by task IDs when only filtering by date, because
        // we want ALL time entries in that date range, not just entries
        // from tasks that have last_used_at in that range
        if (this.chartFilters.projectId || this.chartFilters.clientId) {
            // When filtering by project/client, we need to pass the filtered task IDs
            this._currentTaskInstanceIds = tasks.map(t => t.id);
        }

        // Get statistics from Core (business logic)
        const stats = await this.coreBridge.getStatsForPeriod(
            this._currentDateRange,
            this._currentTaskInstanceIds
        );

        // Update UI labels
        this.totalTimeLabel.set_label(this._formatDuration(stats.totalTime));
        this.activeProjectsLabel.set_label(stats.activeProjects.toString());
        this.trackedTasksLabel.set_label(stats.trackedTasks.toString());

        // Update currency carousel
        this._updateCurrencyCarousel(stats.earningsByCurrency);
    }

    /**
     * Update statistics in real-time (without full reload)
     * Called every second while tracking is active
     */
    async _updateStatisticsRealtime() {
        console.log('[ReportsPage] _updateStatisticsRealtime called');

        if (!this.coreBridge) {
            console.log('[ReportsPage] No coreBridge');
            return;
        }

        const trackingState = this.coreBridge.getTrackingState();
        console.log('[ReportsPage] Tracking state:', trackingState);

        if (!trackingState.isTracking) {
            console.log('[ReportsPage] Not tracking');
            return;
        }

        // Need date range from last full update
        if (!this._currentDateRange) {
            console.log('[ReportsPage] No current date range');
            return;
        }

        try {
            // Get statistics from Core
            const stats = await this.coreBridge.getStatsForPeriod(
                this._currentDateRange,
                this._currentTaskInstanceIds
            );

            console.log('[ReportsPage] Stats from Core:', stats);

            // Add current elapsed time to total
            const currentElapsed = trackingState.elapsedSeconds || 0;
            const totalTime = stats.totalTime + currentElapsed;

            console.log('[ReportsPage] Updating Total Time:', totalTime, 'formatted:', this._formatDuration(totalTime));

            // Update only Total Time label (other stats don't change in real-time)
            this.totalTimeLabel.set_label(this._formatDuration(totalTime));
        } catch (error) {
            console.error('[ReportsPage] Error updating statistics realtime:', error);
        }
    }

    /**
     * Start carousel auto-advance timer (every 5 seconds)
     */
    _startCarouselAutoAdvance() {
        // Clear existing timer if any
        if (this._carouselTimerId) {
            GLib.source_remove(this._carouselTimerId);
        }

        // Auto-advance every 5 seconds
        this._carouselTimerId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 5, () => {
            if (!this.currencyCarousel) return GLib.SOURCE_REMOVE;

            const nPages = this.currencyCarousel.get_n_pages();
            if (nPages <= 1) return GLib.SOURCE_CONTINUE;

            const currentPage = Math.floor(this.currencyCarousel.get_position());
            const nextPage = (currentPage + 1) % nPages;

            this.currencyCarousel.scroll_to(this.currencyCarousel.get_nth_page(nextPage), true);

            return GLib.SOURCE_CONTINUE;
        });
    }

    /**
     * Update currency carousel with earnings
     */
    _updateCurrencyCarousel(currencyTotals) {
        // Clear existing carousel content
        while (this.currencyCarousel.get_first_child()) {
            this.currencyCarousel.remove(this.currencyCarousel.get_first_child());
        }

        if (currencyTotals.size === 0) {
            // Show 0.00 if no earnings
            const zeroBox = this._createCurrencyBox('0.00', 'USD');
            this.currencyCarousel.append(zeroBox);
        } else {
            // Add a page for each currency
            for (const [currency, amount] of currencyTotals) {
                const formattedAmount = amount.toFixed(2);
                const currencyBox = this._createCurrencyBox(formattedAmount, currency);
                this.currencyCarousel.append(currencyBox);
            }
        }
    }

    /**
     * Create currency display box for carousel
     */
    _createCurrencyBox(amount, currency) {
        const box = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 4,
            halign: Gtk.Align.CENTER,
            valign: Gtk.Align.CENTER,
        });

        const currencySymbol = getCurrencySymbol(currency);
        const symbolLabel = new Gtk.Label({
            label: currencySymbol,
            css_classes: ['title-1', 'accent'],
        });

        const amountLabel = new Gtk.Label({
            label: amount,
            css_classes: ['title-1'],
        });

        const currencyLabel = new Gtk.Label({
            label: currency,
            css_classes: ['caption'],
        });

        box.append(symbolLabel);
        box.append(amountLabel);
        box.append(currencyLabel);

        return box;
    }

    /**
     * Update recent tasks list
     */
    _updateRecentTasksList(tasks) {
        // Clear existing list
        let child = this.recentTasksList.get_first_child();
        while (child) {
            const next = child.get_next_sibling();
            this.recentTasksList.remove(child);
            child = next;
        }

        if (tasks.length === 0) {
            const emptyRow = new Adw.ActionRow({
                title: _('No tasks found'),
                subtitle: _('Try adjusting your filters'),
                sensitive: false,
            });
            this.recentTasksList.append(emptyRow);
            return;
        }

        // Sort by last_used_at descending
        const sortedTasks = [...tasks].sort((a, b) => {
            if (!a.last_used_at) return 1;
            if (!b.last_used_at) return -1;
            return b.last_used_at.localeCompare(a.last_used_at);
        });

        // Show top 10 recent tasks
        const recentTasks = sortedTasks.slice(0, 10);

        recentTasks.forEach(task => {
            const row = new Adw.ActionRow({
                title: task.task_name || _('Unnamed Task'),
                use_markup: true,
            });

            // Subtitle: colored dot + project + client + date
            const projectColor = task.project_color || '#9a9996';
            const subtitleParts = [];

            // Add colored dot before project name
            if (task.project_name) {
                subtitleParts.push(`<span foreground="${projectColor}">●</span> ${task.project_name}`);
            }
            if (task.client_name) subtitleParts.push(task.client_name);
            if (task.last_used_at) {
                const date = this._formatDate(task.last_used_at);
                subtitleParts.push(date);
            }
            row.set_subtitle(subtitleParts.join(' • '));

            // Time suffix
            const timeLabel = new Gtk.Label({
                label: this._formatDuration(task.total_time || 0),
                css_classes: ['dim-label'],
                valign: Gtk.Align.CENTER,
            });
            row.add_suffix(timeLabel);

            this.recentTasksList.append(row);
        });
    }

    /**
     * Format duration as HH:MM:SS
     */
    _formatDuration(seconds) {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;
        return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }

    /**
     * Format date as DD.MM.YYYY
     */
    _formatDate(dateStr) {
        if (!dateStr) return '';

        let cleanDateStr = dateStr;
        if (!cleanDateStr.endsWith('Z') && !cleanDateStr.includes('+')) {
            cleanDateStr = cleanDateStr + 'Z';
        }

        const date = GLib.DateTime.new_from_iso8601(cleanDateStr, null);
        if (!date) return dateStr;

        const day = String(date.get_day_of_month()).padStart(2, '0');
        const month = String(date.get_month()).padStart(2, '0');
        const year = date.get_year();

        return `${day}.${month}.${year}`;
    }

    /**
     * Convert task instances to old format for PDF export
     * Old format: { start, duration, task_name, project_id, client_id }
     * Each TaskInstance (stack) = 1 task unit
     */
    _prepareExportData() {
        const exportTasks = [];

        // Convert each task instance to old task format
        (this.allTasks || []).forEach(taskInstance => {
            if (!taskInstance.last_used_at) return;

            exportTasks.push({
                start: taskInstance.last_used_at,
                duration: taskInstance.total_time || 0,
                task_name: taskInstance.task_name || 'Unnamed Task',
                project_id: taskInstance.project_id || 1,
                client_id: taskInstance.client_id || 1,
                id: taskInstance.id,
                task_instance_id: taskInstance.id
            });
        });

        return exportTasks;
    }

    /**
     * Export PDF report
     */
    async _exportPDF() {
        if (!this.reportExporter) {
            console.error('Report exporter not initialized');
            return;
        }

        try {
            // Convert data to old format for PDF export
            const exportTasks = this._prepareExportData();

            // Update report exporter with converted data
            this.reportExporter.tasks = exportTasks;
            this.reportExporter.projects = this.allProjects;
            this.reportExporter.clients = this.allClients;

            // Open PDF export preferences dialog (correct order: parentWindow, reportExporter)
            const prefsDialog = new PDFExportPreferencesDialog(this.parentWindow, this.reportExporter);
            prefsDialog.present(this.parentWindow);

        } catch (error) {
            console.error('Error exporting PDF:', error);
            if (this.parentWindow && this.parentWindow.showToast) {
                this.parentWindow.showToast(_('PDF export failed'));
            }
        }
    }

    /**
     * Refresh page
     */
    async refresh() {
        await this.loadReports();
    }

    /**
     * Update only the chart and statistics without full reload
     * Used for real-time updates when tracking
     */
    async updateChartsOnly() {
        try {
            // Reload only time entries and task instances
            this.allTasks = await this.coreBridge.getAllTaskInstances() || [];
            this.allTimeEntries = await this.coreBridge.getAllTimeEntries() || [];

            // Update all reports
            this._updateReports();
        } catch (error) {
            console.error('Error updating charts:', error);
        }
    }
}
