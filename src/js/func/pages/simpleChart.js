import Gtk from 'gi://Gtk';

// Advanced chart functionality with filters
export class SimpleChart {
    constructor(placeholder) {
        this.placeholder = placeholder;
        this.currentPeriod = 'week'; // week, month, year, custom
        this.selectedProjectId = null; // null = all projects
        this.selectedClientId = null; // null = all clients
        this.allProjects = []; // Store projects for color mapping
        this.customDateRange = null; // For custom date range filtering
        this._cssProviderCache = new Map(); // Cache CSS providers to avoid creating too many
    }

    createChart(allTasks, allProjects = [], allClients = []) {
        this.allProjects = allProjects; // Store projects for color access
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

    setCustomDateRange(fromDate, toDate) {
        this.customDateRange = { fromDate, toDate };
        this.currentPeriod = 'custom';
    }

    clearCustomDateRange() {
        this.customDateRange = null;
        if (this.currentPeriod === 'custom') {
            this.currentPeriod = 'week';
        }
    }

    _showPlaceholder() {
        const placeholderLabel = new Gtk.Label({
            label: _('📊 No data yet\nStart tracking time to see your productivity chart'),
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
        let titleText = _('📊 Weekly Activity');
        if (this.currentPeriod === 'week') {
            const currentWeek = this._getGermanWeekNumber(new Date());
            titleText = _('📊 Weekly Activity (KW %d)').replace('%d', currentWeek);
        }
        if (this.currentPeriod === 'month') titleText = _('📊 Monthly Activity (4 weeks)');
        if (this.currentPeriod === 'year') titleText = _('📊 Yearly Activity (12 months)');
        if (this.currentPeriod === 'custom' && this.customDateRange) {
            const fromDate = this.customDateRange.fromDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            const toDate = this.customDateRange.toDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            titleText = `📊 Custom Range (${fromDate} - ${toDate})`;
        }
        
        const titleLabel = new Gtk.Label({
            label: titleText,
            css_classes: ['title-4'],
            halign: Gtk.Align.CENTER,
            margin_bottom: 8
        });
        chartBox.append(titleLabel);
        
        // Calculate chart dimensions
        const minBarWidth = 48; // 40px bar + 8px spacing
        const calculatedWidth = chartData.length * minBarWidth;
        const maxWidthForCentering = 400; // Maximum width before switching to scrollable mode
        
        // Find max value for scaling - ensure minimum reasonable scale
        const maxHours = Math.max(...chartData.map(d => d.hours), 1);
        
        // For custom ranges with small daily values, ensure minimum scale for visibility
        const adjustedMaxHours = this._getAdjustedMaxHours(maxHours, chartData);
        
        // Create bars container
        const barsBox = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 8,
            height_request: 120
        });
        
        // Create bars for each day
        chartData.forEach(dayData => {
            this._createBar(barsBox, dayData, adjustedMaxHours);
        });
        
        // Always center the chart regardless of number of elements
        const centeringContainer = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            halign: Gtk.Align.CENTER,
            valign: Gtk.Align.CENTER,
            hexpand: true
        });
        
        if (calculatedWidth <= maxWidthForCentering) {
            // Few elements - simple centered layout
            centeringContainer.append(barsBox);
        } else {
            // Many elements - use scrollable container with dragging, but still centered
            // Calculate responsive width based on available space
            const maxScrollWidth = Math.min(calculatedWidth, 600); // Max 600px or content width
            
            const scrolledWindow = new Gtk.ScrolledWindow({
                hscrollbar_policy: Gtk.PolicyType.AUTOMATIC,
                vscrollbar_policy: Gtk.PolicyType.NEVER,
                height_request: 140, // Slightly larger to accommodate scrollbar
                width_request: maxScrollWidth,
                kinetic_scrolling: true, // Enable smooth kinetic scrolling/dragging
                overlay_scrolling: true  // Use overlay scrollbars for cleaner look
            });
            
            barsBox.set_halign(Gtk.Align.START);
            barsBox.set_size_request(calculatedWidth, -1);
            
            scrolledWindow.set_child(barsBox);
            
            // Add touch/drag gesture support for better dragging experience
            const dragGesture = new Gtk.GestureDrag();
            dragGesture.set_button(1); // Primary mouse button
            
            let startScrollX = 0;
            let startDragX = 0;
            
            dragGesture.connect('drag-begin', (gesture, startX, startY) => {
                const adjustment = scrolledWindow.get_hadjustment();
                startScrollX = adjustment.get_value();
                startDragX = startX;
            });
            
            dragGesture.connect('drag-update', (gesture, offsetX, offsetY) => {
                const adjustment = scrolledWindow.get_hadjustment();
                const newValue = startScrollX - offsetX;
                adjustment.set_value(Math.max(0, Math.min(newValue, adjustment.get_upper() - adjustment.get_page_size())));
            });
            
            scrolledWindow.add_controller(dragGesture);
            centeringContainer.append(scrolledWindow);
        }
        
