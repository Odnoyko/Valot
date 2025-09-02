import Gtk from 'gi://Gtk';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import Pango from 'gi://Pango';
import PangoCairo from 'gi://PangoCairo';
import { TimeUtils } from 'resource:///com/odnoyko/valot/js/utils/timeUtils.js';
import { ThemeLoader } from 'resource:///com/odnoyko/valot/js/reports/themeLoader.js';

export class HTMLPDFExporter {
    constructor(tasks, projects, clients, currentPeriod = 'week', selectedProjectId = null, selectedClientId = null) {
        this.tasks = tasks || [];
        this.projects = projects || [];
        this.clients = clients || [];
        this.currentPeriod = currentPeriod;
        this.selectedProjectId = selectedProjectId;
        this.selectedClientId = selectedClientId;
        // TimeUtils has static methods, no need to instantiate
        
        // New options - CONFIGURE THESE BY HAND
        this.includeBilling = false;          // SET TO false TO REMOVE BILLING INFO
        this.customDateRange = null;          // { from: Date, to: Date } - SET DATE RANGE
        this.filterByProject = null;          // SET PROJECT ID TO FILTER
        this.filterByClient = null;           // SET CLIENT ID TO FILTER  
        this.filterPeriod = 'week';           // 'week', 'month', 'year', 'custom'
        this.currentTheme = 'annual-report';    // DEFAULT THEME - CHANGE THIS
        this.themeLoader = new ThemeLoader();
    }

    setTheme(themeId) {
        this.currentTheme = themeId;
    }

    getAvailableThemes() {
        return this.themeLoader.getAllThemes();
    }

    loadCustomTheme(filepath) {
        const themeId = this.themeLoader.loadThemeFromFile(filepath);
        if (themeId) {
            this.currentTheme = themeId;
            return true;
        }
        return false;
    }

