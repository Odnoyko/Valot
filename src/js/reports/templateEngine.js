import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import { TimeUtils } from 'resource:///com/odnoyko/valot/js/utils/timeUtils.js';

export class TemplateEngine {
    constructor() {
        this.templates = new Map();
        this.loadBuiltInTemplates();
    }

    loadBuiltInTemplates() {
        // Load the professional template from resource
        this.templates.set('professional-report', {
            name: 'Professional Report',
            description: 'Modern professional report with charts, logo, and toggleable sections',
            resourcePath: 'resource:///com/odnoyko/valot/js/reports/templates/professional-report.html'
        });
    }

    renderTemplate(templateId, data, sections = {}) {
        const template = this.templates.get(templateId);
        if (!template) {
            throw new Error(`Template '${templateId}' not found`);
        }

        let html;
        
        // Load HTML from resource or file
        if (template.resourcePath) {
            try {
                const file = Gio.File.new_for_uri(template.resourcePath);
                const [success, contents] = file.load_contents(null);
                if (success) {
                    html = new TextDecoder().decode(contents);
                } else {
                    throw new Error(`Could not load template resource: ${template.resourcePath}`);
                }
            } catch (error) {
                console.error('Error loading template resource:', error);
                throw error;
            }
        } else if (template.templatePath) {
            try {
                const file = Gio.File.new_for_path(template.templatePath);
                const [success, contents] = file.load_contents(null);
                if (success) {
                    html = new TextDecoder().decode(contents);
                } else {
                    throw new Error(`Could not load template file: ${template.templatePath}`);
                }
            } catch (error) {
                console.error('Error loading template file:', error);
                throw error;
            }
        } else {
            html = template.html;
        }

        // Handle conditional sections - set visibility
        const visibilityMap = {
            'CHARTS_VISIBILITY': sections.showCharts ? '' : 'hidden',
            'TASKS_VISIBILITY': sections.showTasks ? '' : 'hidden', 
            'PROJECTS_VISIBILITY': sections.showProjects ? '' : 'hidden',
            'BILLING_VISIBILITY': sections.showBilling ? '' : 'hidden'
        };

        // Replace visibility placeholders
        Object.keys(visibilityMap).forEach(key => {
            const placeholder = `{{${key}}}`;
            html = html.replace(new RegExp(placeholder, 'g'), visibilityMap[key]);
        });
        
        // Replace data placeholders
        Object.keys(data).forEach(key => {
            const placeholder = `{{${key}}}`;
            const value = data[key] || '';
            html = html.replace(new RegExp(placeholder, 'g'), value);
        });

        return html;
    }

