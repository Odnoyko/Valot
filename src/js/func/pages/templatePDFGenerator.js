import Gtk from 'gi://Gtk';
import Adw from 'gi://Adw';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import WebKit from 'gi://WebKit';
import { TemplateEngine } from 'resource:///com/odnoyko/valot/js/func/pages/templateEngine.js';
import { Config } from 'resource:///com/odnoyko/valot/config.js';

export class TemplatePDFGenerator {
    constructor(tasks, projects, clients) {
        this.tasks = tasks || [];
        this.projects = projects || [];
        this.clients = clients || [];
        
        // Configuration options
        this.includeBilling = false;
        this.customDateRange = null;
        this.filterByProject = null;
        this.filterByClient = null;
        this.filterPeriod = 'week';
        this.currentTemplate = 'professional-report';
        
        // Section visibility
        this.sections = {
            showAnalytics: true,
            showCharts: true,
            showTasks: true,
            showProjects: true,
            showBilling: false,
            logoPath: null
        };
        
        this.templateEngine = new TemplateEngine();
    }

    setTemplate(templateId) {
        this.currentTemplate = templateId;
    }

    configureBilling(includeBilling) {
        this.includeBilling = includeBilling;
    }

    configureDateRange(fromDate, toDate) {
        this.customDateRange = { from: fromDate, to: toDate };
        this.filterPeriod = 'custom';
    }

    configureProjectFilter(projectId) {
        this.filterByProject = projectId;
    }

    configureClientFilter(clientId) {
        this.filterByClient = clientId;
    }

    configurePeriod(period) {
        this.filterPeriod = period;
        if (period !== 'custom') {
            this.customDateRange = null;
        }
    }

    configureSections(sections) {
        this.sections = { ...this.sections, ...sections };
    }

    async exportToPDF(parentWindow) {
        try {
            // Create Valot reports folder and auto-save there
            const reportsDir = Config.getValotReportsDir();
            const file = await this._createReportsFolder(reportsDir);
            
            const filepath = file.get_path();
            if (filepath) {
                await this._createPDFFromTemplate(filepath, parentWindow);
                
                this._showSuccessDialog(filepath, reportsDir, parentWindow);
            }
        } catch (error) {
            console.error('Template PDF export error:', error);
            const errorDialog = new Gtk.AlertDialog({
                message: 'Export Failed',
                detail: `Could not export PDF: ${error.message}`
            });
            errorDialog.show(parentWindow);
        }
    }

    async _createReportsFolder(reportsDir) {
        console.log(`Attempting to create reports directory: ${reportsDir}`);
        
        try {
            // Create Valot folder if it doesn't exist
            if (!GLib.file_test(reportsDir, GLib.FileTest.IS_DIR)) {
                console.log(`Directory doesn't exist, creating: ${reportsDir}`);
                const result = GLib.mkdir_with_parents(reportsDir, 0o755);
                if (result !== 0) {
                    throw new Error(`Failed to create directory: ${reportsDir} (code: ${result})`);
                }
                console.log(`Successfully created directory: ${reportsDir}`);
            } else {
                console.log(`Directory already exists: ${reportsDir}`);
            }
            
            // Generate filename and create file object
            const fileName = this._generateFileName();
            const filePath = GLib.build_filenamev([reportsDir, fileName]);
            console.log(`Generated file path: ${filePath}`);
            return Gio.File.new_for_path(filePath);
        } catch (error) {
            console.error(`Error in _createReportsFolder: ${error.message}`);
            throw error;
        }
    }

    _showSuccessDialog(filepath, reportsDir, parentWindow) {
        const fileName = filepath.split('/').pop();
        
        const dialog = new Adw.AlertDialog({
            heading: 'PDF Export Complete',
            body: `Report saved successfully!\n\nFile: ${fileName}\nLocation: ${reportsDir}\n\nClick "Open Folder" to view the file in your file manager.`
        });
        
        dialog.add_response('close', 'Close');
        dialog.add_response('open_folder', 'Open Folder');
        dialog.set_response_appearance('open_folder', Adw.ResponseAppearance.SUGGESTED);
        
        dialog.connect('response', (dialog, response) => {
            if (response === 'open_folder') {
                this._openFolder(reportsDir);
            }
            dialog.close();
        });
        
        dialog.present(parentWindow);
    }

    _openFolder(folderPath) {
        console.log(`Attempting to open folder: ${folderPath}`);
        
        try {
            // Simple xdg-open call only
            const subprocess = Gio.Subprocess.new(
                ['xdg-open', folderPath],
                Gio.SubprocessFlags.NONE
            );
            subprocess.wait_async(null, null);
            console.log('✓ Opened folder via xdg-open');
            return true;
        } catch (error) {
            console.error('Could not open folder:', error);
        }
        
        // If failed, show simple dialog
        const errorDialog = new Adw.AlertDialog({
            heading: 'PDF Export Completed',
            body: `Your report has been saved successfully!\n\nLocation: ${folderPath}\n\nPlease open this location manually in your file manager.`
        });
        errorDialog.add_response('close', 'OK');
        errorDialog.present(null);
        return false;
    }

