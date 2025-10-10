import { BaseService } from './BaseService';
import { CoreAPI } from '../api/CoreAPI';
import { Client, ClientCreateInput, ClientUpdateInput } from '../models/Client';
import { CoreEvents } from '../events/CoreEvents';

export class ClientService extends BaseService {
    constructor(core: CoreAPI) {
        super(core);
    }

    /**
     * Get all clients
     */
    async getAll(): Promise<Client[]> {
        const sql = `SELECT * FROM Client ORDER BY name ASC`;
        return await this.query<Client>(sql);
    }

    /**
     * Get client by ID
     */
    async getById(id: number): Promise<Client | null> {
        const sql = `SELECT * FROM Client WHERE id = ?`;
        const results = await this.query<Client>(sql, [id]);
        return results.length > 0 ? results[0] : null;
    }

    /**
     * Get client by name
     */
    async getByName(name: string): Promise<Client | null> {
        const sql = `SELECT * FROM Client WHERE name = ?`;
        const results = await this.query<Client>(sql, [name]);
        return results.length > 0 ? results[0] : null;
    }

    /**
     * Create a new client
     */
    async create(input: ClientCreateInput): Promise<number> {
        // Check for duplicate name
        const existing = await this.getByName(input.name);
        if (existing) {
            throw new Error('Client with this name already exists');
        }

        const sql = `
            INSERT INTO Client (name, rate, currency)
            VALUES (?, ?, ?)
        `;

        const clientId = await this.execute(sql, [
            input.name,
            input.rate || 0,
            input.currency || 'USD',
        ]);

        this.events.emit(CoreEvents.CLIENT_CREATED, { id: clientId, ...input });

        return clientId;
    }

    /**
     * Update a client
     */
    async update(id: number, input: ClientUpdateInput): Promise<void> {
        // Check if client exists
        const client = await this.getById(id);
        if (!client) {
            throw new Error('Client not found');
        }

        // Check for duplicate name if name is being changed
        if (input.name && input.name !== client.name) {
            const existing = await this.getByName(input.name);
            if (existing) {
                throw new Error('Client with this name already exists');
            }
        }

        const updates: string[] = [];
        const params: any[] = [];

        if (input.name !== undefined) {
            updates.push('name = ?');
            params.push(input.name);
        }
        if (input.rate !== undefined) {
            updates.push('rate = ?');
            params.push(input.rate);
        }
        if (input.currency !== undefined) {
            updates.push('currency = ?');
            params.push(input.currency);
        }

        if (updates.length === 0) return;

        params.push(id);
        const sql = `UPDATE Client SET ${updates.join(', ')} WHERE id = ?`;

        await this.execute(sql, params);

        this.events.emit(CoreEvents.CLIENT_UPDATED, { id, ...input });
    }

    /**
     * Delete a client
     */
    async delete(id: number): Promise<void> {
        const sql = `DELETE FROM Client WHERE id = ?`;
        await this.execute(sql, [id]);

        this.events.emit(CoreEvents.CLIENT_DELETED, { id });
    }

    /**
     * Search clients by name
     */
    async search(query: string): Promise<Client[]> {
        const sql = `SELECT * FROM Client WHERE name LIKE ? ORDER BY name ASC`;
        return await this.query<Client>(sql, [`%${query}%`]);
    }
}
