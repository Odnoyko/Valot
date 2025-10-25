import Gtk from 'gi://Gtk';
import { ReportPDF } from 'resource:///com/odnoyko/valot/ui/utils/export/reportPDF.js';
import { ReportHTML } from 'resource:///com/odnoyko/valot/ui/utils/export/reportHTML.js';

export class ReportExporter {
    constructor(tasks, projects, clients) {
        this.tasks = tasks || [];
        this.projects = projects || [];
        this.clients = clients || [];
        
        // Create both exporters
        this.pdfExporter = new ReportPDF(tasks, projects, clients);
        this.htmlExporter = new ReportHTML(tasks, projects, clients);
        
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
    }

    setTemplate(templateId) {
        this.currentTemplate = templateId;
        this.pdfExporter.setTemplate(templateId);
        this.htmlExporter.setTemplate(templateId);
    }

    configureBilling(includeBilling) {
        this.includeBilling = includeBilling;
        this.pdfExporter.configureBilling(includeBilling);
        this.htmlExporter.configureBilling(includeBilling);
    }

    configureDateRange(fromDate, toDate) {
        this.customDateRange = { from: fromDate, to: toDate };
        this.filterPeriod = 'custom';
        this.pdfExporter.configureDateRange(fromDate, toDate);
        this.htmlExporter.configureDateRange(fromDate, toDate);
    }

    configureProjectFilter(projectId) {
        this.filterByProject = projectId;
        this.pdfExporter.configureProjectFilter(projectId);
        this.htmlExporter.configureProjectFilter(projectId);
    }

    configureClientFilter(clientId) {
        this.filterByClient = clientId;
        this.pdfExporter.configureClientFilter(clientId);
        this.htmlExporter.configureClientFilter(clientId);
    }

    configurePeriod(period) {
        this.filterPeriod = period;
        if (period !== 'custom') {
            this.customDateRange = null;
        }
        this.pdfExporter.configurePeriod(period);
        this.htmlExporter.configurePeriod(period);
    }

    configureSections(sections) {
        this.sections = { ...this.sections, ...sections };
        this.pdfExporter.configureSections(sections);
        this.htmlExporter.configureSections(sections);
    }

    /**
     * Smart export: Always tries PDF first, falls back to HTML if PDF fails
     */
    async exportReport(parentWindow) {
        
        try {
            // STEP 1: Always try PDF export first
            await this.pdfExporter.exportToPDF(parentWindow);
            
        } catch (pdfError) {
            //('❌ PDF export failed:', pdfError.message);
            //('📍 PDF error stack:', pdfError.stack);
            //('🔄 Falling back to HTML export...');
            
            try {
                // STEP 2: PDF failed, export HTML with fallback message
                //('🌐 Attempting HTML export fallback...');
                await this.htmlExporter.exportToHTML(parentWindow, 'fallback');
                //('✅ HTML export fallback completed successfully!');
                
            } catch (htmlError) {
                //('💥 Both PDF and HTML export failed!');
                //('📍 HTML error:', htmlError.message);
                //('📍 HTML error stack:', htmlError.stack);
                
                // Show error dialog if both fail
                //('🚨 Showing error dialog to user...');
                const errorDialog = new Gtk.AlertDialog({
                    message: _('Export Failed'),
                    detail: _('Both PDF and HTML export failed.\n\nPDF Error: %s\nHTML Error: %s').format(pdfError.message, htmlError.message)
                });
                errorDialog.show(parentWindow);
                throw htmlError;
            }
        }
    }

    /**
     * Force HTML export (for testing or manual override)
     */
    async exportHTML(parentWindow) {
        return await this.htmlExporter.exportToHTML(parentWindow, 'manual');
    }

    /**
     * Force PDF export (for testing - will fail if PDF not available)
     */
    async exportPDF(parentWindow) {
        return await this.pdfExporter.exportToPDF(parentWindow);
    }

    // Template management methods
    getAvailableTemplates() {
        return this.pdfExporter.getAvailableTemplates();
    }

    loadCustomTemplate(filepath) {
        const result1 = this.pdfExporter.loadCustomTemplate(filepath);
        const result2 = this.htmlExporter.loadCustomTemplate(filepath);
        return result1 && result2;
    }

    saveCurrentTemplate(filepath) {
        return this.pdfExporter.saveCurrentTemplate(filepath);
    }
}