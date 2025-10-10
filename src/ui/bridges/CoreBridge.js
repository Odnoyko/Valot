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

    // ==================== Projects API ====================

    async getAllProjects() {
        return await this.core.services.projects.getAll();
    }

    async getProject(id) {
        return await this.core.services.projects.getById(id);
    }

    async createProject(name, color, icon, clientId) {
        return await this.core.services.projects.create({
            name,
            color,
            icon,
            client_id: clientId,
        });
    }

    async updateProject(id, data) {
        return await this.core.services.projects.update(id, data);
    }

    async deleteProject(id) {
        return await this.core.services.projects.delete(id);
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
        return await this.core.services.clients.create({
            name,
            rate,
            currency,
        });
    }

    async updateClient(id, data) {
        return await this.core.services.clients.update(id, data);
    }

    async deleteClient(id) {
        return await this.core.services.clients.delete(id);
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

    // ==================== Time Tracking API ====================

    async startTracking(taskId, taskName, projectId) {
        return await this.core.services.tracking.start(taskId, taskName, projectId);
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

    getCurrentTracking() {
        return this.core.services.tracking.getCurrentTracking();
    }

    async getAllTimeEntries() {
        return await this.core.services.tracking.getAllTimeEntries();
    }

    async getTimeEntriesByTask(taskId) {
        return await this.core.services.tracking.getTimeEntriesByTask(taskId);
    }

    // ==================== State API ====================

    getState() {
        return this.core.state.getState();
    }

    getTrackingState() {
        return this.core.state.getTrackingState();
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
}
