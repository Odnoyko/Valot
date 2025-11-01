/**
 * Core Bridge
 * Connects Core API (TypeScript) with GTK UI (GJS)
 */

export class CoreBridge {
    constructor(coreAPI) {
        this.core = coreAPI;
        this.uiCallbacks = new Map();

        // Subscribe to core events
        this._setupEventListeners();
    }

    /**
     * Setup event listeners from Core
     */
    _setupEventListeners() {
        // Tracking events
        this.core.events.on('tracking:started', (data) => {
            this._notifyUI('tracking-started', data);
        });

        this.core.events.on('tracking:stopped', (data) => {
            this._notifyUI('tracking-stopped', data);
        });

        this.core.events.on('tracking:updated', (data) => {
            this._notifyUI('tracking-updated', data);
        });

        // Project events
        this.core.events.on('project:created', (data) => {
            this._notifyUI('project-created', data);
        });

        this.core.events.on('project:updated', (data) => {
            this._notifyUI('project-updated', data);
        });

        this.core.events.on('project:deleted', (data) => {
            this._notifyUI('project-deleted', data);
        });

        this.core.events.on('projects:deleted', (data) => {
            this._notifyUI('projects-deleted', data);
        });

        // Client events
        this.core.events.on('client:created', (data) => {
            this._notifyUI('client-created', data);
        });

        this.core.events.on('client:updated', (data) => {
            this._notifyUI('client-updated', data);
        });

        this.core.events.on('client:deleted', (data) => {
            this._notifyUI('client-deleted', data);
        });

        this.core.events.on('clients:deleted', (data) => {
            this._notifyUI('clients-deleted', data);
        });

        // Task events
        this.core.events.on('task:created', (data) => {
            this._notifyUI('task-created', data);
        });

        this.core.events.on('task:updated', (data) => {
            this._notifyUI('task-updated', data);
        });

        this.core.events.on('task:deleted', (data) => {
            this._notifyUI('task-deleted', data);
        });
    }

    /**
     * Register UI callback
     */
    onUIEvent(event, callback) {
        if (!this.uiCallbacks.has(event)) {
            this.uiCallbacks.set(event, new Set());
        }
        this.uiCallbacks.get(event).add(callback);
    }

    /**
     * Unregister UI callback
     * @param {string} event - Event name
     * @param {Function} callback - Callback function to remove
     */
    offUIEvent(event, callback) {
        const callbacks = this.uiCallbacks.get(event);
        if (callbacks) {
            callbacks.delete(callback);
            if (callbacks.size === 0) {
                this.uiCallbacks.delete(event);
            }
        }
    }

    /**
     * Clear all UI event callbacks (for cleanup)
     */
    clearUIEventCallbacks() {
        this.uiCallbacks.clear();
    }

    /**
     * Emit UI event (public method for pages to trigger events)
     */
    emitUIEvent(event, data) {
        this._notifyUI(event, data);
    }

    /**
     * Notify UI about core events
     */
    _notifyUI(event, data) {
        const callbacks = this.uiCallbacks.get(event);
        if (callbacks) {
            callbacks.forEach(callback => {
                try {
                    callback(data);
                } catch (error) {
                    console.error(`Error in UI callback for ${event}:`, error);
                }
            });
        }
    }

    // ==================== Timer Scheduler API ====================

    subscribeTick(callback) {
        return this.core.getScheduler().subscribe(callback);
    }

    unsubscribeTick(token) {
        return this.core.getScheduler().unsubscribe(token);
    }

    // ==================== Projects API ====================

    async getAllProjects() {
        return await this.core.services.projects.getAll();
    }

    async getProject(id) {
        return await this.core.services.projects.getById(id);
    }

    async createProject(input) {
        // Support both old (name, color, icon, clientId) and new (object) format
        const projectData = typeof input === 'string' ? {
            name: input,
            color: arguments[1],
            icon: arguments[2],
            client_id: arguments[3],
        } : input;

        const projectId = await this.core.services.projects.create(projectData);

        // Return full project object
        return await this.core.services.projects.getById(projectId);
    }

    async updateProject(id, data) {
        return await this.core.services.projects.update(id, data);
    }

