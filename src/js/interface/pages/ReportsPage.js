import Gtk from 'gi://Gtk';
import { Button } from '../components/primitive/Button.js';
import { Label } from '../components/primitive/Label.js';
import { getCurrencySymbol } from '../../data/currencies.js';

/**
 * Reports management page - extracted from window.js
 * Handles all report-related functionality
 */
export class ReportsPage {
    constructor(config = {}) {
        // ReportsPage constructor
        
        // Base page properties
        this.app = config.app;
        this.parentWindow = config.parentWindow;
        
        // Report-specific state - will be updated from UI filters
        this.chartFilters = {
            period: 'week',
            project: null,
            client: null
        };
        
        // Get managers from parent window
        this.reportExporter = config.reportExporter;
        this.simpleChart = config.simpleChart;
        this.timeUtils = config.timeUtils;
        
        // Component assignments
        
        if (!this.reportExporter) {
            console.warn('⚠️ WARNING: reportExporter not provided in config!');
        } else {
            // reportExporter found
        }
        
        // ReportsPage constructor completed
    }

    /**
     * Update chart filters (called by main window when UI filters change)
     */
    updateFilters(period, projectId, clientId) {
        this.chartFilters = {
            period: period || 'week',
            project: projectId,
            client: clientId
        };
        
        // Update reports immediately when filters change - delegate to main window
        if (this.parentWindow && typeof this.parentWindow._updateReportsStatistics === 'function') {
            this.parentWindow._updateReportsStatistics();
        }
    }


    /**
     * Load and update all report data
     */
    async loadReports() {
        this.showLoading('Loading reports...');
        
        try {
            // Delegate to main window for statistics update
            if (this.parentWindow && typeof this.parentWindow._updateReportsStatistics === 'function') {
                this.parentWindow._updateReportsStatistics();
            }
            await this._updateWeeklyTime();
            this._updateChart();
            // Reports loaded successfully
        } catch (error) {
            console.error('Error loading reports:', error);
            console.warn('⚠️ Reports page failed to load completely');
        } finally {
            this.hideLoading();
            
            // Update weekly time in sidebar after loading reports
            if (this.parentWindow && typeof this.parentWindow.updateWeeklyTime === 'function') {
                await this.parentWindow.updateWeeklyTime();
            }
        }
    }

    /**
     * Update report statistics based on current chart filters
     */
    async _updateReports() {
        if (!this.parentWindow || !this.parentWindow.allTasks) {
            return;
        }

        const tasks = this.parentWindow.allTasks || [];
        const projects = this.parentWindow.allProjects || [];
        
        // Get filtered tasks based on current chart filters
        const filteredTasks = this._getFilteredTasks(tasks);
        
        // Calculate total time for filtered tasks
        const totalTime = filteredTasks.reduce((sum, task) => sum + (task.duration || 0), 0);
        
        // Update Total Time UI
        if (this.parentWindow._reports_total_time_value) {
            this.parentWindow._reports_total_time_value.set_label(this._formatDuration(totalTime));
        }
        
        // Calculate active projects (projects that have tasks in the filtered period)
        const activeProjectIds = new Set(filteredTasks.map(task => task.project_id).filter(id => id));
        const activeProjectsCount = activeProjectIds.size;
        
        // Update Active Projects UI
        if (this.parentWindow._reports_total_projects_value) {
            this.parentWindow._reports_total_projects_value.set_label(activeProjectsCount.toString());
        }
        
        // Calculate total tracked tasks (excluding active tasks)
        const completedTasks = filteredTasks.filter(task => !task.isActive);
        
        // Update Tracked Tasks UI
        if (this.parentWindow._reports_total_tasks_value) {
            this.parentWindow._reports_total_tasks_value.set_label(completedTasks.length.toString());
        }
        
        // Calculate earnings (if task has hourly rate)
        let totalEarnings = 0;
        const currencyTotals = new Map(); // Track earnings by currency
        
        filteredTasks.forEach(task => {
            if (task.hourly_rate && task.duration) {
                const hours = task.duration / 3600;
                const earnings = hours * task.hourly_rate;
                const currency = task.currency || 'USD';
                
                totalEarnings += earnings;
                currencyTotals.set(currency, (currencyTotals.get(currency) || 0) + earnings);
            }
        });
        
        // Update Currency Carousel with earnings
        this._updateCurrencyCarousel(currencyTotals);

        // Reports updated with current filter-based statistics
    }

