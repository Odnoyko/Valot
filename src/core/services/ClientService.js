/**
 * Client Service - Simplified
 * Direct SQL, minimal object creation
 */
import { BaseService } from './BaseService.js';
import { CoreEvents } from '../events/CoreEvents.js';

export class ClientService extends BaseService {
    constructor(core) {
        super(core);
    }

    /**
     * Get all clients (direct SQL)
     */
    async getAll() {
        return await this.query(`SELECT * FROM Client ORDER BY name ASC`);
    }

    /**
     * Get client by ID (direct SQL)
     */
    async getById(id) {
        const rows = await this.query(`SELECT * FROM Client WHERE id = ?`, [id]);
        return rows.length > 0 ? rows[0] : null;
    }

    /**
     * Get client by name (direct SQL)
     */
    async getByName(name) {
        const rows = await this.query(`SELECT * FROM Client WHERE name = ?`, [name]);
        return rows.length > 0 ? rows[0] : null;
    }

    /**
     * Create client (direct SQL)
     */
    async create(input) {
        // Ensure unique name
        let finalName = input.name;
        let suffix = 2;

        while (true) {
            const existing = await this.getByName(finalName);
            if (!existing) break;
            finalName = `${input.name} (${suffix})`;
            suffix++;
        }

        const clientId = await this.execute(
            `INSERT INTO Client (name, rate, currency) VALUES (?, ?, ?)`,
            [finalName, input.rate || 0, input.currency || 'USD']
        );

        this.events.emit(CoreEvents.CLIENT_CREATED, { id: clientId, name: finalName, ...input });
        return clientId;
    }

    /**
     * Update client (direct SQL)
     */
    async update(id, input) {
        const client = await this.getById(id);
        if (!client) {
            throw new Error('Client not found');
        }

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

        if (updates.length === 0) return;

        params.push(id);
        await this.execute(`UPDATE Client SET ${updates.join(', ')} WHERE id = ?`, params);

        this.events.emit(CoreEvents.CLIENT_UPDATED, { id, ...input });
    }

    /**
     * Delete client (direct SQL)
     */
    async delete(id) {
        if (id === 1) {
            throw new Error('Cannot delete default client');
        }

        await this.execute(`UPDATE TaskInstance SET client_id = 1 WHERE client_id = ?`, [id]);
        await this.execute(`DELETE FROM Client WHERE id = ?`, [id]);

        this.events.emit(CoreEvents.CLIENT_DELETED, { id });
    }

    /**
     * Delete multiple clients (direct SQL)
     */
    async deleteMultiple(ids) {
        if (!ids || ids.length === 0) return;

        const idsToDelete = ids.filter(id => id !== 1);
        if (idsToDelete.length === 0) return;

        const placeholders = idsToDelete.map(() => '?').join(', ');
        await this.execute(`UPDATE TaskInstance SET client_id = 1 WHERE client_id IN (${placeholders})`, idsToDelete);
        await this.execute(`DELETE FROM Client WHERE id IN (${placeholders})`, idsToDelete);

        this.events.emit(CoreEvents.CLIENTS_DELETED, { ids: idsToDelete });
    }

    /**
     * Search clients (direct SQL)
     */
    async search(query) {
        return await this.query(`SELECT * FROM Client WHERE name LIKE ? ORDER BY name ASC`, [`%${query}%`]);
    }
}
