import Gtk from 'gi://Gtk';
import Adw from 'gi://Adw';
import GObject from 'gi://GObject';
import { BUTTON, LABEL } from 'resource:///com/odnoyko/valot/ui/utils/commonStrings.js';

/**
 * PDF Export Preferences Dialog
 * Provides comprehensive options for PDF export configuration
 */
export const PDFExportPreferencesDialog = GObject.registerClass({
    GTypeName: 'PDFExportPreferencesDialog',
}, class PDFExportPreferencesDialog extends Adw.Dialog {
    _init(parentWindow, reportExporter) {
        super._init({
            title: _('PDF Export Preferences')
        });

        this.parentWindow = parentWindow;
        this.reportExporter = reportExporter;
        
        // Export configuration
        this.exportConfig = {
            // Time settings
            timeRange: 'week', // week, month, year, custom
            customStartDate: null,
            customEndDate: null,
            
            // Content settings
            includeAnalytics: true,
            includeCharts: true,
            includeTasks: true,
            includeProjects: true,
            includeBilling: false,
            
            // Project/Client filters
            filterByProject: null,
            filterByClient: null,
            
            // Template settings
            template: 'professional-report'
        };

        this._buildInterface();
        this._connectSignals();
        
    }

    _buildInterface() {
        // Create main container
        const mainBox = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 0
        });

        // Create header bar
        const headerBar = new Adw.HeaderBar({
            title_widget: new Adw.WindowTitle({
                title: _('PDF Export Preferences')
            })
        });

        // Add Cancel button
        const cancelButton = new Gtk.Button({
            label: BUTTON.CANCEL
        });
        cancelButton.connect('clicked', () => this.close());
        headerBar.pack_start(cancelButton);

        // Add Export button
        this.exportButton = new Gtk.Button({
            label: _('Export PDF'),
            css_classes: ['suggested-action']
        });
        this.exportButton.connect('clicked', () => this.applyAndExport());
        headerBar.pack_end(this.exportButton);

        mainBox.append(headerBar);

        // Create view stack for tabs
        this.viewStack = new Adw.ViewStack();
        this.viewSwitcher = new Adw.ViewSwitcher({
            stack: this.viewStack,
            policy: Adw.ViewSwitcherPolicy.WIDE
        });

        // Add view switcher to a separate bar
        const switcherBar = new Gtk.CenterBox({
            center_widget: this.viewSwitcher,
            css_classes: ['toolbar'],
            margin_top: 6,
            margin_bottom: 6
        });
        mainBox.append(switcherBar);

        // Create scrolled window for content
        const scrolledWindow = new Gtk.ScrolledWindow({
            vexpand: true,
            min_content_height: 400,
            min_content_width: 600
        });
        scrolledWindow.set_child(this.viewStack);
        mainBox.append(scrolledWindow);

        // Set content
        this.set_child(mainBox);

        // Add pages to stack
        this._createTimeSettingsPage();
        this._createContentSettingsPage();
        this._createProjectClientSettingsPage();
    }

    _createTimeSettingsPage() {
        const timePage = new Adw.PreferencesPage({
            title: _('Time Range'),
            icon_name: 'clock-symbolic'
        });

        // Time Period Group
        const periodGroup = new Adw.PreferencesGroup({
            title: _('Report Period'),
            description: _('Select the time period for your report')
        });

        // Period selection row
        const periodRow = new Adw.ComboRow({
            title: _('Time Period'),
            subtitle: _('Choose predefined period or custom range')
        });

        const periodModel = new Gtk.StringList();
        periodModel.splice(0, 0, [
            _('This Week'),
            _('This Month'),
            _('This Year'),
            _('Custom Range')
        ]);
        periodRow.set_model(periodModel);
        periodRow.set_selected(0); // Default to "This Week"

        periodRow.connect('notify::selected', () => {
            const periods = ['week', 'month', 'year', 'custom'];
            this.exportConfig.timeRange = periods[periodRow.get_selected()];
            this._updateCustomDateVisibility();
        });

        periodGroup.add(periodRow);

        // Custom date range group (initially hidden)
        this.customDateGroup = new Adw.PreferencesGroup({
            title: _('Custom Date Range'),
            description: _('Specify exact start and end dates'),
            visible: false
        });

        // Start date row
        const startDateRow = new Adw.ActionRow({
            title: _('Start Date'),
            subtitle: _('Beginning of the report period')
        });

        this.startDateButton = new Gtk.Button({
            label: _('Select Date'),
            css_classes: ['flat'],
            valign: Gtk.Align.CENTER
        });
        startDateRow.add_suffix(this.startDateButton);

        // End date row
        const endDateRow = new Adw.ActionRow({
            title: _('End Date'),
            subtitle: _('End of the report period')
        });

        this.endDateButton = new Gtk.Button({
            label: _('Select Date'),
            css_classes: ['flat'],
            valign: Gtk.Align.CENTER
        });
        endDateRow.add_suffix(this.endDateButton);

        this.customDateGroup.add(startDateRow);
        this.customDateGroup.add(endDateRow);

        // Add groups to page
        timePage.add(periodGroup);
        timePage.add(this.customDateGroup);
        
        this.viewStack.add_titled(timePage, 'time', _('Time Range'));
    }

    _createContentSettingsPage() {
        const contentPage = new Adw.PreferencesPage({
            title: _('Content'),
            icon_name: 'document-properties-symbolic'
        });

        // Report Sections Group
        const sectionsGroup = new Adw.PreferencesGroup({
            title: _('Report Sections'),
            description: _('Choose which sections to include in your PDF report')
        });

        // Analytics switch
        const analyticsRow = new Adw.SwitchRow({
            title: _('Analytics and Statistics'),
            subtitle: _('Include summary statistics and analysis'),
            active: this.exportConfig.includeAnalytics
        });
        analyticsRow.connect('notify::active', () => {
            this.exportConfig.includeAnalytics = analyticsRow.get_active();
        });

        // Charts switch
        const chartsRow = new Adw.SwitchRow({
            title: _('Charts and Visualizations'),
            subtitle: _('Include time tracking charts and graphs'),
            active: this.exportConfig.includeCharts
        });
        chartsRow.connect('notify::active', () => {
            this.exportConfig.includeCharts = chartsRow.get_active();
        });

        // Tasks switch
        const tasksRow = new Adw.SwitchRow({
            title: _('Task Details'),
            subtitle: _('Include detailed task information'),
            active: this.exportConfig.includeTasks
        });
        tasksRow.connect('notify::active', () => {
            this.exportConfig.includeTasks = tasksRow.get_active();
        });

        // Projects switch
        const projectsRow = new Adw.SwitchRow({
            title: _('Project Information'),
            subtitle: _('Include project details and summaries'),
            active: this.exportConfig.includeProjects
        });
        projectsRow.connect('notify::active', () => {
            this.exportConfig.includeProjects = projectsRow.get_active();
        });

        // Billing switch
        const billingRow = new Adw.SwitchRow({
            title: _('Billing and Financial Data'),
            subtitle: _('Include rates, costs, and financial calculations'),
            active: this.exportConfig.includeBilling
        });
        billingRow.connect('notify::active', () => {
            this.exportConfig.includeBilling = billingRow.get_active();
        });

        sectionsGroup.add(analyticsRow);
        sectionsGroup.add(chartsRow);
        sectionsGroup.add(tasksRow);
        sectionsGroup.add(projectsRow);
        sectionsGroup.add(billingRow);

        contentPage.add(sectionsGroup);
        this.viewStack.add_titled(contentPage, 'content', _('Content'));
    }

    _createProjectClientSettingsPage() {
        const filterPage = new Adw.PreferencesPage({
            title: _('Filters'),
            icon_name: 'funnel-symbolic'
        });

        // Project Filter Group
        const projectGroup = new Adw.PreferencesGroup({
            title: _('Project Filter'),
            description: _('Limit report to specific projects')
        });

        this.projectFilterRow = new Adw.ComboRow({
            title: LABEL.PROJECT,
            subtitle: _('Select a specific project or include all projects')
        });

        // Will be populated with actual projects
        this._updateProjectFilter();
        projectGroup.add(this.projectFilterRow);

        // Client Filter Group
        const clientGroup = new Adw.PreferencesGroup({
            title: _('Client Filter'),
            description: _('Limit report to specific clients')
        });

        this.clientFilterRow = new Adw.ComboRow({
            title: LABEL.CLIENT,
            subtitle: _('Select a specific client or include all clients')
        });

        // Will be populated with actual clients
        this._updateClientFilter();
        clientGroup.add(this.clientFilterRow);

        filterPage.add(projectGroup);
        filterPage.add(clientGroup);
        this.viewStack.add_titled(filterPage, 'filters', _('Filters'));
    }

    _updateProjectFilter() {
        const projects = this.parentWindow?.allProjects || [];
        const projectModel = new Gtk.StringList();

        // Add "All Projects" option first
        const projectOptions = [_('All Projects'), ...projects.map(p => p.name)];
        projectModel.splice(0, 0, projectOptions);
        
        this.projectFilterRow.set_model(projectModel);
        this.projectFilterRow.set_selected(0);

        this.projectFilterRow.connect('notify::selected', () => {
            const selectedIndex = this.projectFilterRow.get_selected();
            this.exportConfig.filterByProject = selectedIndex === 0 ? null : projects[selectedIndex - 1]?.id;
        });
    }

    _updateClientFilter() {
        const clients = this.parentWindow?.allClients || [];
        const clientModel = new Gtk.StringList();

        // Add "All Clients" option first
        const clientOptions = [_('All Clients'), ...clients.map(c => c.name)];
        clientModel.splice(0, 0, clientOptions);
        
        this.clientFilterRow.set_model(clientModel);
        this.clientFilterRow.set_selected(0);

        this.clientFilterRow.connect('notify::selected', () => {
            const selectedIndex = this.clientFilterRow.get_selected();
            this.exportConfig.filterByClient = selectedIndex === 0 ? null : clients[selectedIndex - 1]?.id;
        });
    }

    _updateCustomDateVisibility() {
        const isCustom = this.exportConfig.timeRange === 'custom';
        this.customDateGroup.set_visible(isCustom);
    }

    _connectSignals() {
        // Date picker buttons
        this.startDateButton?.connect('clicked', () => {
            // TODO: Implement date picker
        });

        this.endDateButton?.connect('clicked', () => {
            // TODO: Implement date picker
        });
    }

    /**
     * Apply the configuration and start export
     */
    async applyAndExport() {

        if (!this.reportExporter) {
            //('❌ No report exporter available');
            return;
        }

        try {
            // Configure time period
            this.reportExporter.configurePeriod(this.exportConfig.timeRange);
            
            // Configure custom date range if needed
            if (this.exportConfig.timeRange === 'custom' && 
                this.exportConfig.customStartDate && 
                this.exportConfig.customEndDate) {
                this.reportExporter.configureDateRange(
                    this.exportConfig.customStartDate,
                    this.exportConfig.customEndDate
                );
            }

            // Configure filters
            if (this.exportConfig.filterByProject) {
                this.reportExporter.configureProjectFilter(this.exportConfig.filterByProject);
            }
            if (this.exportConfig.filterByClient) {
                this.reportExporter.configureClientFilter(this.exportConfig.filterByClient);
            }

            // Configure sections
            const sections = {
                showAnalytics: this.exportConfig.includeAnalytics,
                showCharts: this.exportConfig.includeCharts,
                showTasks: this.exportConfig.includeTasks,
                showProjects: this.exportConfig.includeProjects,
                showBilling: this.exportConfig.includeBilling
            };
            this.reportExporter.configureSections(sections);
            this.reportExporter.configureBilling(this.exportConfig.includeBilling);

            // Update data
            if (this.parentWindow) {
                const tasks = this.parentWindow.allTasks || [];
                const projects = this.parentWindow.allProjects || [];
                const clients = this.parentWindow.allClients || [];

                this.reportExporter.tasks = tasks;
                this.reportExporter.projects = projects;
                this.reportExporter.clients = clients;

                if (this.reportExporter.pdfExporter) {
                    this.reportExporter.pdfExporter.tasks = tasks;
                    this.reportExporter.pdfExporter.projects = projects;
                    this.reportExporter.pdfExporter.clients = clients;
                }

                if (this.reportExporter.htmlExporter) {
                    this.reportExporter.htmlExporter.tasks = tasks;
                    this.reportExporter.htmlExporter.projects = projects;
                    this.reportExporter.htmlExporter.clients = clients;
                }
            }

            // Start the export
            await this.reportExporter.exportReport(this.parentWindow);
            
            // Close the dialog after successful export
            this.close();

        } catch (error) {
            //('💥 Export configuration failed:', error);
        }
    }

    /**
     * Show the preferences dialog
     */
    static show(parentWindow, reportExporter) {
        const dialog = new PDFExportPreferencesDialog(parentWindow, reportExporter);
        dialog.present(parentWindow);
        return dialog;
    }
});
