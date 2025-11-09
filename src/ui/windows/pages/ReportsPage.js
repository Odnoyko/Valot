import Gtk from 'gi://Gtk';
import Adw from 'gi://Adw?version=1';
import Gdk from 'gi://Gdk';
import GLib from 'gi://GLib';
import { AdvancedTrackingWidget } from 'resource:///com/odnoyko/valot/ui/components/complex/AdvancedTrackingWidget.js';
import { TaskRowTemplate } from 'resource:///com/odnoyko/valot/ui/components/complex/TaskRowTemplate.js';
import { TaskStackTemplate } from 'resource:///com/odnoyko/valot/ui/components/complex/TaskStackTemplate.js';
import { getCurrencySymbol } from 'resource:///com/odnoyko/valot/data/currencies.js';
import { ReportExporter } from 'resource:///com/odnoyko/valot/ui/utils/export/reportExporter.js';
import { PDFExportPreferencesDialog } from 'resource:///com/odnoyko/valot/ui/components/dialogs/PDFExportPreferencesDialog.js';

/**
 * Reports Page - Restored UI from main branch
 * Full chart, statistics, and recent tasks list
 */
export class ReportsPage {
    constructor(config = {}) {
        this.app = config.app;
        this.parentWindow = config.parentWindow;
        this.coreBridge = config.coreBridge;

        // Chart filters state
        this.chartFilters = {
            period: 'week',
            projectId: null,
            clientId: null,
            customDateRange: null // {fromDate, toDate}
        };

        // Data cache
        this.allTasks = [];
        this.allProjects = [];
        this.allClients = [];

        // Store event handler references for cleanup
        this._eventHandlers = {};
        
        // Store GTK signal handler IDs for cleanup (GLib timers)
        this._signalHandlerIds = [];
        
        // Store widget handler connections for cleanup (widget -> handlerId)
        this._widgetConnections = new Map();

        // COPIED FROM TasksPage: Template tracking for real-time updates
        this.taskTemplates = new Map(); // taskInstanceId -> template instance
        
        // Tracked widgets/templates for cleanup (inline ListRenderService logic)
        this._trackedWidgets = new Map(); // key -> widget
        this._trackedTemplates = new Map(); // key -> template

        // Maximum cache size to prevent memory leaks
        this._maxCacheSize = 1000;
        
        // Flag to prevent multiple simultaneous loadReports() calls
        this._isLoadingReports = false;

        // Subscribe to UI events for real-time updates
        this._subscribeToEvents();

        // REMOVED: Throttle guards - no longer using real-time updates
    }

    /**
     * Subscribe to Core events for real-time updates
     */
    _subscribeToEvents() {
        if (!this.coreBridge) return;
        
        // Reload when tracking starts/stops (creates new time entries)
        // COPIED FROM TasksPage: Use _baseTimeOnStart pattern to prevent time accumulation
        this._eventHandlers['tracking-started'] = async (data) => {
            try {
                // CRITICAL: Check if tracking matches ALL active filters (period, project, client)
                // But only if _currentDateRange is already set (page loaded)
                // Otherwise, check will happen in _updateStatistics after date range is calculated
                if (data && data.startTime && this._currentDateRange) {
                    this._checkIfTrackingMatchesFilters(data);
                } else {
                    // If date range not set yet, will be checked in _updateStatistics
                    this._isTrackingInPeriod = false;
                }
                
                // Cache client info for real-time income calculations (only if matches filters)
                if (this._isTrackingInPeriod && data && data.clientId) {
                    await this._cacheTrackingClientFromData(data.clientId);
                } else {
                    this._cachedTrackingClient = null;
                }
                
                // COPIED FROM TasksPage: Save base time when tracking starts (prevents accumulation)
                if (data && data.taskInstanceId) {
                    const taskInstance = this.allTasks.find(t => t.id === data.taskInstanceId);
                    if (taskInstance) {
                        // Save base time when tracking starts (prevents accumulation)
                        taskInstance._baseTimeOnStart = taskInstance.total_time || 0;
                        
                        // Also set for template task object
                        const template = this.taskTemplates.get(data.taskInstanceId);
                        if (template && template.task) {
                            template.task._baseTimeOnStart = taskInstance._baseTimeOnStart;
                        }
                        
                        // For stack templates - find task in group and set base time
                        for (const [stackId, stackTemplate] of this.taskTemplates.entries()) {
                            if (stackTemplate.group && stackTemplate.group.tasks) {
                                const taskInStack = stackTemplate.group.tasks.find(t => t.id === data.taskInstanceId);
                                if (taskInStack) {
                                    taskInStack._baseTimeOnStart = taskInstance._baseTimeOnStart;
                                }
                            }
                        }
                    }
                }
                
                // Reload tasks to get the new tracked task instance
                await this.updateChartsOnly();
                
                // CRITICAL: Re-set _baseTimeOnStart after updateChartsOnly() reloads tasks
                // This ensures the tracked task in allTasks has the correct base time
                if (data && data.taskInstanceId) {
                    const taskInstance = this.allTasks.find(t => t.id === data.taskInstanceId);
                    if (taskInstance && taskInstance._baseTimeOnStart === undefined) {
                        taskInstance._baseTimeOnStart = taskInstance.total_time || 0;
                    }
                }
                
                // Update Recent Tasks list with fresh data including the new tracked task
                const filteredTasks = this._getFilteredTasks();
                this._updateRecentTasksList(filteredTasks);
                
                // CRITICAL: After rendering, set _baseTimeOnStart for tracked task in templates
                // This ensures templates have the correct base time for real-time updates
                if (data && data.taskInstanceId) {
                    const trackedTask = this.allTasks.find(t => t.id === data.taskInstanceId);
                    if (trackedTask && trackedTask._baseTimeOnStart !== undefined) {
                        // Set for single task template
                        const template = this.taskTemplates.get(data.taskInstanceId);
                        if (template && template.task) {
                            template.task._baseTimeOnStart = trackedTask._baseTimeOnStart;
                        }
                        
                        // Set for stack templates
                        for (const [stackId, stackTemplate] of this.taskTemplates.entries()) {
                            if (stackTemplate.group && stackTemplate.group.tasks) {
                                const taskInStack = stackTemplate.group.tasks.find(t => t.id === data.taskInstanceId);
                                if (taskInStack) {
                                    taskInStack._baseTimeOnStart = trackedTask._baseTimeOnStart;
                                }
                            }
                        }
                    }
                }
            } catch (error) {
                console.error('[ReportsPage] Error in tracking-started handler:', error);
            }
        };

        // COPIED FROM TasksPage: Full logic for tracking-stopped
        this._eventHandlers['tracking-stopped'] = async (data) => {
            try {
                // Clear tracking state
                this._isTrackingInPeriod = false;
                this._cachedTrackingClient = null;

                // Clean up realtime earnings Map cache
                if (this._realtimeEarningsMap) {
                    this._realtimeEarningsMap.clear();
                    this._realtimeEarningsMap = null;
                }

                // Clean up currency cache arrays
                this._cachedCurrentCurrencies = null;
                
                // COPIED FROM TasksPage: Update time using base time + duration (not accumulated total)
                if (data && data.taskInstanceId && data.duration) {
                    // OPTIMIZED: If template exists, update directly from event duration (no DB query)
                    const template = this.taskTemplates.get(data.taskInstanceId);
                    const taskInstance = this.allTasks.find(t => t.id === data.taskInstanceId);
                    
                    if (template && taskInstance) {
                        // CRITICAL: Update time using base time + duration (not accumulated total)
                        const baseTime = taskInstance._baseTimeOnStart !== undefined ? taskInstance._baseTimeOnStart : (taskInstance.total_time || 0);
                        taskInstance.total_time = baseTime + data.duration;
                        
                        // Clear base time marker (tracking stopped)
                        delete taskInstance._baseTimeOnStart;
                        
                        // OPTIMIZED: Update template directly (no DB query, no object creation)
                        if (template.task) {
                            template.task.total_time = taskInstance.total_time;
                            // Clear base time in template task too
                            delete template.task._baseTimeOnStart;
                        } else if (template.group) {
                            // For stack templates, update task in group
                            const taskInGroup = template.group.tasks.find(t => t.id === data.taskInstanceId);
                            if (taskInGroup) {
                                taskInGroup.total_time = taskInstance.total_time;
                                delete taskInGroup._baseTimeOnStart;
                            }
                        }
                        
                        // CRITICAL: Clear base time in all stacks that might contain this task
                        for (const [stackId, stackTemplate] of this.taskTemplates.entries()) {
                            if (stackTemplate.group && stackTemplate.group.tasks) {
                                const taskInStack = stackTemplate.group.tasks.find(t => t.id === data.taskInstanceId);
                                if (taskInStack) {
                                    taskInStack.total_time = taskInstance.total_time;
                                    delete taskInStack._baseTimeOnStart;
                                }
                            }
                        }
                        
                        // CRITICAL: Update tracking state FIRST (clears isTracking flag)
                        // This ensures isCurrentlyTracking will be false in updateTime/updateTaskTime
                        if (typeof template.updateTrackingState === 'function') {
                            template.updateTrackingState();
                        }
                        
                        // CRITICAL: Update time AFTER tracking state (so green dot is removed correctly)
                        if (typeof template.updateTime === 'function') {
                            template.updateTime(taskInstance.total_time);
                        }
                        if (typeof template.updateTaskTime === 'function') {
                            template.updateTaskTime(data.taskInstanceId, taskInstance.total_time);
                        }
                        
                        // CRITICAL: Update tracking state AGAIN after time update (ensures correct state)
                        if (typeof template.updateTrackingState === 'function') {
                            template.updateTrackingState();
                        }
                    } else if (taskInstance) {
                        // Task exists but no template - update time in allTasks
                        const baseTime = taskInstance._baseTimeOnStart !== undefined ? taskInstance._baseTimeOnStart : (taskInstance.total_time || 0);
                        taskInstance.total_time = baseTime + data.duration;
                        delete taskInstance._baseTimeOnStart;
                    }
                }
                
                // CRITICAL: Update all templates AFTER time updates (remove green dots, show start icons)
                // This ensures tracking state is correctly updated after stop
                this._updateAllTemplatesTrackingState();

                await this.updateChartsOnly();
            } catch (error) {
                console.error('[ReportsPage] Error in tracking-stopped handler:', error);
            }
        };
        
        // COPIED FROM TasksPage: Handle task creation/updates
        this._eventHandlers['task-created'] = async () => {
            // Reload tasks list to show new task
            const filteredTasks = this._getFilteredTasks();
            this._updateRecentTasksList(filteredTasks);
        };
        
        this._eventHandlers['task-updated'] = async (data) => {
            console.log('[ReportsPage] task-updated event received:', data);
            // COPIED FROM TasksPage: Update ALL task instances with same task_id
            // This ensures all entries for a task are updated when task is modified
            if (data && data.id) {
                // data.id is task_id from Core TASK_UPDATED event
                console.log('[ReportsPage] Updating all task instances for task_id:', data.id);
                await this._updateAllTaskInstances(data.id);
            } else if (data && data.taskInstanceId) {
                // data.taskInstanceId is from UI task-updated event (TaskInstanceEditDialog)
                console.log('[ReportsPage] Getting task_id from taskInstanceId:', data.taskInstanceId);
                // Get task_id from task instance and update all instances
                const taskInstance = await this.coreBridge.getTaskInstance(data.taskInstanceId);
                if (taskInstance && taskInstance.task_id) {
                    console.log('[ReportsPage] Found task_id:', taskInstance.task_id, 'updating all instances');
                    await this._updateAllTaskInstances(taskInstance.task_id);
                } else {
                    console.log('[ReportsPage] Could not get task_id, doing full reload');
                    // Fallback: full reload if can't get task_id
                    await this.updateChartsOnly();
                    const filteredTasks = this._getFilteredTasks();
                    this._updateRecentTasksList(filteredTasks);
                }
            } else {
                console.log('[ReportsPage] No ID in data, doing full reload');
                // Fallback: full reload if no ID
                await this.updateChartsOnly();
                const filteredTasks = this._getFilteredTasks();
                this._updateRecentTasksList(filteredTasks);
            }
        };
        
        // OPTIMIZED: Real-time statistics updates - only update labels, no object creation
        // COPIED FROM TasksPage: Update time using _baseTimeOnStart + elapsedSeconds
        this._eventHandlers['tracking-updated'] = async (data) => {
            console.log('[ReportsPage] tracking-updated event received:', {
                hasData: !!data,
                elapsedSeconds: data?.elapsedSeconds,
                taskName: data?.taskName,
                projectId: data?.projectId,
                clientId: data?.clientId,
                taskId: data?.taskId
            });
            
            if (!data) {
                console.log('[ReportsPage] tracking-updated: Early return - no data');
                return;
            }
            
            // CRITICAL: Check if task name, project or client changed FIRST (before elapsedSeconds check)
            // This handles cases where project/client changes but elapsedSeconds might be 0
            if (data.taskName !== undefined || data.projectId !== undefined || data.clientId !== undefined) {
                console.log('[ReportsPage] tracking-updated: Name/Project/Client changed', {
                    taskName: data.taskName,
                    projectId: data.projectId,
                    clientId: data.clientId,
                    taskId: data.taskId
                });
                
                // COPIED FROM TasksPage: Reload task list to reflect changes
                // Reload projects/clients if they changed, then reload tasks
                const promises = [];
                if (data.projectId !== undefined) {
                    promises.push(this.coreBridge.getAllProjects().then(projects => {
                        this.allProjects = (projects || []).slice(-this._maxCacheSize);
                        console.log('[ReportsPage] Projects reloaded:', this.allProjects.length);
                    }));
                }
                if (data.clientId !== undefined) {
                    promises.push(this.coreBridge.getAllClients().then(clients => {
                        this.allClients = (clients || []).slice(-this._maxCacheSize);
                        console.log('[ReportsPage] Clients reloaded:', this.allClients.length);
                    }));
                }
                await Promise.all(promises);
                
                // Reload tasks from database to get updated names/projects/clients
                console.log('[ReportsPage] Updating charts...');
                await this.updateChartsOnly();
                console.log('[ReportsPage] Charts updated, allTasks length:', this.allTasks.length);
                
                // Reload task list to reflect changes
                const filteredTasks = this._getFilteredTasks();
                console.log('[ReportsPage] Filtered tasks length:', filteredTasks.length);
                this._updateRecentTasksList(filteredTasks);
                console.log('[ReportsPage] Recent tasks list updated');
                return; // Exit early - _updateRecentTasksList() will refresh everything
            }
            
            // Only process time updates if elapsedSeconds is defined (can be 0)
            if (data.elapsedSeconds === undefined) {
                console.log('[ReportsPage] tracking-updated: Early return - no elapsedSeconds');
                return;
            }
            
            // CRITICAL: Re-check if tracking matches filters when project/client changes
            const trackingState = this.coreBridge.getTrackingState();
            if (trackingState && trackingState.isTracking) {
                // Re-check filters when project/client changes during tracking
                if (data.projectId !== undefined || data.clientId !== undefined) {
                    this._checkIfTrackingMatchesFilters({
                        startTime: trackingState.startTime,
                        projectId: data.projectId !== undefined ? data.projectId : trackingState.currentProjectId,
                        clientId: data.clientId !== undefined ? data.clientId : trackingState.currentClientId
                    });
                    
                    // If client changed and still matches filters - update currency cache
                    if (data.clientId !== undefined && this._isTrackingInPeriod) {
                        this._cacheTrackingClientFromData(data.clientId).then(() => {
                            // Clear realtime earnings map to force recalculation with new currency
                            if (this._realtimeEarningsMap) {
                                this._realtimeEarningsMap.clear();
                                this._realtimeEarningsMap = null;
                            }
                            // Update earnings with new currency (only if still matches filters)
                            if (this._isTrackingInPeriod) {
                                this._updateStatisticsRealtimeFromData(data);
                            }
                        });
                        return; // Exit early - will update after client is cached
                    }
                }
            }
            
            // COPIED FROM TasksPage: Update time labels using templates (same as TasksPage)
            if (!data.taskId) return;
            
            const tracking = this.coreBridge ? this.coreBridge.getTrackingState() : null;
            if (!tracking || !tracking.isTracking) {
                return;
            }
            
            const taskId = data.taskId;
            const elapsedSeconds = data.elapsedSeconds;
            
            // COPIED FROM TasksPage: Find tracked task by taskInstanceId first (exact match)
            // Then fallback to taskId + projectId + clientId
            let trackedTask = null;
            if (tracking.currentTaskInstanceId) {
                trackedTask = this.allTasks.find(t => t.id === tracking.currentTaskInstanceId);
            }
            
            // Fallback to taskId + projectId + clientId if not found by ID
            if (!trackedTask) {
                trackedTask = this.allTasks.find(t => 
                    t.task_id === taskId &&
                    t.project_id === tracking.currentProjectId &&
                    t.client_id === tracking.currentClientId
                );
            }
            
            if (trackedTask && elapsedSeconds !== undefined) {
                // COPIED FROM TasksPage: Update time label directly (no template lookup, no DB query)
                const template = this.taskTemplates.get(trackedTask.id);
                if (template) {
                    // OPTIMIZED: Direct update of time label only
                    if (typeof template.updateTimeLabel === 'function') {
                        template.updateTimeLabel(elapsedSeconds);
                    }
                }
                
                // COPIED FROM TasksPage: Also check if it's in a stack
                // Find all stack templates and check if they contain this task
                for (const [stackId, stackTemplate] of this.taskTemplates.entries()) {
                    if (stackTemplate.group && stackTemplate.group.tasks) {
                        // CRITICAL: Find by exact taskInstanceId first (most reliable)
                        let taskInStack = null;
                        if (tracking.currentTaskInstanceId) {
                            taskInStack = stackTemplate.group.tasks.find(t => t.id === tracking.currentTaskInstanceId);
                        }
                        
                        // Fallback: Find by task_id/project_id/client_id if not found by ID
                        if (!taskInStack) {
                            taskInStack = stackTemplate.group.tasks.find(t => 
                                t.id === trackedTask.id &&
                                t.task_id === taskId &&
                                t.project_id === tracking.currentProjectId &&
                                t.client_id === tracking.currentClientId
                            );
                        }
                        
                        if (taskInStack) {
                            // CRITICAL: Use base time from start (prevents accumulation)
                            // If _baseTimeOnStart is not set, use current total_time as fallback
                            let baseTime = taskInStack._baseTimeOnStart;
                            if (baseTime === undefined) {
                                // Fallback: try to get from trackedTask
                                baseTime = trackedTask._baseTimeOnStart;
                                if (baseTime === undefined) {
                                    // Last fallback: use current total_time
                                    baseTime = taskInStack.total_time || 0;
                                    // Set it for next time
                                    taskInStack._baseTimeOnStart = baseTime;
                                } else {
                                    // Sync with taskInStack
                                    taskInStack._baseTimeOnStart = baseTime;
                                }
                            }
                            
                            const currentTotal = baseTime + elapsedSeconds;
                            
                            if (typeof stackTemplate.updateTaskTime === 'function') {
                                stackTemplate.updateTaskTime(trackedTask.id, currentTotal);
                            }
                        }
                    }
                }
            }
            
            // CRITICAL: Only update statistics if tracking matches ALL active filters
            // If tracking doesn't match filters - don't show real-time updates in statistics
            if (!this._isTrackingInPeriod) {
                return;
            }
            
            // OPTIMIZED: Update only labels, no getTrackingState() call, no DB queries
            this._updateStatisticsRealtimeFromData(data);
        };

        // REMOVED: Duplicate task-updated handler - using COPIED FROM TasksPage version above

        this._eventHandlers['tasks-deleted'] = () => {
            this.updateChartsOnly();
        };

        this._eventHandlers['project-updated'] = async () => {
            console.log('[ReportsPage] project-updated event received');
            // COPIED FROM TasksPage: Reload tasks when project is updated
            if (!this._isLoadingReports) {
                this._isLoadingReports = true;
                try {
                    // CRITICAL: Reload projects first to get updated project names
                    this.allProjects = await this.coreBridge.getAllProjects() || [];
                    console.log('[ReportsPage] Projects reloaded:', this.allProjects.length);
                    // Then reload tasks to get updated project names in task data
                    await this.updateChartsOnly();
                    console.log('[ReportsPage] Charts updated, allTasks length:', this.allTasks.length);
                    const filteredTasks = this._getFilteredTasks();
                    console.log('[ReportsPage] Filtered tasks length:', filteredTasks.length);
                    this._updateRecentTasksList(filteredTasks);
                    console.log('[ReportsPage] Recent tasks list updated');
                } finally {
                    this._isLoadingReports = false;
                }
            }
        };
        
        this._eventHandlers['client-updated'] = async () => {
            console.log('[ReportsPage] client-updated event received');
            // COPIED FROM TasksPage: Reload tasks when client is updated
            if (!this._isLoadingReports) {
                this._isLoadingReports = true;
                try {
                    // CRITICAL: Reload clients first to get updated client names
                    this.allClients = await this.coreBridge.getAllClients() || [];
                    console.log('[ReportsPage] Clients reloaded:', this.allClients.length);
                    // Then reload tasks to get updated client names in task data
                    await this.updateChartsOnly();
                    console.log('[ReportsPage] Charts updated, allTasks length:', this.allTasks.length);
                    const filteredTasks = this._getFilteredTasks();
                    console.log('[ReportsPage] Filtered tasks length:', filteredTasks.length);
                    this._updateRecentTasksList(filteredTasks);
                    console.log('[ReportsPage] Recent tasks list updated');
                } finally {
                    this._isLoadingReports = false;
                }
            }
        };

        // Memory cleanup events disabled - cleanup happens in destroy(), not periodically
        // this._eventHandlers['memory-cleanup-ui'] = () => {
        //     this._cleanupUnusedUI();
        // };

        // Subscribe with stored handlers
        console.log('[ReportsPage] Subscribing to events:', Object.keys(this._eventHandlers));
        Object.keys(this._eventHandlers).forEach(event => {
            this.coreBridge.onUIEvent(event, this._eventHandlers[event]);
            console.log('[ReportsPage] Subscribed to event:', event);
        });
    }

