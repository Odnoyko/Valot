import Gtk from 'gi://Gtk';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import WebKit from 'gi://WebKit';
import { TemplateEngine } from 'resource:///com/odnoyko/valot/js/reports/templateEngine.js';

export class HTMLTemplatePDFExporter {
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
        const dialog = new Gtk.FileDialog({
            title: 'Export Custom Template Report as PDF'
        });

        // Set initial folder with better error handling and create Valot reports folder
        try {
            const homeDir = GLib.get_home_dir();
            let initialDir = homeDir;
            
            // Try to create Documents/Valot folder for reports
            const documentsDir = GLib.build_filenamev([homeDir, 'Documents']);
            if (GLib.file_test(documentsDir, GLib.FileTest.IS_DIR)) {
                const valotReportsDir = GLib.build_filenamev([documentsDir, 'Valot']);
                
                // Create Valot folder if it doesn't exist
                if (!GLib.file_test(valotReportsDir, GLib.FileTest.IS_DIR)) {
                    try {
                        GLib.mkdir_with_parents(valotReportsDir, 0o755);
                    } catch (mkdirError) {
                        console.log('Could not create Valot folder:', mkdirError);
                    }
                }
                
                // Try to set Valot folder as initial
                if (GLib.file_test(valotReportsDir, GLib.FileTest.IS_DIR)) {
                    try {
                        const file = Gio.File.new_for_path(valotReportsDir);
                        dialog.set_initial_folder(file);
                        initialDir = valotReportsDir;
                        console.log('Using Valot reports folder:', valotReportsDir);
                    } catch (error) {
                        console.log('Could not set Valot folder, trying Documents:', error);
                        // Fallback to Documents
                        const file = Gio.File.new_for_path(documentsDir);
                        dialog.set_initial_folder(file);
                        initialDir = documentsDir;
                    }
                } else {
                    // Use Documents as fallback
                    const file = Gio.File.new_for_path(documentsDir);
                    dialog.set_initial_folder(file);
                    initialDir = documentsDir;
                }
            } else {
                // Ultimate fallback to home directory
                const file = Gio.File.new_for_path(homeDir);
                dialog.set_initial_folder(file);
                console.log('Using home directory as fallback');
            }

            // Set initial filename
            const defaultFileName = this._generateFileName();
            const defaultFile = Gio.File.new_for_path(GLib.build_filenamev([initialDir, defaultFileName]));
            dialog.set_initial_file(defaultFile);
        } catch (error) {
            console.log('Error setting initial folder, dialog will use system default:', error);
            // Don't try to set any folder, let the system handle it
        }

        try {
            const file = await new Promise((resolve, reject) => {
                dialog.save(parentWindow, null, (source, result) => {
                    try {
                        const file = dialog.save_finish(result);
                        resolve(file);
                    } catch (error) {
                        reject(error);
                    }
                });
            });
            
            const filepath = file.get_path();
            if (filepath) {
                await this._createPDFFromTemplate(filepath, parentWindow);
                
                const toast = new Gtk.AlertDialog({
                    message: 'PDF Export Complete',
                    detail: `Custom template report saved to: ${filepath}`
                });
                toast.show(parentWindow);
            }
        } catch (error) {
            if (error.code !== Gtk.DialogError.DISMISSED) {
                console.error('Template PDF export error:', error);
                const errorDialog = new Gtk.AlertDialog({
                    message: 'Export Failed',
                    detail: `Could not export PDF: ${error.message}`
                });
                errorDialog.show(parentWindow);
            }
        }
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
                const monday = new Date(now);
                monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
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