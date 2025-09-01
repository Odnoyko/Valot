import Gtk from 'gi://Gtk';

// Advanced chart functionality with filters
export class SimpleChart {
    constructor(placeholder) {
        this.placeholder = placeholder;
        this.currentPeriod = 'week'; // week, month, year
        this.selectedProjectId = null; // null = all projects
        this.selectedClientId = null; // null = all clients
    }

    createChart(allTasks, allProjects = [], allClients = []) {
        if (!this.placeholder) return;
        
        // Clear existing chart content
        while (this.placeholder.get_first_child()) {
            this.placeholder.remove(this.placeholder.get_first_child());
        }
        
        // Get filtered data based on current settings
        const chartData = this._getChartData(allTasks, this.currentPeriod, this.selectedProjectId, this.selectedClientId);
        
        if (chartData.length === 0) {
            this._showPlaceholder();
            return;
        }
        
        this._renderChart(chartData);
    }

    setPeriod(period) {
        this.currentPeriod = period;
    }

    setProjectFilter(projectId) {
        this.selectedProjectId = projectId;
    }

    setClientFilter(clientId) {
        this.selectedClientId = clientId;
    }

    _showPlaceholder() {
        const placeholderLabel = new Gtk.Label({
            label: '📊 No data yet\nStart tracking time to see your productivity chart',
            css_classes: ['dim-label'],
            justify: Gtk.Justification.CENTER,
            halign: Gtk.Align.CENTER,
            valign: Gtk.Align.CENTER
        });
        this.placeholder.append(placeholderLabel);
    }

    _renderChart(chartData) {
        // Create chart container
        const chartBox = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 8,
            margin_top: 12,
            margin_bottom: 12
        });
        
        // Chart title - dynamic based on period with German week numbering
        let titleText = '📊 Weekly Activity';
        if (this.currentPeriod === 'week') {
            const currentWeek = this._getGermanWeekNumber(new Date());
            titleText = `📊 Weekly Activity (KW ${currentWeek})`;
        }
        if (this.currentPeriod === 'month') titleText = '📊 Monthly Activity (4 weeks)';
        if (this.currentPeriod === 'year') titleText = '📊 Yearly Activity (12 months)';
        
        const titleLabel = new Gtk.Label({
            label: titleText,
            css_classes: ['title-4'],
            halign: Gtk.Align.CENTER,
            margin_bottom: 8
        });
        chartBox.append(titleLabel);
        
        // Create bars container
        const barsBox = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 8,
            halign: Gtk.Align.CENTER,
            height_request: 120
        });
        
        // Find max value for scaling
        const maxHours = Math.max(...chartData.map(d => d.hours), 1);
        
        // Create bars for each day
        chartData.forEach(dayData => {
            this._createBar(barsBox, dayData, maxHours);
        });
        
        chartBox.append(barsBox);
        
        // Total summary with period-specific text
        const totalHours = chartData.reduce((sum, d) => sum + d.hours, 0);
        let summaryText = `Total: ${totalHours.toFixed(1)} hours`;
        
        if (this.currentPeriod === 'week') {
            const currentWeek = this._getGermanWeekNumber(new Date());
            summaryText = `Total: ${totalHours.toFixed(1)} hours in KW ${currentWeek}`;
        } else if (this.currentPeriod === 'month') {
            summaryText = `Total: ${totalHours.toFixed(1)} hours in last 4 weeks`;
        } else if (this.currentPeriod === 'year') {
            summaryText = `Total: ${totalHours.toFixed(1)} hours this year`;
        }
        
        const summaryLabel = new Gtk.Label({
            label: summaryText,
            css_classes: ['caption'],
            halign: Gtk.Align.CENTER,
            margin_top: 8
        });
        chartBox.append(summaryLabel);
        
        this.placeholder.append(chartBox);
    }

    _createBar(container, dayData, maxHours) {
        const barContainer = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 4,
            width_request: 40
        });
        
        // Bar (visual representation)
        const barHeight = Math.max((dayData.hours / maxHours) * 80, 2); // Min 2px height
        
        const barBox = new Gtk.Box({
            width_request: 24,
            height_request: 80,
            halign: Gtk.Align.CENTER,
            valign: Gtk.Align.END
        });
        
        const bar = new Gtk.Box({
            width_request: 24,
            height_request: barHeight,
            css_classes: ['chart-bar'],
            halign: Gtk.Align.CENTER,
            valign: Gtk.Align.END
        });
        
        // Apply color based on activity level
        let colorClass = 'low-activity';
        if (dayData.hours > maxHours * 0.7) colorClass = 'high-activity';
        else if (dayData.hours > maxHours * 0.3) colorClass = 'medium-activity';
        
        const barCss = `
            .chart-bar.${colorClass} {
                background: ${this._getActivityColor(dayData.hours, maxHours)};
                border-radius: 4px;
            }
        `;
        const barProvider = new Gtk.CssProvider();
        barProvider.load_from_data(barCss, -1);
        bar.get_style_context().add_provider(barProvider, Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION);
        bar.add_css_class(colorClass);
        
        barBox.append(bar);
        barContainer.append(barBox);
        
        // Period label (day/week/month)
        const periodLabel = new Gtk.Label({
            label: dayData.label,
            css_classes: ['caption'],
            halign: Gtk.Align.CENTER
        });
        barContainer.append(periodLabel);
        
        // Hours label
        const hoursLabel = new Gtk.Label({
            label: dayData.hours > 0 ? `${dayData.hours.toFixed(1)}h` : '0h',
            css_classes: ['caption', 'dim-label'],
            halign: Gtk.Align.CENTER
        });
        barContainer.append(hoursLabel);
        
        container.append(barContainer);
    }

    _getChartData(allTasks, period = 'week', projectId = null, clientId = null) {
        let data = [];
        
        // Filter tasks by project and client first
        let filteredTasks = allTasks || [];
        if (projectId) {
            filteredTasks = filteredTasks.filter(task => task.project_id === projectId);
        }
        if (clientId) {
            filteredTasks = filteredTasks.filter(task => task.client_id === clientId);
        }
        
        switch (period) {
            case 'week':
                data = this._getWeekData(filteredTasks);
                break;
            case 'month':
                data = this._getMonthData(filteredTasks);
                break;
            case 'year':
                data = this._getYearData(filteredTasks);
                break;
            default:
                data = this._getWeekData(filteredTasks);
        }
        
        return data;
    }

    _getGermanWeekNumber(date) {
        // German week numbering follows ISO 8601
        const tempDate = new Date(date.getTime());
        // Set to nearest Thursday: current date + 4 - current day number
        // Make Sunday's day number 7
        tempDate.setUTCDate(tempDate.getUTCDate() + 4 - (tempDate.getUTCDay() || 7));
        // Get first day of year
        const yearStart = new Date(tempDate.getUTCFullYear(), 0, 1);
        // Calculate full weeks to nearest Thursday
        const weekNo = Math.ceil((((tempDate - yearStart) / 86400000) + 1) / 7);
        return weekNo;
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
        
        // Get last 30 days, grouped by weeks
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
        
        // Get last 12 months
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

    _getActivityColor(hours, maxHours) {
        const ratio = hours / maxHours;
        if (ratio > 0.7) return '#33d17a'; // Green for high activity
        if (ratio > 0.3) return '#f9c23c'; // Yellow for medium activity  
        if (ratio > 0) return '#99c1f1';   // Light blue for low activity
        return '#deddda';                  // Gray for no activity
    }
}