    /**
     * Helper method to track GTK signal handler IDs for cleanup
     * @param {GObject.Object} widget - Widget to connect to
     * @param {string} signal - Signal name
     * @param {Function} callback - Callback function
     * @returns {number} Handler ID
     */
    _trackConnection(widget, signal, callback) {
        const handlerId = widget.connect(signal, callback);
        // Store widget reference and handler ID for cleanup
        if (!this._widgetConnections.has(widget)) {
            this._widgetConnections.set(widget, []);
        }
        this._widgetConnections.get(widget).push(handlerId);
        return handlerId;
    }

    /**
     * Add item to cache with size limit to prevent memory leaks
     */
    _addToCache(arrayName, item) {
        const array = this[arrayName];
        if (!array) return;

        // Check if item already exists (by id if available)
        if (item.id) {
            const existing = array.find(a => a.id === item.id);
            if (existing) {
                // Update existing item
                Object.assign(existing, item);
                return;
            }
        }

        array.push(item);

        // Limit cache size - keep only most recent items
        if (array.length > this._maxCacheSize) {
            // Remove oldest items (FIFO)
            array.splice(0, array.length - this._maxCacheSize);
        }
    }

    /**
     * Cleanup unused UI elements (called on destroy or when needed)
     */
    _cleanupUnusedUI() {
        // Use existing _addToCache logic which already limits size
        // But we can force cleanup if arrays are too large
        if (this.allTasks && this.allTasks.length > this._maxCacheSize) {
            // Keep only most recent items
            const toRemove = this.allTasks.length - this._maxCacheSize;
            this.allTasks.splice(0, toRemove);
        }
        
        if (this.allProjects && this.allProjects.length > this._maxCacheSize) {
            const toRemove = this.allProjects.length - this._maxCacheSize;
            this.allProjects.splice(0, toRemove);
        }
        
        if (this.allClients && this.allClients.length > this._maxCacheSize) {
            const toRemove = this.allClients.length - this._maxCacheSize;
            this.allClients.splice(0, toRemove);
        }
    }

    /**
     * Cleanup: unsubscribe from events and clear references
     */
    destroy() {
        // Unsubscribe from CoreBridge events
        if (this.coreBridge && this._eventHandlers) {
            Object.keys(this._eventHandlers).forEach(event => {
                this.coreBridge.offUIEvent(event, this._eventHandlers[event]);
            });
            this._eventHandlers = {};
        }

        // REMOVED: No timer to stop

        // Clear carousel timer if exists
        if (this._carouselTimerId) {
            GLib.source_remove(this._carouselTimerId);
            this._carouselTimerId = 0;
        }

        // Disconnect GTK signal handlers
        // Disconnect tracked widget connections
        if (this._widgetConnections && this._widgetConnections.size > 0) {
            this._widgetConnections.forEach((handlerIds, widget) => {
                handlerIds.forEach(id => {
                    try {
                        if (widget && !widget.is_destroyed?.()) {
                            widget.disconnect(id);
                        }
                    } catch (e) {
                        // Widget may already be destroyed
                    }
                });
            });
            this._widgetConnections.clear();
        }

        // Remove GLib timers
        if (this._signalHandlerIds.length > 0) {
            this._signalHandlerIds.forEach(id => {
                try {
                    GLib.Source.remove(id);
                } catch (e) {
                    // Handler may already be removed
                }
            });
            this._signalHandlerIds = [];
        }

        // Cleanup unused UI before destroying
        this._cleanupUnusedUI();
        
        // Clear arrays to release memory
        this.allTasks = [];
        this.allProjects = [];
        this.allClients = [];

        // Clear currency carousel pages map
        if (this._currencyCarouselPages) {
            this._currencyCarouselPages.clear();
        }

        // Cleanup tracking widget if exists
        if (this.trackingWidget && typeof this.trackingWidget.cleanup === 'function') {
            this.trackingWidget.cleanup();
            this.trackingWidget = null;
        }
    }

    /**
     * Called when page is hidden (navigated away from)
     * Lightweight cleanup - clears data but keeps UI structure
     */
    onHide() {
        // REMOVED: No timer to stop
        
        // CRITICAL: Don't cleanup tracking widget subscriptions on hide
        // Keep subscriptions active so widget continues to receive updates
        // Widget will be refreshed in _onPageChanged() when page becomes visible
        // This ensures time updates continue even when page is hidden
        
        // Clear data arrays (they will be reloaded when page is shown again)
        this.allTasks = [];
        this.allTimeEntries = [];
        this.allProjects = [];
        this.allClients = [];
        
        // Clear report exporter reference
        this.reportExporter = null;
    }

    /**
     * Create and return the main widget for this page
     */
    getWidget() {
        const page = new Adw.ToolbarView();

        // Create header bar
        const headerBar = this._createHeaderBar();
        page.add_top_bar(headerBar);

        // Create content
        const content = this._createContent();
        page.set_content(content);

        // Subscribe to sidebar visibility changes
        if (this.parentWindow && this.parentWindow.splitView) {
            this._trackConnection(this.parentWindow.splitView, 'notify::show-sidebar', () => {
                this._updateSidebarToggleButton();
            });
        }

        // Load initial data
        this.loadReports();

        return page;
    }

    /**
     * Called when page becomes visible
     * CRITICAL: Refresh tracking widget to sync UI with current state
     */
    onPageShown() {
        this._updateSidebarToggleButton();
        
        // CRITICAL: Clear ALL cached filter state to force recalculation
        // This ensures filters are applied correctly after page changes
        // Without this, filters may stop working after navigation
        this._currentDateRange = null;
        this._currentTaskInstanceIds = null;
        this._isTrackingInPeriod = false;
        this._cachedStatsTotal = 0;
        this._cachedEarningsByCurrency = new Map();
        this._cachedTrackingClient = null;
        
        // COPIED FROM TasksPage: Clear templates before reload
        this._trackedTemplates.clear();
        this._trackedWidgets.clear();
        this.taskTemplates.clear();
        
        // CRITICAL: Refresh tracking widget to ensure it's synchronized with current tracking state
        // This updates time display and restores subscriptions if needed
        if (this.trackingWidget && typeof this.trackingWidget.refresh === 'function') {
            this.trackingWidget.refresh();
        }
        
        // CRITICAL: Always reload data and update reports to ensure filters work correctly
        // Even if data arrays are not empty, they may be stale or incomplete
        // After loadReports completes, restore real-time updates for tracked task if tracking is active
        // COPIED FROM TasksPage: Set _baseTimeOnStart for already-active tracking
        this.loadReports().then(() => {
            // COPIED FROM TasksPage: If tracking is already active, set _baseTimeOnStart for tracked task
            // This handles case when page loads while tracking is already in progress
            const trackingState = this.coreBridge ? this.coreBridge.getTrackingState() : null;
            if (trackingState && trackingState.isTracking && trackingState.currentTaskInstanceId) {
                const trackedTask = this.allTasks.find(t => t.id === trackingState.currentTaskInstanceId);
                if (trackedTask) {
                    // Set base time if not already set (prevents accumulation)
                    if (trackedTask._baseTimeOnStart === undefined) {
                        trackedTask._baseTimeOnStart = trackedTask.total_time || 0;
                    }
                } else {
                    // Try to load it from Core if not found
                    this.coreBridge.getTaskInstance(trackingState.currentTaskInstanceId).then(taskInstance => {
                        if (taskInstance) {
                            this.allTasks.push(taskInstance);
                            // Set base time for newly loaded task
                            taskInstance._baseTimeOnStart = taskInstance.total_time || 0;
                            // Rebuild Recent Tasks list to include the tracked task
                            const filteredTasks = this._getFilteredTasks();
                            this._updateRecentTasksList(filteredTasks);
                        }
                    }).catch(error => {
                        console.error('[ReportsPage] Error loading tracked task in onPageShown:', error);
                    });
                }
                
                // Ensure Recent Tasks list is updated with tracked task
                if (!this._trackedTaskTimeLabel) {
                    const filteredTasks = this._getFilteredTasks();
                    this._updateRecentTasksList(filteredTasks);
                }
            }
        }).catch(error => {
            console.error('[ReportsPage] Error loading reports in onPageShown:', error);
        });
    }

