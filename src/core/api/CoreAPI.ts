import { EventBus } from '../events/EventBus';
import { CoreEvents } from '../events/CoreEvents';
import { StateManager } from '../state/StateManager';
import { DatabaseAdapter } from '../database/DatabaseAdapter';
import { ProjectService } from '../services/ProjectService';
import { ClientService } from '../services/ClientService';
import { TaskService } from '../services/TaskService';
import { TaskInstanceService } from '../services/TaskInstanceService';
import { TimeTrackingService } from '../services/TimeTrackingService';
import { ReportService } from '../services/ReportService';

/**
 * Core API Services
 */
export interface CoreServices {
    projects: ProjectService;
    clients: ClientService;
    tasks: TaskService;
    taskInstances: TaskInstanceService;
    tracking: TimeTrackingService;
    reports: ReportService;
}

/**
 * Core API
 * Main interface for interacting with the application core
 */
export class CoreAPI {
    public events: EventBus;
    public state: StateManager;
    public database: DatabaseAdapter | null;
    public services!: CoreServices;

    private initialized: boolean;

    constructor() {
        this.events = new EventBus();
        this.state = new StateManager(this.events);
        this.database = null;
        this.initialized = false;
    }

    /**
     * Initialize Core with database adapter
     */
    async initialize(databaseAdapter: DatabaseAdapter): Promise<void> {
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
        };

        this.events.emit(CoreEvents.DATABASE_CONNECTED);
        this.events.emit(CoreEvents.CORE_INITIALIZED);

        this.initialized = true;
    }

    /**
     * Check if core is initialized
     */
    isInitialized(): boolean {
        return this.initialized;
    }

    /**
     * Shutdown core
     */
    async shutdown(): Promise<void> {
        if (this.database) {
            await this.database.close();
        }
        this.events.clear();
        this.initialized = false;
    }
}
