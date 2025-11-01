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
import { TrackingPersistenceService } from '../services/TrackingPersistenceService.js';
import { TimerScheduler } from '../services/TimerScheduler.js';
import { CacheService } from '../services/CacheService.js';
// import { MemoryCleanupService } from '../services/MemoryCleanupService.js'; // Disabled: cleanup every 30s masks problems, need proper resource management instead
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
        // Note: TimerScheduler is created in initialize() as part of services
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
            timerScheduler: new TimerScheduler(1),
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
        
        // Initialize persistence service (handles crash recovery)
        this.services.persistence = new TrackingPersistenceService(this);
        await this.services.persistence.initialize();
        
        // Memory cleanup service disabled:
        // Frequent cleanup (every 30s) masks memory leaks instead of fixing them.
        // Proper resource management (destroy/unsubscribe) should prevent RAM growth.
        // this.services.memoryCleanup = new MemoryCleanupService(this);
        // this.services.timerScheduler.subscribe(() => {
        //     this.services.memoryCleanup.onTick();
        // });
        
        this.events.emit(CoreEvents.DATABASE_CONNECTED);
        this.events.emit(CoreEvents.CORE_INITIALIZED);
        this.initialized = true;
    }
    getScheduler() {
        return this.services?.timerScheduler;
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
        // Cleanup persistence service
        if (this.services?.persistence) {
            this.services.persistence.destroy();
        }
        
        // Stop timer scheduler
        if (this.services?.timerScheduler) {
            this.services.timerScheduler.stop();
        }
        
        // Memory cleanup service disabled
        // if (this.services?.memoryCleanup) {
        //     this.services.memoryCleanup.destroy();
        // }
        
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