    generateDataFromTasks(tasks, projects, clients, options = {}) {
        const filteredTasks = tasks || [];
        const totalTime = filteredTasks.reduce((sum, task) => sum + (task.duration || 0), 0);
        const completedTasks = filteredTasks.filter(task => !task.isActive).length;
        const activeTasks = filteredTasks.filter(task => task.isActive).length;
        
        // Calculate revenue if billing enabled
        let totalRevenue = 0;
        let billableTasksCount = 0;
        let totalBillableHours = 0;
        let effectiveRate = 0;
        
        if (options.includeBilling) {
            filteredTasks.forEach(task => {
                const client = clients.find(c => c.id === task.client_id);
                const duration = task.duration || task.time_spent || 0;
                if (client && client.rate && client.rate > 0 && duration > 0) {
                    totalRevenue += (duration / 3600) * client.rate;
                    totalBillableHours += duration / 3600;
                    billableTasksCount++;
                }
            });
            effectiveRate = totalBillableHours > 0 ? (totalRevenue / totalBillableHours) : 0;
        }

        // Calculate totals
        const totalTasks = filteredTasks.length;
        
        // Generate chart data
        const chartData = this._generateChartData(filteredTasks, projects, options.period || 'week');
        const projectChartData = this._generateProjectChartData(filteredTasks, projects);
        
        // Generate task list HTML with stacking (combine tasks with same name)
        const taskStacks = {};
        
        // Group tasks by name and sum their durations
        filteredTasks.forEach(task => {
            const taskName = task.name || 'Unnamed Task';
            const project = projects.find(p => p.id === task.project_id);
            const client = clients.find(c => c.id === task.client_id);
            const key = `${taskName}_${client?.id || 'no-client'}_${project?.id || 'no-project'}`;
            
            if (!taskStacks[key]) {
                taskStacks[key] = {
                    name: taskName,
                    client: client,
                    project: project,
                    totalDuration: 0,
                    count: 0
                };
            }
            
            taskStacks[key].totalDuration += task.duration || task.time_spent || 0;
            taskStacks[key].count += 1;
        });
        
        // Convert stacks to array and generate HTML
        const stackedTasks = Object.values(taskStacks);
        const taskListHtml = stackedTasks.map((stack, index) => {
            // Add page break after every 15 stacked tasks to prevent overflow
            const pageBreak = index > 0 && index % 15 === 0 ? '<div class="section-break"></div>' : '';
            
            const taskLabel = stack.count > 1 ? `${stack.name} (${stack.count}×)` : stack.name;
            
            return `
                ${pageBreak}
                <div class="task-item">
                    <div>
                        <div class="task-name">${taskLabel}</div>
                        <div class="task-client">${stack.client?.name || 'No Client'} • ${stack.project?.name || 'No Project'}</div>
                    </div>
                    <div class="task-time">${TimeUtils.formatDuration(stack.totalDuration)}</div>
                </div>
            `;
        }).join('');

        // Generate project summary HTML with page breaks
        let projectIndex = 0;
        const projectListHtml = projects.map(project => {
            const projectTasks = filteredTasks.filter(task => task.project_id == project.id);
            const projectTime = projectTasks.reduce((sum, task) => sum + (task.duration || task.time_spent || 0), 0);
            const client = clients.find(c => c.id === project.client_id);
            
            if (projectTasks.length === 0) return '';
            
            // Add page break after every 15 projects
            const pageBreak = projectIndex > 0 && projectIndex % 15 === 0 ? '<div class="section-break"></div>' : '';
            projectIndex++;
            
            return `
                ${pageBreak}
                <div class="project-item">
                    <div>
                        <div class="project-name">${project.name}</div>
                        <div class="project-client">${client?.name || 'No Client'} • ${projectTasks.length} tasks</div>
                    </div>
                    <div class="project-time">${TimeUtils.formatDuration(projectTime)}</div>
                </div>
            `;
        }).filter(html => html !== '').join('');

        // Generate logo section HTML
        const logoSectionHtml = options.logoPath 
            ? `<img src="${options.logoPath}" alt="Logo" class="logo">`
            : `<div style="font-size: 24px; font-weight: 600; color: #2c3e50;">Your Company</div>`;

        return {
            // Header data
            PERIOD: this._getCurrentPeriod(),
            CURRENT_DATE: new Date().toLocaleDateString('en-US', { 
                year: 'numeric', 
                month: 'long', 
                day: 'numeric' 
            }),
            LOGO_SECTION: logoSectionHtml,
            
            // Chart data
            CHART_PERIOD_TITLE: chartData.title,
            TIME_CHART_HTML: chartData.html,
            PROJECT_CHART_HTML: projectChartData.html,
            PROJECT_LEGEND_HTML: projectChartData.legend,
            
            // Stats
            TOTAL_HOURS: (totalTime / 3600).toFixed(1),
            TOTAL_TASKS: totalTasks.toString(),
            ACTIVE_PROJECTS: projects.filter(p => p.active !== false).length.toString(),
            AVG_DAILY_HOURS: (totalTime / 3600 / 7).toFixed(1), // Weekly average
            
            // Task and project data as HTML
            TASK_LIST_HTML: taskListHtml || '<div class="task-item"><div><div class="task-name">No tasks found</div></div></div>',
            PROJECT_LIST_HTML: projectListHtml || '<div class="project-item"><div><div class="project-name">No projects found</div></div></div>',
            
            // Billing data
            TOTAL_REVENUE: options.includeBilling ? `€${totalRevenue.toFixed(2)}` : '€0.00',
            AVG_HOURLY_RATE: options.includeBilling && effectiveRate > 0 ? `€${effectiveRate.toFixed(2)}/h` : '€0.00/h',
            BILLABLE_HOURS: options.includeBilling ? totalBillableHours.toFixed(1) : '0.0',
            BILLABLE_TASKS_COUNT: options.includeBilling ? billableTasksCount.toString() : '0',
            EFFECTIVE_RATE: options.includeBilling && effectiveRate > 0 ? `€${effectiveRate.toFixed(2)}/h` : '€0.00/h'
        };
    }

