/**
 * Base Service class
 * Provides common functionality for all services
 */
export class BaseService {
    core;
    events;
    state;
    database;
    constructor(core) {
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
    async query(sql, params) {
        return await this.database.query(sql, params);
    }
    /**
     * Execute helper
     */
    async execute(sql, params) {
        return await this.database.execute(sql, params);
    }
}