    // CONFIGURE REPORT BY HAND - USE THESE METHODS
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
        // period: 'week', 'month', 'year', 'custom'
        this.filterPeriod = period;
        if (period !== 'custom') {
            this.customDateRange = null;
        }
    }

    async exportToPDF(parentWindow) {
        const dialog = new Gtk.FileDialog({
            title: 'Export Time Report as PDF'
        });

        // Set initial folder to user documents
        const homeDir = GLib.get_home_dir();
        const documentsDir = GLib.build_filenamev([homeDir, 'Documents']);
        let initialDir = documentsDir;
        
        if (GLib.file_test(documentsDir, GLib.FileTest.IS_DIR)) {
            const file = Gio.File.new_for_path(documentsDir);
            dialog.set_initial_folder(file);
        } else {
            // Fallback to home directory
            initialDir = homeDir;
            const file = Gio.File.new_for_path(homeDir);
            dialog.set_initial_folder(file);
        }

        // Set initial filename
        const defaultFileName = this._generateFileName();
        const defaultFile = Gio.File.new_for_path(GLib.build_filenamev([initialDir, defaultFileName]));
        dialog.set_initial_file(defaultFile);

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
                await this._createPDFUsingWebView(filepath, parentWindow);
                
                // Show success notification
                const toast = new Gtk.AlertDialog({
                    message: 'PDF Export Complete',
                    detail: `Report saved to: ${filepath}`
                });
                toast.show(parentWindow);
            }
        } catch (error) {
            if (error.code !== Gtk.DialogError.DISMISSED) {
                console.error('PDF export error:', error);
                const errorDialog = new Gtk.AlertDialog({
                    message: 'Export Failed',
                    detail: `Could not export PDF: ${error.message}`
                });
                errorDialog.show(parentWindow);
            }
        }
    }

    _generateFileName(customName = null) {
        if (customName && customName.trim()) {
            // Use custom name, ensure it has .pdf extension
            const trimmedName = customName.trim();
            return trimmedName.endsWith('.pdf') ? trimmedName : `${trimmedName}.pdf`;
        }
        
        const date = new Date();
        const dateStr = date.toISOString().split('T')[0]; // YYYY-MM-DD
        const periodStr = this.currentPeriod.charAt(0).toUpperCase() + this.currentPeriod.slice(1);
        return `Valot_Time_Report_${periodStr}_${dateStr}.pdf`;
    }

    async _createPDFUsingWebView(filepath, parentWindow) {
        return new Promise((resolve, reject) => {
            try {
                // Create print operation
                const printOp = Gtk.PrintOperation.new();
                const settings = Gtk.PrintSettings.new();
                const pageSetup = Gtk.PageSetup.new();
                
                // Set up PDF export
                printOp.set_export_filename(filepath);
                
                // Configure for A4 PDF
                pageSetup.set_paper_size(Gtk.PaperSize.new('iso_a4'));
                pageSetup.set_orientation(Gtk.PageOrientation.PORTRAIT);
                
                // Set margins (in mm)
                pageSetup.set_top_margin(20, Gtk.Unit.MM);
                pageSetup.set_bottom_margin(20, Gtk.Unit.MM);
                pageSetup.set_left_margin(20, Gtk.Unit.MM);
                pageSetup.set_right_margin(20, Gtk.Unit.MM);
                
                printOp.set_default_page_setup(pageSetup);
                printOp.set_print_settings(settings);
                
                // Set number of pages
                printOp.set_n_pages(1);
                
                // Connect draw-page signal
                printOp.connect('draw-page', (operation, context, pageNumber) => {
                    const cr = context.get_cairo_context();
                    const width = context.get_width();
                    const height = context.get_height();
                    
                    this._drawPDFContent(cr, width, height);
                });
                
                // Run the print operation
                try {
                    const result = printOp.run(Gtk.PrintOperationAction.EXPORT, parentWindow);
                    
                    if (result === Gtk.PrintOperationResult.APPLY) {
                        console.log('PDF exported successfully to:', filepath);
                        resolve();
                    } else {
                        reject(new Error('Print operation was cancelled'));
                    }
                } catch (printError) {
                    reject(printError);
                }
                
            } catch (error) {
                reject(error);
            }
        });
    }
    
    _drawPDFContent(cr, width, height) {
        const stats = this._calculateStatistics();
        const recentTasks = this._getRecentTasks().slice(0, 10);
        const currentDate = new Date().toLocaleDateString('de-DE');
        
        // === LOAD THEME ===
        const theme = this.themeLoader.getTheme(this.currentTheme);
        
        // Convert theme to design object
        const DESIGN = {
            // Layout from theme
            ...theme.layout,
            
            // Convert hex colors to RGB
            primary: this.themeLoader.hexToRgb(theme.colors.primary),
            secondary: this.themeLoader.hexToRgb(theme.colors.secondary),
            accent: this.themeLoader.hexToRgb(theme.colors.accent),
            success: this.themeLoader.hexToRgb(theme.colors.success),
            warning: this.themeLoader.hexToRgb(theme.colors.warning),
            danger: this.themeLoader.hexToRgb(theme.colors.danger),
            white: this.themeLoader.hexToRgb(theme.colors.white),
            lightGray: this.themeLoader.hexToRgb(theme.colors.lightGray),
            mediumGray: this.themeLoader.hexToRgb(theme.colors.mediumGray),
            darkGray: this.themeLoader.hexToRgb(theme.colors.darkGray),
            black: this.themeLoader.hexToRgb(theme.colors.black),
            
            // Typography
            ...theme.typography,
            
            // Components
            ...theme.components,
        };
        
        let yPos = 0;
        const lineHeight = 20;
        
        // Create Pango layout for better text rendering
        const layout = PangoCairo.create_layout(cr);
        
        // Helper function to set color
        const setColor = (color) => cr.setSourceRGB(color.r, color.g, color.b);
        
        // === MODERN HEADER SECTION ===
        // Header background with modern gradient simulation
        setColor(DESIGN.primary);
        cr.rectangle(0, yPos, width, DESIGN.headerHeight);
        cr.fill();
        
        // Accent stripe
        setColor(DESIGN.accent);
        cr.rectangle(0, yPos + DESIGN.headerHeight - 4, width, 4);
        cr.fill();
        
        // Modern logo area - rounded rectangle instead of circle
        setColor(DESIGN.white);
        const logoSize = 50;
        const logoX = DESIGN.margin;
        const logoY = yPos + (DESIGN.headerHeight - logoSize) / 2;
        
        // Rounded rectangle for logo (simple rectangle for now)
        cr.rectangle(logoX, logoY, logoSize, logoSize);
        cr.fill();
        
        // Logo text "V" with modern styling
        setColor(DESIGN.primary);
        layout.set_markup(`<span size="${DESIGN.titleSize}" weight="bold">V</span>`, -1);
        cr.moveTo(logoX + 17, logoY + 12);
        PangoCairo.show_layout(cr, layout);
        
        // Main title with better typography
        setColor(DESIGN.white);
        layout.set_markup(`<span size="${DESIGN.titleSize}" weight="300">VALOT</span>`, -1);
        cr.moveTo(logoX + logoSize + 20, yPos + 25);
        PangoCairo.show_layout(cr, layout);
        
        layout.set_markup(`<span size="${DESIGN.headerSize}" weight="normal">Time Tracking Report</span>`, -1);
        cr.moveTo(logoX + logoSize + 20, yPos + 50);
        PangoCairo.show_layout(cr, layout);
        
        // Report metadata in top right
        const weekNumber = this.currentPeriod === 'week' ? this._getGermanWeekNumber(new Date()) : '';
        const periodText = this.currentPeriod === 'week' ? `Week ${weekNumber}` : this.currentPeriod;
        
        layout.set_markup(`<span size="${DESIGN.bodySize}" color="white">${currentDate}</span>`, -1);
        cr.moveTo(width - 120, yPos + 30);
        PangoCairo.show_layout(cr, layout);
        
        layout.set_markup(`<span size="${DESIGN.captionSize}" color="white">${periodText}</span>`, -1);
        cr.moveTo(width - 120, yPos + 50);
        PangoCairo.show_layout(cr, layout);
        
        yPos += DESIGN.headerHeight + DESIGN.sectionSpacing;
        
        // === MODERN STATISTICS SECTION ===
        setColor(DESIGN.darkGray);
        layout.set_markup(`<span size="${DESIGN.subtitleSize}" weight="600">Overview</span>`, -1);
        cr.moveTo(DESIGN.margin, yPos);
        PangoCairo.show_layout(cr, layout);
        yPos += 35;
        
        // Statistics in modern card grid
        const statsEntries = Object.entries(stats);
        const cardsPerRow = Math.min(3, statsEntries.length);
        const cardWidth = (width - 2 * DESIGN.margin - (cardsPerRow - 1) * 15) / cardsPerRow;
        
        let currentX = DESIGN.margin;
        let currentY = yPos;
        let cardCount = 0;
        
        statsEntries.forEach(([key, value]) => {
            // Modern stat card with shadow effect
            setColor(DESIGN.white);
            cr.rectangle(currentX, currentY, cardWidth, DESIGN.statCardHeight);
            cr.fill();
            
            // Card border
            setColor(DESIGN.lightGray);
            cr.setLineWidth(1);
            cr.rectangle(currentX, currentY, cardWidth, DESIGN.statCardHeight);
            cr.stroke();
            
            // Accent top border
            setColor(DESIGN.accent);
            cr.rectangle(currentX, currentY, cardWidth, 3);
            cr.fill();
            
            // Icon background (small colored circle)
            setColor(DESIGN.accent);
            cr.arc(currentX + 20, currentY + 25, 8, 0, 2 * Math.PI);
            cr.fill();
            
            // Stat label
            setColor(DESIGN.mediumGray);
            layout.set_markup(`<span size="${DESIGN.captionSize}" weight="500">${key.toUpperCase()}</span>`, -1);
            cr.moveTo(currentX + 35, currentY + 15);
            PangoCairo.show_layout(cr, layout);
            
            // Stat value
            setColor(DESIGN.darkGray);
            layout.set_markup(`<span size="${DESIGN.headerSize}" weight="bold">${value}</span>`, -1);
            cr.moveTo(currentX + 35, currentY + 35);
            PangoCairo.show_layout(cr, layout);
            
            // Move to next card position
            cardCount++;
            currentX += cardWidth + 15;
            
            // Move to next row if needed
            if (cardCount % cardsPerRow === 0) {
                currentX = DESIGN.margin;
                currentY += DESIGN.statCardHeight + 15;
            }
        });
        
        yPos = currentY + (cardCount % cardsPerRow === 0 ? 0 : DESIGN.statCardHeight) + DESIGN.sectionSpacing;
        
        // === MODERN TASKS SECTION ===
        if (recentTasks.length > 0) {
            setColor(DESIGN.darkGray);
            layout.set_markup(`<span size="${DESIGN.subtitleSize}" weight="600">Recent Activity</span>`, -1);
            cr.moveTo(DESIGN.margin, yPos);
            PangoCairo.show_layout(cr, layout);
            yPos += 35;
            
            recentTasks.forEach((task, index) => {
                if (yPos > height - 80) return; // Stop if running out of space
                
                const project = this.projects.find(p => p.id === task.project_id);
                const client = this.clients.find(c => c.id === task.client_id);
                
                // Modern task card
                setColor(DESIGN.white);
                cr.rectangle(DESIGN.margin, yPos, width - 2 * DESIGN.margin, DESIGN.cardHeight);
                cr.fill();
                
                // Card border
                setColor(DESIGN.lightGray);
                cr.setLineWidth(1);
                cr.rectangle(DESIGN.margin, yPos, width - 2 * DESIGN.margin, DESIGN.cardHeight);
                cr.stroke();
                
                // Status indicator (colored left border)
                const statusColor = project?.id === 1 ? DESIGN.mediumGray : DESIGN.success;
                setColor(statusColor);
                cr.rectangle(DESIGN.margin, yPos, 4, DESIGN.cardHeight);
                cr.fill();
                
                // Task priority/number badge
                setColor(DESIGN.secondary);
                cr.rectangle(DESIGN.margin + 15, yPos + 15, 25, 20);
                cr.fill();
                
                setColor(DESIGN.white);
                layout.set_markup(`<span size="${DESIGN.captionSize}" weight="bold">${index + 1}</span>`, -1);
                cr.moveTo(DESIGN.margin + 24, yPos + 22);
                PangoCairo.show_layout(cr, layout);
                
                // Task name
                setColor(DESIGN.darkGray);
                layout.set_markup(`<span size="${DESIGN.bodySize}" weight="600">${task.name}</span>`, -1);
                cr.moveTo(DESIGN.margin + 50, yPos + 12);
                PangoCairo.show_layout(cr, layout);
                
                // Task metadata
                const duration = TimeUtils.formatDuration(task.duration);
                let metadata = `${duration}`;
                if (project) metadata += ` • ${project.name}`;
                if (client) metadata += ` • ${client.name}`;
                
                setColor(DESIGN.mediumGray);
                layout.set_markup(`<span size="${DESIGN.captionSize}">${metadata}</span>`, -1);
                cr.moveTo(DESIGN.margin + 50, yPos + 30);
                PangoCairo.show_layout(cr, layout);
                
                // Timestamp in top right
                if (task.start) {
                    const startDate = new Date(task.start);
                    const timeStr = startDate.toLocaleTimeString('de-DE', {hour: '2-digit', minute: '2-digit'});
                    setColor(DESIGN.mediumGray);
                    layout.set_markup(`<span size="${DESIGN.captionSize}">${timeStr}</span>`, -1);
                    cr.moveTo(width - DESIGN.margin - 50, yPos + 20);
                    PangoCairo.show_layout(cr, layout);
                }
                
                yPos += DESIGN.cardHeight + 8;
            });
        }
        
        // === MODERN FOOTER ===
        const footerY = height - DESIGN.footerHeight;
        
        // Subtle footer background
        setColor(DESIGN.lightGray);
        cr.rectangle(0, footerY, width, DESIGN.footerHeight);
        cr.fill();
        
        // Footer content
        setColor(DESIGN.mediumGray);
        const timestamp = `${new Date().toLocaleDateString('de-DE')} ${new Date().toLocaleTimeString('de-DE')}`;
        layout.set_markup(`<span size="${DESIGN.captionSize}">Generated by Valot • ${timestamp}</span>`, -1);
        cr.moveTo(DESIGN.margin, footerY + 20);
        PangoCairo.show_layout(cr, layout);
        
        // Page indicator
        layout.set_markup(`<span size="${DESIGN.captionSize}">1/1</span>`, -1);
        cr.moveTo(width - DESIGN.margin - 30, footerY + 20);
        PangoCairo.show_layout(cr, layout);
    }

    _generateHTMLReport() {
        const stats = this._calculateStatistics();
        const filteredTasks = this._getFilteredTasks();
        const currentDate = new Date().toLocaleDateString('de-DE');
        
        let html = `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Valot Time Report</title>
    <style>
        @page {
            size: A4;
            margin: 2cm;
        }
        @media print {
            .print-info {
                display: none;
            }
            body {
                -webkit-print-color-adjust: exact;
                print-color-adjust: exact;
            }
        }
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            margin: 0;
            padding: 0;
            color: #333;
            line-height: 1.6;
        }
        .header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 30px;
            border-radius: 10px;
            margin-bottom: 30px;
            text-align: center;
        }
        .header h1 {
            margin: 0;
            font-size: 2.5em;
            font-weight: 300;
        }
        .header .subtitle {
            margin: 10px 0 0 0;
            font-size: 1.2em;
            opacity: 0.9;
        }
        .section {
            margin-bottom: 30px;
            background: white;
            padding: 25px;
            border-radius: 10px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        .section h2 {
            color: #667eea;
            border-bottom: 2px solid #667eea;
            padding-bottom: 10px;
            margin-top: 0;
        }
        .stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
            gap: 20px;
            margin-top: 20px;
        }
        .stat-card {
            background: #f8f9fa;
            padding: 20px;
            border-radius: 8px;
            border-left: 4px solid #667eea;
        }
        .stat-label {
            font-weight: 600;
            color: #666;
            font-size: 0.9em;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        .stat-value {
            font-size: 1.5em;
            font-weight: 700;
            color: #333;
            margin-top: 5px;
        }
        .task-list {
            margin-top: 20px;
        }
        .task-item {
            background: #f8f9fa;
            margin: 10px 0;
            padding: 15px;
            border-radius: 8px;
            border-left: 4px solid #28a745;
        }
        .task-name {
            font-weight: 600;
            color: #333;
            font-size: 1.1em;
        }
        .task-details {
            margin-top: 8px;
            font-size: 0.9em;
            color: #666;
        }
        .task-meta {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-top: 10px;
        }
        .duration {
            font-weight: 600;
            color: #667eea;
        }
        .project-client {
            color: #666;
            font-size: 0.85em;
        }
        .footer {
            text-align: center;
            margin-top: 40px;
            padding: 20px;
            color: #666;
            font-size: 0.9em;
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>Valot Time Tracking Report</h1>
        <div class="subtitle">Generated on ${currentDate} • Period: ${this.currentPeriod}`;
        
        if (this.currentPeriod === 'week') {
            const weekNumber = this._getGermanWeekNumber(new Date());
            html += ` (KW ${weekNumber})`;
        }
        
        html += `</div>
    </div>
    
    <div class="print-info" style="background: #e3f2fd; padding: 15px; border-radius: 8px; margin-bottom: 20px; border-left: 4px solid #2196f3;">
        <h3 style="margin: 0 0 10px 0; color: #1976d2;">📄 Convert to PDF</h3>
        <p style="margin: 0; color: #666;">To save as PDF: Press <strong>Ctrl+P</strong> (or Cmd+P on Mac), then select "Save as PDF" or "Print to PDF" as the destination.</p>
    </div>`;
        
        // Filter information
        if (this.selectedProjectId || this.selectedClientId) {
            html += `<div class="section">
                <h2>Applied Filters</h2>`;
            
            if (this.selectedProjectId) {
                const project = this.projects.find(p => p.id === this.selectedProjectId);
                if (project) {
                    html += `<p><strong>Project:</strong> ${project.name}</p>`;
                }
            }
            
            if (this.selectedClientId) {
                const client = this.clients.find(c => c.id === this.selectedClientId);
                if (client) {
                    html += `<p><strong>Client:</strong> ${client.name}</p>`;
                }
            }
            
            html += `</div>`;
        }
        
        // Statistics
        html += `<div class="section">
            <h2>Statistics</h2>
            <div class="stats-grid">`;
        
        Object.entries(stats).forEach(([key, value]) => {
            html += `
                <div class="stat-card">
                    <div class="stat-label">${key}</div>
                    <div class="stat-value">${value}</div>
                </div>`;
        });
        
        html += `</div></div>`;
        
        // Task list
        const recentTasks = this._getRecentTasks().slice(0, 15);
        if (recentTasks.length > 0) {
            html += `<div class="section">
                <h2>Recent Tasks</h2>
                <div class="task-list">`;
            
            recentTasks.forEach(task => {
                const project = this.projects.find(p => p.id === task.project_id);
                const client = this.clients.find(c => c.id === task.client_id);
                
                html += `
                    <div class="task-item">
                        <div class="task-name">${task.name}</div>
                        <div class="task-meta">
                            <div class="duration">${TimeUtils.formatDuration(task.duration)}</div>
                            <div class="project-client">`;
                
                if (project) html += `${project.name}`;
                if (project && client) html += ` • `;
                if (client) html += `${client.name}`;
                
                html += `</div>
                        </div>`;
                
                if (task.start) {
                    const startDate = new Date(task.start);
                    html += `<div class="task-details">
                        ${startDate.toLocaleDateString('de-DE')} at ${startDate.toLocaleTimeString('de-DE')}
                    </div>`;
                }
                
                html += `</div>`;
            });
            
            html += `</div></div>`;
        }
        
        html += `
    <div class="footer">
        Generated by Valot Time Tracking Application
    </div>
</body>
</html>`;
        
        return html;
    }

    _calculateStatistics() {
        const filteredTasks = this._getFilteredTasks();
        const totalTime = filteredTasks.reduce((sum, task) => sum + (task.duration || 0), 0);
        const completedTasks = filteredTasks.filter(task => !task.isActive).length;
        
        const stats = {
            'Total Time': TimeUtils.formatDuration(totalTime),
            'Completed Tasks': completedTasks.toString(),
            'Average per Task': completedTasks > 0 ? TimeUtils.formatDuration(totalTime / completedTasks) : '0:00:00'
        };

        if (this.selectedProjectId) {
            const project = this.projects.find(p => p.id === this.selectedProjectId);
            if (project) {
                stats['Project'] = project.name;
            }
        }

        if (this.selectedClientId) {
            const client = this.clients.find(c => c.id === this.selectedClientId);
            if (client) {
                stats['Client'] = client.name;
            }
        }

        // Add billing information if enabled
        if (this.includeBilling) {
            let totalRevenue = 0;
            filteredTasks.forEach(task => {
                const client = this.clients.find(c => c.id === task.client_id);
                if (client && task.duration) {
                    totalRevenue += (task.duration / 3600) * (client.rate || 0);
                }
            });
            stats['Total Revenue'] = `€${totalRevenue.toFixed(2)}`;
            
            if (completedTasks > 0) {
                stats['Average Rate'] = `€${(totalRevenue / (totalTime / 3600)).toFixed(2)}/h`;
            }
        }

        // Add custom date range info if applicable
        if (this.customDateRange && this.customDateRange.from && this.customDateRange.to) {
            stats['Date Range'] = `${this.customDateRange.from.toLocaleDateString('de-DE')} - ${this.customDateRange.to.toLocaleDateString('de-DE')}`;
        }

        return stats;
    }

    _getFilteredTasks() {
        let filteredTasks = this.tasks || [];
        
        // Legacy project/client filtering (for compatibility)
        if (this.selectedProjectId) {
            filteredTasks = filteredTasks.filter(task => task.project_id === this.selectedProjectId);
        }
        if (this.selectedClientId) {
            filteredTasks = filteredTasks.filter(task => task.client_id === this.selectedClientId);
        }

        // New filtering options
        if (this.filterByProject) {
            filteredTasks = filteredTasks.filter(task => task.project_id === this.filterByProject);
        }
        if (this.filterByClient) {
            filteredTasks = filteredTasks.filter(task => task.client_id === this.filterByClient);
        }

        // Date range filtering
        if (this.filterPeriod && this.filterPeriod !== 'all') {
            const now = new Date();
            let startDate, endDate;

            if (this.filterPeriod === 'custom' && this.customDateRange) {
                startDate = this.customDateRange.from;
                endDate = this.customDateRange.to;
            } else if (this.filterPeriod === 'week') {
                // Current week (Monday to Sunday)
                const monday = new Date(now);
                monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
                monday.setHours(0, 0, 0, 0);
                
                const sunday = new Date(monday);
                sunday.setDate(monday.getDate() + 6);
                sunday.setHours(23, 59, 59, 999);
                
                startDate = monday;
                endDate = sunday;
            } else if (this.filterPeriod === 'month') {
                // Current month
                startDate = new Date(now.getFullYear(), now.getMonth(), 1);
                endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
            } else if (this.filterPeriod === 'year') {
                // Current year
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

    _getRecentTasks() {
        const filteredTasks = this._getFilteredTasks();
        return filteredTasks
            .filter(task => !task.isActive)
            .sort((a, b) => new Date(b.start) - new Date(a.start));
    }

    _getGermanWeekNumber(date) {
        const tempDate = new Date(date.getTime());
        tempDate.setUTCDate(tempDate.getUTCDate() + 4 - (tempDate.getUTCDay() || 7));
        const yearStart = new Date(tempDate.getUTCFullYear(), 0, 1);
        const weekNo = Math.ceil((((tempDate - yearStart) / 86400000) + 1) / 7);
        return weekNo;
    }
}