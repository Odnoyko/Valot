import { EventBus } from '../events/EventBus.js';
import { CoreEvents } from '../events/CoreEvents.js';
import { StateManager } from '../state/StateManager.js';
import { ProjectService } from '../services/ProjectService.js';
import { ClientService } from '../services/ClientService.js';
import { TaskService } from '../services/TaskService.js';
import { TaskInstanceService } from '../services/TaskInstanceService.js';
import { TimeTrackingService } from '../services/TimeTrackingService.js';
import { ReportService } from '../services/ReportService.js';
import { StatsService } from '../services/StatsService.js';
/**
 * Core API
 * Main interface for interacting with the application core
 */
export class CoreAPI {
    events;
    state;
    database;
    services;
    initialized;
    constructor() {
        this.events = new EventBus();
        this.state = new StateManager(this.events);
        this.database = null;
        this.initialized = false;
    }
    /**
     * Initialize Core with database adapter
     */
    async initialize(databaseAdapter) {
        if (this.initialized) {
            throw new Error('Core already initialized');
        }
        this.database = databaseAdapter;
        await this.database.initialize();
        // Initialize services
        this.services = {
            projects: new ProjectService(this),
            clients: new ClientService(this),
            tasks: new TaskService(this),
            taskInstances: new TaskInstanceService(this),
            tracking: new TimeTrackingService(this),
            reports: new ReportService(this),
            stats: new StatsService(this),
        };
        this.events.emit(CoreEvents.DATABASE_CONNECTED);
        this.events.emit(CoreEvents.CORE_INITIALIZED);
        this.initialized = true;
    }
    /**
     * Check if core is initialized
     */
    isInitialized() {
        return this.initialized;
    }
    /**
     * Shutdown core
     */
    async shutdown() {
        if (this.database) {
            await this.database.close();
        }
        this.events.clear();
        this.initialized = false;
    }
}