    async deleteProject(id) {
        return await this.core.services.projects.delete(id);
    }

    async deleteMultipleProjects(ids) {
        return await this.core.services.projects.deleteMultiple(ids);
    }

    async searchProjects(query) {
        return await this.core.services.projects.search(query);
    }

    // ==================== Clients API ====================

    async getAllClients() {
        return await this.core.services.clients.getAll();
    }

    async getClient(id) {
        return await this.core.services.clients.getById(id);
    }

    async createClient(name, rate, currency) {
        const clientId = await this.core.services.clients.create({
            name,
            rate,
            currency,
        });

        // Return full client object
        return await this.core.services.clients.getById(clientId);
    }

    async updateClient(id, data) {
        return await this.core.services.clients.update(id, data);
    }

    async deleteClient(id) {
        return await this.core.services.clients.delete(id);
    }

    async deleteMultipleClients(ids) {
        return await this.core.services.clients.deleteMultiple(ids);
    }

    async searchClients(query) {
        return await this.core.services.clients.search(query);
    }

    // ==================== Tasks API ====================

    async getAllTasks() {
        return await this.core.services.tasks.getAll();
    }

    async getTask(id) {
        return await this.core.services.tasks.getById(id);
    }

    async getTasksByProject(projectId) {
        return await this.core.services.tasks.getByProject(projectId);
    }

    async createTask(name, projectId) {
        return await this.core.services.tasks.create({
            name,
            project_id: projectId,
        });
    }

    async updateTask(id, data) {
        return await this.core.services.tasks.update(id, data);
    }

    async deleteTask(id) {
        return await this.core.services.tasks.delete(id);
    }

    async addTimeToTask(id, seconds) {
        return await this.core.services.tasks.addTime(id, seconds);
    }

    async searchTasks(query) {
        return await this.core.services.tasks.search(query);
    }

    async getTotalTime() {
        return await this.core.services.tasks.getTotalTime();
    }

    async getTasksCount() {
        return await this.core.services.tasks.getCount();
    }

    // ==================== Task Instances API ====================

    async getAllTaskInstances(options) {
        return await this.core.services.taskInstances.getAllViews(options);
    }

    async getTaskInstance(id) {
        return await this.core.services.taskInstances.getView(id);
    }

    async createTaskInstance(data) {
        return await this.core.services.taskInstances.create(data);
    }

    async restoreTaskInstance(data) {
        return await this.core.services.taskInstances.restore(data);
    }

    async deleteTaskInstance(id) {
        return await this.core.services.taskInstances.delete(id);
    }

    async deleteMultipleTaskInstances(ids) {
        for (const id of ids) {
            await this.core.services.taskInstances.delete(id);
        }
    }

    async findOrCreateTask(name) {
        return await this.core.services.tasks.findOrCreate(name);
    }

    async createAutoIndexedTask(projectId = null, clientId = null) {
        return await this.core.services.tasks.createAutoIndexed(projectId, clientId);
    }

    async getNextTaskAutoIndex(projectId = null, clientId = null) {
        return await this.core.services.tasks.getNextAutoIndex(projectId, clientId);
    }

    async cleanupOrphanedTasks() {
        return await this.core.services.tasks.cleanupOrphanedTasks();
    }

    // ==================== Time Tracking API ====================

    /**
     * Start tracking a task
     * @param {number} taskId - Task ID
     * @param {number|null} projectId - Project ID (optional)
     * @param {number|null} clientId - Client ID (optional)
     * @param {boolean} pomodoroMode - Enable Pomodoro countdown mode (optional)
     * @param {number} pomodoroDuration - Pomodoro duration in seconds (optional)
     */
    async startTracking(taskId, projectId = null, clientId = null, pomodoroMode = false, pomodoroDuration = 0) {
        return await this.core.services.tracking.start(taskId, projectId, clientId, pomodoroMode, pomodoroDuration);
    }

    async stopTracking() {
        return await this.core.services.tracking.stop();
    }

    async pauseTracking() {
        return await this.core.services.tracking.pause();
    }

    async resumeTracking() {
        return await this.core.services.tracking.resume();
    }

