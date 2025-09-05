import Gtk from 'gi://Gtk';
import Gdk from 'gi://Gdk';
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
        // TimeUtils has static methods, no need to instantiate
        
        // New options
        this.includeBilling = true;
        this.customDateRange = null; // { from: Date, to: Date }
    }

    async exportToPDF(parentWindow) {
        const dialog = new Gtk.FileDialog({
            title: 'Export Time Report (Text)'
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
                    message: 'Report Export Complete',
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
            // Use custom name, ensure it has .txt extension
            const trimmedName = customName.trim();
            return trimmedName.endsWith('.txt') ? trimmedName : `${trimmedName}.txt`;
        }
        
        const date = new Date();
        const dateStr = date.toISOString().split('T')[0]; // YYYY-MM-DD
        const periodStr = this.currentPeriod.charAt(0).toUpperCase() + this.currentPeriod.slice(1);
        return `Valot_Time_Report_${periodStr}_${dateStr}.txt`;
    }

    setCustomName(customName) {
        this.customName = customName;
    }

    _createPDF(filepath) {
        // Create a simple text-based report
        const reportContent = this._generateTextReport();
        
        try {
            // Write the report content to file
            const file = Gio.File.new_for_path(filepath);
            const outputStream = file.replace(null, false, Gio.FileCreateFlags.NONE, null);
            outputStream.write(reportContent, null);
            outputStream.close(null);
            
            console.log('Report exported to:', filepath);
        } catch (error) {
            console.error('Error writing report file:', error);
            throw error;
        }
    }

    _generateTextReport() {
        const stats = this._calculateStatistics();
        const filteredTasks = this._getFilteredTasks();
        const currentDate = new Date().toLocaleDateString('de-DE');
        
        let report = `VALOT TIME TRACKING REPORT\n`;
        report += `================================\n\n`;
        report += `Generated on: ${currentDate}\n`;
        report += `Period: ${this.currentPeriod}\n`;
        
        if (this.currentPeriod === 'week') {
            const weekNumber = this._getGermanWeekNumber(new Date());
            report += `German Week (KW): ${weekNumber}\n`;
        }
        
        report += `\n`;
        
        // Filter information
        if (this.selectedProjectId) {
            const project = this.projects.find(p => p.id === this.selectedProjectId);
            if (project) {
                report += `Project Filter: ${project.name}\n`;
            }
        }
        
        if (this.selectedClientId) {
            const client = this.clients.find(c => c.id === this.selectedClientId);
            if (client) {
                report += `Client Filter: ${client.name}\n`;
            }
        }
        
        // Statistics
        report += `\nSTATISTICS\n`;
        report += `----------\n`;
        Object.entries(stats).forEach(([key, value]) => {
            report += `${key}: ${value}\n`;
        });
        
        // Task list
        const recentTasks = this._getRecentTasks().slice(0, 20);
        if (recentTasks.length > 0) {
            report += `\nRECENT TASKS\n`;
            report += `------------\n`;
            recentTasks.forEach(task => {
                const project = this.projects.find(p => p.id === task.project_id);
                const client = this.clients.find(c => c.id === task.client_id);
                report += `• ${task.name}\n`;
                report += `  Duration: ${TimeUtils.formatDuration(task.duration)}\n`;
                if (project) report += `  Project: ${project.name}\n`;
                if (client) report += `  Client: ${client.name}\n`;
                if (task.start) {
                    const startDate = new Date(task.start);
                    report += `  Date: ${startDate.toLocaleDateString('de-DE')} ${startDate.toLocaleTimeString('de-DE')}\n`;
                }
                report += `\n`;
            });
        }
        
        report += `\nGenerated by Valot Time Tracking\n`;
        
        return report;
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