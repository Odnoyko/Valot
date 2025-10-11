/**
 * Report generation service
 * Generates reports from time tracking data
 */
import { BaseService } from './BaseService.js';
import { DateFilters } from '../utils/DateFilters.js';
/**
 * Report Service
 * Handles report generation and data aggregation
 */
export class ReportService extends BaseService {
    constructor(coreAPI) {
        super(coreAPI);
    }
    /**
     * Generate report data
     */
    async generateReport(options) {
        // Fetch time entries in date range
        const entries = await this.getEntriesInRange(options);
        // Fetch related data
        const { projects, clients, tasks, instances } = await this.fetchRelatedData(entries);
        // Calculate summary
        const summary = this.calculateSummary(entries, options.dateRange);
        // Group entries
        const groups = this.groupEntries(entries, options, projects, clients, tasks, instances);
        return {
            summary,
            groups,
            entries,
            projects,
            clients,
            tasks,
            instances,
            options,
            generatedAt: new Date(),
        };
    }
    /**
     * Get time entries in date range
     */
    async getEntriesInRange(options) {
        // Get all time entries
        const allEntries = await this.core.services.tracking.getAllTimeEntries();
        // Filter by date range
        let filtered = allEntries.filter((entry) => {
            const entryDate = new Date(entry.start_time);
            return DateFilters.isInRange(entryDate, options.dateRange);
        });
        // TODO: Add project/client/task filtering when we have proper JOIN queries
        // For now, we'll need to fetch tasks and filter through them
        return filtered;
    }
    /**
     * Fetch related projects, clients, tasks, and instances
     */
    async fetchRelatedData(entries) {
        // Get unique task instance IDs from entries
        const instanceIds = new Set(entries.map(e => e.task_instance_id));
        const projects = new Map();
        const clients = new Map();
        const tasks = new Map();
        const instances = new Map();
        // Fetch instances first
        for (const id of instanceIds) {
            const instance = await this.core.services.taskInstances.getById(id);
            if (instance) {
                instances.set(String(id), instance);
                // Fetch related task
                const task = await this.core.services.tasks.getById(instance.task_id);
                if (task) {
                    tasks.set(String(instance.task_id), task);
                }
                // Fetch related project
                if (instance.project_id) {
                    const project = await this.core.services.projects.getById(instance.project_id);
                    if (project) {
                        projects.set(String(instance.project_id), project);
                        // Fetch client through project
                        if (project.client_id) {
                            const client = await this.core.services.clients.getById(project.client_id);
                            if (client) {
                                clients.set(String(project.client_id), client);
                            }
                        }
                    }
                }
                // Fetch direct client (if instance has client_id)
                if (instance.client_id) {
                    const client = await this.core.services.clients.getById(instance.client_id);
                    if (client) {
                        clients.set(String(instance.client_id), client);
                    }
                }
            }
        }
        return { projects, clients, tasks, instances };
    }
    /**
     * Calculate report summary
     */
    calculateSummary(entries, dateRange) {
        const totalDuration = entries.reduce((sum, entry) => sum + entry.duration, 0);
        // TODO: Calculate earnings from tasks with hourly rates
        const totalEarnings = 0;
        const instanceIds = new Set(entries.map(e => e.task_instance_id));
        // TODO: Get project/client counts from instances
        const projectCount = 0;
        const clientCount = 0;
        return {
            totalDuration,
            totalEntries: entries.length,
            totalEarnings,
            projectCount,
            clientCount,
            taskCount: instanceIds.size,
            averageSessionDuration: entries.length > 0 ? totalDuration / entries.length : 0,
            periodStart: dateRange.start,
            periodEnd: dateRange.end,
        };
    }
    /**
     * Group entries by specified criteria
     */
    groupEntries(entries, options, projects, clients, tasks, instances) {
        const groupBy = options.groupBy || 'project';
        const groups = new Map();
        // Calculate total duration for percentage
        const totalDuration = entries.reduce((sum, entry) => sum + entry.duration, 0);
        // Group entries
        for (const entry of entries) {
            let groupId;
            let groupName;
            const instance = instances.get(String(entry.task_instance_id));
            const task = instance ? tasks.get(String(instance.task_id)) : null;
            switch (groupBy) {
                case 'project':
                    const projectId = instance?.project_id;
                    groupId = projectId ? String(projectId) : 'no-project';
                    groupName = projectId
                        ? projects.get(String(projectId))?.name || 'Unknown Project'
                        : 'No Project';
                    break;
                case 'client':
                    // First try direct client_id from instance
                    let clientId = instance?.client_id;
                    // If not, get from project
                    if (!clientId && instance?.project_id) {
                        const project = projects.get(String(instance.project_id));
                        clientId = project?.client_id || null;
                    }
                    groupId = clientId ? String(clientId) : 'no-client';
                    groupName = clientId
                        ? clients.get(String(clientId))?.name || 'Unknown Client'
                        : 'No Client';
                    break;
                case 'task':
                    groupId = instance ? String(instance.task_id) : 'unknown';
                    groupName = task?.name || 'Unknown Task';
                    break;
                case 'date':
                    const date = new Date(entry.start_time);
                    groupId = date.toISOString().split('T')[0];
                    groupName = date.toLocaleDateString();
                    break;
                case 'none':
                default:
                    groupId = 'all';
                    groupName = 'All Entries';
                    break;
            }
            if (!groups.has(groupId)) {
                groups.set(groupId, {
                    id: groupId,
                    name: groupName,
                    duration: 0,
                    entries: [],
                    earnings: 0,
                    percentage: 0,
                });
            }
            const group = groups.get(groupId);
            group.duration += entry.duration;
            // TODO: Calculate earnings from task hourly rate
            group.entries.push(entry);
        }
        // Calculate percentages
        for (const group of groups.values()) {
            group.percentage = totalDuration > 0 ? (group.duration / totalDuration) * 100 : 0;
        }
        // Convert to array and sort
        let result = Array.from(groups.values());
        result = this.sortGroups(result, options.sortBy || 'duration', options.sortDescending);
        return result;
    }
    /**
     * Sort report groups
     */
    sortGroups(groups, sortBy, descending = true) {
        const sorted = [...groups].sort((a, b) => {
            let comparison = 0;
            switch (sortBy) {
                case 'duration':
                    comparison = a.duration - b.duration;
                    break;
                case 'name':
                    comparison = a.name.localeCompare(b.name);
                    break;
                case 'earnings':
                    comparison = a.earnings - b.earnings;
                    break;
                case 'date':
                    comparison = a.id.localeCompare(b.id);
                    break;
            }
            return descending ? -comparison : comparison;
        });
        return sorted;
    }
    /**
     * Generate chart data for report
     */
    generateChartData(reportData) {
        return reportData.groups.map(group => ({
            label: group.name,
            value: group.duration,
            percentage: group.percentage,
        }));
    }
    /**
     * Export report to CSV
     */
    exportToCSV(reportData) {
        const lines = [];
        // Header
        lines.push('Date,Task,Project,Client,Duration (min)');
        // Data rows
        for (const entry of reportData.entries) {
            const instance = reportData.instances.get(String(entry.task_instance_id));
            const task = instance ? reportData.tasks.get(String(instance.task_id)) : null;
            const project = instance?.project_id ? reportData.projects.get(String(instance.project_id)) : null;
            // Get client - first from instance, then from project
            let client = instance?.client_id ? reportData.clients.get(String(instance.client_id)) : null;
            if (!client && project?.client_id) {
                client = reportData.clients.get(String(project.client_id));
            }
            const row = [
                new Date(entry.start_time).toLocaleDateString(),
                task?.name || '',
                project?.name || '',
                client?.name || '',
                entry.duration.toString(),
            ];
            lines.push(row.join(','));
        }
        return lines.join('\n');
    }
    /**
     * Export report to JSON
     */
    exportToJSON(reportData) {
        return JSON.stringify(reportData, null, 2);
    }
    /**
     * Format duration for display (hours:minutes)
     */
    formatDuration(minutes) {
        const hours = Math.floor(minutes / 60);
        const mins = minutes % 60;
        return `${hours}:${mins.toString().padStart(2, '0')}`;
    }
    /**
     * Format currency for display
     */
    formatCurrency(amount, currency = 'USD') {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: currency,
        }).format(amount);
    }
}