    /**
     * Update weekly time tracking
     */
    async _updateWeeklyTime() {
        // This would integrate with the weekly time calculation logic
        // Weekly time updated
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
     * Export PDF report with current filter settings
     */
    exportPDFReport() {
        if (!this.reportExporter) {
            console.error('❌ Report exporter not available - this.reportExporter is null/undefined');
            return;
        }

        try {
            // Update the report exporter with current data
            this._updateReportExporterData();

            // Configure filters based on current chart filters
            this.reportExporter.configurePeriod(this.chartFilters.period);

            if (this.chartFilters.project) {
                this.reportExporter.configureProjectFilter(this.chartFilters.project);
            }

            if (this.chartFilters.client) {
                this.reportExporter.configureClientFilter(this.chartFilters.client);
            }

            // Configure sections based on UI switches
            const sections = {
                showAnalytics: this.includeAnalyticsSwitch?.get_active() ?? true,
                showCharts: this.includeChartsSwitch?.get_active() ?? true,
                showTasks: this.includeTasksSwitch?.get_active() ?? true,
                showProjects: this.includeProjectsSwitch?.get_active() ?? true,
                showBilling: this.includeBillingSwitch?.get_active() ?? false
            };

            this.reportExporter.configureSections(sections);
            this.reportExporter.configureBilling(sections.showBilling);

            // Export the report
            this.reportExporter.exportReport(this.parentWindow);

        } catch (error) {
            console.error('💥 Error configuring PDF export:', error);
            console.error('📍 Error stack:', error.stack);
        }
    }

    /**
     * Export HTML report with current filter settings
     */
    exportHTMLReport() {
        if (!this.reportExporter) {
            console.error('Report exporter not available');
            return;
        }

        try {
            // Update the report exporter with current data
            this._updateReportExporterData();

            // Configure filters based on current chart filters
            this.reportExporter.configurePeriod(this.chartFilters.period);

            if (this.chartFilters.project) {
                this.reportExporter.configureProjectFilter(this.chartFilters.project);
            }

            if (this.chartFilters.client) {
                this.reportExporter.configureClientFilter(this.chartFilters.client);
            }

            // Configure sections with default values (can be enhanced later with UI switches)
            const sections = {
                showAnalytics: true,
                showCharts: true,
                showTasks: true,
                showProjects: true,
                showBilling: false
            };

            this.reportExporter.configureSections(sections);
            this.reportExporter.configureBilling(sections.showBilling);

            // Export HTML report
            this.reportExporter.exportHTML(this.parentWindow);

        } catch (error) {
            console.error('Error configuring HTML export:', error);
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
        // ReportsPage loading message
        // Could show spinner in UI if needed
    }

    /**
     * Hide loading state
     */
    hideLoading() {
        // ReportsPage loading finished
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
     * Update report exporter with current task data
     */
    _updateReportExporterData() {
        if (!this.reportExporter) {
            console.error('❌ No report exporter available in _updateReportExporterData');
            return;
        }

        if (!this.parentWindow) {
            console.error('❌ No parent window available in _updateReportExporterData');
            return;
        }

        const tasks = this.parentWindow.allTasks || [];
        const projects = this.parentWindow.allProjects || [];
        const clients = this.parentWindow.allClients || [];

        // Update the data in both PDF and HTML exporters
        this.reportExporter.tasks = tasks;
        this.reportExporter.projects = projects;
        this.reportExporter.clients = clients;

        // Update the underlying exporters
        if (this.reportExporter.pdfExporter) {
            this.reportExporter.pdfExporter.tasks = tasks;
            this.reportExporter.pdfExporter.projects = projects;
            this.reportExporter.pdfExporter.clients = clients;
        } else {
            console.warn('⚠️ PDF exporter not found in report exporter');
        }

        if (this.reportExporter.htmlExporter) {
            this.reportExporter.htmlExporter.tasks = tasks;
            this.reportExporter.htmlExporter.projects = projects;
            this.reportExporter.htmlExporter.clients = clients;
        } else {
            console.warn('⚠️ HTML exporter not found in report exporter');
        }
    }

    /**
     * Get tasks filtered by current chart filters (period, project, client)
     */
    _getFilteredTasks(tasks) {
        let filteredTasks = tasks.filter(task => !task.isActive); // Exclude active tasks
        
        // Apply project filter
        if (this.chartFilters.project) {
            filteredTasks = filteredTasks.filter(task => task.project_id === this.chartFilters.project);
        }
        
        // Apply client filter
        if (this.chartFilters.client) {
            filteredTasks = filteredTasks.filter(task => task.client_id === this.chartFilters.client);
        }
        
        // Apply period filter
        filteredTasks = this._filterTasksByPeriod(filteredTasks, this.chartFilters.period);
        
        return filteredTasks;
    }
    
    /**
     * Filter tasks by time period (same logic as chart uses)
     */
    _filterTasksByPeriod(tasks, period) {
        const now = new Date();
        
        switch (period) {
            case 'week': {
                // Current week (Monday to Sunday)
                const monday = new Date(now);
                const dayOfWeek = now.getDay();
                const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
                monday.setDate(now.getDate() - daysToMonday);
                monday.setHours(0, 0, 0, 0);
                
                const sunday = new Date(monday);
                sunday.setDate(monday.getDate() + 6);
                sunday.setHours(23, 59, 59, 999);
                
                return tasks.filter(task => {
                    if (!task.start) return false;
                    const taskDate = new Date(task.start);
                    return taskDate >= monday && taskDate <= sunday;
                });
            }
            
            case 'month': {
                // Last 4 weeks
                const fourWeeksAgo = new Date(now);
                fourWeeksAgo.setDate(now.getDate() - 28);
                fourWeeksAgo.setHours(0, 0, 0, 0);
                
                return tasks.filter(task => {
                    if (!task.start) return false;
                    const taskDate = new Date(task.start);
                    return taskDate >= fourWeeksAgo;
                });
            }
            
            case 'year': {
                // Last 12 months
                const twelveMonthsAgo = new Date(now);
                twelveMonthsAgo.setMonth(now.getMonth() - 12);
                twelveMonthsAgo.setHours(0, 0, 0, 0);
                
                return tasks.filter(task => {
                    if (!task.start) return false;
                    const taskDate = new Date(task.start);
                    return taskDate >= twelveMonthsAgo;
                });
            }
            
            case 'custom': {
                // Use custom date range from simpleChart
                if (this.simpleChart && this.simpleChart.customDateRange) {
                    const { fromDate, toDate } = this.simpleChart.customDateRange;
                    return tasks.filter(task => {
                        if (!task.start) return false;
                        const taskDate = new Date(task.start);
                        return taskDate >= fromDate && taskDate <= toDate;
                    });
                }
                // Fallback to week if no custom range
                return this._filterTasksByPeriod(tasks, 'week');
            }
            
            default:
                return this._filterTasksByPeriod(tasks, 'week');
        }
    }
    
    /**
     * Update currency carousel with earnings data
     */
    _updateCurrencyCarousel(currencyTotals) {
        const carousel = this.parentWindow._reports_currency_carousel;
        if (!carousel) return;
        
        // Clear existing carousel content
        while (carousel.get_first_child()) {
            carousel.remove(carousel.get_first_child());
        }
        
        if (currencyTotals.size === 0) {
            // Show 0.00 if no earnings
            const zeroBox = this._createCurrencyBox('0.00', 'USD');
            carousel.append(zeroBox);
        } else {
            // Add a page for each currency
            for (const [currency, amount] of currencyTotals) {
                const formattedAmount = amount.toFixed(2); // Remove currency symbol
                const currencyBox = this._createCurrencyBox(formattedAmount, currency);
                carousel.append(currencyBox);
            }
        }
    }
    
    /**
     * Create a currency display box for the carousel
     */
    _createCurrencyBox(formattedAmount, currency) {
        const box = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 4,
            halign: Gtk.Align.CENTER,
            valign: Gtk.Align.CENTER
        });
        
        // Get currency symbol and show it as icon
        const currencySymbol = getCurrencySymbol(currency);
        const symbolLabel = new Gtk.Label({
            label: currencySymbol,
            css_classes: ['title-1', 'accent']
        });
        
        const amountLabel = new Gtk.Label({
            label: formattedAmount,
            css_classes: ['title-1']
        });
        
        const currencyLabel = new Gtk.Label({
            label: currency,
            css_classes: ['caption']
        });
        
        box.append(symbolLabel);
        box.append(amountLabel);
        box.append(currencyLabel);
        
        return box;
    }
    
    /**
     * Format currency amount
     */
    _formatCurrency(amount, currency = 'USD') {
        const symbols = {
            'USD': '$',
            'EUR': '€',
            'GBP': '£',
            'JPY': '¥'
        };
        
        const symbol = symbols[currency] || '$';
        return `${symbol}${amount.toFixed(2)}`;
    }

    /**
     * Show error message (simplified version)
     */
    showError(title, message) {
        console.error(`${title}: ${message}`);
    }

    /**
     * Toggle search bar visibility (not used in reports page)
     */
    toggleSearch() {
        // Reports page doesn't have search functionality
    }
}