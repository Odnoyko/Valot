import { BaseService } from './BaseService.js';
import { CoreEvents } from '../events/CoreEvents.js';
import { Logger } from '../utils/Logger.js';
/**
 * Client Service
 * Uses cache-first approach: reads from cache, writes to cache + DB
 */
export class ClientService extends BaseService {
    constructor(core) {
        super(core);
    }
    
    /**
     * Get cache service
     */
    get cache() {
        return this.core.services?.cache;
    }
    
    /**
     * Get all clients (from cache)
     */
    async getAll() {
        if (this.cache) {
            const clients = this.cache.getAllClients();
            if (clients.length > 0) {
                return clients.sort((a, b) => a.name.localeCompare(b.name));
            }
        }
        
        // Fallback to DB
        const sql = `SELECT * FROM Client ORDER BY name ASC`;
        const results = await this.query(sql);
        
        // Populate cache
        if (this.cache && results.length > 0) {
            results.forEach(client => {
                this.cache.setClient(client);
            });
        }
        
        return results;
    }
    
    /**
     * Get client by ID (from cache, fallback to DB)
     */
    async getById(id) {
        if (this.cache) {
            const client = this.cache.getClient(id);
            if (client) {
                return client;
            }
        }
        
        // Cache miss - fetch from DB
        const sql = `SELECT * FROM Client WHERE id = ?`;
        const results = await this.query(sql, [id]);
        if (results.length > 0) {
            const client = results[0];
            // Update cache
            if (this.cache) {
                this.cache.setClient(client);
            }
            return client;
        }
        
        return null;
    }
    
    /**
     * Get client by name (from cache)
     */
    async getByName(name) {
        // Search in cache
        if (this.cache) {
            const allClients = this.cache.getAllClients();
            const found = allClients.find(c => c.name === name);
            if (found) {
                return found;
            }
        }
        
        // Fallback to DB
        const sql = `SELECT * FROM Client WHERE name = ?`;
        const results = await this.query(sql, [name]);
        if (results.length > 0) {
            const client = results[0];
            // Update cache
            if (this.cache) {
                this.cache.setClient(client);
            }
            return client;
        }
        
        return null;
    }
    /**
     * Create a new client
     * Writes to cache immediately, then to DB (write-back)
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

        // Write to DB immediately for ID generation
        const sql = `
            INSERT INTO Client (name, rate, currency)
            VALUES (?, ?, ?)
        `;
        const clientId = await this.execute(sql, [
            finalName,
            input.rate || 0,
            input.currency || 'USD',
        ]);
        
        // Get created client from DB
        const createdClient = await this.query(`SELECT * FROM Client WHERE id = ?`, [clientId]);
        const client = createdClient[0];
        
        // Update cache
        if (this.cache) {
            this.cache.setClient(client);
        }
        
        this.events.emit(CoreEvents.CLIENT_CREATED, { id: clientId, name: finalName, ...input });
        return clientId;
    }
    /**
     * Update a client
     * Updates cache immediately, then writes to DB (write-back)
     */
    async update(id, input) {
        // Get existing client
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
        
        // Update in cache first
        if (this.cache) {
            const updatedClient = { ...client, ...input };
            this.cache.setClient(updatedClient);
        }
        
        // Write to DB
        params.push(id);
        const sql = `UPDATE Client SET ${updates.join(', ')} WHERE id = ?`;
        await this.execute(sql, params);
        
        this.events.emit(CoreEvents.CLIENT_UPDATED, { id, ...input });
    }
    /**
     * Delete a client
     * Removes from cache and DB
     */
    async delete(id) {
        // Prevent deletion of default client
        if (id === 1) {
            throw new Error('Cannot delete default client');
        }

        // Reassign all TaskInstances using this client to default client (id=1)
        const reassignSql = `UPDATE TaskInstance SET client_id = 1 WHERE client_id = ?`;
        await this.execute(reassignSql, [id]);

        // Remove from cache
        if (this.cache) {
            this.cache.deleteClient(id);
        }

        // Delete from DB
        const sql = `DELETE FROM Client WHERE id = ?`;
        await this.execute(sql, [id]);
        
        this.events.emit(CoreEvents.CLIENT_DELETED, { id });
    }

    /**
     * Delete multiple clients
     * Removes from cache and DB
     */
    async deleteMultiple(ids) {
        if (!ids || ids.length === 0) {
            return;
        }

        // Filter out default client (ID = 1)
        const idsToDelete = ids.filter(id => id !== 1);

        if (idsToDelete.length === 0) {
            return;
        }

        // Reassign all TaskInstances using these clients to default client (id=1)
        const placeholders = idsToDelete.map(() => '?').join(', ');
        const reassignSql = `UPDATE TaskInstance SET client_id = 1 WHERE client_id IN (${placeholders})`;
        await this.execute(reassignSql, idsToDelete);

        // Remove from cache
        if (this.cache) {
            idsToDelete.forEach(id => {
                this.cache.deleteClient(id);
            });
        }

        // Delete from DB
        const sql = `DELETE FROM Client WHERE id IN (${placeholders})`;
        await this.execute(sql, idsToDelete);

        this.events.emit(CoreEvents.CLIENTS_DELETED, { ids: idsToDelete });
    }
    
    /**
     * Search clients by name (from cache)
     */
    async search(query) {
        if (this.cache) {
            const allClients = this.cache.getAllClients();
            const lowerQuery = query.toLowerCase();
            const filtered = allClients.filter(c => 
                c.name.toLowerCase().includes(lowerQuery)
            );
            return filtered.sort((a, b) => a.name.localeCompare(b.name));
        }
        
        // Fallback to DB
        const sql = `SELECT * FROM Client WHERE name LIKE ? ORDER BY name ASC`;
        return await this.query(sql, [`%${query}%`]);
    }
}