    /**
     * Update sidebar toggle button visibility based on sidebar state
     */
    _updateSidebarToggleButton() {
        if (this.sidebarToggleBtn && this.parentWindow && this.parentWindow.splitView) {
            const sidebarVisible = this.parentWindow.splitView.get_show_sidebar();
            this.sidebarToggleBtn.set_visible(!sidebarVisible);
        }
    }

    _createHeaderBar() {
        const headerBar = new Adw.HeaderBar();

        // Sidebar toggle button (only visible when sidebar is hidden)
        this.sidebarToggleBtn = new Gtk.Button({
            icon_name: 'sidebar-show-symbolic',
            tooltip_text: _('Show Sidebar'),
            css_classes: ['flat'],
            visible: false
        });
        this.sidebarToggleBtn.connect('clicked', () => {
            if (this.parentWindow && this.parentWindow.splitView) {
                this.parentWindow.splitView.set_show_sidebar(true);
            }
        });
        headerBar.pack_start(this.sidebarToggleBtn);

        // PDF Export button (start - left side)
        const pdfExportBtn = new Gtk.Button({
            icon_name: 'document-save-symbolic',
            tooltip_text: _('Export PDF Report'),
            css_classes: ['flat'],
        });
        pdfExportBtn.connect('clicked', () => {
            this._exportPDF();
        });
        headerBar.pack_start(pdfExportBtn);

        // Tracking widget (title area)
        this.trackingWidget = new AdvancedTrackingWidget(this.coreBridge, this.parentWindow);
        headerBar.set_title_widget(this.trackingWidget.getWidget());

        // Compact tracker button (end - right side)
        const compactTrackerBtn = new Gtk.Button({
            icon_name: 'view-restore-symbolic',
            css_classes: ['flat', 'circular'],
            tooltip_text: _('Open Compact Tracker (Shift: keep main window)'),
        });

        compactTrackerBtn.connect('clicked', () => {
            const display = Gdk.Display.get_default();
            const seat = display?.get_default_seat();
            const keyboard = seat?.get_keyboard();

            let shiftPressed = false;
            if (keyboard) {
                const state = keyboard.get_modifier_state();
                shiftPressed = !!(state & Gdk.ModifierType.SHIFT_MASK);
            }

            if (this.parentWindow?.application) {
                this.parentWindow.application._launchCompactTracker(shiftPressed);
            } else {
                console.error('[ReportsPage] No application reference!');
            }
        });

        headerBar.pack_end(compactTrackerBtn);

        return headerBar;
    }

