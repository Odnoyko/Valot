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
import { CacheService } from '../services/CacheService.js';
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
        
        // Initialize cache service FIRST (other services will use it)
        this.services = {
            cache: new CacheService(this),
        };
        
        // Initialize cache (loads all data from DB)
        await this.services.cache.initialize();
        
        // Initialize other services (they will use cache)
        this.services.projects = new ProjectService(this);
        this.services.clients = new ClientService(this);
        this.services.tasks = new TaskService(this);
        this.services.taskInstances = new TaskInstanceService(this);
        this.services.tracking = new TimeTrackingService(this);
        this.services.reports = new ReportService(this);
        this.services.stats = new StatsService(this);
        
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
        // Final cache sync and cleanup
        if (this.services?.cache) {
            this.services.cache.destroy();
        }
        
        if (this.database) {
            await this.database.close();
        }
        this.events.clear();
        this.initialized = false;
    }
}
