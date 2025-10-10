import { CoreAPI } from '../api/CoreAPI';
import { EventBus } from '../events/EventBus';
import { StateManager } from '../state/StateManager';
import { DatabaseAdapter } from '../database/DatabaseAdapter';

/**
 * Base Service class
 * Provides common functionality for all services
 */
export abstract class BaseService {
    protected core: CoreAPI;
    protected events: EventBus;
    protected state: StateManager;
    protected database: DatabaseAdapter;

    constructor(core: CoreAPI) {
        this.core = core;
        this.events = core.events;
        this.state = core.state;

        if (!core.database) {
            throw new Error('Database not initialized');
        }
        this.database = core.database;
    }

    /**
     * Query helper
     */
    protected async query<T = any>(sql: string, params?: any[]): Promise<T[]> {
        return await this.database.query<T>(sql, params);
    }

    /**
     * Execute helper
     */
    protected async execute(sql: string, params?: any[]): Promise<number> {
        return await this.database.execute(sql, params);
    }
}
