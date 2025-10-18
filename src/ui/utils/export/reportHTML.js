import Gtk from 'gi://Gtk';
import Adw from 'gi://Adw';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import { TemplateEngine } from 'resource:///com/odnoyko/valot/ui/utils/export/templateEngine.js';
import { Config } from 'resource:///com/odnoyko/valot/config.js';

export class ReportHTML {
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

    async exportToHTML(parentWindow, reason = 'fallback') {
        try {
            // If this is a fallback from failed PDF export, disable charts but keep analytics
            if (reason === 'fallback') {
                this.sections.showCharts = false;
                this.sections.showAnalytics = true;
            }
            
            // Create Valot reports folder and auto-save there
            const reportsDir = Config.getValotReportsDir();
            const file = await this._createReportsFolder(reportsDir);

            const filepath = file.get_path();
            if (filepath) {
                await this._createHTMLFromTemplate(filepath, parentWindow);

                // Auto-open HTML file in browser
                this._openHTMLFile(filepath);

                this._showSuccessDialog(filepath, reportsDir, parentWindow, reason);
            }
        } catch (error) {
            //('HTML export error:', error);
            const errorDialog = new Gtk.AlertDialog({
                message: 'HTML Export Failed',
                detail: `Could not export HTML: ${error.message}`
            });
            errorDialog.show(parentWindow);
        }
    }

    async _createReportsFolder(reportsDir) {

        try {
            // Create Valot folder if it doesn't exist
            if (!GLib.file_test(reportsDir, GLib.FileTest.IS_DIR)) {
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

    _showSuccessDialog(filepath, reportsDir, parentWindow, reason) {
        const fileName = filepath.split('/').pop();

        let message = 'HTML Report Export Complete';
        let body = '';

        if (reason === 'fallback') {
            message = 'PDF Export Fallback - HTML Generated';
            body = `PDF export is not available in your environment.\nHTML report created instead.\n\nFile: ${fileName}\nLocation: ${reportsDir}\n\n📄 To create PDF: Use the Print button in your browser to save as PDF.`;
        } else {
            body = `Report saved successfully!\n\nFile: ${fileName}\nLocation: ${reportsDir}\n\n📄 To create PDF: Use the Print button in your browser to save as PDF.`;
        }

        const dialog = new Adw.AlertDialog({
            heading: message,
            body: body
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

        try {
            const subprocess = Gio.Subprocess.new(
                ['xdg-open', folderPath],
                Gio.SubprocessFlags.NONE
            );
            subprocess.wait_async(null, null);
            return true;
        } catch (error) {
            //('Could not open folder:', error);
            return false;
        }
    }

    _openHTMLFile(filepath) {
        try {
            const subprocess = Gio.Subprocess.new(
                ['xdg-open', filepath],
                Gio.SubprocessFlags.NONE
            );

            subprocess.wait_async(null, (source, result) => {
                try {
                    subprocess.wait_finish(result);
                } catch (error) {
                }
            });

        } catch (error) {
        }
    }

    async _createHTMLFromTemplate(filepath, parentWindow) {
        try {
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

            // Generate HTML from template with PDF print instructions
            const html = this._generateHTMLWithPrintInstructions(data);

            // Write HTML to file
            const file = Gio.File.new_for_path(filepath);
            const outputStream = file.replace(null, false, Gio.FileCreateFlags.NONE, null);

            const bytes = new TextEncoder().encode(html);
            outputStream.write_bytes(new GLib.Bytes(bytes), null);
            outputStream.close(null);


        } catch (error) {
            //('Error creating HTML from template:', error);
            throw error;
        }
    }

    _generateHTMLWithPrintInstructions(data) {
        // Get base HTML template
        let html = this.templateEngine.renderTemplate(this.currentTemplate, data, this.sections);

        // Add print instructions at the top after body opening
        const printInstructions = `
    <div class="print-instructions" style="background: linear-gradient(135deg, #ff6b6b, #ee5a24); color: white; padding: 20px; margin: 20px 0; border-radius: 12px; text-align: center; box-shadow: 0 4px 15px rgba(255,107,107,0.3); display: block !important;">
        <h2 style="margin: 0 0 15px 0; font-size: 1.4em; font-weight: 600;">📄 Create PDF from this Report</h2>
        <p style="margin: 0 0 20px 0; font-size: 1.1em; line-height: 1.4;">Direct PDF export is not available in your environment.<br>Use your browser's print function to save as PDF:</p>

        <div style="display: flex; justify-content: center; gap: 15px; flex-wrap: wrap; margin: 20px 0;">
            <div style="background: rgba(255,255,255,0.2); padding: 15px 25px; border-radius: 8px; backdrop-filter: blur(10px);">
                <strong style="font-size: 1.1em;">Linux/Windows:</strong><br>
                <span style="font-size: 1.2em;">Ctrl + P</span>
            </div>
        </div>

        <button onclick="window.print()" style="background: white; color: #ee5a24; border: none; padding: 15px 30px; border-radius: 8px; font-size: 1.1em; font-weight: 600; cursor: pointer; box-shadow: 0 2px 8px rgba(0,0,0,0.2); transition: transform 0.2s;" onmouseover="this.style.transform='translateY(-2px)'" onmouseout="this.style.transform='translateY(0)'">
            🖨️ Print to PDF
        </button>

        <p style="margin: 15px 0 0 0; font-size: 0.9em; opacity: 0.9;">💡 Tip: Select "Save as PDF" or "Print to PDF" in your browser's print dialog</p>
    </div>

    <style>
        .print-instructions {
            position: relative;
            z-index: 1000;
        }
        
        @media print {
            .print-instructions {
                display: none !important;
                visibility: hidden !important;
                opacity: 0 !important;
                height: 0 !important;
                margin: 0 !important;
                padding: 0 !important;
                overflow: hidden !important;
            }
        }
        
        @page {
            margin: 2cm;
        }
    </style>`;

        // Insert instructions after <body> tag
        html = html.replace(/<body[^>]*>/, `$&${printInstructions}`);

        return html;
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
        return `Valot_Report_HTML_${dateStr}.html`;
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