    _createContent() {
        const scrolled = new Gtk.ScrolledWindow();

        const mainBox = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 24,
            margin_top: 24,
            margin_bottom: 24,
            margin_start: 24,
            margin_end: 24,
        });

        // Page title
        const titleLabel = new Gtk.Label({
            label: _('Task Reports'),
            css_classes: ['title-1'],
            halign: Gtk.Align.CENTER,
        });
        mainBox.append(titleLabel);

        // Chart section with filters
        const chartSection = this._createChartSection();
        mainBox.append(chartSection);

        // Summary statistics
        const statsSection = this._createSummaryStatistics();
        mainBox.append(statsSection);

        // Recent tasks list
        const tasksSection = this._createRecentTasksList();
        mainBox.append(tasksSection);

        scrolled.set_child(mainBox);
        return scrolled;
    }

    /**
     * Create chart section with filters
     */
    _createChartSection() {
        const group = new Adw.PreferencesGroup();

        const contentBox = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 12,
        });

        // Chart filters
        const filtersBox = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 12,
            halign: Gtk.Align.CENTER,
            margin_bottom: 12,
        });

        // Period filter dropdown
        const periodModel = new Gtk.StringList();
        periodModel.append(_('Week'));
        periodModel.append(_('Month'));
        periodModel.append(_('Year'));
        periodModel.append(_('Custom Range'));

        this.periodFilter = new Gtk.DropDown({
            model: periodModel,
            selected: 0,
            tooltip_text: _('Select time period'),
        });

        this.periodFilter.connect('notify::selected', () => {
            const selected = this.periodFilter.get_selected();
            const periods = ['week', 'month', 'year', 'custom'];
            this.chartFilters.period = periods[selected];

            // Show/hide custom date buttons
            if (this.chartFilters.period === 'custom') {
                this.customDateBox.set_visible(true);
                // Set default range if not set
                if (!this.chartFilters.customDateRange) {
                    const now = GLib.DateTime.new_now_local();
                    const fromDate = now.add_days(-30);
                    this.chartFilters.customDateRange = { fromDate, toDate: now };
                    this._updateCustomDateButtons();
                }
            } else {
                this.customDateBox.set_visible(false);
            }
            
            // CRITICAL: Don't check filters here - _updateStatistics will do it after updating _currentDateRange
            // This ensures we check against the correct date range for the current period filter

            this._updateReports().catch(error => {
                console.error('[ReportsPage] Error updating reports from period change:', error);
            });
        });

        // Project filter dropdown
        this.projectFilter = new Gtk.DropDown({
            tooltip_text: _('Filter by project'),
        });

        // Client filter dropdown
        this.clientFilter = new Gtk.DropDown({
            tooltip_text: _('Filter by client'),
        });

        filtersBox.append(this.periodFilter);
        filtersBox.append(this.projectFilter);
        filtersBox.append(this.clientFilter);

        // Custom date range buttons (hidden by default)
        this.customDateBox = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 12,
            halign: Gtk.Align.CENTER,
            margin_bottom: 12,
            visible: false,
        });

        // "bis" label between dates
        const bisLabel = new Gtk.Label({
            label: _('bis'),
            css_classes: ['dim-label'],
        });

        // Start date button
        this.startDateButton = new Gtk.Button({
            css_classes: ['flat'],
        });
        this.startDateButton.connect('clicked', () => {
            this._showDatePickerDialog(true); // true = start date
        });

        // End date button
        this.endDateButton = new Gtk.Button({
            css_classes: ['flat'],
        });
        this.endDateButton.connect('clicked', () => {
            this._showDatePickerDialog(false); // false = end date
        });

        this.customDateBox.append(this.startDateButton);
        this.customDateBox.append(bisLabel);
        this.customDateBox.append(this.endDateButton);

        contentBox.append(filtersBox);
        contentBox.append(this.customDateBox);

        // Chart container
        this.chartContainer = this._createChart();

        contentBox.append(this.chartContainer);

        group.add(contentBox);
        return group;
    }

    /**
     * Create chart placeholder container
     */
    _createChart() {
        const chartBox = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 12,
            halign: Gtk.Align.FILL,
            valign: Gtk.Align.START,
        });

        // Empty placeholder - will be populated when data loads
        const placeholderLabel = new Gtk.Label({
            label: _('Loading chart...'),
            css_classes: ['dim-label'],
            halign: Gtk.Align.CENTER,
            valign: Gtk.Align.CENTER,
        });
        chartBox.append(placeholderLabel);

        return chartBox;
    }

    /**
     * Create summary statistics section (4 cards)
     */
    _createSummaryStatistics() {
        const group = new Adw.PreferencesGroup();

        const statsBox = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 24,
            homogeneous: true,
        });

        // Total Time card
        const totalTimeCard = this._createStatCard(
            'alarm-symbolic',
            '00:00:00',
            _('Total Time')
        );
        this.totalTimeLabel = totalTimeCard.valueLabel;

        // Active Projects card
        const activeProjectsCard = this._createStatCard(
            'folder-symbolic',
            '0',
            _('Active Projects')
        );
        this.activeProjectsLabel = activeProjectsCard.valueLabel;

        // Total Earnings card (with carousel)
        const earningsCard = this._createEarningsCard();

        // Tracked Tasks card
        const trackedTasksCard = this._createStatCard(
            'view-list-symbolic',
            '0',
            _('Tracked Tasks')
        );
        this.trackedTasksLabel = trackedTasksCard.valueLabel;

        statsBox.append(totalTimeCard.card);
        statsBox.append(activeProjectsCard.card);
        statsBox.append(earningsCard);
        statsBox.append(trackedTasksCard.card);

        group.add(statsBox);
        return group;
    }

    /**
     * Create a statistics card
     */
    _createStatCard(iconName, defaultValue, label) {
        const card = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            css_classes: ['card'],
        });

        const contentBox = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 12,
            margin_top: 16,
            margin_bottom: 16,
            margin_start: 16,
            margin_end: 16,
        });

        const icon = new Gtk.Image({
            icon_name: iconName,
            pixel_size: 32,
            css_classes: ['accent'],
        });

        const valueLabel = new Gtk.Label({
            label: defaultValue,
            // Remove css_classes for real-time updateable labels
            // css_classes: ['title-1'],
        });

        // Apply title-1 CSS manually to avoid GTK render cache issues
        valueLabel.add_css_class('title-1');

        const descLabel = new Gtk.Label({
            label: label,
            css_classes: ['caption'],
        });

        contentBox.append(icon);
        contentBox.append(valueLabel);
        contentBox.append(descLabel);

        card.append(contentBox);

        return { card, valueLabel, contentBox };
    }

    /**
     * Create earnings card with currency carousel
     */
    _createEarningsCard() {
        const card = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            css_classes: ['card'],
        });

        const contentBox = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 8,
            margin_top: 12,
            margin_bottom: 12,
            margin_start: 12,
            margin_end: 12,
        });

        // Currency carousel (without dots, no icon)
        this.currencyCarousel = new Adw.Carousel({
            halign: Gtk.Align.CENTER,
            valign: Gtk.Align.CENTER,
            height_request: 80,
            allow_long_swipes: true,
            allow_scroll_wheel: false, // Disable built-in scroll, we'll handle it manually
        });

        // Add scroll event controller to card to change slides on scroll
        const scrollController = new Gtk.EventControllerScroll({
            flags: Gtk.EventControllerScrollFlags.VERTICAL | Gtk.EventControllerScrollFlags.DISCRETE,
        });

        // Track last scroll time to debounce
        let lastScrollTime = 0;

        scrollController.connect('scroll', (controller, dx, dy) => {
            const nPages = this.currencyCarousel.get_n_pages();

            if (nPages <= 1) return false;

            // Debounce: ignore if scrolled less than 300ms ago
            const now = Date.now();
            if (now - lastScrollTime < 300) {
                return true;
            }
            lastScrollTime = now;

            // Round to nearest page
            const currentPage = Math.round(this.currencyCarousel.get_position());

            if (dy > 0) {
                // Scroll down - next page
                const nextPage = (currentPage + 1) % nPages;
                this.currencyCarousel.scroll_to(this.currencyCarousel.get_nth_page(nextPage), true);
            } else if (dy < 0) {
                // Scroll up - previous page
                const prevPage = currentPage - 1 < 0 ? nPages - 1 : currentPage - 1;
                this.currencyCarousel.scroll_to(this.currencyCarousel.get_nth_page(prevPage), true);
            }

            return true; // Stop event propagation
        });

        card.add_controller(scrollController);

        // Auto-advance carousel every 10 seconds
        this._startCarouselAutoAdvance();

        const descLabel = new Gtk.Label({
            label: _('Total Earnings'),
            css_classes: ['caption'],
        });

        contentBox.append(this.currencyCarousel);
        contentBox.append(descLabel);

        card.append(contentBox);

        // Initialize with 0.00
        this._updateCurrencyCarousel(new Map());

        return card;
    }

    /**
     * Create recent tasks list
     */
    _createRecentTasksList() {
        const group = new Adw.PreferencesGroup({
            title: _('Recent Tasks'),
            description: _('Your most recent completed tasks'),
        });

        this.recentTasksList = new Gtk.ListBox({
            css_classes: ['boxed-list'],
            selection_mode: Gtk.SelectionMode.NONE,
        });

        // Empty state
        const emptyRow = new Adw.ActionRow({
            title: _('No tasks yet'),
            subtitle: _('Start tracking time to see your tasks here'),
            sensitive: false,
        });
        this.recentTasksList.append(emptyRow);

        group.add(this.recentTasksList);
        return group;
    }

    /**
     * Load reports data
     */
    async loadReports() {
        try {
            // Load all data from Core
            // Limit array sizes to prevent RAM growth (keep only most recent)
            const allTaskInstances = await this.coreBridge.getAllTaskInstances() || [];
            this.allTasks = allTaskInstances.slice(-this._maxCacheSize);
            
            const allTimeEntries = await this.coreBridge.getAllTimeEntries() || [];
            this.allTimeEntries = allTimeEntries.slice(-this._maxCacheSize);
            
            const allProjects = await this.coreBridge.getAllProjects() || [];
            this.allProjects = allProjects.slice(-this._maxCacheSize);
            
            const allClients = await this.coreBridge.getAllClients() || [];
            this.allClients = allClients.slice(-this._maxCacheSize);

            // Initialize report exporter with current data
            this.reportExporter = new ReportExporter(this.allTasks, this.allProjects, this.allClients);

            // Update filters dropdowns
            this._updateFilterDropdowns();

            // Update all reports
            // CRITICAL: _updateStatistics will check if tracking matches filters after updating _currentDateRange
            // This ensures we check against the correct date range for the current period filter
            await this._updateReports().catch(error => {
                console.error('[ReportsPage] Error updating reports from loadReports:', error);
            });
        } catch (error) {
            console.error('[ReportsPage] Error loading reports:', error);
        }
    }

    /**
     * Update filter dropdowns with projects and clients
     */
    _updateFilterDropdowns() {
        // Project filter
        const projectModel = new Gtk.StringList();
        projectModel.append(_('All Projects'));
        this.allProjects.forEach(project => {
            projectModel.append(project.name);
        });
        this.projectFilter.set_model(projectModel);

        this.projectFilter.connect('notify::selected', () => {
            const selected = this.projectFilter.get_selected();
            this.chartFilters.projectId = selected === 0 ? null : this.allProjects[selected - 1]?.id;
            
            // CRITICAL: Don't check filters here - _updateStatistics will do it after updating _currentDateRange
            // This ensures we check against the correct date range for the current period filter
            
            this._updateReports().catch(error => {
                console.error('[ReportsPage] Error updating reports from project filter:', error);
            });
        });

        // Client filter
        const clientModel = new Gtk.StringList();
        clientModel.append(_('All Clients'));
        this.allClients.forEach(client => {
            clientModel.append(client.name);
        });
        this.clientFilter.set_model(clientModel);

        this.clientFilter.connect('notify::selected', () => {
            const selected = this.clientFilter.get_selected();
            this.chartFilters.clientId = selected === 0 ? null : this.allClients[selected - 1]?.id;
            
            // CRITICAL: Don't check filters here - _updateStatistics will do it after updating _currentDateRange
            // This ensures we check against the correct date range for the current period filter
            
            this._updateReports().catch(error => {
                console.error('[ReportsPage] Error updating reports from client filter:', error);
            });
        });
    }

    /**
     * Update all report sections
     */
    async _updateReports() {
        try {
            // CRITICAL: Get filtered tasks for statistics (may not have _currentTaskInstanceIds yet)
            const filteredTasksForStats = this._getFilteredTasks();

            // Update statistics (async - calls Core)
            // This will set _currentTaskInstanceIds based on TimeEntry.end_time filtering
            await this._updateStatistics(filteredTasksForStats).catch(error => {
                console.error('[ReportsPage] Error updating statistics:', error);
            });

            // CRITICAL: Get filtered tasks AGAIN after _updateStatistics completes
            // This ensures _currentTaskInstanceIds is set and Recent Tasks uses correct filtering
            const filteredTasks = this._getFilteredTasks();

            // Update recent tasks list (only completed tasks, no tracking time)
            // Now uses _currentTaskInstanceIds from _updateStatistics for correct period filtering
            this._updateRecentTasksList(filteredTasks);
            
            // CRITICAL: After updating Recent Tasks list, immediately update tracked task time
            // This ensures real-time updates work correctly after returning to the page
            // Use setTimeout to ensure _updateRecentTasksList has completed and references are set
            GLib.timeout_add(GLib.PRIORITY_DEFAULT, 50, () => {
                const trackingState = this.coreBridge ? this.coreBridge.getTrackingState() : null;
                if (trackingState && trackingState.isTracking && this._trackedTaskTimeLabel && 
                    !this._trackedTaskTimeLabel.is_destroyed?.()) {
                    // Update time immediately with current elapsedSeconds
                    if (this._trackedTaskBaseTime !== undefined && this._trackedTaskBaseTime !== null) {
                        const totalTime = this._trackedTaskBaseTime + (trackingState.elapsedSeconds || 0);
                        this._trackedTaskTimeLabel.set_label(this._formatDuration(totalTime));
                    } else {
                        // If base time not set, recalculate it
                        const currentElapsed = trackingState.elapsedSeconds || 0;
                        // Try to find tracked task to get base time
                        const trackedTask = this.allTasks.find(t =>
                            t.id === trackingState.currentTaskInstanceId ||
                            (t.task_id === trackingState.currentTaskId &&
                             t.project_id === trackingState.currentProjectId &&
                             t.client_id === trackingState.currentClientId)
                        );
                        if (trackedTask) {
                            const baseTime = Math.max(0, (trackedTask.total_time || 0) - currentElapsed);
                            this._trackedTaskBaseTime = baseTime;
                            const totalTime = baseTime + currentElapsed;
                            this._trackedTaskTimeLabel.set_label(this._formatDuration(totalTime));
                        }
                    }
                }
                return false; // Don't repeat
            });

            // Update chart visualization
            this._updateChartVisualization();
        } catch (error) {
            console.error('[ReportsPage] Error in _updateReports:', error);
        }
    }

    /**
     * Update chart visualization with current data
     */
    _updateChartVisualization() {
        if (!this.chartContainer) return;

        // Clear chart container
        while (this.chartContainer.get_first_child()) {
            this.chartContainer.remove(this.chartContainer.get_first_child());
        }

        const filteredTasks = this._getFilteredTasks();

        if (filteredTasks.length === 0) {
            const emptyLabel = new Gtk.Label({
                label: _('📊 No data for selected period\nStart tracking time to see your chart'),
                css_classes: ['dim-label'],
                justify: Gtk.Justification.CENTER,
                halign: Gtk.Align.CENTER,
                valign: Gtk.Align.CENTER,
            });
            this.chartContainer.append(emptyLabel);
            return;
        }

        // Create simple bar chart visualization
        const chartData = this._prepareChartData(filteredTasks);
        this._renderSimpleChart(chartData);
    }

    /**
     * Parse end_time from database entry handling both ISO8601 and local format
     * @param {string} dateString - Date string from database
     * @returns {GLib.DateTime|null} Parsed date or null
     */
    _parseEndTime(dateString) {
        if (!dateString) return null;

        // Check if date is in ISO8601 format (with T) or local format (YYYY-MM-DD HH:MM:SS)
        if (dateString.includes('T')) {
            // ISO8601 format - parse as UTC
            return GLib.DateTime.new_from_iso8601(dateString, null);
        } else {
            // Local format YYYY-MM-DD HH:MM:SS - parse as local time
            const parts = dateString.split(' ');
            if (parts.length === 2) {
                const [datePart, timePart] = parts;
                const [year, month, day] = datePart.split('-').map(Number);
                const [hours, minutes, seconds] = timePart.split(':').map(Number);

                return GLib.DateTime.new_local(
                    year, month, day,
                    hours || 0, minutes || 0, seconds || 0
                );
            }
        }

        return null;
    }

    /**
     * Prepare chart data from filtered time entries
     */
    _prepareChartData(filteredTasks) {
        const now = GLib.DateTime.new_now_local();
        const dataMap = new Map();

        // Get all time entries for filtered tasks
        const taskIds = new Set(filteredTasks.map(t => t.id));
        const relevantEntries = (this.allTimeEntries || []).filter(entry =>
            taskIds.has(entry.task_instance_id)
        );

        if (this.chartFilters.period === 'week') {
            // For week view, create entries for all 7 days (Mon-Sun)
            const dayOfWeek = now.get_day_of_week(); // 1=Monday, 7=Sunday
            const daysToMonday = dayOfWeek - 1;
            const monday = now.add_days(-daysToMonday);

            // Initialize all days with 0
            const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
            for (let i = 0; i < 7; i++) {
                const day = monday.add_days(i);
                const key = `${day.get_year()}-${String(day.get_month()).padStart(2, '0')}-${String(day.get_day_of_month()).padStart(2, '0')}`;
                dataMap.set(key, {
                    label: dayNames[i],
                    hours: 0,
                    projectSegments: []
                });
            }

            // Track time by project for each day (using END TIME from database)
            relevantEntries.forEach(entry => {
                if (!entry.end_time || !entry.duration) return;

                const entryEndDate = this._parseEndTime(entry.end_time);
                if (!entryEndDate) return;

                const key = `${entryEndDate.get_year()}-${String(entryEndDate.get_month()).padStart(2, '0')}-${String(entryEndDate.get_day_of_month()).padStart(2, '0')}`;

                if (dataMap.has(key)) {
                    const dayData = dataMap.get(key);
                    const hours = (entry.duration || 0) / 3600;
                    dayData.hours += hours;

                    // Find task to get project_id
                    const task = filteredTasks.find(t => t.id === entry.task_instance_id);
                    if (task) {
                        const projectId = task.project_id || 1;

                        // Add or update project segment
                        let segment = dayData.projectSegments.find(s => s.projectId === projectId);
                        if (!segment) {
                            segment = { projectId, hours: 0 };
                            dayData.projectSegments.push(segment);
                        }
                        segment.hours += hours;
                    }
                }
            });

            // Sort project segments by hours (descending)
            dataMap.forEach(dayData => {
                dayData.projectSegments.sort((a, b) => b.hours - a.hours);
            });

            return Array.from(dataMap.values());
        } else if (this.chartFilters.period === 'month') {
            // For month view, group by last 4 weeks (KW)
            const today = new Date(now.get_year(), now.get_month() - 1, now.get_day_of_month());

            // Get last 4 weeks
            for (let week = 3; week >= 0; week--) {
                const weekStart = new Date(today);
                weekStart.setDate(today.getDate() - (week * 7 + 6));

                const weekStartGLib = GLib.DateTime.new_local(
                    weekStart.getFullYear(),
                    weekStart.getMonth() + 1,
                    weekStart.getDate(),
                    0, 0, 0
                );

                const germanWeekNumber = this._getWeekNumber(weekStartGLib);
                const key = `KW${germanWeekNumber}`;

                dataMap.set(key, {
                    label: key,
                    hours: 0,
                    projectSegments: [],
                    weekStart: weekStart,
                    weekEnd: new Date(weekStart.getTime() + 6 * 24 * 60 * 60 * 1000)
                });
            }

            // Add time entries to corresponding weeks (using END TIME from database)
            relevantEntries.forEach(entry => {
                if (!entry.end_time || !entry.duration) return;

                const entryEndDate = this._parseEndTime(entry.end_time);
                if (!entryEndDate) return;

                const entryJsDate = new Date(entryEndDate.get_year(), entryEndDate.get_month() - 1, entryEndDate.get_day_of_month());

                // Find which week this entry belongs to
                for (const [key, weekData] of dataMap) {
                    if (entryJsDate >= weekData.weekStart && entryJsDate <= weekData.weekEnd) {
                        const hours = (entry.duration || 0) / 3600;
                        weekData.hours += hours;

                        const task = filteredTasks.find(t => t.id === entry.task_instance_id);
                        if (task) {
                            const projectId = task.project_id || 1;
                            let segment = weekData.projectSegments.find(s => s.projectId === projectId);
                            if (!segment) {
                                segment = { projectId, hours: 0 };
                                weekData.projectSegments.push(segment);
                            }
                            segment.hours += hours;
                        }
                        break;
                    }
                }
            });

            // Sort project segments
            dataMap.forEach(weekData => {
                weekData.projectSegments.sort((a, b) => b.hours - a.hours);
            });

            return Array.from(dataMap.values());
        } else if (this.chartFilters.period === 'year') {
            // For year view, group by last 12 months
            const months = ['Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct'];

            // Initialize last 12 months
            for (let i = 11; i >= 0; i--) {
                const monthDate = GLib.DateTime.new_local(
                    now.get_year(),
                    now.get_month(),
                    1, 0, 0, 0
                ).add_months(-i);

                const monthName = months[monthDate.get_month() - 1];
                const key = `${monthDate.get_year()}-${String(monthDate.get_month()).padStart(2, '0')}`;

                dataMap.set(key, {
                    label: monthName,
                    hours: 0,
                    projectSegments: [],
                    year: monthDate.get_year(),
                    month: monthDate.get_month()
                });
            }

            // Add time entries to corresponding months (using END TIME from database)
            relevantEntries.forEach(entry => {
                if (!entry.end_time || !entry.duration) return;

                const entryEndDate = this._parseEndTime(entry.end_time);
                if (!entryEndDate) return;

                const key = `${entryEndDate.get_year()}-${String(entryEndDate.get_month()).padStart(2, '0')}`;

                if (dataMap.has(key)) {
                    const monthData = dataMap.get(key);
                    const hours = (entry.duration || 0) / 3600;
                    monthData.hours += hours;

                    const task = filteredTasks.find(t => t.id === entry.task_instance_id);
                    if (task) {
                        const projectId = task.project_id || 1;
                        let segment = monthData.projectSegments.find(s => s.projectId === projectId);
                        if (!segment) {
                            segment = { projectId, hours: 0 };
                            monthData.projectSegments.push(segment);
                        }
                        segment.hours += hours;
                    }
                }
            });

            // Sort project segments
            dataMap.forEach(monthData => {
                monthData.projectSegments.sort((a, b) => b.hours - a.hours);
            });

            return Array.from(dataMap.values());
        } else if (this.chartFilters.period === 'custom') {
            // For custom range, determine grouping based on range length
            if (!this.chartFilters.customDateRange) {
                return [];
            }

            const fromDate = this.chartFilters.customDateRange.fromDate;
            const toDate = this.chartFilters.customDateRange.toDate;

            // Calculate days in range
            const daysDiff = Math.floor((toDate.to_unix() - fromDate.to_unix()) / (24 * 60 * 60));

            if (daysDiff < 14) {
                // Group by days
                return this._prepareCustomByDays(relevantEntries, filteredTasks, fromDate, toDate);
            } else if (daysDiff <= 90) {
                // Group by weeks
                return this._prepareCustomByWeeks(relevantEntries, filteredTasks, fromDate, toDate);
            } else {
                // Group by months
                return this._prepareCustomByMonths(relevantEntries, filteredTasks, fromDate, toDate);
            }
        }

        return [];
    }

    /**
     * Get week number from GLib.DateTime
     */
    _getWeekNumber(dateTime) {
        const year = dateTime.get_year();
        const month = dateTime.get_month();
        const day = dateTime.get_day_of_month();

        const date = new Date(year, month - 1, day);
        const firstDay = new Date(date.getFullYear(), 0, 1);
        const days = Math.floor((date - firstDay) / (24 * 60 * 60 * 1000));
        return Math.ceil((days + firstDay.getDay() + 1) / 7);
    }

    /**
     * Prepare custom range data grouped by days (< 14 days)
     */
    _prepareCustomByDays(entries, filteredTasks, fromDate, toDate) {
        const dataMap = new Map();

        // Initialize all days in range
        let currentDate = fromDate;
        while (currentDate.to_unix() <= toDate.to_unix()) {
            const month = currentDate.get_month();
            const day = currentDate.get_day_of_month();
            const label = `${month}/${day}`;
            const key = `${currentDate.get_year()}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

            dataMap.set(key, {
                label: label,
                hours: 0,
                projectSegments: []
            });

            currentDate = currentDate.add_days(1);
        }

        // Add time entries (using END TIME from database)
        entries.forEach(entry => {
            if (!entry.end_time || !entry.duration) return;

            const entryEndDate = this._parseEndTime(entry.end_time);
            if (!entryEndDate) return;

            const key = `${entryEndDate.get_year()}-${String(entryEndDate.get_month()).padStart(2, '0')}-${String(entryEndDate.get_day_of_month()).padStart(2, '0')}`;

            if (dataMap.has(key)) {
                const dayData = dataMap.get(key);
                const hours = (entry.duration || 0) / 3600;
                dayData.hours += hours;

                const task = filteredTasks.find(t => t.id === entry.task_instance_id);
                if (task) {
                    const projectId = task.project_id || 1;
                    let segment = dayData.projectSegments.find(s => s.projectId === projectId);
                    if (!segment) {
                        segment = { projectId, hours: 0 };
                        dayData.projectSegments.push(segment);
                    }
                    segment.hours += hours;
                }
            }
        });

        // Sort project segments
        dataMap.forEach(dayData => {
            dayData.projectSegments.sort((a, b) => b.hours - a.hours);
        });

        return Array.from(dataMap.values());
    }

    /**
     * Prepare custom range data grouped by weeks (14-90 days)
     */
    _prepareCustomByWeeks(entries, filteredTasks, fromDate, toDate) {
        const dataMap = new Map();
        const weeks = [];

        // Find all weeks in range
        let currentDate = fromDate;
        while (currentDate.to_unix() <= toDate.to_unix()) {
            const weekNum = this._getWeekNumber(currentDate);
            const key = `KW${weekNum}`;

            if (!dataMap.has(key)) {
                // Find Monday of this week
                const dayOfWeek = currentDate.get_day_of_week(); // 1=Monday
                const daysToMonday = dayOfWeek - 1;
                const monday = currentDate.add_days(-daysToMonday);
                const sunday = monday.add_days(6);

                dataMap.set(key, {
                    label: key,
                    hours: 0,
                    projectSegments: [],
                    weekStart: monday,
                    weekEnd: sunday
                });

                weeks.push(key);
            }

            currentDate = currentDate.add_days(1);
        }

        // Add time entries (using END TIME from database)
        entries.forEach(entry => {
            if (!entry.end_time || !entry.duration) return;

            const entryEndDate = this._parseEndTime(entry.end_time);
            if (!entryEndDate) return;

            const weekNum = this._getWeekNumber(entryEndDate);
            const key = `KW${weekNum}`;

            if (dataMap.has(key)) {
                const weekData = dataMap.get(key);
                const hours = (entry.duration || 0) / 3600;
                weekData.hours += hours;

                const task = filteredTasks.find(t => t.id === entry.task_instance_id);
                if (task) {
                    const projectId = task.project_id || 1;
                    let segment = weekData.projectSegments.find(s => s.projectId === projectId);
                    if (!segment) {
                        segment = { projectId, hours: 0 };
                        weekData.projectSegments.push(segment);
                    }
                    segment.hours += hours;
                }
            }
        });

        // Sort project segments
        dataMap.forEach(weekData => {
            weekData.projectSegments.sort((a, b) => b.hours - a.hours);
        });

        return Array.from(dataMap.values());
    }

    /**
     * Prepare custom range data grouped by months (> 90 days)
     */
    _prepareCustomByMonths(entries, filteredTasks, fromDate, toDate) {
        const dataMap = new Map();
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

        // Find all months in range
        let currentDate = GLib.DateTime.new_local(
            fromDate.get_year(),
            fromDate.get_month(),
            1, 0, 0, 0
        );

        while (currentDate.to_unix() <= toDate.to_unix()) {
            const monthName = months[currentDate.get_month() - 1];
            const key = `${currentDate.get_year()}-${String(currentDate.get_month()).padStart(2, '0')}`;

            if (!dataMap.has(key)) {
                dataMap.set(key, {
                    label: monthName,
                    hours: 0,
                    projectSegments: [],
                    year: currentDate.get_year(),
                    month: currentDate.get_month()
                });
            }

            currentDate = currentDate.add_months(1);
        }

        // Add time entries (using END TIME from database)
        entries.forEach(entry => {
            if (!entry.end_time || !entry.duration) return;

            const entryEndDate = this._parseEndTime(entry.end_time);
            if (!entryEndDate) return;

            const key = `${entryEndDate.get_year()}-${String(entryEndDate.get_month()).padStart(2, '0')}`;

            if (dataMap.has(key)) {
                const monthData = dataMap.get(key);
                const hours = (entry.duration || 0) / 3600;
                monthData.hours += hours;

                const task = filteredTasks.find(t => t.id === entry.task_instance_id);
                if (task) {
                    const projectId = task.project_id || 1;
                    let segment = monthData.projectSegments.find(s => s.projectId === projectId);
                    if (!segment) {
                        segment = { projectId, hours: 0 };
                        monthData.projectSegments.push(segment);
                    }
                    segment.hours += hours;
                }
            }
        });

        // Sort project segments
        dataMap.forEach(monthData => {
            monthData.projectSegments.sort((a, b) => b.hours - a.hours);
        });

        return Array.from(dataMap.values());
    }

    /**
     * Render simple bar chart
     */
    _renderSimpleChart(chartData) {
        if (chartData.length === 0) return;

        const chartBox = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 12,
            margin_top: 12,
            margin_bottom: 12,
        });

        // Chart title with period-specific formatting
        let titleText = _('📊 Weekly Activity');
        if (this.chartFilters.period === 'week') {
            const now = GLib.DateTime.new_now_local();
            const weekNum = this._getWeekNumber(now);
            titleText = `📊 ${_('Weekly Activity')} (KW ${weekNum})`;
        } else if (this.chartFilters.period === 'month') {
            titleText = _('📊 Monthly Activity (4 weeks)');
        } else if (this.chartFilters.period === 'year') {
            titleText = _('📊 Yearly Activity (12 months)');
        } else if (this.chartFilters.period === 'custom' && this.chartFilters.customDateRange) {
            const fromDate = this.chartFilters.customDateRange.fromDate;
            const toDate = this.chartFilters.customDateRange.toDate;

            // Format dates as "Oct 1" or "Dec 1"
            const fromMonth = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][fromDate.get_month() - 1];
            const toMonth = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][toDate.get_month() - 1];

            const fromStr = `${fromMonth} ${fromDate.get_day_of_month()}`;
            const toStr = `${toMonth} ${toDate.get_day_of_month()}`;

            titleText = `📊 Custom Range (${fromStr} - ${toStr})`;
        }

        const titleLabel = new Gtk.Label({
            label: titleText,
            css_classes: ['title-4'],
            halign: Gtk.Align.CENTER,
            margin_bottom: 8,
        });
        chartBox.append(titleLabel);

        // Find max hours for scaling
        const maxHours = Math.max(...chartData.map(d => d.hours), 1);

        // Calculate total hours for display
        const totalHours = chartData.reduce((sum, d) => sum + d.hours, 0);

        // Calculate chart dimensions
        const minBarWidth = 48; // 40px bar + 8px spacing
        const calculatedWidth = chartData.length * minBarWidth;
        const maxWidthForCentering = 400; // Maximum width before switching to scrollable mode

        // Create horizontal bar chart container
        const barsContainer = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 8,
            height_request: 120,
        });

        // Create vertical bars for each day
        chartData.forEach(dayData => {
            const barContainer = new Gtk.Box({
                orientation: Gtk.Orientation.VERTICAL,
                spacing: 4,
                width_request: 40,
            });

            // Bar box with fixed height
            const barBox = new Gtk.Box({
                width_request: 24,
                height_request: 80,
                halign: Gtk.Align.CENTER,
                valign: Gtk.Align.END,
            });

            if (dayData.projectSegments && dayData.projectSegments.length > 0) {
                // Create stacked bar with project colors
                const totalBarHeight = Math.max((dayData.hours / maxHours) * 80, 2);

                const stackedBar = new Gtk.Box({
                    orientation: Gtk.Orientation.VERTICAL,
                    width_request: 24,
                    height_request: totalBarHeight,
                    halign: Gtk.Align.CENTER,
                    valign: Gtk.Align.END,
                    css_classes: ['chart-bar-stack'],
                });

                // Reverse segments for bottom-to-top stacking
                const reversedSegments = [...dayData.projectSegments].reverse();

                reversedSegments.forEach((segment, index) => {
                    if (segment.hours > 0) {
                        const segmentHeight = (segment.hours / dayData.hours) * totalBarHeight;

                        const segmentBar = new Gtk.Box({
                            width_request: 24,
                            height_request: segmentHeight,
                            halign: Gtk.Align.FILL,
                            valign: Gtk.Align.FILL,
                        });

                        // Get project color
                        const project = this.allProjects.find(p => p.id === segment.projectId);
                        const projectColor = project ? project.color : '#9a9996';

                        // Apply inline CSS for color with border-radius
                        const isFirst = index === 0;
                        const isLast = index === reversedSegments.length - 1;
                        const borderRadius = isFirst && isLast ? '4px' :
                                           isFirst ? '4px 4px 0 0' :
                                           isLast ? '0 0 4px 4px' : '0';

                        const provider = new Gtk.CssProvider();
                        provider.load_from_data(`* {
                            background: ${projectColor};
                            border-radius: ${borderRadius};
                            ${index > 0 ? 'border-top: 1px solid rgba(255,255,255,0.3);' : ''}
                        }`, -1);
                        segmentBar.get_style_context().add_provider(provider, Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION);

                        stackedBar.append(segmentBar);
                    }
                });

                barBox.append(stackedBar);
            } else {
                // Empty day - show gray placeholder
                const emptyBar = new Gtk.Box({
                    width_request: 24,
                    height_request: 2,
                    halign: Gtk.Align.CENTER,
                    valign: Gtk.Align.END,
                });

                const emptyProvider = new Gtk.CssProvider();
                emptyProvider.load_from_data(`* { background: #deddda; border-radius: 2px; }`, -1);
                emptyBar.get_style_context().add_provider(emptyProvider, Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION);

                barBox.append(emptyBar);
            }

            barContainer.append(barBox);

            // Day label
            const periodLabel = new Gtk.Label({
                label: dayData.label,
                css_classes: ['caption'],
                halign: Gtk.Align.CENTER,
            });
            barContainer.append(periodLabel);

            // Hours label
            const hoursLabel = new Gtk.Label({
                label: dayData.hours > 0 ? `${dayData.hours.toFixed(1)}h` : '0h',
                css_classes: ['caption', 'dim-label'],
                halign: Gtk.Align.CENTER,
            });
            barContainer.append(hoursLabel);

            barsContainer.append(barContainer);
        });

        // Wrap bars in scrolled window if needed
        const centeringContainer = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            halign: Gtk.Align.CENTER,
            valign: Gtk.Align.CENTER,
            hexpand: true,
        });

        if (calculatedWidth <= maxWidthForCentering) {
            // Few elements - simple centered layout
            barsContainer.set_halign(Gtk.Align.CENTER);
            centeringContainer.append(barsContainer);
        } else {
            // Many elements - use scrollable container with dragging
            const maxScrollWidth = Math.min(calculatedWidth, 600); // Max 600px or content width

            const scrolledWindow = new Gtk.ScrolledWindow({
                hscrollbar_policy: Gtk.PolicyType.AUTOMATIC,
                vscrollbar_policy: Gtk.PolicyType.NEVER,
                height_request: 140, // Slightly larger to accommodate scrollbar
                width_request: maxScrollWidth,
                kinetic_scrolling: true, // Enable smooth kinetic scrolling/dragging
                overlay_scrolling: true,  // Use overlay scrollbars for cleaner look
            });

            barsContainer.set_halign(Gtk.Align.START);
            barsContainer.set_size_request(calculatedWidth, -1);

            scrolledWindow.set_child(barsContainer);

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

        // Total time summary with period-specific text
        let summaryText = `Total: ${totalHours.toFixed(1)} hours`;
        if (this.chartFilters.period === 'week') {
            const weekNum = this._getWeekNumber(GLib.DateTime.new_now_local());
            summaryText = `Total: ${totalHours.toFixed(1)} hours in KW ${weekNum}`;
        } else if (this.chartFilters.period === 'month') {
            summaryText = `Total: ${totalHours.toFixed(1)} hours in last 4 weeks`;
        } else if (this.chartFilters.period === 'year') {
            summaryText = `Total: ${totalHours.toFixed(1)} hours this year`;
        } else if (this.chartFilters.period === 'custom' && this.chartFilters.customDateRange) {
            const fromDate = this.chartFilters.customDateRange.fromDate;
            const toDate = this.chartFilters.customDateRange.toDate;

            const fromMonth = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][fromDate.get_month() - 1];
            const toMonth = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][toDate.get_month() - 1];

            const fromStr = `${fromMonth} ${fromDate.get_day_of_month()}`;
            const toStr = `${toMonth} ${toDate.get_day_of_month()}`;

            summaryText = `Total: ${totalHours.toFixed(1)} hours (${fromStr} - ${toStr})`;
        }

        const summaryLabel = new Gtk.Label({
            label: summaryText,
            css_classes: ['caption'],
            halign: Gtk.Align.CENTER,
            margin_top: 8,
        });
        chartBox.append(summaryLabel);

        this.chartContainer.append(chartBox);
    }

    /**
     * Get filtered tasks based on current filters
     */
    _getFilteredTasks() {
        // CRITICAL: Filter tasks using the same logic as statistics
        // This ensures Recent Tasks shows only tasks that match ALL active filters (project, client, period)
        // Use _currentTaskInstanceIds if available (from _updateStatistics), otherwise filter by last_used_at
        let filtered = [...this.allTasks];
        
        // Step 1: Filter by project
        if (this.chartFilters.projectId) {
            filtered = filtered.filter(t => t.project_id === this.chartFilters.projectId);
        }
        
        // Step 2: Filter by client
        if (this.chartFilters.clientId) {
            filtered = filtered.filter(t => t.client_id === this.chartFilters.clientId);
        }
        
        // Step 3: CRITICAL: Filter by period using taskInstanceIds (from TimeEntry.end_time) if available
        // This ensures we use the same filtering logic as statistics
        // _currentTaskInstanceIds already contains tasks filtered by project/client AND period
        if (this._currentTaskInstanceIds !== null && this._currentTaskInstanceIds !== undefined) {
            // Use taskInstanceIds from _updateStatistics (already filtered by project/client AND period)
            if (this._currentTaskInstanceIds.length === 0) {
                // No tasks match ALL filters - return empty array
                filtered = [];
            } else {
                // Filter by taskInstanceIds that match ALL filters (project/client AND period)
                const taskIdsSet = new Set(this._currentTaskInstanceIds);
                filtered = filtered.filter(t => taskIdsSet.has(t.id));
            }
        } else {
            // Fallback: filter by last_used_at (for cases where _currentTaskInstanceIds is not set yet)
            filtered = this._filterByPeriod(filtered, this.chartFilters.period);
        }
        
        // COPIED FROM TasksPage: Always include currently tracked task AND all tasks from its stack
        // This ensures user can always see what's being tracked and the entire stack is visible
        const trackingState = this.coreBridge ? this.coreBridge.getTrackingState() : null;
        if (trackingState && trackingState.isTracking && trackingState.currentTaskInstanceId) {
            // Try to find tracked task by taskInstanceId first
            let trackedTask = null;
            if (trackingState.currentTaskInstanceId) {
                trackedTask = this.allTasks.find(t => t.id === trackingState.currentTaskInstanceId);
            }
            
            // If not found by ID, try to find by task_id/project_id/client_id
            if (!trackedTask) {
                trackedTask = this.allTasks.find(t =>
                    t.task_id === trackingState.currentTaskId &&
                    t.project_id === trackingState.currentProjectId &&
                    t.client_id === trackingState.currentClientId
                );
            }
            
            // NOTE: Cannot use await here - _getFilteredTasks() is synchronous
            // Tracked task should be loaded in tracking-started handler via updateChartsOnly()
            
            if (trackedTask) {
                // CRITICAL: Find ALL tasks from the same stack (same task_name/project_name/client_name)
                // This ensures the entire stack is visible when tracking any entry in it
                const stackTasks = this.allTasks.filter(t => 
                    t.task_name === trackedTask.task_name &&
                    t.project_name === trackedTask.project_name &&
                    t.client_name === trackedTask.client_name
                );
                
                // Add all stack tasks to filtered list if not already present
                for (const stackTask of stackTasks) {
                    const isInList = filtered.some(t => 
                        (trackingState.currentTaskInstanceId && t.id === stackTask.id) ||
                        (t.id === stackTask.id) ||
                        (t.task_id === stackTask.task_id &&
                         t.project_id === stackTask.project_id &&
                         t.client_id === stackTask.client_id &&
                         t.id === stackTask.id)
                    );
                    if (!isInList) {
                        filtered.push(stackTask);
                    }
                }
            }
        }
        
        return filtered;
    }

    /**
     * Filter tasks by time period
     * Always includes tasks from current week/month when filtering by month/year
     */
    _filterByPeriod(tasks, period) {
        const now = GLib.DateTime.new_now_local();

        let startDate, endDate;
        let currentWeekStart = null, currentWeekEnd = null;
        let currentMonthStart = null, currentMonthEnd = null;
        
        switch (period) {
            case 'week': {
                // Current week (Monday to Sunday)
                const dayOfWeek = now.get_day_of_week(); // 1=Monday
                const daysToMonday = dayOfWeek - 1;
                const monday = now.add_days(-daysToMonday);
                startDate = GLib.DateTime.new_local(
                    monday.get_year(),
                    monday.get_month(),
                    monday.get_day_of_month(),
                    0, 0, 0
                );
                const sunday = monday.add_days(6);
                endDate = GLib.DateTime.new_local(
                    sunday.get_year(),
                    sunday.get_month(),
                    sunday.get_day_of_month(),
                    23, 59, 59
                );
                break;
            }
            case 'month': {
                // Last 4 weeks (28 days)
                startDate = now.add_days(-28);
                startDate = GLib.DateTime.new_local(
                    startDate.get_year(),
                    startDate.get_month(),
                    startDate.get_day_of_month(),
                    0, 0, 0
                );
                endDate = now;
                
                // Also track current week boundaries for inclusion
                const dayOfWeek = now.get_day_of_week();
                const daysToMonday = dayOfWeek - 1;
                const monday = now.add_days(-daysToMonday);
                currentWeekStart = GLib.DateTime.new_local(
                    monday.get_year(),
                    monday.get_month(),
                    monday.get_day_of_month(),
                    0, 0, 0
                );
                const sunday = monday.add_days(6);
                currentWeekEnd = GLib.DateTime.new_local(
                    sunday.get_year(),
                    sunday.get_month(),
                    sunday.get_day_of_month(),
                    23, 59, 59
                );
                break;
            }
            case 'year': {
                // Last 12 months
                startDate = now.add_months(-12);
                startDate = GLib.DateTime.new_local(
                    startDate.get_year(),
                    startDate.get_month(),
                    startDate.get_day_of_month(),
                    0, 0, 0
                );
                endDate = now;
                
                // Also track current week and current month boundaries for inclusion
                const dayOfWeek = now.get_day_of_week();
                const daysToMonday = dayOfWeek - 1;
                const monday = now.add_days(-daysToMonday);
                currentWeekStart = GLib.DateTime.new_local(
                    monday.get_year(),
                    monday.get_month(),
                    monday.get_day_of_month(),
                    0, 0, 0
                );
                const sunday = monday.add_days(6);
                currentWeekEnd = GLib.DateTime.new_local(
                    sunday.get_year(),
                    sunday.get_month(),
                    sunday.get_day_of_month(),
                    23, 59, 59
                );
                
                // Current month
                currentMonthStart = GLib.DateTime.new_local(
                    now.get_year(),
                    now.get_month(),
                    1,
                    0, 0, 0
                );
                // Last day of current month
                const nextMonth = currentMonthStart.add_months(1);
                const lastDay = nextMonth.add_days(-1);
                currentMonthEnd = GLib.DateTime.new_local(
                    lastDay.get_year(),
                    lastDay.get_month(),
                    lastDay.get_day_of_month(),
                    23, 59, 59
                );
                break;
            }
            case 'custom': {
                // Use custom date range
                if (!this.chartFilters.customDateRange) {
                    return tasks;
                }
                startDate = this.chartFilters.customDateRange.fromDate;
                endDate = this.chartFilters.customDateRange.toDate;
                break;
            }
            default:
                return tasks;
        }

        const startTimestamp = startDate.to_unix();
        const endTimestamp = endDate ? endDate.to_unix() : null;
        const currentWeekStartTimestamp = currentWeekStart ? currentWeekStart.to_unix() : null;
        const currentWeekEndTimestamp = currentWeekEnd ? currentWeekEnd.to_unix() : null;
        const currentMonthStartTimestamp = currentMonthStart ? currentMonthStart.to_unix() : null;
        const currentMonthEndTimestamp = currentMonthEnd ? currentMonthEnd.to_unix() : null;

        return tasks.filter(task => {
            if (!task.last_used_at) return false;

            let dateString = task.last_used_at;
            if (!dateString.endsWith('Z') && !dateString.includes('+')) {
                dateString = dateString + 'Z';
            }

            const taskDate = GLib.DateTime.new_from_iso8601(dateString, null);
            if (!taskDate) return false;

            const taskTimestamp = taskDate.to_unix();
            
            // Check if task falls in main period range
            let inPeriod = false;
            if (endTimestamp) {
                inPeriod = taskTimestamp >= startTimestamp && taskTimestamp <= endTimestamp;
            } else {
                inPeriod = taskTimestamp >= startTimestamp;
            }
            
            // If not in main period, check if it's in current week (for month/year) or current month (for year)
            if (!inPeriod) {
                if (currentWeekStartTimestamp && currentWeekEndTimestamp) {
                    // Include tasks from current week when filtering by month or year
                    inPeriod = taskTimestamp >= currentWeekStartTimestamp && taskTimestamp <= currentWeekEndTimestamp;
                }
                if (!inPeriod && currentMonthStartTimestamp && currentMonthEndTimestamp) {
                    // Include tasks from current month when filtering by year
                    inPeriod = taskTimestamp >= currentMonthStartTimestamp && taskTimestamp <= currentMonthEndTimestamp;
                }
            }
            
            return inPeriod;
        });
    }

    /**
     * Update custom date button labels
     */
    _updateCustomDateButtons() {
        if (!this.chartFilters.customDateRange) return;

        const fromDate = this.chartFilters.customDateRange.fromDate;
        const toDate = this.chartFilters.customDateRange.toDate;

        // Format dates as "Dec 1, 2024"
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

        const fromStr = `${months[fromDate.get_month() - 1]} ${fromDate.get_day_of_month()}, ${fromDate.get_year()}`;
        const toStr = `${months[toDate.get_month() - 1]} ${toDate.get_day_of_month()}, ${toDate.get_year()}`;

        this.startDateButton.set_label(fromStr);
        this.endDateButton.set_label(toStr);
    }

    /**
     * Show date picker dialog for start or end date
     */
    _showDatePickerDialog(isStartDate) {
        const dialog = new Adw.AlertDialog({
            heading: isStartDate ? _('Select Start Date') : _('Select End Date'),
        });

        const content = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 12,
            margin_top: 12,
            margin_bottom: 12,
            margin_start: 12,
            margin_end: 12,
        });

        // Get current date or default
        let currentDate;
        if (this.chartFilters.customDateRange) {
            currentDate = isStartDate ? this.chartFilters.customDateRange.fromDate : this.chartFilters.customDateRange.toDate;
        } else {
            currentDate = GLib.DateTime.new_now_local();
        }

        const calendar = new Gtk.Calendar({
            day: currentDate.get_day_of_month(),
            month: currentDate.get_month() - 1,
            year: currentDate.get_year(),
        });

        content.append(calendar);

        dialog.set_extra_child(content);
        dialog.add_response('cancel', _('Cancel'));
        dialog.add_response('apply', _('Apply'));
        dialog.set_response_appearance('apply', Adw.ResponseAppearance.SUGGESTED);

        dialog.connect('response', (dlg, response) => {
            if (response === 'apply') {
                const gDate = calendar.get_date();

                const selectedDate = GLib.DateTime.new_local(
                    gDate.get_year(),
                    gDate.get_month(),
                    gDate.get_day_of_month(),
                    isStartDate ? 0 : 23,
                    isStartDate ? 0 : 59,
                    isStartDate ? 0 : 59
                );

                // Initialize range if not exists
                if (!this.chartFilters.customDateRange) {
                    const now = GLib.DateTime.new_now_local();
                    this.chartFilters.customDateRange = {
                        fromDate: isStartDate ? selectedDate : now.add_days(-30),
                        toDate: isStartDate ? now : selectedDate
                    };
                } else {
                    // Update selected date
                    if (isStartDate) {
                        this.chartFilters.customDateRange.fromDate = selectedDate;
                    } else {
                        this.chartFilters.customDateRange.toDate = selectedDate;
                    }
                }

                this._updateCustomDateButtons();
                
                // CRITICAL: Don't check filters here - _updateStatistics will do it after updating _currentDateRange
                // This ensures we check against the correct date range for the custom period filter
                
                this._updateReports().catch(error => {
                    console.error('[ReportsPage] Error updating reports from custom date:', error);
                });
            }
            dlg.close();
        });

        dialog.present(this.parentWindow);
    }

    /**
     * Update statistics cards
     */
    async _updateStatistics(tasks) {
        // Get date range for current filter period
        const now = GLib.DateTime.new_now_local();
        let startDate, endDate;

        switch (this.chartFilters.period) {
            case 'week': {
                const dayOfWeek = now.get_day_of_week();
                const daysToMonday = dayOfWeek - 1;
                const monday = now.add_days(-daysToMonday);
                startDate = GLib.DateTime.new_local(
                    monday.get_year(),
                    monday.get_month(),
                    monday.get_day_of_month(),
                    0, 0, 0
                );
                const sunday = monday.add_days(6);
                endDate = GLib.DateTime.new_local(
                    sunday.get_year(),
                    sunday.get_month(),
                    sunday.get_day_of_month(),
                    23, 59, 59
                );
                break;
            }
            case 'month': {
                startDate = now.add_days(-28);
                startDate = GLib.DateTime.new_local(
                    startDate.get_year(),
                    startDate.get_month(),
                    startDate.get_day_of_month(),
                    0, 0, 0
                );
                endDate = now;
                break;
            }
            case 'year': {
                startDate = now.add_months(-12);
                startDate = GLib.DateTime.new_local(
                    startDate.get_year(),
                    startDate.get_month(),
                    startDate.get_day_of_month(),
                    0, 0, 0
                );
                endDate = now;
                break;
            }
            case 'custom': {
                if (this.chartFilters.customDateRange) {
                    startDate = this.chartFilters.customDateRange.fromDate;
                    endDate = this.chartFilters.customDateRange.toDate;
                }
                break;
            }
        }

        if (!startDate || !endDate) {
            // Fallback to simple calculation if no date range
            this.totalTimeLabel.set_label('00:00:00');
            this.activeProjectsLabel.set_label('0');
            this.trackedTasksLabel.set_label('0');
            this._updateCurrencyCarousel(new Map());
            return;
        }

        // Store current date range for real-time updates
        this._currentDateRange = { startDate, endDate };
        
        // CRITICAL: Always reset task instance IDs at the start
        // This ensures we don't use stale filter values from previous calls
        this._currentTaskInstanceIds = null;

        // Only pass task IDs if we're filtering by project or client
        // Don't filter by task IDs when only filtering by date, because
        // we want ALL time entries in that date range, not just entries
        // from tasks that have last_used_at in that range
        if (this.chartFilters.projectId || this.chartFilters.clientId) {
            // CRITICAL: When filtering by project/client, we need to:
            // 1. Get tasks that match project/client filter (from allTasks, not filtered by period)
            // 2. Get task IDs that have TimeEntry records with end_time in the selected period
            // 3. Intersect these two sets to get tasks that match BOTH filters
            
            // Step 1: Filter tasks by project/client (without period filter)
            let projectClientFiltered = [...this.allTasks];
            if (this.chartFilters.projectId) {
                projectClientFiltered = projectClientFiltered.filter(t => t.project_id === this.chartFilters.projectId);
            }
            if (this.chartFilters.clientId) {
                projectClientFiltered = projectClientFiltered.filter(t => t.client_id === this.chartFilters.clientId);
            }
            
            // Step 2: Get task IDs that have TimeEntry records in the selected period
            const taskIdsInPeriod = await this.coreBridge.getTaskInstanceIdsForPeriod(this._currentDateRange);
            const taskIdsInPeriodSet = new Set(taskIdsInPeriod);
            
            // Step 3: Intersect - only tasks that match project/client AND have entries in period
            const filteredTaskIds = projectClientFiltered
                .filter(t => taskIdsInPeriodSet.has(t.id))
                .map(t => t.id);
            
            // CRITICAL: If no tasks match both filters (project/client AND period),
            // return zero statistics instead of showing all data
            if (filteredTaskIds.length === 0) {
                // No tasks match the filters - show zero statistics
                this._cachedStatsTotal = 0;
                this._cachedEarningsByCurrency = new Map();
                this._isTrackingInPeriod = false;
                this._cachedTrackingClient = null;
                
                this.totalTimeLabel.set_label('00:00:00');
                this.activeProjectsLabel.set_label('0');
                this.trackedTasksLabel.set_label('0');
                this._updateCurrencyCarousel(new Map());
                return;
            }
            
            this._currentTaskInstanceIds = filteredTaskIds;
        } else {
            // CRITICAL: When no project/client filters, get ALL taskInstanceIds that have TimeEntry records in the period
            // This ensures Recent Tasks uses the same filtering logic as statistics (by TimeEntry.end_time, not last_used_at)
            const allTaskIdsInPeriod = await this.coreBridge.getTaskInstanceIdsForPeriod(this._currentDateRange);
            this._currentTaskInstanceIds = allTaskIdsInPeriod;
        }

        // CRITICAL: For getStatsForPeriod, pass null when no project/client filters
        // (Core will handle period filtering internally)
        // But _currentTaskInstanceIds is still set for Recent Tasks filtering
        const taskInstanceIdsToPass = (this.chartFilters.projectId || this.chartFilters.clientId) 
            ? this._currentTaskInstanceIds 
            : null;
        
        // Get statistics from Core (business logic)
        const stats = await this.coreBridge.getStatsForPeriod(
            this._currentDateRange,
            taskInstanceIdsToPass
        );

        // Cache the base stats total and earnings for real-time updates
        this._cachedStatsTotal = stats.totalTime;
        this._cachedEarningsByCurrency = stats.earningsByCurrency;
        
        // CRITICAL: Re-check if current tracking matches filters after updating statistics
        // This ensures real-time updates work only if tracking matches current filters
        const trackingState = this.coreBridge ? this.coreBridge.getTrackingState() : null;
        if (trackingState && trackingState.isTracking && trackingState.startTime) {
            this._checkIfTrackingMatchesFilters({
                startTime: trackingState.startTime,
                projectId: trackingState.currentProjectId,
                clientId: trackingState.currentClientId
            });
            
            // Cache client info only if tracking matches filters
            if (this._isTrackingInPeriod && trackingState.currentClientId) {
                await this._cacheCurrentTrackingClient();
            } else {
                this._cachedTrackingClient = null;
            }
        } else {
            this._isTrackingInPeriod = false;
            this._cachedTrackingClient = null;
        }

        // CRITICAL: Show only filtered time (completed entries matching filters)
        // Real-time tracking time will be added ONLY if tracking matches filters
        const displayTotal = stats.totalTime; // Only completed time matching filters

        // Update UI labels
        this.totalTimeLabel.set_label(this._formatDuration(displayTotal));
        this.activeProjectsLabel.set_label(stats.activeProjects.toString());
        this.trackedTasksLabel.set_label(stats.trackedTasks.toString());

        // CRITICAL: Show only filtered earnings (completed entries matching filters)
        // Real-time tracking earnings will be added ONLY if tracking matches filters
        this._updateCurrencyCarousel(stats.earningsByCurrency);
    }

    /**
     * Update statistics in real-time (without full reload)
     * OPTIMIZED: NO getTrackingState() call, uses data from tracking-updated event
     */
    _updateStatisticsRealtimeFromData(data) {
        if (!data || data.elapsedSeconds === undefined) return;
        
        // Need cached base stats from last full update
        if (this._cachedStatsTotal === undefined) {
            return;
        }
        
        
        // OPTIMIZED: Simply add current elapsed time to cached base total
        // NO object creation, NO getTrackingState() call
        const currentElapsed = data.elapsedSeconds;
        const totalTime = this._cachedStatsTotal + currentElapsed;
        
        
        // Update Total Time label (no async, no glitches)
        this.totalTimeLabel.set_label(this._formatDuration(totalTime));
        
        // Update currency earnings in real-time
        this._updateCurrencyEarningsRealtimeFromData(currentElapsed);
    }

    /**
     * Cache current tracking task client info for real-time earnings updates
     */
    async _cacheCurrentTrackingClient() {
        const trackingState = this.coreBridge.getTrackingState();

        if (!trackingState.isTracking || !trackingState.currentTaskInstanceId) {
            this._cachedTrackingClient = null;
            return;
        }

        try {
            const taskInstance = await this.coreBridge.getTaskInstance(trackingState.currentTaskInstanceId);
            if (!taskInstance) {
                this._cachedTrackingClient = null;
                return;
            }

            const client = await this.coreBridge.getClient(taskInstance.client_id);
            this._cachedTrackingClient = client;
        } catch (error) {
            this._cachedTrackingClient = null;
        }
    }

    /**
     * Update currency earnings in real-time
     * Calculates current task earnings and adds to cached base
     * OPTIMIZED: Reuse Map instead of creating new one every second
     * NO getTrackingState() call - uses cached client data
     */
    _updateCurrencyEarningsRealtimeFromData(currentElapsed) {
        if (!this._cachedEarningsByCurrency) return;
        if (!this._cachedTrackingClient || !this._cachedTrackingClient.rate) return;

        // Calculate current earnings for this tracking session
        const hoursElapsed = currentElapsed / 3600;
        const currentEarnings = hoursElapsed * this._cachedTrackingClient.rate;
        const currency = this._cachedTrackingClient.currency || 'USD';

        // CRITICAL FIX: Reuse Map - update directly instead of cloning
        // Cache base amount if not already cached
        if (!this._realtimeEarningsMap) {
            // Create Map once, reuse forever
            this._realtimeEarningsMap = new Map(this._cachedEarningsByCurrency);
        }

        // Get base amount from cached earnings (original value)
        const baseAmount = this._cachedEarningsByCurrency.get(currency) || 0;

        // Update reused Map with calculated total
        this._realtimeEarningsMap.set(currency, baseAmount + currentEarnings);

        // Update carousel with real-time values (pass reused Map)
        this._updateCurrencyCarousel(this._realtimeEarningsMap);
    }

    /**
     * Update Recent Tasks list in real-time
     * DISABLED: We don't want real-time updates of Recent Tasks during tracking
     */
    async _updateRecentTasksRealtime(trackingState) {
        // DISABLED: Recent Tasks real-time updates - not needed during tracking
        return;
    }

    /**
     * Check if tracking matches ALL active filters (period, project, client)
     * CRITICAL: Real-time updates work ONLY if tracking matches all filters
     */
    _checkIfTrackingMatchesFilters(data) {
        if (!data) {
            this._isTrackingInPeriod = false;
            return;
        }
        
        const trackingState = this.coreBridge ? this.coreBridge.getTrackingState() : null;
        if (!trackingState || !trackingState.isTracking) {
            this._isTrackingInPeriod = false;
            return;
        }
        
        // Check 1: Period filter - startTime must be in current date range
        if (!this._currentDateRange || !data.startTime) {
            this._isTrackingInPeriod = false;
            return;
        }
        
        try {
            // CRITICAL: startTime can be timestamp (number) or string format
            let isoStartTime;
            if (typeof data.startTime === 'number') {
                const date = new Date(data.startTime);
                isoStartTime = date.toISOString();
            } else if (typeof data.startTime === 'string') {
                isoStartTime = data.startTime.replace(' ', 'T') + 'Z';
            } else {
                this._isTrackingInPeriod = false;
                return;
            }
            
            const startDateTime = GLib.DateTime.new_from_iso8601(isoStartTime, null);
            if (!startDateTime) {
                this._isTrackingInPeriod = false;
                return;
            }
            
            const { startDate, endDate } = this._currentDateRange;
            const isInPeriod = startDateTime.compare(startDate) >= 0 && 
                              startDateTime.compare(endDate) <= 0;
            
            if (!isInPeriod) {
                this._isTrackingInPeriod = false;
                return;
            }
            
            // Check 2: Project filter - if filter is set, tracking must match
            if (this.chartFilters.projectId !== null) {
                const trackingProjectId = trackingState.currentProjectId || data.projectId;
                if (trackingProjectId !== this.chartFilters.projectId) {
                    this._isTrackingInPeriod = false;
                    return;
                }
            }
            
            // Check 3: Client filter - if filter is set, tracking must match
            if (this.chartFilters.clientId !== null) {
                const trackingClientId = trackingState.currentClientId || data.clientId;
                if (trackingClientId !== this.chartFilters.clientId) {
                    this._isTrackingInPeriod = false;
                    return;
                }
            }
            
            // All filters passed - tracking matches
            this._isTrackingInPeriod = true;
        } catch (error) {
            console.error('[ReportsPage] Error checking if tracking matches filters:', error);
            this._isTrackingInPeriod = false;
        }
    }
    
    /**
     * Check if tracking start time is in current period filter (legacy method, kept for compatibility)
     */
    _checkIfTrackingIsInPeriod(startTime) {
        // Use new method with full filter checking
        const trackingState = this.coreBridge ? this.coreBridge.getTrackingState() : null;
        if (trackingState && trackingState.isTracking) {
            this._checkIfTrackingMatchesFilters({ startTime });
        } else {
            this._isTrackingInPeriod = false;
        }
    }
    
    /**
     * Cache tracking client info for real-time income calculations
     * NO getTrackingState() call - uses data from event
     */
    async _cacheTrackingClientFromData(clientId) {
        if (!clientId) {
            this._cachedTrackingClient = null;
            return;
        }
        
        try {
            const client = await this.coreBridge.getClient(clientId);
            this._cachedTrackingClient = client;
        } catch (error) {
            console.error('[ReportsPage] Error caching tracking client:', error);
            this._cachedTrackingClient = null;
        }
    }

    // REMOVED: _getFilteredTasksFromArray and _getFilteredTasksFromArraySync
    // These methods are no longer used - _getFilteredTasks() handles all filtering logic

    /**
     * DISABLED: Carousel auto-advance timer - not needed for tracking functionality
     */
    _startCarouselAutoAdvance() {
        // DISABLED: Carousel auto-advance timer - not needed, saves RAM
        return;
    }

    /**
     * Update currency carousel with earnings
     */
    _updateCurrencyCarousel(currencyTotals) {
        // Try to update existing carousel labels first (no flicker)
        if (this._updateCurrencyCarouselLabels(currencyTotals)) {
            return; // Successfully updated existing labels
        }

        // Rebuild carousel if structure changed (different currencies)
        this._rebuildCurrencyCarousel(currencyTotals);
    }

    /**
     * Update existing carousel labels without rebuilding (prevents flicker)
     * Returns true if successful, false if rebuild needed
     * OPTIMIZED: Reuse arrays for currency comparison
     */
    _updateCurrencyCarouselLabels(currencyTotals) {
        if (!this._currencyCarouselPages) return false;

        // OPTIMIZED: Cache currency arrays to avoid creating new arrays every second
        if (!this._cachedCurrentCurrencies) {
            this._cachedCurrentCurrencies = [];
        }

        // Only rebuild currency arrays if currency structure changed (rare)
        const currencyCount = this._currencyCarouselPages.size;
        const newCurrencyCount = currencyTotals ? currencyTotals.size : 0;

        if (currencyCount !== newCurrencyCount) {
            // Structure changed - rebuild cache arrays
            this._cachedCurrentCurrencies = Array.from(this._currencyCarouselPages.keys()).sort();
            const newCurrencies = currencyTotals ? Array.from(currencyTotals.keys()).sort() : [];

            if (this._cachedCurrentCurrencies.length !== newCurrencies.length) return false;
            if (!this._cachedCurrentCurrencies.every((c, i) => c === newCurrencies[i])) return false;
        }

        // Update amounts in existing labels - NO NEW OBJECTS
        for (const [currency, amountLabel] of this._currencyCarouselPages) {
            const amount = currencyTotals.get(currency) || 0;
            amountLabel.set_label(amount.toFixed(2));
        }

        return true;
    }

    /**
     * Rebuild currency carousel from scratch
     */
    _rebuildCurrencyCarousel(currencyTotals) {
        // Clear existing carousel content
        while (this.currencyCarousel.get_first_child()) {
            this.currencyCarousel.remove(this.currencyCarousel.get_first_child());
        }

        // Track carousel pages for updates
        this._currencyCarouselPages = new Map();

        if (!currencyTotals || currencyTotals.size === 0) {
            // Show 0.00 if no earnings
            const { box, amountLabel } = this._createCurrencyBox('0.00', 'USD');
            this.currencyCarousel.append(box);
            this._currencyCarouselPages.set('USD', amountLabel);
        } else {
            // Add a page for each currency to carousel
            for (const [currency, amount] of currencyTotals) {
                const formattedAmount = amount.toFixed(2);
                const { box, amountLabel } = this._createCurrencyBox(formattedAmount, currency);
                this.currencyCarousel.append(box);
                this._currencyCarouselPages.set(currency, amountLabel);
            }
        }
    }

    /**
     * Create currency display box for carousel
     * Returns object with box and amountLabel reference for updates
     */
    _createCurrencyBox(amount, currency) {
        const box = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 4,
            halign: Gtk.Align.CENTER,
            valign: Gtk.Align.CENTER,
        });

        const currencySymbol = getCurrencySymbol(currency);
        const symbolLabel = new Gtk.Label({
            label: currencySymbol,
            css_classes: ['title-1', 'accent'],
        });

        const amountLabel = new Gtk.Label({
            label: amount,
            css_classes: ['title-1'],
        });

        const currencyLabel = new Gtk.Label({
            label: currency,
            css_classes: ['caption'],
        });

        box.append(symbolLabel);
        box.append(amountLabel);
        box.append(currencyLabel);

        return { box, amountLabel };
    }

    /**
     * COPIED FROM TasksPage: Group similar tasks together
     */
    _groupSimilarTasks(tasks) {
        const groups = new Map();

        tasks.forEach(taskInstance => {
            // Group by task name + project + client (like old system)
            const baseName = taskInstance.task_name;
            const projectName = taskInstance.project_name || '';
            const clientName = taskInstance.client_name || '';
            const groupKey = `${baseName}::${projectName}::${clientName}`;

            if (!groups.has(groupKey)) {
                groups.set(groupKey, {
                    groupKey: groupKey,
                    baseName: baseName,
                    tasks: [],
                    totalDuration: 0,
                    totalCost: 0,
                    latestTask: null
                });
            }

            const group = groups.get(groupKey);
            group.tasks.push(taskInstance);
            group.totalDuration += taskInstance.total_time || 0;

            // Calculate cost for this task instance
            const instanceCost = (taskInstance.total_time / 3600) * (taskInstance.client_rate || 0);
            group.totalCost += instanceCost;

            // Keep track of the most recently used task
            if (!group.latestTask) {
                group.latestTask = taskInstance;
            } else {
                const currentTime = taskInstance.last_used_at || '';
                const latestTime = group.latestTask.last_used_at || '';
                if (currentTime > latestTime) {
                    group.latestTask = taskInstance;
                }
            }
        });

        // Convert to array and clear Map immediately to free memory
        const result = Array.from(groups.values());
        groups.clear();
        return result;
    }

    /**
     * COPIED FROM TasksPage: Update ALL task instances with same task_id
     * This ensures all entries for a task are updated when task is modified
     */
    async _updateAllTaskInstances(taskId) {
        console.log('[ReportsPage] _updateAllTaskInstances called for task_id:', taskId);
        if (!this.coreBridge) {
            console.log('[ReportsPage] No coreBridge, returning');
            return;
        }

        try {
            // Find ALL task instances with this task_id in allTasks
            const taskInstances = this.allTasks.filter(t => t.task_id === taskId);
            console.log('[ReportsPage] Found task instances:', taskInstances.length);
            
            if (taskInstances.length === 0) {
                console.log('[ReportsPage] No task instances found, doing full reload');
                // No tasks with this task_id in list - might need full reload
                await this.updateChartsOnly();
                const filteredTasks = this._getFilteredTasks();
                this._updateRecentTasksList(filteredTasks);
                return;
            }

            // CRITICAL: Update ALL task instances, not just first one
            let allUpdated = true;
            for (const taskInstance of taskInstances) {
                console.log('[ReportsPage] Updating task instance:', taskInstance.id);
                if (!taskInstance || !taskInstance.id) {
                    allUpdated = false;
                    continue;
                }

                try {
                    // Load updated task instance from DB
                    const updatedTask = await this.coreBridge.getTaskInstance(taskInstance.id);
                    if (updatedTask) {
                        // Find index in allTasks array
                        const taskIndex = this.allTasks.findIndex(t => t.id === taskInstance.id);
                        if (taskIndex !== -1) {
                            // Update in place (direct assignment, no spread)
                            Object.assign(this.allTasks[taskIndex], updatedTask);
                            
                            // Update template if exists
                            const template = this.taskTemplates.get(taskInstance.id);
                            if (template) {
                                console.log('[ReportsPage] Template found for instance:', taskInstance.id, 'task_name:', updatedTask.task_name);
                                // Update task reference in template
                                if (template.task) {
                                    Object.assign(template.task, updatedTask);
                                    console.log('[ReportsPage] Updated single task template, calling updateTrackingState');
                                    // Update subtitle to show new names
                                    if (typeof template.updateTrackingState === 'function') {
                                        template.updateTrackingState();
                                    }
                                } else if (template.group) {
                                    // For stack templates, update task in group
                                    const taskInGroup = template.group.tasks.find(t => t.id === taskInstance.id);
                                    if (taskInGroup) {
                                        Object.assign(taskInGroup, updatedTask);
                                        console.log('[ReportsPage] Updated task in stack, calling updateTrackingState');
                                        // Update stack subtitle
                                        if (typeof template.updateTrackingState === 'function') {
                                            template.updateTrackingState();
                                        }
                                    }
                                }
                            } else {
                                console.log('[ReportsPage] No template found for instance:', taskInstance.id);
                            }
                            
                            // Also check if it's in a stack (by groupKey)
                            for (const [stackId, stackTemplate] of this.taskTemplates.entries()) {
                                if (stackTemplate.group && stackTemplate.group.tasks) {
                                    const taskInStack = stackTemplate.group.tasks.find(t => t.id === taskInstance.id);
                                    if (taskInStack) {
                                        Object.assign(taskInStack, updatedTask);
                                        // Update stack subtitle
                                        if (typeof stackTemplate.updateTrackingState === 'function') {
                                            stackTemplate.updateTrackingState();
                                        }
                                    }
                                }
                            }
                        }
                    } else {
                        allUpdated = false;
                    }
                } catch (error) {
                    console.error(`[ReportsPage] Error updating task instance ${taskInstance.id}:`, error);
                    allUpdated = false;
                }
            }
            
            // If some updates failed, do full reload as fallback
            if (!allUpdated) {
                console.warn('[ReportsPage] Some task instances failed to update, doing full reload');
                await this.updateChartsOnly();
                const filteredTasks = this._getFilteredTasks();
                this._updateRecentTasksList(filteredTasks);
            }
        } catch (error) {
            console.error('[ReportsPage] Error updating all task instances:', error);
            // Fallback to full reload on error
            await this.updateChartsOnly();
            const filteredTasks = this._getFilteredTasks();
            this._updateRecentTasksList(filteredTasks);
        }
    }

    /**
     * COPIED FROM TasksPage: Update recent tasks list using same components as TasksPage
     */
    _updateRecentTasksList(tasks) {
        // OPTIMIZED: Clear ALL tracked widgets/templates FIRST to free RAM
        this._trackedTemplates.forEach((template, key) => {
            if (template && typeof template.destroy === 'function') {
                template.destroy();
            }
        });
        this._trackedTemplates.clear();
        this._trackedWidgets.clear();
        this.taskTemplates.clear();
        
        // Clear existing list
        let child = this.recentTasksList.get_first_child();
        while (child) {
            const next = child.get_next_sibling();
            this.recentTasksList.remove(child);
            child = next;
        }

        if (tasks.length === 0) {
            const emptyRow = new Adw.ActionRow({
                title: _('No tasks found'),
                subtitle: _('Try adjusting your filters'),
                sensitive: false,
            });
            this.recentTasksList.append(emptyRow);
            return;
        }

        // Sort by last_used_at descending
        const sortedTasks = [...tasks].sort((a, b) => {
            if (!a.last_used_at) return 1;
            if (!b.last_used_at) return -1;
            return b.last_used_at.localeCompare(a.last_used_at);
        });

        // CRITICAL: Don't limit tasks here - we'll limit groups (tasks/stacks) to 6 after grouping
        // This ensures all entries from tracked stack are available for grouping
        let recentTasks = [...sortedTasks];
        
        // CRITICAL: Ensure tracked task AND all tasks from its stack are always in the list
        // This ensures the entire stack is visible when tracking a task in it
        const trackingState = this.coreBridge ? this.coreBridge.getTrackingState() : null;
        if (trackingState && trackingState.isTracking && trackingState.currentTaskInstanceId) {
            // COPIED FROM TasksPage: Find tracked task by taskInstanceId first (exact match)
            let trackedTask = tasks.find(t => t.id === trackingState.currentTaskInstanceId);
            
            // If not found, try to find by task_id/project_id/client_id
            if (!trackedTask) {
                trackedTask = tasks.find(t =>
                    t.task_id === trackingState.currentTaskId &&
                    t.project_id === trackingState.currentProjectId &&
                    t.client_id === trackingState.currentClientId
                );
            }
            
            if (trackedTask) {
                // CRITICAL: Find ALL tasks from the same stack (same task_name/project_name/client_name)
                // This ensures the entire stack is visible, not just the tracked task
                const stackTasks = tasks.filter(t => 
                    t.task_name === trackedTask.task_name &&
                    t.project_name === trackedTask.project_name &&
                    t.client_name === trackedTask.client_name
                );
                
                // Add all stack tasks to the beginning of the list (most important)
                // This ensures stack is always visible with all its entries
                for (const stackTask of stackTasks) {
                    const isAlreadyInList = recentTasks.some(t => t.id === stackTask.id);
                    if (!isAlreadyInList) {
                        recentTasks.unshift(stackTask);
                    }
                }
                
                // No need to limit here - we'll limit groups (tasks/stacks) to 6 after grouping
            }
        }

        // COPIED FROM TasksPage: Group tasks and render using same templates
        // CRITICAL: Group AFTER adding tracked task and its stack to ensure entire stack is grouped
        const taskGroups = this._groupSimilarTasks(recentTasks);
        
        // CRITICAL: After grouping, verify tracked task is in a group
        // If tracked task is not in any group, it means grouping failed - add it manually
        let trackedGroup = null;
        if (trackingState && trackingState.isTracking && trackingState.currentTaskInstanceId) {
            const trackedTask = recentTasks.find(t => t.id === trackingState.currentTaskInstanceId);
            if (trackedTask) {
                // Check if tracked task is in any group
                let isInGroup = false;
                for (const group of taskGroups) {
                    if (group.tasks.some(t => t.id === trackedTask.id)) {
                        isInGroup = true;
                        trackedGroup = group;
                        break;
                    }
                }
                
                // If not in any group, create a group for it or add to matching group
                if (!isInGroup) {
                    // Try to find a group with same task_name/project_name/client_name
                    const matchingGroup = taskGroups.find(g => 
                        g.baseName === trackedTask.task_name &&
                        g.tasks[0]?.project_name === trackedTask.project_name &&
                        g.tasks[0]?.client_name === trackedTask.client_name
                    );
                    
                    if (matchingGroup) {
                        // Add to existing group
                        const isAlreadyInGroup = matchingGroup.tasks.some(t => t.id === trackedTask.id);
                        if (!isAlreadyInGroup) {
                            matchingGroup.tasks.push(trackedTask);
                            matchingGroup.totalDuration += trackedTask.total_time || 0;
                            const instanceCost = (trackedTask.total_time / 3600) * (trackedTask.client_rate || 0);
                            matchingGroup.totalCost += instanceCost;
                        }
                        trackedGroup = matchingGroup;
                    } else {
                        // Create new group for tracked task
                        const groupKey = `${trackedTask.task_name}::${trackedTask.project_name || ''}::${trackedTask.client_name || ''}`;
                        trackedGroup = {
                            groupKey: groupKey,
                            baseName: trackedTask.task_name,
                            tasks: [trackedTask],
                            totalDuration: trackedTask.total_time || 0,
                            totalCost: (trackedTask.total_time / 3600) * (trackedTask.client_rate || 0),
                            latestTask: trackedTask
                        };
                        taskGroups.unshift(trackedGroup);
                    }
                }
                
                // CRITICAL: Ensure tracked group is at the beginning of the list (most visible)
                if (trackedGroup && taskGroups.indexOf(trackedGroup) > 0) {
                    const index = taskGroups.indexOf(trackedGroup);
                    taskGroups.splice(index, 1);
                    taskGroups.unshift(trackedGroup);
                }
            }
        }
        
        // CRITICAL: Limit to 6 groups (tasks/stacks) maximum, but always include tracked group
        // This ensures we show only last 6 items (single tasks and stacks), not entries
        if (taskGroups.length > 6) {
            if (trackedGroup) {
                // Keep tracked group + 5 most recent other groups
                const otherGroups = taskGroups.filter(g => g !== trackedGroup);
                // Sort other groups by latest task's last_used_at
                otherGroups.sort((a, b) => {
                    const aTime = a.latestTask?.last_used_at || '';
                    const bTime = b.latestTask?.last_used_at || '';
                    if (!aTime) return 1;
                    if (!bTime) return -1;
                    return bTime.localeCompare(aTime);
                });
                // Keep top 5 other groups + tracked group
                const limitedGroups = [trackedGroup, ...otherGroups.slice(0, 5)];
                // Sort final list: tracked group first, then by last_used_at
                limitedGroups.sort((a, b) => {
                    if (a === trackedGroup) return -1;
                    if (b === trackedGroup) return 1;
                    const aTime = a.latestTask?.last_used_at || '';
                    const bTime = b.latestTask?.last_used_at || '';
                    if (!aTime) return 1;
                    if (!bTime) return -1;
                    return bTime.localeCompare(aTime);
                });
                // Replace taskGroups with limited list
                taskGroups.length = 0;
                taskGroups.push(...limitedGroups);
            } else {
                // No tracked group - just keep 6 most recent groups
                taskGroups.sort((a, b) => {
                    const aTime = a.latestTask?.last_used_at || '';
                    const bTime = b.latestTask?.last_used_at || '';
                    if (!aTime) return 1;
                    if (!bTime) return -1;
                    return bTime.localeCompare(aTime);
                });
                taskGroups.splice(6);
            }
        }
        
        taskGroups.forEach(group => {
            let row;

            if (group.tasks.length === 1) {
                // Single task - use TaskRowTemplate
                const task = group.tasks[0];
                const template = new TaskRowTemplate(task, this);
                row = template.getWidget();

                // Register for cleanup tracking
                this._trackedTemplates.set(task.id, template);
                this._trackedWidgets.set(`task-${task.id}`, row);

                // Update tracking state (icon and green dot)
                template.updateTrackingState();

                // Store template for real-time updates
                this.taskTemplates.set(task.id, template);
            } else {
                // Multiple tasks - use TaskStackTemplate (stack/expander)
                const template = new TaskStackTemplate(group, this);
                row = template.getWidget();

                // Register for cleanup tracking
                this._trackedTemplates.set(`stack:${group.groupKey}`, template);
                this._trackedWidgets.set(`stack-${group.groupKey}`, row);

                // Update tracking state (icon)
                template.updateTrackingState();

                // Store template for real-time updates by groupKey (for stacks)
                this.taskTemplates.set(`stack:${group.groupKey}`, template);
            }

            if (row) {
                this.recentTasksList.append(row);
            }
        });
    }

    /**
     * COPIED FROM TasksPage: Update all templates' tracking state
     */
    _updateAllTemplatesTrackingState() {
        if (!this.taskTemplates || this.taskTemplates.size === 0) return;

        this.taskTemplates.forEach((template, key) => {
            try {
                if (template && typeof template.updateTrackingState === 'function') {
                    template.updateTrackingState();
                }
            } catch (e) {
                // Ignore errors
            }
        });
    }

    /**
     * Format duration as HH:MM:SS
     */
    _formatDuration(seconds) {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;
        return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }

    /**
     * Format date as DD.MM.YYYY
     */
    _formatDate(dateStr) {
        if (!dateStr) return '';

        // Parse date string
        // New format from TimeUtils.getCurrentTimestamp(): YYYY-MM-DD HH:MM:SS (local time)
        // We treat all as local time now (no 'Z')
        let cleanDateStr = dateStr;
        
        if (!cleanDateStr.includes('T') && !cleanDateStr.includes('Z')) {
            // SQLite format: YYYY-MM-DD HH:MM:SS (local time)
            // Convert to ISO format without 'Z' (local time)
            cleanDateStr = cleanDateStr.replace(' ', 'T');
        }

        const date = GLib.DateTime.new_from_iso8601(cleanDateStr, null);
        if (!date) return dateStr;

        const day = String(date.get_day_of_month()).padStart(2, '0');
        const month = String(date.get_month()).padStart(2, '0');
        const year = date.get_year();

        return `${day}.${month}.${year}`;
    }

    /**
     * Convert task instances to old format for PDF export
     * Old format: { start, duration, task_name, project_id, client_id }
     * Each TaskInstance (stack) = 1 task unit
     */
    _prepareExportData() {
        const exportTasks = [];

        // Convert each task instance to old task format
        (this.allTasks || []).forEach(taskInstance => {
            if (!taskInstance.last_used_at) return;

            exportTasks.push({
                start: taskInstance.last_used_at,
                duration: taskInstance.total_time || 0,
                task_name: taskInstance.task_name || 'Unnamed Task',
                project_id: taskInstance.project_id || 1,
                client_id: taskInstance.client_id || 1,
                id: taskInstance.id,
                task_instance_id: taskInstance.id
            });
        });

        return exportTasks;
    }

    /**
     * Export PDF report
     */
    async _exportPDF() {
        if (!this.reportExporter) {
            console.error('[ReportsPage] Report exporter not initialized');
            return;
        }

        try {
            // Convert data to old format for PDF export
            const exportTasks = this._prepareExportData();

            // Update report exporter with converted data
            this.reportExporter.tasks = exportTasks;
            this.reportExporter.projects = this.allProjects;
            this.reportExporter.clients = this.allClients;

            // Open PDF export preferences dialog (correct order: parentWindow, reportExporter)
            const prefsDialog = new PDFExportPreferencesDialog(this.parentWindow, this.reportExporter);
            prefsDialog.present(this.parentWindow);

        } catch (error) {
            console.error('[ReportsPage] Error exporting PDF:', error);
            if (this.parentWindow && this.parentWindow.showToast) {
                this.parentWindow.showToast(_('PDF export failed'));
            }
        }
    }

    /**
     * Refresh page
     */
    async refresh() {
        await this.loadReports();
    }

    /**
     * Update only the chart and statistics without full reload
     * Used for real-time updates when tracking
     */
    async updateChartsOnly() {
        try {
            // Reload only time entries and task instances
            const allTaskInstances = await this.coreBridge.getAllTaskInstances() || [];
            this.allTasks = allTaskInstances.slice(-this._maxCacheSize);
            this.allTimeEntries = await this.coreBridge.getAllTimeEntries() || [];

            // DEBUG: Log to verify tracked task is loaded
            const trackingState = this.coreBridge ? this.coreBridge.getTrackingState() : null;
            if (trackingState && trackingState.isTracking && trackingState.currentTaskInstanceId) {
                const trackedTask = this.allTasks.find(t => t.id === trackingState.currentTaskInstanceId);
            }

            // Update all reports
            await this._updateReports();
        } catch (error) {
            console.error('[ReportsPage] Error updating charts:', error);
        }
    }
}