    _getCurrentPeriod() {
        const now = new Date();
        const year = now.getFullYear();
        const month = now.getMonth();
        return `FY${year.toString().slice(-2)}/${(year + 1).toString().slice(-2)}`;
    }

    _generateChartData(tasks, projects, period = 'week') {
        let chartData = [];
        let title = 'Weekly Activity';
        
        switch (period) {
            case 'week':
                chartData = this._getWeekData(tasks);
                const currentWeek = this._getGermanWeekNumber(new Date());
                title = `📊 Weekly Activity (KW ${currentWeek})`;
                break;
            case 'month':
                chartData = this._getMonthData(tasks);
                title = '📊 Monthly Activity (4 weeks)';
                break;
            case 'year':
                chartData = this._getYearData(tasks);
                title = '📊 Yearly Activity (12 months)';
                break;
        }

        const maxHours = Math.max(...chartData.map(d => d.hours), 1);
        
        const html = chartData.map(dayData => {
            const barHeight = Math.max((dayData.hours / maxHours) * 80, 3);
            const color = this._getActivityColor(dayData.hours, maxHours);
            
            return `
                <div style="display: flex; flex-direction: column; justify-content: flex-end; align-items: center; width: 50px; height: 140px;">
                    <div style="height: ${barHeight}px; background: ${color}; width: 50px; border-radius: 4px 4px 0 0; margin-bottom: 5px;"></div>
                    <div style="font-size: 10px; color: #666; text-align: center; line-height: 1.2; margin-bottom: 2px;">${dayData.label}</div>
                    <div style="font-size: 10px; color: #666; text-align: center; font-weight: 500;">
                        ${dayData.hours > 0 ? dayData.hours.toFixed(1) + 'h' : '0h'}
                    </div>
                </div>
            `;
        }).join('');

        return { html, title };
    }

    _generateProjectChartData(tasks, projects) {
        console.log('Debug - Projects:', projects.map(p => ({id: p.id, name: p.name})));
        console.log('Debug - Tasks:', tasks.map(t => ({name: t.name, project_id: t.project_id, duration: t.duration})));
        
        // Calculate hours per project
        const projectHours = {};
        tasks.forEach(task => {
            // Use both project_id and projectId as fallback
            const projectId = task.project_id || task.projectId || 1; // Default project ID is 1
            projectHours[projectId] = (projectHours[projectId] || 0) + (task.duration || task.time_spent || 0) / 3600;
        });

        console.log('Debug - Project Hours:', projectHours);

        // Sort projects by hours and take top 5
        const sortedProjects = Object.entries(projectHours)
            .sort(([,a], [,b]) => b - a)
            .slice(0, 5);

        if (sortedProjects.length === 0) {
            return { 
                html: '<div class="chart-bar" style="height: 30px; background: #ddd; min-width: 50px;"><div class="bar-label">No data</div></div>',
                legend: '<div class="legend-item"><div class="legend-color" style="background: #ddd;"></div>No projects</div>'
            };
        }

        const maxHours = Math.max(...sortedProjects.map(([,hours]) => hours), 1);
        const projectColors = this._getProjectColors();

        const html = sortedProjects.map(([projectId, hours], index) => {
            const project = projects.find(p => p.id == projectId); // Use == for loose comparison
            const projectName = project ? project.name : `Project ${projectId}`;
            const barHeight = Math.max((hours / maxHours) * 80, 10);
            const color = projectColors[index % projectColors.length];
            
            console.log(`Debug - Project ${projectId}: ${projectName}, Hours: ${hours}, Found: ${!!project}`);
            
            return `
                <div style="display: flex; flex-direction: column; justify-content: flex-end; align-items: center; width: 60px; height: 140px;">
                    <div style="height: ${barHeight}px; background: ${color}; width: 60px; border-radius: 4px 4px 0 0; margin-bottom: 5px;"></div>
                    <div style="font-size: 10px; color: #666; text-align: center; line-height: 1.2; margin-bottom: 2px; word-break: break-word;">${projectName}</div>
                    <div style="font-size: 10px; color: #666; text-align: center; font-weight: 500;">
                        ${hours.toFixed(1)}h
                    </div>
                </div>
            `;
        }).join('');

        const legend = sortedProjects.map(([projectId, hours], index) => {
            const project = projects.find(p => p.id == projectId);
            const projectName = project ? project.name : `Project ${projectId}`;
            const color = projectColors[index % projectColors.length];
            
            return `
                <div class="legend-item">
                    <div class="legend-color" style="background: ${color};"></div>
                    ${projectName} (${hours.toFixed(1)}h)
                </div>
            `;
        }).join('');

        return { html, legend };
    }

