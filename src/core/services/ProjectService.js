import { BaseService } from './BaseService.js';
import { CoreEvents } from '../events/CoreEvents.js';
export class ProjectService extends BaseService {
    constructor(core) {
        super(core);
    }
    /**
     * Get all projects
     */
    async getAll() {
        const sql = `SELECT * FROM Project ORDER BY name ASC`;
        return await this.query(sql);
    }
    /**
     * Get project by ID
     */
    async getById(id) {
        const sql = `SELECT * FROM Project WHERE id = ?`;
        const results = await this.query(sql, [id]);
        return results.length > 0 ? results[0] : null;
    }
    /**
     * Get project by name
     */
    async getByName(name) {
        const sql = `SELECT * FROM Project WHERE name = ?`;
        const results = await this.query(sql, [name]);
        return results.length > 0 ? results[0] : null;
    }
    /**
     * Create a new project
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
            INSERT INTO Project (name, color, icon, client_id, total_time, dark_icons, icon_color, icon_color_mode)
            VALUES (?, ?, ?, ?, 0, ?, ?, ?)
        `;
        const projectId = await this.execute(sql, [
            finalName,
            input.color || '#cccccc',
            input.icon || 'folder-symbolic',
            input.client_id || null,
            input.dark_icons !== undefined ? (input.dark_icons ? 1 : 0) : 0,
            input.icon_color || '#cccccc',
            input.icon_color_mode || 'auto',
        ]);
        this.events.emit(CoreEvents.PROJECT_CREATED, { id: projectId, name: finalName, ...input });
        return projectId;
    }
    /**
     * Update a project
     */
    async update(id, input) {
        // Check if project exists
        const project = await this.getById(id);
        if (!project) {
            throw new Error('Project not found');
        }
        // Check for duplicate name if name is being changed
        if (input.name && input.name !== project.name) {
            const existing = await this.getByName(input.name);
            if (existing) {
                throw new Error('Project with this name already exists');
            }
        }
        const updates = [];
        const params = [];
        if (input.name !== undefined) {
            updates.push('name = ?');
            params.push(input.name);
        }
        if (input.color !== undefined) {
            updates.push('color = ?');
            params.push(input.color);
        }
        if (input.icon !== undefined) {
            updates.push('icon = ?');
            params.push(input.icon);
        }
        if (input.client_id !== undefined) {
            updates.push('client_id = ?');
            params.push(input.client_id);
        }
        if (input.dark_icons !== undefined) {
            updates.push('dark_icons = ?');
            params.push(input.dark_icons ? 1 : 0);
        }
        if (input.icon_color !== undefined) {
            updates.push('icon_color = ?');
            params.push(input.icon_color);
        }
        if (input.icon_color_mode !== undefined) {
            updates.push('icon_color_mode = ?');
            params.push(input.icon_color_mode);
        }
        if (updates.length === 0)
            return;
        params.push(id);
        const sql = `UPDATE Project SET ${updates.join(', ')} WHERE id = ?`;
        await this.execute(sql, params);
        this.events.emit(CoreEvents.PROJECT_UPDATED, { id, ...input });
    }
    /**
     * Delete a project
     */
    async delete(id) {
        // Prevent deletion of default project
        if (id === 1) {
            throw new Error('Cannot delete default project');
        }

        const sql = `DELETE FROM Project WHERE id = ?`;
        await this.execute(sql, [id]);
        this.events.emit(CoreEvents.PROJECT_DELETED, { id });
    }

    /**
     * Delete multiple projects
     */
    async deleteMultiple(ids) {
        if (!ids || ids.length === 0) {
            return;
        }

        // Filter out default project (ID = 1)
        const idsToDelete = ids.filter(id => id !== 1);

        if (idsToDelete.length === 0) {
            return;
        }

        const placeholders = idsToDelete.map(() => '?').join(', ');
        const sql = `DELETE FROM Project WHERE id IN (${placeholders})`;
        await this.execute(sql, idsToDelete);

        this.events.emit(CoreEvents.PROJECTS_DELETED, { ids: idsToDelete });
    }
    /**
     * Update project total time
     */
    async updateTotalTime(id, totalTime) {
        const sql = `UPDATE Project SET total_time = ? WHERE id = ?`;
        await this.execute(sql, [totalTime, id]);
    }
    /**
     * Get projects by client
     */
    async getByClient(clientId) {
        const sql = `SELECT * FROM Project WHERE client_id = ? ORDER BY name ASC`;
        return await this.query(sql, [clientId]);
    }
    /**
     * Search projects by name
     */
    async search(query) {
        const sql = `SELECT * FROM Project WHERE name LIKE ? ORDER BY name ASC`;
        return await this.query(sql, [`%${query}%`]);
    }
}