        chartBox.append(centeringContainer);
        
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
        } else if (this.currentPeriod === 'custom' && this.customDateRange) {
            const fromDate = this.customDateRange.fromDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            const toDate = this.customDateRange.toDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            summaryText = `Total: ${totalHours.toFixed(1)} hours (${fromDate} - ${toDate})`;
        }
        
        const summaryLabel = new Gtk.Label({
            label: summaryText,
            css_classes: ['chart-summary-label'],
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
        
        // Bar container with fixed height
        const barBox = new Gtk.Box({
            width_request: 24,
            height_request: 80,
            halign: Gtk.Align.CENTER,
            valign: Gtk.Align.END
        });
        
        if (dayData.projectSegments && dayData.projectSegments.length > 0) {
            // Create stacked bar with multiple project colors
            const totalBarHeight = Math.max((dayData.hours / maxHours) * 80, 2);
            
            // Create a vertical stacked bar
            const stackedBar = new Gtk.Box({
                orientation: Gtk.Orientation.VERTICAL,
                width_request: 24,
                height_request: totalBarHeight,
                halign: Gtk.Align.CENTER,
                valign: Gtk.Align.END,
                css_classes: ['chart-bar-stack']
            });
            
            let cumulativeHeight = 0;
            dayData.projectSegments.forEach((segment, index) => {
                if (segment.hours > 0) {
                    const segmentHeight = (segment.hours / dayData.hours) * totalBarHeight;
                    
                    const segmentBar = new Gtk.Box({
                        width_request: 24,
                        height_request: segmentHeight,
                        halign: Gtk.Align.FILL,
                        valign: Gtk.Align.FILL,
                        css_classes: [`chart-segment-${index}`]
                    });
                    
                    // Get project color
                    const project = this.allProjects.find(p => p.id === segment.projectId);
                    const projectColor = project ? project.color : '#9a9996';
                    
                    // Apply color with border radius only for first/last segments
                    const isFirst = index === 0;
                    const isLast = index === dayData.projectSegments.length - 1;
                    const borderRadius = isFirst && isLast ? '4px' : 
                                       isFirst ? '4px 4px 0 0' : 
                                       isLast ? '0 0 4px 4px' : '0';
                    
                    const segmentCss = `
                        .chart-segment-${index} {
                            background: ${projectColor};
                            border-radius: ${borderRadius};
                            ${index > 0 ? 'border-top: 1px solid rgba(255,255,255,0.3);' : ''}
                        }
                    `;

                    // Reuse cached provider based on CSS content
                    const cacheKey = `segment-${projectColor}-${borderRadius}-${index}`;
                    let segmentProvider = this._cssProviderCache.get(cacheKey);
                    if (!segmentProvider) {
                        segmentProvider = new Gtk.CssProvider();
                        segmentProvider.load_from_data(segmentCss, -1);
                        this._cssProviderCache.set(cacheKey, segmentProvider);
                    }
                    segmentBar.get_style_context().add_provider(segmentProvider, Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION);
                    
                    stackedBar.append(segmentBar);
                }
            });
            
            barBox.append(stackedBar);
        } else {
            // Empty day - show gray placeholder
            const emptyBar = new Gtk.Box({
                width_request: 24,
                height_request: 2,
                css_classes: ['chart-bar-empty'],
                halign: Gtk.Align.CENTER,
                valign: Gtk.Align.END
            });
            
            const emptyCss = `
                .chart-bar-empty {
                    background: #deddda;
                    border-radius: 2px;
                }
            `;
            // Reuse shared empty bar provider
            if (!this._emptyBarProvider) {
                this._emptyBarProvider = new Gtk.CssProvider();
                this._emptyBarProvider.load_from_data(emptyCss, -1);
            }
            emptyBar.get_style_context().add_provider(this._emptyBarProvider, Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION);
            
            barBox.append(emptyBar);
        }
        
        barContainer.append(barBox);
        
        // Period label (day/week/month)
        const periodLabel = new Gtk.Label({
            label: dayData.label,
            css_classes: ['chart-period-label'],
            halign: Gtk.Align.CENTER
        });
        barContainer.append(periodLabel);
        
        // Hours label
        const hoursLabel = new Gtk.Label({
            label: dayData.hours > 0 ? `${dayData.hours.toFixed(1)}h` : '0h',
            css_classes: ['chart-hours-label'],
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
            case 'custom':
                data = this._getCustomRangeData(filteredTasks);
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
        
        // Calculate Monday of current week (ISO week standard)
        const monday = new Date(today);
        const dayOfWeek = today.getDay(); // 0 = Sunday, 1 = Monday, etc.
        const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // If Sunday, go back 6 days
        monday.setDate(today.getDate() - daysToMonday);
        monday.setHours(0, 0, 0, 0); // Start of Monday

        // Chart showing week period

        // Generate data for Monday through Sunday
        for (let i = 0; i < 7; i++) {
            const date = new Date(monday);
            date.setDate(monday.getDate() + i);
            const dayName = days[i];
            
            let totalSeconds = 0;
            const projectHours = new Map(); // Track time per project for this day
            
            tasks.forEach(task => {
                if (task.start) {
                    const taskDate = new Date(task.start);
                    if (taskDate.toDateString() === date.toDateString()) {
                        const duration = task.duration || 0;
                        totalSeconds += duration;
                        
                        // Track project hours
                        const projectId = task.project_id || 1;
                        projectHours.set(projectId, (projectHours.get(projectId) || 0) + duration);
                    }
                }
            });
            
            // Convert to project segments for stacking
            const projectSegments = [];
            for (const [projectId, duration] of projectHours) {
                projectSegments.push({
                    projectId: projectId,
                    hours: duration / 3600
                });
            }
            
            // Sort by hours for consistent stacking
            projectSegments.sort((a, b) => b.hours - a.hours);
            
            data.push({
                label: dayName,
                hours: totalSeconds / 3600,
                date: date,
                projectSegments: projectSegments
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
            const projectHours = new Map(); // Track time per project for this week
            
            tasks.forEach(task => {
                if (task.start) {
                    const taskDate = new Date(task.start);
                    if (taskDate >= weekStart && taskDate <= weekEnd) {
                        const duration = task.duration || 0;
                        totalSeconds += duration;
                        
                        // Track project hours
                        const projectId = task.project_id || 1;
                        projectHours.set(projectId, (projectHours.get(projectId) || 0) + duration);
                    }
                }
            });
            
            // Convert to project segments for stacking
            const projectSegments = [];
            for (const [projectId, duration] of projectHours) {
                projectSegments.push({
                    projectId: projectId,
                    hours: duration / 3600
                });
            }
            
            // Sort by hours for consistent stacking
            projectSegments.sort((a, b) => b.hours - a.hours);
            
            const germanWeekNumber = this._getGermanWeekNumber(weekStart);
            data.push({
                label: `KW${germanWeekNumber}`,
                hours: totalSeconds / 3600,
                date: weekStart,
                projectSegments: projectSegments
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
            const projectHours = new Map(); // Track time per project for this month
            
            tasks.forEach(task => {
                if (task.start) {
                    const taskDate = new Date(task.start);
                    if (taskDate.getFullYear() === date.getFullYear() && 
                        taskDate.getMonth() === date.getMonth()) {
                        const duration = task.duration || 0;
                        totalSeconds += duration;
                        
                        // Track project hours
                        const projectId = task.project_id || 1;
                        projectHours.set(projectId, (projectHours.get(projectId) || 0) + duration);
                    }
                }
            });
            
            // Convert to project segments for stacking
            const projectSegments = [];
            for (const [projectId, duration] of projectHours) {
                projectSegments.push({
                    projectId: projectId,
                    hours: duration / 3600
                });
            }
            
            // Sort by hours for consistent stacking
            projectSegments.sort((a, b) => b.hours - a.hours);
            
            data.push({
                label: monthName,
                hours: totalSeconds / 3600,
                date: date,
                projectSegments: projectSegments
            });
        }
        
        return data;
    }

    _getCustomRangeData(tasks) {
        if (!this.customDateRange) {
            return this._getWeekData(tasks);
        }

        const data = [];
        const { fromDate, toDate } = this.customDateRange;
        
        // Calculate the number of days in the range
        const timeDiff = toDate.getTime() - fromDate.getTime();
        const daysDiff = Math.ceil(timeDiff / (1000 * 3600 * 24)) + 1;

        // If range is too long (>30 days), group by weeks
        if (daysDiff > 30) {
            return this._getCustomRangeWeeklyData(tasks, fromDate, toDate);
        }

        // Generate data for each day in the range
        for (let i = 0; i < daysDiff; i++) {
            const date = new Date(fromDate);
            date.setDate(fromDate.getDate() + i);
            
            let totalSeconds = 0;
            const projectHours = new Map();
            
            tasks.forEach(task => {
                if (task.start) {
                    const taskDate = new Date(task.start);
                    if (taskDate.toDateString() === date.toDateString()) {
                        const duration = task.duration || 0;
                        totalSeconds += duration;
                        
                        const projectId = task.project_id || 1;
                        projectHours.set(projectId, (projectHours.get(projectId) || 0) + duration);
                    }
                }
            });
            
            // Convert to project segments
            const projectSegments = [];
            for (const [projectId, duration] of projectHours) {
                projectSegments.push({
                    projectId: projectId,
                    hours: duration / 3600
                });
            }
            
            projectSegments.sort((a, b) => b.hours - a.hours);
            
            data.push({
                label: date.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' }),
                hours: totalSeconds / 3600,
                date: date,
                projectSegments: projectSegments
            });
        }
        
        return data;
    }

    _getCustomRangeWeeklyData(tasks, fromDate, toDate) {
        const data = [];
        
        // Start from Monday of the week containing fromDate
        const startDate = new Date(fromDate);
        const startDayOfWeek = startDate.getDay();
        const daysToMonday = startDayOfWeek === 0 ? 6 : startDayOfWeek - 1;
        startDate.setDate(startDate.getDate() - daysToMonday);
        
        // Generate weekly data until we cover the toDate
        let currentWeekStart = new Date(startDate);
        
        while (currentWeekStart <= toDate) {
            const weekEnd = new Date(currentWeekStart);
            weekEnd.setDate(currentWeekStart.getDate() + 6);
            
            let totalSeconds = 0;
            const projectHours = new Map();
            
            tasks.forEach(task => {
                if (task.start) {
                    const taskDate = new Date(task.start);
                    if (taskDate >= currentWeekStart && taskDate <= weekEnd && 
                        taskDate >= fromDate && taskDate <= toDate) {
                        const duration = task.duration || 0;
                        totalSeconds += duration;
                        
                        const projectId = task.project_id || 1;
                        projectHours.set(projectId, (projectHours.get(projectId) || 0) + duration);
                    }
                }
            });
            
            // Convert to project segments
            const projectSegments = [];
            for (const [projectId, duration] of projectHours) {
                projectSegments.push({
                    projectId: projectId,
                    hours: duration / 3600
                });
            }
            
            projectSegments.sort((a, b) => b.hours - a.hours);
            
            const germanWeekNumber = this._getGermanWeekNumber(currentWeekStart);
            data.push({
                label: `KW${germanWeekNumber}`,
                hours: totalSeconds / 3600,
                date: currentWeekStart,
                projectSegments: projectSegments
            });
            
            // Move to next week
            currentWeekStart = new Date(currentWeekStart);
            currentWeekStart.setDate(currentWeekStart.getDate() + 7);
        }
        
        return data;
    }

    /**
     * Adjust maximum hours for better chart visibility
     * Ensures bars have reasonable height regardless of period type
     */
    _getAdjustedMaxHours(maxHours, chartData) {
        // If we have very small values (less than 2 hours max), and this is a custom range
        // or daily view, use a more appropriate scale
        if (this.currentPeriod === 'custom' || this.currentPeriod === 'week') {
            const totalHours = chartData.reduce((sum, d) => sum + d.hours, 0);
            const avgHours = totalHours / chartData.length;
            
            // If the max is very small but we have reasonable activity, scale appropriately
            if (maxHours < 2 && totalHours > 5) {
                // Use a scale that makes the tallest bar about 70% of chart height
                return Math.max(maxHours * 1.5, 4);
            }
            
            // For very small values, ensure minimum scale of 2 hours for visibility
            if (maxHours < 1 && totalHours > 0) {
                return Math.max(maxHours * 2, 2);
            }
        }
        
        // For month/year views or when values are already reasonable, use original
        return maxHours;
    }

}