    async _createPDFFromTemplate(filepath, parentWindow) {
        return new Promise((resolve, reject) => {
            try {
                // Create WebKit view for HTML rendering
                const webView = new WebKit.WebView();
                
                // Get filtered data
                const filteredTasks = this._getFilteredTasks();
                const data = this.templateEngine.generateDataFromTasks(
                    filteredTasks, 
                    this.projects, 
                    this.clients,
                    { 
                        includeBilling: this.includeBilling,
                        logoPath: this.sections.logoPath,
                        period: this.filterPeriod
                    }
                );
                
                // Generate HTML from template
                const html = this.templateEngine.renderTemplate(this.currentTemplate, data, this.sections);
                
                // Load HTML content
                webView.load_html(html, 'file:///');
                
                // Wait for content to load then print
                webView.connect('load-changed', (webView, loadEvent) => {
                    if (loadEvent === WebKit.LoadEvent.FINISHED) {
                        // Small delay to ensure rendering is complete
                        GLib.timeout_add(GLib.PRIORITY_DEFAULT, 500, () => {
                            this._printWebViewToPDF(webView, filepath, parentWindow).then(resolve).catch(reject);
                            return GLib.SOURCE_REMOVE;
                        });
                    }
                });
                
            } catch (error) {
                reject(error);
            }
        });
    }

    async _printWebViewToPDF(webView, filepath, parentWindow) {
        return new Promise((resolve, reject) => {
            try {
                const printOp = WebKit.PrintOperation.new(webView);
                const printSettings = Gtk.PrintSettings.new();
                
                // Configure print settings for PDF
                printSettings.set_printer('Print to File');
                printSettings.set('output-file-format', 'pdf');
                printSettings.set('output-uri', `file://${filepath}`);
                
                // Set page setup
                const pageSetup = Gtk.PageSetup.new();
                pageSetup.set_orientation(Gtk.PageOrientation.PORTRAIT);
                pageSetup.set_paper_size(Gtk.PaperSize.new(Gtk.PAPER_NAME_A4));
                
                printOp.set_print_settings(printSettings);
                printOp.set_page_setup(pageSetup);
                
                // Run print operation
                printOp.print();
                
                // Monitor print completion
                GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1000, () => {
                    if (GLib.file_test(filepath, GLib.FileTest.EXISTS)) {
                        resolve();
                        return GLib.SOURCE_REMOVE;
                    }
                    return GLib.SOURCE_CONTINUE;
                });
                
            } catch (error) {
                reject(error);
            }
        });
    }

    _getFilteredTasks() {
        let filteredTasks = this.tasks || [];
        
        // Apply project filter
        if (this.filterByProject) {
            filteredTasks = filteredTasks.filter(task => task.project_id === this.filterByProject);
        }
        
        // Apply client filter
        if (this.filterByClient) {
            filteredTasks = filteredTasks.filter(task => task.client_id === this.filterByClient);
        }

        // Apply date range filtering
        if (this.filterPeriod && this.filterPeriod !== 'all') {
            const now = new Date();
            let startDate, endDate;

            if (this.filterPeriod === 'custom' && this.customDateRange) {
                startDate = this.customDateRange.from;
                endDate = this.customDateRange.to;
            } else if (this.filterPeriod === 'week') {
                // Calculate Monday of current week (ISO week standard)
                const monday = new Date(now);
                const dayOfWeek = now.getDay(); // 0 = Sunday, 1 = Monday, etc.
                const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // If Sunday, go back 6 days
                monday.setDate(now.getDate() - daysToMonday);
                monday.setHours(0, 0, 0, 0);
                
                const sunday = new Date(monday);
                sunday.setDate(monday.getDate() + 6);
                sunday.setHours(23, 59, 59, 999);
                
                startDate = monday;
                endDate = sunday;
            } else if (this.filterPeriod === 'month') {
                startDate = new Date(now.getFullYear(), now.getMonth(), 1);
                endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
            } else if (this.filterPeriod === 'year') {
                startDate = new Date(now.getFullYear(), 0, 1);
                endDate = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);
            }

            if (startDate && endDate) {
                filteredTasks = filteredTasks.filter(task => {
                    if (!task.start) return false;
                    const taskDate = new Date(task.start);
                    return taskDate >= startDate && taskDate <= endDate;
                });
            }
        }

        return filteredTasks;
    }

    _generateFileName() {
        const date = new Date();
        const dateStr = date.toISOString().split('T')[0];
        return `Custom_Template_Report_${dateStr}.pdf`;
    }

    // Template management methods
    getAvailableTemplates() {
        return this.templateEngine.getAllTemplates();
    }

    loadCustomTemplate(filepath) {
        const templateId = this.templateEngine.loadTemplateFromFile(filepath);
        if (templateId) {
            this.currentTemplate = templateId;
            return true;
        }
        return false;
    }

    saveCurrentTemplate(filepath) {
        return this.templateEngine.saveTemplateToFile(this.currentTemplate, filepath);
    }
}