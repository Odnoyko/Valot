import Gtk from 'gi://Gtk';
import { Button } from '../components/primitive/Button.js';
import { Label } from '../components/primitive/Label.js';

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
        console.log('📊 Updating ReportsPage filters:', { period, projectId, clientId });
        this.chartFilters = {
            period: period || 'week',
            project: projectId,
            client: clientId
        };
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

        // Reports updated with current statistics
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
        console.log('🚀 PDF Export button clicked!');
        
        if (!this.reportExporter) {
            console.error('❌ Report exporter not available - this.reportExporter is null/undefined');
            console.log('📊 Available properties:', Object.keys(this));
            return;
        }

        console.log('✅ Report exporter found:', this.reportExporter);

        try {
            console.log('🔧 Configuring PDF export with current settings...');
            console.log('📊 Current chart filters:', this.chartFilters);
            
            // Update the report exporter with current data
            console.log('🔄 Updating report exporter data...');
            this._updateReportExporterData();
            
            // Configure filters based on current chart filters
            console.log('⚙️ Configuring period filter:', this.chartFilters.period);
            this.reportExporter.configurePeriod(this.chartFilters.period);
            
            if (this.chartFilters.project) {
                console.log('📁 Configuring project filter:', this.chartFilters.project);
                this.reportExporter.configureProjectFilter(this.chartFilters.project);
            } else {
                console.log('📁 No project filter applied');
            }
            
            if (this.chartFilters.client) {
                console.log('👤 Configuring client filter:', this.chartFilters.client);
                this.reportExporter.configureClientFilter(this.chartFilters.client);
            } else {
                console.log('👤 No client filter applied');
            }

            // Configure sections based on UI switches
            const sections = {
                showAnalytics: this.includeAnalyticsSwitch?.get_active() ?? true,
                showCharts: this.includeChartsSwitch?.get_active() ?? true,
                showTasks: this.includeTasksSwitch?.get_active() ?? true,
                showProjects: this.includeProjectsSwitch?.get_active() ?? true,
                showBilling: this.includeBillingSwitch?.get_active() ?? false
            };
            
            console.log('📋 Configured sections:', sections);
            
            this.reportExporter.configureSections(sections);
            this.reportExporter.configureBilling(sections.showBilling);

            // Export the report
            console.log('🎯 Starting PDF export with parent window - type:', typeof this.parentWindow);
            console.log('🏠 Parent window available:', !!this.parentWindow);
            
            this.reportExporter.exportReport(this.parentWindow);
            console.log('📤 PDF export method called successfully');
            
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
            console.log('Configuring HTML export with current settings...');
            
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
            console.log('Starting HTML export...');
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
        console.log('🔄 _updateReportExporterData called');
        
        if (!this.reportExporter) {
            console.error('❌ No report exporter available in _updateReportExporterData');
            return;
        }
        
        if (!this.parentWindow) {
            console.error('❌ No parent window available in _updateReportExporterData');
            return;
        }

        console.log('🏠 Parent window found, extracting data...');
        const tasks = this.parentWindow.allTasks || [];
        const projects = this.parentWindow.allProjects || [];
        const clients = this.parentWindow.allClients || [];

        console.log('📊 Data extracted:', {
            tasks: tasks.length,
            projects: projects.length,
            clients: clients.length
        });

        // Update the data in both PDF and HTML exporters
        console.log('🔄 Updating main report exporter data...');
        this.reportExporter.tasks = tasks;
        this.reportExporter.projects = projects;
        this.reportExporter.clients = clients;

        // Update the underlying exporters
        if (this.reportExporter.pdfExporter) {
            console.log('📄 Updating PDF exporter data...');
            this.reportExporter.pdfExporter.tasks = tasks;
            this.reportExporter.pdfExporter.projects = projects;
            this.reportExporter.pdfExporter.clients = clients;
        } else {
            console.warn('⚠️ PDF exporter not found in report exporter');
        }

        if (this.reportExporter.htmlExporter) {
            console.log('🌐 Updating HTML exporter data...');
            this.reportExporter.htmlExporter.tasks = tasks;
            this.reportExporter.htmlExporter.projects = projects;
            this.reportExporter.htmlExporter.clients = clients;
        } else {
            console.warn('⚠️ HTML exporter not found in report exporter');
        }

        console.log('✅ Report exporter data update completed successfully');
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
        console.log('Search not available on reports page');
    }
}