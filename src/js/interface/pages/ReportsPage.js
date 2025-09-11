import Gtk from 'gi://Gtk';
import { Button } from '../components/primitive/Button.js';
import { Label } from '../components/primitive/Label.js';

/**
 * Reports management page - extracted from window.js
 * Handles all report-related functionality
 */
export class ReportsPage {
    constructor(config = {}) {
        this.config = {
            title: 'Reports',
            subtitle: 'View statistics and export reports',
            showTrackingWidget: true,
            actions: [
                {
                    icon: 'document-save-symbolic',
                    tooltip: 'Export PDF Report',
                    cssClasses: ['suggested-action'],
                    onClick: (page) => page.exportPDFReport()
                }
            ],
            ...config
        };

        // Base page properties
        this.app = config.app;
        this.parentWindow = config.parentWindow;
        this.isLoading = false;
        this.currentPage = 0;
        this.itemsPerPage = 10;
        
        // Report-specific state
        this.reportData = null;
        this.chartFilters = {
            period: 'week',
            project: null,
            client: null
        };
        
        // Get managers from parent window
        this.reportExporter = config.reportExporter;
        this.simpleChart = config.simpleChart;
        this.timeUtils = config.timeUtils;
        
        // Create the main widget
        this.widget = this._createMainContent();
    }

    /**
     * Get the main widget for this page
     */
    getWidget() {
        return this.widget;
    }

