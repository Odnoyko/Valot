import Gtk from 'gi://Gtk';
import Gdk from 'gi://Gdk';
import Cairo from 'gi://cairo';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import { TimeUtils } from 'resource:///com/odnoyko/valot/js/utils/timeUtils.js';

export class PDFExporter {
    constructor(tasks, projects, clients, currentPeriod = 'week', selectedProjectId = null, selectedClientId = null) {
        this.tasks = tasks || [];
        this.projects = projects || [];
        this.clients = clients || [];
        this.currentPeriod = currentPeriod;
        this.selectedProjectId = selectedProjectId;
        this.selectedClientId = selectedClientId;
        this.timeUtils = new TimeUtils();
        
        // New options
        this.includeBilling = true;
        this.customDateRange = null; // { from: Date, to: Date }
    }

    async exportToPDF(parentWindow) {
        const dialog = new Gtk.FileDialog({
            title: 'Export Time Report'
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
        const defaultFileName = this._generateFileName(this.customName);
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
                this._createPDF(filepath);
                
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

    setCustomName(customName) {
        this.customName = customName;
    }

    _createPDF(filepath) {
        // PDF page dimensions (A4: 595x842 points)
        const pageWidth = 595;
        const pageHeight = 842;

        const surface = Cairo.PdfSurface.create(filepath, pageWidth, pageHeight);
        const ctx = Cairo.Context.create(surface);

        // Set up fonts and colors
        ctx.selectFontFace('Sans', Cairo.FontSlant.NORMAL, Cairo.FontWeight.NORMAL);

        this._drawHeader(ctx, pageWidth);
        this._drawReportInfo(ctx, pageWidth, 120);
        this._drawChart(ctx, pageWidth, 200);
        this._drawStatistics(ctx, pageWidth, 450);
        this._drawTaskList(ctx, pageWidth, 600);

        // Finish the PDF
        ctx.showPage();
        surface.finish();
        
        console.log('PDF exported to:', filepath);
    }

    _drawHeader(ctx, pageWidth) {
        const headerHeight = 80;
        
        // Background
        ctx.setSourceRgb(0.95, 0.95, 0.95);
        ctx.rectangle(0, 0, pageWidth, headerHeight);
        ctx.fill();

        // Try to load user logo (placeholder implementation)
        const logoSize = 60;
        const logoX = 20;
        const logoY = 10;
        
        // Draw logo placeholder (circle with "V")
        ctx.setSourceRgb(0.2, 0.4, 0.8);
        ctx.arc(logoX + logoSize/2, logoY + logoSize/2, logoSize/2, 0, 2 * Math.PI);
        ctx.fill();
        
        ctx.setSourceRgb(1, 1, 1);
        ctx.setFontSize(24);
        ctx.textPath('V');
        const textExtents = ctx.textExtents('V');
        ctx.moveTo(logoX + logoSize/2 - (textExtents.width || textExtents.textWidth)/2, 
                   logoY + logoSize/2 + (textExtents.height || textExtents.textHeight)/2);
        ctx.showText('V');

        // Title
        ctx.setSourceRgb(0.1, 0.1, 0.1);
        ctx.setFontSize(20);
        ctx.moveTo(logoX + logoSize + 20, 35);
        ctx.showText('Valot Time Tracking Report');

        // Date and period
        ctx.setFontSize(12);
        const currentDate = new Date().toLocaleDateString('de-DE');
        ctx.moveTo(logoX + logoSize + 20, 55);
        ctx.showText(`Generated on: ${currentDate} • Period: ${this.currentPeriod}`);
    }

    _drawReportInfo(ctx, pageWidth, y) {
        ctx.setSourceRgb(0.1, 0.1, 0.1);
        ctx.setFontSize(14);
        ctx.moveTo(20, y);
        ctx.showText('Report Summary');

        ctx.setFontSize(10);
        let infoY = y + 25;

        // Filter info
        if (this.selectedProjectId) {
            const project = this.projects.find(p => p.id === this.selectedProjectId);
            if (project) {
                ctx.moveTo(20, infoY);
                ctx.showText(`Project Filter: ${project.name}`);
                infoY += 15;
            }
        }

        if (this.selectedClientId) {
            const client = this.clients.find(c => c.id === this.selectedClientId);
            if (client) {
                ctx.moveTo(20, infoY);
                ctx.showText(`Client Filter: ${client.name}`);
                infoY += 15;
            }
        }

        // German week info for week view
        if (this.currentPeriod === 'week') {
            const weekNumber = this._getGermanWeekNumber(new Date());
            ctx.moveTo(20, infoY);
            ctx.showText(`German Week (KW): ${weekNumber}`);
        }
    }

    _drawChart(ctx, pageWidth, y) {
        const chartData = this._getChartData();
        if (chartData.length === 0) return;

        const chartWidth = pageWidth - 40;
        const chartHeight = 150;
        const barWidth = Math.min(40, chartWidth / chartData.length - 10);
        const maxHours = Math.max(...chartData.map(d => d.hours), 1);

        // Chart title
        ctx.setSourceRgb(0.1, 0.1, 0.1);
        ctx.setFontSize(14);
        let titleText = `${this.currentPeriod.charAt(0).toUpperCase() + this.currentPeriod.slice(1)} Activity Chart`;
        if (this.currentPeriod === 'week') {
            const weekNumber = this._getGermanWeekNumber(new Date());
            titleText = `Weekly Activity Chart (KW ${weekNumber})`;
        }
        ctx.moveTo(20, y);
        ctx.showText(titleText);

        // Draw bars
        const barsY = y + 30;
        const barsHeight = 100;
        let barX = 20;

        chartData.forEach((dayData, index) => {
            const barHeight = Math.max((dayData.hours / maxHours) * barsHeight, 2);
            
            // Bar
            ctx.setSourceRgb(0.2, 0.6, 1.0);
            ctx.rectangle(barX, barsY + barsHeight - barHeight, barWidth, barHeight);
            ctx.fill();

            // Label
            ctx.setSourceRgb(0.1, 0.1, 0.1);
            ctx.setFontSize(8);
            const labelText = dayData.label;
            const textExtents = ctx.textExtents(labelText);
            ctx.moveTo(barX + barWidth/2 - (textExtents.width || textExtents.textWidth)/2, barsY + barsHeight + 15);
            ctx.showText(labelText);

            // Hours
            const hoursText = dayData.hours > 0 ? `${dayData.hours.toFixed(1)}h` : '0h';
            const hoursExtents = ctx.textExtents(hoursText);
            ctx.moveTo(barX + barWidth/2 - (hoursExtents.width || hoursExtents.textWidth)/2, barsY + barsHeight + 25);
            ctx.showText(hoursText);

            barX += barWidth + 10;
        });

        // Total
        const totalHours = chartData.reduce((sum, d) => sum + d.hours, 0);
        ctx.setFontSize(10);
        ctx.moveTo(20, y + chartHeight - 10);
        ctx.showText(`Total: ${totalHours.toFixed(1)} hours`);
    }

    _drawStatistics(ctx, pageWidth, y) {
        ctx.setSourceRgb(0.1, 0.1, 0.1);
        ctx.setFontSize(14);
        ctx.moveTo(20, y);
        ctx.showText('Statistics');

        const stats = this._calculateStatistics();
        ctx.setFontSize(10);
        let statsY = y + 25;

        Object.entries(stats).forEach(([key, value]) => {
            ctx.moveTo(20, statsY);
            ctx.showText(`${key}: ${value}`);
            statsY += 15;
        });
    }

    _drawTaskList(ctx, pageWidth, y) {
        const recentTasks = this._getRecentTasks();
        if (recentTasks.length === 0) return;

        ctx.setSourceRgb(0.1, 0.1, 0.1);
        ctx.setFontSize(14);
        ctx.moveTo(20, y);
        ctx.showText('Recent Tasks');

        ctx.setFontSize(9);
        let taskY = y + 25;
        
        recentTasks.slice(0, 10).forEach(task => {
            const taskText = `${task.name} - ${this.timeUtils.formatDuration(task.duration)}`;
            ctx.moveTo(20, taskY);
            ctx.showText(taskText);
            taskY += 12;
        });
    }

    _getChartData() {
        let filteredTasks = this.tasks || [];
        
        // Apply filters
        if (this.selectedProjectId) {
            filteredTasks = filteredTasks.filter(task => task.project_id === this.selectedProjectId);
        }
        if (this.selectedClientId) {
            filteredTasks = filteredTasks.filter(task => task.client_id === this.selectedClientId);
        }

        switch (this.currentPeriod) {
            case 'week':
                return this._getWeekData(filteredTasks);
            case 'month':
                return this._getMonthData(filteredTasks);
            case 'year':
                return this._getYearData(filteredTasks);
            default:
                return this._getWeekData(filteredTasks);
        }
    }

    _getWeekData(tasks) {
        const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
        const data = [];
        const today = new Date();
        
        for (let i = 6; i >= 0; i--) {
            const date = new Date(today);
            date.setDate(date.getDate() - i);
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
                hours: totalSeconds / 3600,
                date: date
            });
        }
        
        return data;
    }

    _getMonthData(tasks) {
        const data = [];
        const today = new Date();
        
        for (let week = 3; week >= 0; week--) {
            const weekStart = new Date(today);
            weekStart.setDate(today.getDate() - (week * 7 + 6));
            const weekEnd = new Date(weekStart);
            weekEnd.setDate(weekStart.getDate() + 6);
            
            let totalSeconds = 0;
            tasks.forEach(task => {
                if (task.start) {
                    const taskDate = new Date(task.start);
                    if (taskDate >= weekStart && taskDate <= weekEnd) {
                        totalSeconds += task.duration || 0;
                    }
                }
            });
            
            const germanWeekNumber = this._getGermanWeekNumber(weekStart);
            data.push({
                label: `KW${germanWeekNumber}`,
                hours: totalSeconds / 3600,
                date: weekStart
            });
        }
        
        return data;
    }

    _getYearData(tasks) {
        const data = [];
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 
                       'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const today = new Date();
        
        for (let i = 11; i >= 0; i--) {
            const date = new Date(today.getFullYear(), today.getMonth() - i, 1);
            const monthName = months[date.getMonth()];
            
            let totalSeconds = 0;
            tasks.forEach(task => {
                if (task.start) {
                    const taskDate = new Date(task.start);
                    if (taskDate.getFullYear() === date.getFullYear() && 
                        taskDate.getMonth() === date.getMonth()) {
                        totalSeconds += task.duration || 0;
                    }
                }
            });
            
            data.push({
                label: monthName,
                hours: totalSeconds / 3600,
                date: date
            });
        }
        
        return data;
    }

    _getGermanWeekNumber(date) {
        const tempDate = new Date(date.getTime());
        tempDate.setUTCDate(tempDate.getUTCDate() + 4 - (tempDate.getUTCDay() || 7));
        const yearStart = new Date(tempDate.getUTCFullYear(), 0, 1);
        const weekNo = Math.ceil((((tempDate - yearStart) / 86400000) + 1) / 7);
        return weekNo;
    }

    _calculateStatistics() {
        const filteredTasks = this._getFilteredTasks();
        const totalTime = filteredTasks.reduce((sum, task) => sum + (task.duration || 0), 0);
        const completedTasks = filteredTasks.filter(task => !task.isActive).length;
        
        const stats = {
            'Total Time': this.timeUtils.formatDuration(totalTime),
            'Completed Tasks': completedTasks.toString(),
            'Average per Task': completedTasks > 0 ? this.timeUtils.formatDuration(totalTime / completedTasks) : '0:00:00'
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
        
        if (this.selectedProjectId) {
            filteredTasks = filteredTasks.filter(task => task.project_id === this.selectedProjectId);
        }
        if (this.selectedClientId) {
            filteredTasks = filteredTasks.filter(task => task.client_id === this.selectedClientId);
        }

        return filteredTasks;
    }

    _getRecentTasks() {
        const filteredTasks = this._getFilteredTasks();
        return filteredTasks
            .filter(task => !task.isActive)
            .sort((a, b) => new Date(b.start) - new Date(a.start));
    }
}