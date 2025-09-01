import Gtk from 'gi://Gtk';
import Adw from 'gi://Adw';
import GObject from 'gi://GObject';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import { PDFExporter } from 'resource:///com/odnoyko/valot/js/reports/pdfExporter.js';

export const PDFPreviewWindow = GObject.registerClass({
    GTypeName: 'PDFPreviewWindow',
}, class PDFPreviewWindow extends Adw.Window {
    constructor(application, tasks, projects, clients) {
        super({
            application,
            title: 'PDF Export Preview',
            default_width: 1000,
            default_height: 700,
            modal: true
        });

        // Use Adw.ApplicationWindow approach - no custom titlebar needed
        // AdwWindow handles the titlebar automatically

        this.tasks = tasks || [];
        this.projects = projects || [];
        this.clients = clients || [];

        // Current filter settings
        this.currentFilters = {
            dateRange: 'week', // week, month, year, custom
            fromDate: null,
            toDate: null,
            projectId: null,
            clientId: null,
            includeBilling: true,
            customReportName: ''
        };

        this._setupUI();
        this._connectEvents();
        this._updatePreview();
    }

    _setupUI() {
        // Use Adw.ToolbarView for proper Adwaita layout
        const toolbarView = new Adw.ToolbarView();

        // Header bar
        const headerBar = new Adw.HeaderBar({
            title_widget: new Adw.WindowTitle({
                title: 'PDF Export Preview'
            })
        });

        // Close button
        const closeButton = new Gtk.Button({
            icon_name: 'window-close-symbolic',
            tooltip_text: 'Close',
            css_classes: ['flat']
        });
        closeButton.connect('clicked', () => this.close());
        headerBar.pack_end(closeButton);

        toolbarView.add_top_bar(headerBar);

        // Main container
        const mainBox = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 12,
            margin_top: 12,
            margin_bottom: 12,
            margin_start: 12,
            margin_end: 12
        });

        // Left panel - Filters
        const filtersPanel = this._createFiltersPanel();
        filtersPanel.set_size_request(300, -1);

        // Right panel - Preview
        const previewPanel = this._createPreviewPanel();
        previewPanel.hexpand = true;

        mainBox.append(filtersPanel);
        mainBox.append(previewPanel);

        toolbarView.set_content(mainBox);
        this.set_content(toolbarView);
    }

    _createFiltersPanel() {
        const scrolled = new Gtk.ScrolledWindow({
            hscrollbar_policy: Gtk.PolicyType.NEVER,
            vscrollbar_policy: Gtk.PolicyType.AUTOMATIC
        });

        const filtersBox = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 18,
            margin_top: 6,
            margin_bottom: 6,
            margin_start: 6,
            margin_end: 6
        });

        // Title
        const titleLabel = new Gtk.Label({
            label: '📋 Export Filters',
            css_classes: ['title-2'],
            halign: Gtk.Align.START,
            margin_bottom: 6
        });
        filtersBox.append(titleLabel);

        // Date Range Section
        filtersBox.append(this._createDateRangeSection());
        
        // Custom Date Section
        filtersBox.append(this._createCustomDateSection());

        // Project Filter Section
        filtersBox.append(this._createProjectSection());

        // Client Filter Section
        filtersBox.append(this._createClientSection());

        // Options Section
        filtersBox.append(this._createOptionsSection());

        // Report Name Section
        filtersBox.append(this._createReportNameSection());

        // Action Buttons
        filtersBox.append(this._createActionButtons());

        scrolled.set_child(filtersBox);
        return scrolled;
    }

    _createDateRangeSection() {
        const group = new Adw.PreferencesGroup({
            title: 'Date Range',
            margin_bottom: 12
        });

        // Date range dropdown
        const dateRangeModel = new Gtk.StringList();
        dateRangeModel.append('This Week');
        dateRangeModel.append('This Month');
        dateRangeModel.append('This Year');
        dateRangeModel.append('Custom Range');

        this.dateRangeDropdown = new Gtk.DropDown({
            model: dateRangeModel,
            selected: 0
        });

        const dateRangeRow = new Adw.ActionRow({
            title: 'Time Period',
            activatable_widget: this.dateRangeDropdown
        });
        dateRangeRow.add_suffix(this.dateRangeDropdown);
        group.add(dateRangeRow);

        return group;
    }

    _createCustomDateSection() {
        this.customDateGroup = new Adw.PreferencesGroup({
            title: 'Custom Date Range',
            margin_bottom: 12,
            visible: false
        });

        // From date
        this.fromDateEntry = new Gtk.Entry({
            placeholder_text: 'DD/MM/YYYY',
            input_purpose: Gtk.InputPurpose.DIGITS,
            max_length: 10
        });

        const fromDateRow = new Adw.ActionRow({
            title: 'From Date',
            activatable_widget: this.fromDateEntry
        });
        fromDateRow.add_suffix(this.fromDateEntry);
        this.customDateGroup.add(fromDateRow);

        // To date
        this.toDateEntry = new Gtk.Entry({
            placeholder_text: 'DD/MM/YYYY',
            input_purpose: Gtk.InputPurpose.DIGITS,
            max_length: 10
        });

        const toDateRow = new Adw.ActionRow({
            title: 'To Date',
            activatable_widget: this.toDateEntry
        });
        toDateRow.add_suffix(this.toDateEntry);
        this.customDateGroup.add(toDateRow);

        return this.customDateGroup;
    }

    _createProjectSection() {
        const group = new Adw.PreferencesGroup({
            title: 'Project Filter',
            margin_bottom: 12
        });

        // Project dropdown
        const projectModel = new Gtk.StringList();
        projectModel.append('All Projects');
        this.projects.forEach(project => {
            projectModel.append(project.name);
        });

        this.projectDropdown = new Gtk.DropDown({
            model: projectModel,
            selected: 0
        });

        const projectRow = new Adw.ActionRow({
            title: 'Project',
            activatable_widget: this.projectDropdown
        });
        projectRow.add_suffix(this.projectDropdown);
        group.add(projectRow);

        return group;
    }

    _createClientSection() {
        const group = new Adw.PreferencesGroup({
            title: 'Client Filter',
            margin_bottom: 12
        });

        // Client dropdown
        const clientModel = new Gtk.StringList();
        clientModel.append('All Clients');
        this.clients.forEach(client => {
            clientModel.append(client.name);
        });

        this.clientDropdown = new Gtk.DropDown({
            model: clientModel,
            selected: 0
        });

        const clientRow = new Adw.ActionRow({
            title: 'Client',
            activatable_widget: this.clientDropdown
        });
        clientRow.add_suffix(this.clientDropdown);
        group.add(clientRow);

        return group;
    }

    _createOptionsSection() {
        const group = new Adw.PreferencesGroup({
            title: 'Report Options',
            margin_bottom: 12
        });

        // Billing information toggle
        this.billingSwitch = new Gtk.Switch({
            active: true
        });

        const billingRow = new Adw.ActionRow({
            title: 'Include Billing Information',
            subtitle: 'Show rates, revenue, and billing details',
            activatable_widget: this.billingSwitch
        });
        billingRow.add_suffix(this.billingSwitch);
        group.add(billingRow);

        return group;
    }

    _createReportNameSection() {
        const group = new Adw.PreferencesGroup({
            title: 'Report Name',
            margin_bottom: 12
        });

        // Custom report name input
        this.reportNameEntry = new Gtk.Entry({
            placeholder_text: 'Custom report name (optional)',
            text: ''
        });

        const reportNameRow = new Adw.ActionRow({
            title: 'Custom Name',
            subtitle: 'Leave empty for auto-generated name',
            activatable_widget: this.reportNameEntry
        });
        reportNameRow.add_suffix(this.reportNameEntry);
        group.add(reportNameRow);

        return group;
    }

    _createActionButtons() {
        const buttonsBox = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 6,
            margin_top: 12
        });

        // Update Preview Button
        this.previewButton = new Gtk.Button({
            label: '🔄 Update Preview',
            css_classes: ['suggested-action'],
            hexpand: true
        });
        buttonsBox.append(this.previewButton);

        // Export PDF Button
        this.exportButton = new Gtk.Button({
            label: '📄 Export PDF',
            css_classes: ['suggested-action'],
            hexpand: true
        });
        buttonsBox.append(this.exportButton);

        // Close Button
        const closeButtonAction = new Gtk.Button({
            label: '❌ Close',
            css_classes: ['destructive-action'],
            hexpand: true
        });
        closeButtonAction.connect('clicked', () => this.close());
        buttonsBox.append(closeButtonAction);

        return buttonsBox;
    }

    _createPreviewPanel() {
        const previewBox = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 12
        });

        // Preview header
        const headerBox = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 12,
            margin_bottom: 6
        });

        const previewLabel = new Gtk.Label({
            label: '📊 PDF Preview',
            css_classes: ['title-2'],
            halign: Gtk.Align.START,
            hexpand: true
        });

        headerBox.append(previewLabel);
        previewBox.append(headerBox);

        // Preview content area
        const scrolledPreview = new Gtk.ScrolledWindow({
            vexpand: true,
            hscrollbar_policy: Gtk.PolicyType.AUTOMATIC,
            vscrollbar_policy: Gtk.PolicyType.AUTOMATIC
        });

        this.previewContent = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 12,
            margin_top: 12,
            margin_bottom: 12,
            margin_start: 12,
            margin_end: 12
        });

        // Add white background for preview
        this.previewContent.add_css_class('card');

        scrolledPreview.set_child(this.previewContent);
        previewBox.append(scrolledPreview);

        return previewBox;
    }

    _connectEvents() {
        // Date range dropdown change
        this.dateRangeDropdown.connect('notify::selected', () => {
            const selected = this.dateRangeDropdown.get_selected();
            this.customDateGroup.set_visible(selected === 3); // Custom Range
            this._updateFiltersFromUI();
            this._updatePreview();
        });

        // Custom date entries
        this.fromDateEntry.connect('changed', () => {
            this._updateFiltersFromUI();
        });

        this.toDateEntry.connect('changed', () => {
            this._updateFiltersFromUI();
        });

        // Project and client dropdowns
        this.projectDropdown.connect('notify::selected', () => {
            this._updateFiltersFromUI();
            this._updatePreview();
        });

        this.clientDropdown.connect('notify::selected', () => {
            this._updateFiltersFromUI();
            this._updatePreview();
        });

        // Billing switch
        this.billingSwitch.connect('notify::active', () => {
            this._updateFiltersFromUI();
            this._updatePreview();
        });

        // Report name entry
        this.reportNameEntry.connect('changed', () => {
            this._updateFiltersFromUI();
        });

        // Buttons
        this.previewButton.connect('clicked', () => {
            this._updatePreview();
        });

        this.exportButton.connect('clicked', () => {
            this._exportPDF();
        });
    }

    _updateFiltersFromUI() {
        // Date range
        const dateRangeSelected = this.dateRangeDropdown.get_selected();
        const dateRanges = ['week', 'month', 'year', 'custom'];
        this.currentFilters.dateRange = dateRanges[dateRangeSelected];

        // Custom dates
        if (this.currentFilters.dateRange === 'custom') {
            this.currentFilters.fromDate = this._parseDate(this.fromDateEntry.get_text());
            this.currentFilters.toDate = this._parseDate(this.toDateEntry.get_text());
        } else {
            this.currentFilters.fromDate = null;
            this.currentFilters.toDate = null;
        }

        // Project
        const projectSelected = this.projectDropdown.get_selected();
        this.currentFilters.projectId = projectSelected === 0 ? null : this.projects[projectSelected - 1]?.id;

        // Client
        const clientSelected = this.clientDropdown.get_selected();
        this.currentFilters.clientId = clientSelected === 0 ? null : this.clients[clientSelected - 1]?.id;

        // Billing
        this.currentFilters.includeBilling = this.billingSwitch.get_active();

        // Custom report name
        this.currentFilters.customReportName = this.reportNameEntry.get_text().trim();
    }

    _parseDate(dateStr) {
        if (!dateStr || dateStr.length !== 10) return null;
        
        const parts = dateStr.split('/');
        if (parts.length !== 3) return null;
        
        const day = parseInt(parts[0]);
        const month = parseInt(parts[1]) - 1; // JS months are 0-based
        const year = parseInt(parts[2]);
        
        if (isNaN(day) || isNaN(month) || isNaN(year)) return null;
        
        return new Date(year, month, day);
    }

    _updatePreview() {
        // Clear existing preview
        while (this.previewContent.get_first_child()) {
            this.previewContent.remove(this.previewContent.get_first_child());
        }

        // Get filtered data
        const filteredTasks = this._getFilteredTasks();
        const stats = this._calculateStatistics(filteredTasks);

        // Create preview content
        this._addPreviewHeader();
        this._addPreviewFilters();
        this._addPreviewStats(stats);
        this._addPreviewChart(filteredTasks);
        this._addPreviewTasks(filteredTasks);
    }

    _addPreviewHeader() {
        const headerBox = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 12,
            margin_bottom: 12
        });

        // Logo placeholder
        const logoBox = new Gtk.Box({
            width_request: 60,
            height_request: 60,
            css_classes: ['card'],
            halign: Gtk.Align.CENTER,
            valign: Gtk.Align.CENTER
        });

        const logoLabel = new Gtk.Label({
            label: 'V',
            css_classes: ['title-1'],
            halign: Gtk.Align.CENTER,
            valign: Gtk.Align.CENTER
        });
        logoBox.append(logoLabel);

        // Title and info
        const titleBox = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 6,
            hexpand: true
        });

        const titleLabel = new Gtk.Label({
            label: 'Valot Time Tracking Report',
            css_classes: ['title-1'],
            halign: Gtk.Align.START
        });

        const dateLabel = new Gtk.Label({
            label: `Generated on: ${new Date().toLocaleDateString('de-DE')}`,
            css_classes: ['caption'],
            halign: Gtk.Align.START
        });

        titleBox.append(titleLabel);
        titleBox.append(dateLabel);

        headerBox.append(logoBox);
        headerBox.append(titleBox);

        this.previewContent.append(headerBox);
    }

    _addPreviewFilters() {
        const filtersBox = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 6,
            margin_bottom: 12
        });

        const filtersTitle = new Gtk.Label({
            label: 'Applied Filters',
            css_classes: ['heading'],
            halign: Gtk.Align.START
        });
        filtersBox.append(filtersTitle);

        // Date range
        let dateText = this.currentFilters.dateRange.charAt(0).toUpperCase() + this.currentFilters.dateRange.slice(1);
        if (this.currentFilters.dateRange === 'custom' && this.currentFilters.fromDate && this.currentFilters.toDate) {
            dateText = `${this.currentFilters.fromDate.toLocaleDateString('de-DE')} - ${this.currentFilters.toDate.toLocaleDateString('de-DE')}`;
        }

        const dateFilterLabel = new Gtk.Label({
            label: `📅 Period: ${dateText}`,
            css_classes: ['caption'],
            halign: Gtk.Align.START
        });
        filtersBox.append(dateFilterLabel);

        // Project filter
        if (this.currentFilters.projectId) {
            const project = this.projects.find(p => p.id === this.currentFilters.projectId);
            if (project) {
                const projectLabel = new Gtk.Label({
                    label: `📁 Project: ${project.name}`,
                    css_classes: ['caption'],
                    halign: Gtk.Align.START
                });
                filtersBox.append(projectLabel);
            }
        }

        // Client filter
        if (this.currentFilters.clientId) {
            const client = this.clients.find(c => c.id === this.currentFilters.clientId);
            if (client) {
                const clientLabel = new Gtk.Label({
                    label: `👤 Client: ${client.name}`,
                    css_classes: ['caption'],
                    halign: Gtk.Align.START
                });
                filtersBox.append(clientLabel);
            }
        }

        this.previewContent.append(filtersBox);
    }

    _addPreviewStats(stats) {
        const statsBox = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 12,
            homogeneous: true,
            margin_bottom: 12
        });

        // Total time card
        const timeCard = this._createStatCard('⏰ Total Time', stats.totalTime);
        statsBox.append(timeCard);

        // Tasks card
        const tasksCard = this._createStatCard('✅ Tasks', stats.totalTasks.toString());
        statsBox.append(tasksCard);

        // Billing card (if enabled)
        if (this.currentFilters.includeBilling && stats.totalRevenue !== undefined) {
            const revenueCard = this._createStatCard('💰 Revenue', `€${stats.totalRevenue.toFixed(2)}`);
            statsBox.append(revenueCard);
        }

        this.previewContent.append(statsBox);
    }

    _createStatCard(title, value) {
        const card = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 6,
            margin_top: 12,
            margin_bottom: 12,
            margin_start: 12,
            margin_end: 12,
            css_classes: ['card']
        });

        const titleLabel = new Gtk.Label({
            label: title,
            css_classes: ['caption'],
            halign: Gtk.Align.CENTER
        });

        const valueLabel = new Gtk.Label({
            label: value,
            css_classes: ['title-2'],
            halign: Gtk.Align.CENTER
        });

        card.append(titleLabel);
        card.append(valueLabel);

        return card;
    }

    _addPreviewChart(filteredTasks) {
        const chartBox = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 6,
            margin_bottom: 12
        });

        const chartTitle = new Gtk.Label({
            label: '📊 Activity Overview',
            css_classes: ['heading'],
            halign: Gtk.Align.START
        });
        chartBox.append(chartTitle);

        // Simple chart representation (text-based for preview)
        const chartData = this._getChartDataForPreview(filteredTasks);
        
        if (chartData.length > 0) {
            const chartTextBox = new Gtk.Box({
                orientation: Gtk.Orientation.HORIZONTAL,
                spacing: 12,
                css_classes: ['card'],
                margin_top: 6,
                margin_bottom: 6,
                margin_start: 12,
                margin_end: 12
            });

            chartData.forEach(data => {
                const barBox = new Gtk.Box({
                    orientation: Gtk.Orientation.VERTICAL,
                    spacing: 4,
                    halign: Gtk.Align.CENTER
                });

                const hoursLabel = new Gtk.Label({
                    label: `${data.hours.toFixed(1)}h`,
                    css_classes: ['caption']
                });

                const dayLabel = new Gtk.Label({
                    label: data.label,
                    css_classes: ['caption']
                });

                barBox.append(hoursLabel);
                barBox.append(dayLabel);
                chartTextBox.append(barBox);
            });

            chartBox.append(chartTextBox);
        } else {
            const noDataLabel = new Gtk.Label({
                label: 'No data for selected period',
                css_classes: ['dim-label'],
                halign: Gtk.Align.CENTER,
                margin_top: 12,
                margin_bottom: 12
            });
            chartBox.append(noDataLabel);
        }

        this.previewContent.append(chartBox);
    }

    _addPreviewTasks(filteredTasks) {
        const tasksBox = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 6
        });

        const tasksTitle = new Gtk.Label({
            label: 'Recent Tasks',
            css_classes: ['heading'],
            halign: Gtk.Align.START
        });
        tasksBox.append(tasksTitle);

        const recentTasks = filteredTasks
            .filter(task => !task.isActive)
            .sort((a, b) => new Date(b.start) - new Date(a.start))
            .slice(0, 10);

        if (recentTasks.length > 0) {
            recentTasks.forEach(task => {
                const taskBox = new Gtk.Box({
                    orientation: Gtk.Orientation.HORIZONTAL,
                    spacing: 12,
                    margin_top: 6
                });

                const taskLabel = new Gtk.Label({
                    label: task.name,
                    halign: Gtk.Align.START,
                    hexpand: true
                });

                const durationLabel = new Gtk.Label({
                    label: this._formatDuration(task.duration),
                    css_classes: ['caption']
                });

                taskBox.append(taskLabel);
                taskBox.append(durationLabel);
                tasksBox.append(taskBox);
            });
        } else {
            const noTasksLabel = new Gtk.Label({
                label: 'No tasks in selected period',
                css_classes: ['dim-label'],
                halign: Gtk.Align.CENTER,
                margin_top: 12
            });
            tasksBox.append(noTasksLabel);
        }

        this.previewContent.append(tasksBox);
    }

    _getFilteredTasks() {
        let filtered = this.tasks;

        // Apply project filter
        if (this.currentFilters.projectId) {
            filtered = filtered.filter(task => task.project_id === this.currentFilters.projectId);
        }

        // Apply client filter
        if (this.currentFilters.clientId) {
            filtered = filtered.filter(task => task.client_id === this.currentFilters.clientId);
        }

        // Apply date filter
        if (this.currentFilters.dateRange === 'custom' && this.currentFilters.fromDate && this.currentFilters.toDate) {
            filtered = filtered.filter(task => {
                if (!task.start) return false;
                const taskDate = new Date(task.start);
                return taskDate >= this.currentFilters.fromDate && taskDate <= this.currentFilters.toDate;
            });
        } else {
            // Apply predefined date ranges
            const now = new Date();
            let startDate;

            switch (this.currentFilters.dateRange) {
                case 'week':
                    startDate = new Date(now);
                    startDate.setDate(now.getDate() - 7);
                    break;
                case 'month':
                    startDate = new Date(now);
                    startDate.setMonth(now.getMonth() - 1);
                    break;
                case 'year':
                    startDate = new Date(now);
                    startDate.setFullYear(now.getFullYear() - 1);
                    break;
                default:
                    startDate = new Date(0); // All time
            }

            filtered = filtered.filter(task => {
                if (!task.start) return false;
                const taskDate = new Date(task.start);
                return taskDate >= startDate;
            });
        }

        return filtered;
    }

    _calculateStatistics(tasks) {
        const totalTime = tasks.reduce((sum, task) => sum + (task.duration || 0), 0);
        const totalTasks = tasks.filter(task => !task.isActive).length;
        
        const stats = {
            totalTime: this._formatDuration(totalTime),
            totalTasks
        };

        // Add billing info if enabled
        if (this.currentFilters.includeBilling) {
            let totalRevenue = 0;
            tasks.forEach(task => {
                const client = this.clients.find(c => c.id === task.client_id);
                if (client && task.duration) {
                    totalRevenue += (task.duration / 3600) * (client.rate || 0);
                }
            });
            stats.totalRevenue = totalRevenue;
        }

        return stats;
    }

    _getChartDataForPreview(tasks) {
        // Return simplified chart data for preview
        const data = [];
        const now = new Date();
        
        if (this.currentFilters.dateRange === 'week') {
            const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
            for (let i = 6; i >= 0; i--) {
                const date = new Date(now);
                date.setDate(now.getDate() - i);
                const dayName = days[date.getDay() === 0 ? 6 : date.getDay() - 1];
                
                let totalSeconds = 0;
                tasks.forEach(task => {
                    if (task.start) {
                        const taskDate = new Date(task.start);
                        if (taskDate.toDateString() === date.toDateString()) {
                            totalSeconds += task.duration || 0;
                        }
                    }
                });
                
                data.push({
                    label: dayName,
                    hours: totalSeconds / 3600
                });
            }
        }
        
        return data.slice(0, 7); // Limit for preview
    }

    _formatDuration(seconds) {
        if (!seconds) return '0:00:00';
        
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;
        
        return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }

    async _exportPDF() {
        try {
            this._updateFiltersFromUI();
            
            // Create enhanced PDFExporter with current filters
            const exporter = new PDFExporter(
                this._getFilteredTasks(),
                this.projects,
                this.clients,
                this.currentFilters.dateRange === 'custom' ? 'week' : this.currentFilters.dateRange,
                this.currentFilters.projectId,
                this.currentFilters.clientId
            );

            // Set billing option
            exporter.includeBilling = this.currentFilters.includeBilling;
            exporter.customDateRange = this.currentFilters.dateRange === 'custom' ? {
                from: this.currentFilters.fromDate,
                to: this.currentFilters.toDate
            } : null;

            // Set custom name if provided
            if (this.currentFilters.customReportName) {
                exporter.setCustomName(this.currentFilters.customReportName);
            }

            await exporter.exportToPDF(this);
        } catch (error) {
            console.error('PDF export error:', error);
            const errorDialog = new Gtk.AlertDialog({
                message: 'Export Failed',
                detail: `Could not export PDF: ${error.message}`
            });
            errorDialog.show(this);
        }
    }
});