    async updateCurrentTaskName(newName) {
        return await this.core.services.tracking.updateCurrentTaskName(newName);
    }

    async updateCurrentProjectClient(projectId = null, clientId = null) {
        return await this.core.services.tracking.updateCurrentProjectClient(projectId, clientId);
    }

    getCurrentTracking() {
        return this.core.services.tracking.getCurrentTracking();
    }

    async getAllTimeEntries() {
        return await this.core.services.tracking.getAllTimeEntries();
    }

    async getTimeEntriesByInstance(instanceId) {
        return await this.core.services.tracking.getTimeEntriesByInstance(instanceId);
    }

    async deleteTimeEntry(entryId) {
        return await this.core.services.tracking.deleteTimeEntry(entryId);
    }

    async updateTimeEntry(entryId, data) {
        return await this.core.services.tracking.updateTimeEntry(entryId, data);
    }

    async updateTaskInstance(instanceId, data) {
        return await this.core.services.taskInstances.update(instanceId, data);
    }

    /**
     * Update TaskInstance with automatic tracking synchronization (if tracked)
     * Logic is handled in Core - checks if instance is tracked and applies changes globally
     * 
     * @param {number} instanceId - TaskInstance ID
     * @param {object} data - Update data (task_id, project_id, client_id, last_used_at, is_favorite, total_time)
     * @param {string} newTaskName - Optional: new task name if task_id changed
     * @returns {Promise<object>} Updated TaskInstance
     */
    async updateTaskInstanceWithTrackingSync(instanceId, data, newTaskName = null) {
        return await this.core.services.taskInstances.updateWithTrackingSync(instanceId, data, newTaskName);
    }

    async updateTaskInstanceTotalTime(instanceId) {
        return await this.core.services.taskInstances.updateTotalTime(instanceId);
    }

    // ==================== State API ====================

    getState() {
        return this.core.state.getState();
    }

    getTrackingState() {
        return this.core.state.getTrackingState();
    }

    getLastUsedProjectId() {
        return this.core.services.tracking.getLastUsedProjectId();
    }

    getLastUsedClientId() {
        return this.core.services.tracking.getLastUsedClientId();
    }

    getUIState() {
        return this.core.state.getUIState();
    }

    updateUIState(state) {
        this.core.state.updateUIState(state);
    }

    isTracking() {
        return this.core.state.isTracking();
    }

    getCurrentTaskId() {
        return this.core.state.getCurrentTaskId();
    }

    async getCurrentTaskOldTime() {
        return await this.core.services.tracking.getCurrentTaskOldTime();
    }

    // ========================================
    // Statistics Methods
    // ========================================

    /**
     * Get This Week statistics (Monday to Sunday)
     */
    async getThisWeekStats() {
        return await this.core.services.stats.getThisWeekStats();
    }

    /**
     * Get statistics for a specific date range based on time entries
     * @param {Object} dateRange - { startDate: GLib.DateTime, endDate: GLib.DateTime }
     * @param {Array} taskInstanceIds - Optional array of task instance IDs to filter
     */
    async getStatsForPeriod(dateRange, taskInstanceIds = null) {
        return await this.core.services.stats.getStatsForPeriod(dateRange, taskInstanceIds);
    }

    /**
     * Get task instance IDs that have time entries with end_time in the specified period
     * @param {Object} dateRange - { startDate: GLib.DateTime, endDate: GLib.DateTime }
     */
    async getTaskInstanceIdsForPeriod(dateRange) {
        return await this.core.services.stats.getTaskInstanceIdsForPeriod(dateRange);
    }

    /**
     * Get top projects with time tracking
     */
    async getProjectsWithTime(limit = 5) {
        return await this.core.services.stats.getProjectsWithTime(limit);
    }

    /**
     * Get Today statistics
     */
    async getTodayStats() {
        return await this.core.services.stats.getTodayStats();
    }

    /**
     * Get This Month statistics
     */
    async getThisMonthStats() {
        return await this.core.services.stats.getThisMonthStats();
    }

    /**
     * Get all projects with calculated total_time
     */
    async getAllProjectsWithTime() {
        return await this.core.services.stats.getAllProjectsWithTime();
    }
}