    _createMainContent() {
        const mainContent = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 12,
            hexpand: true,
            vexpand: true
        });

        // Statistics cards
        this._createStatsSection(mainContent);

        // Chart filters and visualization
        this._createChartSection(mainContent);

        // Recent tasks summary
        this._createRecentTasksSection(mainContent);

        return mainContent;
    }

    _createStatsSection(container) {
        const statsBox = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 12,
            homogeneous: true,
            margin_bottom: 12
        });

        // Today stats
        const todayCard = this._createStatCard(
            'Today',
            'Today\'s work summary',
            [
                { label: 'Time Tracked', value: '0h 0m', id: 'today-time' },
                { label: 'Tasks Completed', value: '0', id: 'today-tasks' }
            ]
        );

        // Week stats
        const weekCard = this._createStatCard(
            'This Week',
            'Weekly work summary',
            [
                { label: 'Time Tracked', value: '0h 0m', id: 'week-time' },
                { label: 'Tasks Completed', value: '0', id: 'week-tasks' }
            ]
        );

        // Month stats
        const monthCard = this._createStatCard(
            'This Month',
            'Monthly work summary',
            [
                { label: 'Time Tracked', value: '0h 0m', id: 'month-time' },
                { label: 'Tasks Completed', value: '0', id: 'month-tasks' }
            ]
        );

        statsBox.append(todayCard);
        statsBox.append(weekCard);
        statsBox.append(monthCard);

        container.append(statsBox);
    }

    _createStatCard(title, subtitle, stats) {
        const card = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 8,
            css_classes: ['card'],
            margin_start: 6,
            margin_end: 6,
            margin_top: 6,
            margin_bottom: 6
        });

        const headerBox = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 4,
            margin_start: 12,
            margin_end: 12,
            margin_top: 12
        });

        const titleLabel = new Gtk.Label({
            label: title,
            css_classes: ['title-3'],
            halign: Gtk.Align.START
        });

        const subtitleLabel = new Gtk.Label({
            label: subtitle,
            css_classes: ['dim-label'],
            halign: Gtk.Align.START
        });

        headerBox.append(titleLabel);
        headerBox.append(subtitleLabel);
        card.append(headerBox);

        // Stats rows
        const statsBox = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 6,
            margin_start: 12,
            margin_end: 12,
            margin_bottom: 12
        });

        stats.forEach(stat => {
            const statRow = new Gtk.Box({
                orientation: Gtk.Orientation.HORIZONTAL,
                spacing: 6
            });

            const labelWidget = new Gtk.Label({
                label: stat.label,
                hexpand: true,
                halign: Gtk.Align.START
            });

            const valueWidget = new Gtk.Label({
                label: stat.value,
                css_classes: ['monospace', 'accent'],
                halign: Gtk.Align.END
            });

            statRow.append(labelWidget);
            statRow.append(valueWidget);
            statsBox.append(statRow);

            // Store reference for updates
            if (stat.id) {
                this[stat.id] = { getWidget: () => valueWidget, setText: (text) => valueWidget.set_label(text) };
            }
        });

        card.append(statsBox);
        return card;
    }

    _createChartSection(container) {
        const chartSection = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 12,
            css_classes: ['card'],
            margin_start: 6,
            margin_end: 6,
            margin_top: 6,
            margin_bottom: 6
        });

        // Chart header with filters
        const headerBox = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 12,
            margin_start: 12,
            margin_end: 12,
            margin_top: 12
        });

        const titleLabel = new Gtk.Label({
            label: 'Time Distribution Chart',
            css_classes: ['title-3'],
            hexpand: true,
            halign: Gtk.Align.START
        });

        // Filters
        const filtersBox = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 6
        });

        // Period filter
        const periodDropdown = new Gtk.DropDown({
            model: new Gtk.StringList({ strings: ['Week', 'Month', 'Year'] }),
            selected: 0
        });
        periodDropdown.connect('notify::selected', () => {
            const periods = ['week', 'month', 'year'];
            this.chartFilters.period = periods[periodDropdown.get_selected()];
            this._updateChart();
        });

        filtersBox.append(new Gtk.Label({ label: 'Period:' }));
        filtersBox.append(periodDropdown);

        headerBox.append(titleLabel);
        headerBox.append(filtersBox);
        chartSection.append(headerBox);

        // Chart placeholder
        this.chartPlaceholder = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 12,
            height_request: 300,
            margin_start: 12,
            margin_end: 12,
            margin_bottom: 12
        });

        const chartLabel = new Gtk.Label({
            label: 'Chart will be displayed here',
            css_classes: ['dim-label'],
            halign: Gtk.Align.CENTER,
            valign: Gtk.Align.CENTER
        });

        this.chartPlaceholder.append(chartLabel);
        chartSection.append(this.chartPlaceholder);

        container.append(chartSection);
    }

    _createRecentTasksSection(container) {
        const recentSection = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 12,
            css_classes: ['card'],
            margin_start: 6,
            margin_end: 6,
            margin_top: 6,
            margin_bottom: 6
        });

        // Header
        const headerLabel = new Gtk.Label({
            label: 'Recent Tasks',
            css_classes: ['title-3'],
            halign: Gtk.Align.START,
            margin_start: 12,
            margin_end: 12,
            margin_top: 12
        });

        recentSection.append(headerLabel);

        // Tasks list container
        this.recentTasksList = new Gtk.ListBox({
            css_classes: ['boxed-list'],
            margin_start: 12,
            margin_end: 12,
            margin_bottom: 12
        });

        // Empty state
        const emptyRow = new Gtk.ListBoxRow({
            activatable: false,
            selectable: false
        });

        const emptyLabel = new Gtk.Label({
            label: 'No recent tasks',
            css_classes: ['dim-label'],
            margin_top: 12,
            margin_bottom: 12
        });

        emptyRow.set_child(emptyLabel);
        this.recentTasksList.append(emptyRow);

        recentSection.append(this.recentTasksList);
        container.append(recentSection);
    }

    /**
     * Load and update all report data
     */
    async loadReports() {
        this.showLoading('Loading reports...');
        
        try {
            await this._updateReports();
            await this._updateWeeklyTime();
            this._updateChart();
            console.log('ReportsPage: Reports loaded successfully', this.reportData);
        } catch (error) {
            console.error('Error loading reports:', error);
            this.showError('Load Error', 'Failed to load reports');
        } finally {
            this.hideLoading();
        }
    }

    /**
     * Update report statistics
     */
    async _updateReports() {
        if (!this.parentWindow || !this.parentWindow.allTasks) {
            return;
        }

        const tasks = this.parentWindow.allTasks || [];
        const now = new Date();
        
        // Calculate today's stats
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const todayTasks = tasks.filter(task => 
            new Date(task.created_date) >= todayStart && !task.isActive
        );
        
        const todayTime = todayTasks.reduce((sum, task) => sum + (task.duration || 0), 0);
        this['today-time']?.setText(this._formatDuration(todayTime));
        this['today-tasks']?.setText(todayTasks.length.toString());

        // Calculate week's stats
        const weekStart = new Date(now);
        weekStart.setDate(now.getDate() - now.getDay());
        weekStart.setHours(0, 0, 0, 0);
        
        const weekTasks = tasks.filter(task => 
            new Date(task.created_date) >= weekStart && !task.isActive
        );
        
        const weekTime = weekTasks.reduce((sum, task) => sum + (task.duration || 0), 0);
        this['week-time']?.setText(this._formatDuration(weekTime));
        this['week-tasks']?.setText(weekTasks.length.toString());

        // Calculate month's stats
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const monthTasks = tasks.filter(task => 
            new Date(task.created_date) >= monthStart && !task.isActive
        );
        
        const monthTime = monthTasks.reduce((sum, task) => sum + (task.duration || 0), 0);
        this['month-time']?.setText(this._formatDuration(monthTime));
        this['month-tasks']?.setText(monthTasks.length.toString());

        console.log('Reports updated with current statistics');
    }

    /**
     * Update weekly time tracking
     */
    async _updateWeeklyTime() {
        // This would integrate with the weekly time calculation logic
        console.log('Weekly time updated');
    }

    /**
     * Update chart visualization
     */
    _updateChart() {
        if (this.simpleChart && this.parentWindow) {
            this.simpleChart.createChart(
                this.parentWindow.allTasks || [],
                this.parentWindow.allProjects || [],
                this.parentWindow.allClients || []
            );
        }
    }

    /**
     * Export PDF report
     */
    exportPDFReport() {
        if (this.reportExporter) {
            console.log('Exporting PDF report...');
            this.reportExporter.exportToPDF(this.reportData);
        } else {
            console.error('Report exporter not available');
        }
    }

    /**
     * Refresh page data
     */
    async refresh() {
        try {
            await this.loadReports();
        } catch (error) {
            console.error('ReportsPage refresh failed:', error);
        }
    }

    /**
     * Show loading state
     */
    showLoading(message = 'Loading...') {
        console.log(`ReportsPage: ${message}`);
        // Could show spinner in UI if needed
    }

    /**
     * Hide loading state
     */
    hideLoading() {
        console.log('ReportsPage: Loading finished');
        // Could hide spinner in UI if needed
    }

    /**
     * Format duration in seconds to human readable format
     */
    _formatDuration(seconds) {
        if (!seconds) return '0m';
        
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        
        if (hours > 0) {
            return `${hours}h ${minutes}m`;
        } else {
            return `${minutes}m`;
        }
    }

    /**
     * Toggle search bar visibility (not used in reports page)
     */
    toggleSearch() {
        // Reports page doesn't have search functionality
        console.log('Search not available on reports page');
    }
}