/**
 * Project Service - Simplified
 * Direct SQL, minimal object creation
 */
import { BaseService } from './BaseService.js';
import { CoreEvents } from '../events/CoreEvents.js';

export class ProjectService extends BaseService {
    constructor(core) {
        super(core);
    }

    /**
     * Get all projects (direct SQL)
     */
    async getAll() {
        return await this.query(`SELECT * FROM Project ORDER BY name ASC`);
    }

    /**
     * Get project by ID (direct SQL)
     */
    async getById(id) {
        const rows = await this.query(`SELECT * FROM Project WHERE id = ?`, [id]);
        return rows.length > 0 ? rows[0] : null;
    }

    /**
     * Get project by name (direct SQL)
     */
    async getByName(name) {
        const rows = await this.query(`SELECT * FROM Project WHERE name = ?`, [name]);
        return rows.length > 0 ? rows[0] : null;
    }

    /**
     * Create project (direct SQL)
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

        const projectId = await this.execute(
            `INSERT INTO Project (name, color, icon, client_id, total_time, dark_icons, icon_color, icon_color_mode)
             VALUES (?, ?, ?, ?, 0, ?, ?, ?)`,
            [
                finalName,
                input.color || '#cccccc',
                input.icon !== undefined ? input.icon : null,
                input.client_id || null,
                input.dark_icons !== undefined ? (input.dark_icons ? 1 : 0) : 0,
                input.icon_color || '#cccccc',
                input.icon_color_mode || 'auto',
            ]
        );

        this.events.emit(CoreEvents.PROJECT_CREATED, { id: projectId, name: finalName, ...input });
        return projectId;
    }

    /**
     * Update project (direct SQL)
     */
    async update(id, input) {
        const project = await this.getById(id);
        if (!project) {
            throw new Error('Project not found');
        }

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

        if (updates.length === 0) return;

        params.push(id);
        await this.execute(`UPDATE Project SET ${updates.join(', ')} WHERE id = ?`, params);

        this.events.emit(CoreEvents.PROJECT_UPDATED, { id, ...input });
    }

    /**
     * Delete project (direct SQL)
     */
    async delete(id) {
        if (id === 1) {
            throw new Error('Cannot delete default project');
        }

        await this.execute(`UPDATE TaskInstance SET project_id = 1 WHERE project_id = ?`, [id]);
        await this.execute(`DELETE FROM Project WHERE id = ?`, [id]);

        this.events.emit(CoreEvents.PROJECT_DELETED, { id });
    }

    /**
     * Delete multiple projects (direct SQL)
     */
    async deleteMultiple(ids) {
        if (!ids || ids.length === 0) return;

        const idsToDelete = ids.filter(id => id !== 1);
        if (idsToDelete.length === 0) return;

        const placeholders = idsToDelete.map(() => '?').join(', ');
        await this.execute(`UPDATE TaskInstance SET project_id = 1 WHERE project_id IN (${placeholders})`, idsToDelete);
        await this.execute(`DELETE FROM Project WHERE id IN (${placeholders})`, idsToDelete);

        this.events.emit(CoreEvents.PROJECTS_DELETED, { ids: idsToDelete });
    }

    /**
     * Update total time (direct SQL)
     */
    async updateTotalTime(id, totalTime) {
        await this.execute(`UPDATE Project SET total_time = ? WHERE id = ?`, [totalTime, id]);
    }

    /**
     * Get projects by client (direct SQL)
     */
    async getByClient(clientId) {
        return await this.query(`SELECT * FROM Project WHERE client_id = ? ORDER BY name ASC`, [clientId]);
    }

    /**
     * Search projects (direct SQL)
     */
    async search(query) {
        return await this.query(`SELECT * FROM Project WHERE name LIKE ? ORDER BY name ASC`, [`%${query}%`]);
    }
}