    _getProjectColors() {
        // Project-specific colors similar to the app
        return [
            '#33d17a', // Green
            '#f9c23c', // Yellow
            '#99c1f1', // Blue
            '#f66151', // Red
            '#dc8add', // Purple
            '#865e3c', // Brown
            '#26a269', // Dark Green
            '#e66100'  // Orange
        ];
    }

    _getActivityColor(hours, maxHours) {
        const ratio = hours / maxHours;
        if (ratio > 0.7) return '#33d17a'; // Green for high activity
        if (ratio > 0.3) return '#f9c23c'; // Yellow for medium activity  
        if (ratio > 0) return '#99c1f1';   // Light blue for low activity
        return '#deddda';                  // Gray for no activity
    }

    _getGermanWeekNumber(date) {
        const tempDate = new Date(date.getTime());
        tempDate.setUTCDate(tempDate.getUTCDate() + 4 - (tempDate.getUTCDay() || 7));
        const yearStart = new Date(tempDate.getUTCFullYear(), 0, 1);
        const weekNo = Math.ceil((((tempDate - yearStart) / 86400000) + 1) / 7);
        return weekNo;
    }

    _getWeekData(tasks) {
        const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
        const data = [];
        
        // Get current week starting from Monday
        const today = new Date();
        const currentDay = today.getDay();
        const monday = new Date(today);
        // Calculate days to subtract to get to Monday (0=Sunday, 1=Monday, etc)
        const daysToMonday = currentDay === 0 ? 6 : currentDay - 1;
        monday.setDate(today.getDate() - daysToMonday);
        
        // Generate 7 days starting from Monday
        for (let i = 0; i < 7; i++) {
            const date = new Date(monday);
            date.setDate(monday.getDate() + i);
            const dayName = days[i];
            
            let totalSeconds = 0;
            tasks.forEach(task => {
                if (task.start || task.start_time) {
                    const taskDate = new Date(task.start || task.start_time);
                    if (taskDate.toDateString() === date.toDateString()) {
                        totalSeconds += task.duration || task.time_spent || 0;
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

    loadTemplateFromFile(filepath) {
        try {
            const file = Gio.File.new_for_path(filepath);
            const [success, contents] = file.load_contents(null);
            
            if (success) {
                const html = new TextDecoder().decode(contents);
                const templateId = `custom-${Date.now()}`;
                this.templates.set(templateId, {
                    name: 'Custom Template',
                    description: 'Loaded from file',
                    html: html
                });
                return templateId;
            }
        } catch (error) {
            console.error('Error loading template file:', error);
        }
        return null;
    }

    saveTemplateToFile(templateId, filepath) {
        try {
            const template = this.templates.get(templateId);
            if (!template) return false;
            
            const file = Gio.File.new_for_path(filepath);
            file.replace_contents(template.html, null, false, Gio.FileCreateFlags.NONE, null);
            return true;
        } catch (error) {
            console.error('Error saving template file:', error);
            return false;
        }
    }

    getAllTemplates() {
        return Array.from(this.templates.entries()).map(([id, template]) => ({
            id,
            name: template.name,
            description: template.description
        }));
    }
}
