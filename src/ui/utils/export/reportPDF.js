import Gtk from 'gi://Gtk';
import Adw from 'gi://Adw';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import WebKit from 'gi://WebKit';
import { TemplateEngine } from 'resource:///com/odnoyko/valot/ui/utils/export/templateEngine.js';
import { Config } from 'resource:///com/odnoyko/valot/config.js';

export class ReportPDF {
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
        
        // Show progress dialog
        const progressDialog = new Adw.AlertDialog({
            heading: 'Exporting PDF',
            body: 'Preparing PDF export...\nPlease wait while your report is being generated.'
        });
        progressDialog.add_response('cancel', 'Cancel');
        progressDialog.present(parentWindow);
        
        let exportCancelled = false;
        progressDialog.connect('response', () => {
            exportCancelled = true;
        });

        try {
            
            // Step 1: Create folder
            this._updateProgress(progressDialog, 'Creating export folder...');
            const reportsDir = Config.getValotReportsDir();
            const file = await this._createReportsFolder(reportsDir);
            
            if (exportCancelled) {
                //('❌ Export cancelled after folder creation');
                throw new Error('Export cancelled by user');
            }
            
            const filepath = file.get_path();
            
            if (filepath) {
                // Step 2: Generate PDF
                this._updateProgress(progressDialog, 'Generating PDF from template...\nThis may take a few moments.');
                
                await this._createPDFFromTemplate(filepath, parentWindow, progressDialog);
                
                if (exportCancelled) {
                    //('❌ Export cancelled after PDF generation attempt');
                    // Clean up partial file
                    try {
                        if (GLib.file_test(filepath, GLib.FileTest.EXISTS)) {
                            //('🧹 Cleaning up partial file...');
                            const file = Gio.File.new_for_path(filepath);
                            file.delete(null);
                            //('🧹 Partial file cleaned up');
                        }
                    } catch (cleanupError) {
                        //('⚠️ Could not clean up partial file:', cleanupError);
                    }
                    throw new Error('Export cancelled by user');
                }
                
                // Success!
                progressDialog.close();
                this._showSuccessDialog(filepath, reportsDir, parentWindow);
            }
        } catch (error) {
            progressDialog.close();
            // PDF export failed
            
            let errorMessage = error.message;
            let errorDetail = '';
            
            // Categorize errors for better user feedback
            if (error.message.includes('WebKit')) {
                errorMessage = 'PDF Generation Failed';
                errorDetail = 'WebKit rendering engine failed. This usually happens in sandboxed environments like Flatpak.\n\nTry using the HTML export option instead.';
                //('🌐 WebKit-related error detected');
            } else if (error.message.includes('print')) {
                errorMessage = 'Print System Unavailable';  
                errorDetail = 'Cannot access system printer/PDF export functionality.\n\nThis feature may not be available in your environment.';
                //('🖨️ Print system error detected');
            } else if (error.message.includes('timeout')) {
                errorMessage = 'Export Timeout';
                errorDetail = 'PDF generation took too long and was cancelled.\n\nTry reducing the amount of data in your report or try again.';
                //('⏰ Timeout error detected');
            } else if (error.message.includes('cancelled')) {
                //('👤 User cancellation detected - not showing error dialog');
                // Don't show error for user cancellation
                return;
            } else {
                //('❓ Unknown error type detected');
                errorDetail = `Technical details: ${error.message}`;
            }
            
            //('🚨 Showing error dialog to user...');
            const errorDialog = new Gtk.AlertDialog({
                message: errorMessage,
                detail: errorDetail
            });
            errorDialog.show(parentWindow);
            
            // Re-throw for fallback system
            //('🔄 Re-throwing error for fallback system');
            throw error;
        }
    }

    async _createReportsFolder(reportsDir) {
        
        try {
            // Create Valot folder if it doesn't exist
            if (!GLib.file_test(reportsDir, GLib.FileTest.IS_DIR)) {
                //(`Directory doesn't exist, creating: ${reportsDir}`);
                const result = GLib.mkdir_with_parents(reportsDir, 0o755);
                if (result !== 0) {
                    throw new Error(`Failed to create directory: ${reportsDir} (code: ${result})`);
                }
            } else {
            }
            
            // Generate filename and create file object
            const fileName = this._generateFileName();
            const filePath = GLib.build_filenamev([reportsDir, fileName]);
            return Gio.File.new_for_path(filePath);
        } catch (error) {
            //(`Error in _createReportsFolder: ${error.message}`);
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
        //(`Attempting to open folder: ${folderPath}`);
        
        try {
            // Simple xdg-open call only
            const subprocess = Gio.Subprocess.new(
                ['xdg-open', folderPath],
                Gio.SubprocessFlags.NONE
            );
            subprocess.wait_async(null, null);
            //('✓ Opened folder via xdg-open');
            return true;
        } catch (error) {
            //('Could not open folder:', error);
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

    _updateProgress(progressDialog, message) {
        try {
            progressDialog.set_body(message);
        } catch (error) {
            //('Could not update progress dialog:', error);
        }
    }

    async _createPDFFromTemplate(filepath, parentWindow, progressDialog) {
        return new Promise((resolve, reject) => {
            let timeoutId = null;
            let isCompleted = false;
            
            try {
                
                // Set timeout for the entire PDF generation process (30 seconds)
                timeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 30000, () => {
                    if (!isCompleted) {
                        //('⏰ PDF generation timeout after 30 seconds');
                        reject(new Error('PDF generation timeout - process took too long'));
                    }
                    return GLib.SOURCE_REMOVE;
                });
                
                // Create WebKit view for HTML rendering
                const webView = new WebKit.WebView();
                
                // Handle WebKit errors
                webView.connect('load-failed', (webView, loadEvent, failingURI, error) => {
                    //('🚨 WebKit load failed:', error.message);
                    if (!isCompleted) {
                        isCompleted = true;
                        if (timeoutId) GLib.source_remove(timeoutId);
                        reject(new Error(`WebKit load failed: ${error.message}`));
                    }
                });
                
                this._updateProgress(progressDialog, 'Preparing template data...');
                
                // Get filtered data
                const filteredTasks = this._getFilteredTasks();
                
                const data = this.templateEngine.generateDataFromTasks(
                    filteredTasks,
                    this.projects,
                    this.clients,
                    {
                        includeBilling: this.includeBilling,
                        logoPath: this.sections.logoPath,
                        period: this.filterPeriod,
                        selectedCurrencies: this.sections.selectedCurrencies || []
                    }
                );
                
                this._updateProgress(progressDialog, 'Generating HTML from template...');
                
                // Generate HTML from template
                const html = this.templateEngine.renderTemplate(this.currentTemplate, data, this.sections);
                
                this._updateProgress(progressDialog, 'Loading template in WebKit...');
                
                // Load HTML content
                webView.load_html(html, 'file:///');
                
                // Wait for content to load then print
                webView.connect('load-changed', (webView, loadEvent) => {
                        
                    if (loadEvent === WebKit.LoadEvent.STARTED) {
                        this._updateProgress(progressDialog, 'WebKit is rendering content...');
                    } else if (loadEvent === WebKit.LoadEvent.FINISHED) {
                        this._updateProgress(progressDialog, 'Content loaded, generating PDF...');
                        
                        // Small delay to ensure rendering is complete
                        GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1000, () => {
                            if (!isCompleted) {
                                this._printWebViewToPDF(webView, filepath, parentWindow, progressDialog)
                                    .then(() => {
                                        isCompleted = true;
                                        if (timeoutId) GLib.source_remove(timeoutId);
                                        resolve();
                                    })
                                    .catch((error) => {
                                        isCompleted = true;
                                        if (timeoutId) GLib.source_remove(timeoutId);
                                        reject(error);
                                    });
                            }
                            return GLib.SOURCE_REMOVE;
                        });
                    }
                });
                
            } catch (error) {
                //('💥 Error in _createPDFFromTemplate:', error);
                isCompleted = true;
                if (timeoutId) GLib.source_remove(timeoutId);
                reject(error);
            }
        });
    }

    async _printWebViewToPDF(webView, filepath, parentWindow, progressDialog) {
        return new Promise((resolve, reject) => {
            let printTimeoutId = null;
            let checkIntervalId = null;
            
            try {
                this._updateProgress(progressDialog, 'Converting to PDF format...');
                
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
                
                // Set timeout for print operation (15 seconds)
                printTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 15000, () => {
                    //('⏰ Print operation timeout');
                    if (checkIntervalId) GLib.source_remove(checkIntervalId);
                    reject(new Error('Print operation timeout - PDF generation took too long'));
                    return GLib.SOURCE_REMOVE;
                });
                
                // Run print operation
                try {
                    printOp.print();
                    this._updateProgress(progressDialog, 'Writing PDF file...');
                } catch (printError) {
                    //('🚨 Print operation failed:', printError.message);
                    if (printTimeoutId) GLib.source_remove(printTimeoutId);
                    reject(new Error(`Print operation failed: ${printError.message}`));
                    return;
                }
                
                let checkCount = 0;
                // Monitor print completion with better feedback
                checkIntervalId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 500, () => {
                    checkCount++;
                    
                    if (GLib.file_test(filepath, GLib.FileTest.EXISTS)) {
                        
                        // Clean up timeouts
                        if (printTimeoutId) GLib.source_remove(printTimeoutId);
                        if (checkIntervalId) GLib.source_remove(checkIntervalId);
                        
                        // Verify file size
                        try {
                            const file = Gio.File.new_for_path(filepath);
                            const fileInfo = file.query_info('standard::size', Gio.FileQueryInfoFlags.NONE, null);
                            const fileSize = fileInfo.get_size();
                            
                            if (fileSize > 0) {
                                resolve();
                            } else {
                                reject(new Error('Generated PDF file is empty'));
                            }
                        } catch (sizeError) {
                            //('Could not check file size:', sizeError);
                            resolve(); // File exists, assume it's okay
                        }
                        
                        return GLib.SOURCE_REMOVE;
                    }
                    
                    // Update progress every few checks
                    if (checkCount % 4 === 0) {
                        this._updateProgress(progressDialog, `Writing PDF file... (${Math.floor(checkCount/2)}s)`);
                    }
                    
                    return GLib.SOURCE_CONTINUE;
                });
                
            } catch (error) {
                //('💥 Error in _printWebViewToPDF:', error);
                if (printTimeoutId) GLib.source_remove(printTimeoutId);
                if (checkIntervalId) GLib.source_remove(checkIntervalId);
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