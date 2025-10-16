import { BaseService } from './BaseService.js';
import { CoreEvents } from '../events/CoreEvents.js';
export class ClientService extends BaseService {
    constructor(core) {
        super(core);
    }
    /**
     * Get all clients
     */
    async getAll() {
        const sql = `SELECT * FROM Client ORDER BY name ASC`;
        return await this.query(sql);
    }
    /**
     * Get client by ID
     */
    async getById(id) {
        const sql = `SELECT * FROM Client WHERE id = ?`;
        const results = await this.query(sql, [id]);
        return results.length > 0 ? results[0] : null;
    }
    /**
     * Get client by name
     */
    async getByName(name) {
        const sql = `SELECT * FROM Client WHERE name = ?`;
        const results = await this.query(sql, [name]);
        return results.length > 0 ? results[0] : null;
    }
    /**
     * Create a new client
     */
    async create(input) {
        // Ensure unique name - add suffix if exists
        let finalName = input.name;
        let suffix = 2;

        while (true) {
            const existing = await this.getByName(finalName);
            if (!existing) {
                break; // Name is unique
            }
            finalName = `${input.name} (${suffix})`;
            suffix++;
        }

        const sql = `
            INSERT INTO Client (name, rate, currency)
            VALUES (?, ?, ?)
        `;
        const clientId = await this.execute(sql, [
            finalName,
            input.rate || 0,
            input.currency || 'USD',
        ]);
        this.events.emit(CoreEvents.CLIENT_CREATED, { id: clientId, name: finalName, ...input });
        return clientId;
    }
    /**
     * Update a client
     */
    async update(id, input) {
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
        const updates = [];
        const params = [];
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
        if (updates.length === 0)
            return;
        params.push(id);
        const sql = `UPDATE Client SET ${updates.join(', ')} WHERE id = ?`;
        await this.execute(sql, params);
        this.events.emit(CoreEvents.CLIENT_UPDATED, { id, ...input });
    }
    /**
     * Delete a client
     */
    async delete(id) {
        // Prevent deletion of default client
        if (id === 1) {
            throw new Error('Cannot delete default client');
        }

        const sql = `DELETE FROM Client WHERE id = ?`;
        await this.execute(sql, [id]);
        this.events.emit(CoreEvents.CLIENT_DELETED, { id });
    }

    /**
     * Delete multiple clients
     */
    async deleteMultiple(ids) {
        if (!ids || ids.length === 0) {
            return;
        }

        // Filter out default client (ID = 1)
        const idsToDelete = ids.filter(id => id !== 1);

        if (idsToDelete.length === 0) {
            console.log('⚠️ No clients to delete (default client cannot be deleted)');
            return;
        }

        const placeholders = idsToDelete.map(() => '?').join(', ');
        const sql = `DELETE FROM Client WHERE id IN (${placeholders})`;
        await this.execute(sql, idsToDelete);

        this.events.emit(CoreEvents.CLIENTS_DELETED, { ids: idsToDelete });
    }
    /**
     * Search clients by name
     */
    async search(query) {
        const sql = `SELECT * FROM Client WHERE name LIKE ? ORDER BY name ASC`;
        return await this.query(sql, [`%${query}%`]);
    }
}
