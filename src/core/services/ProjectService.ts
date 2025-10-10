import { BaseService } from './BaseService';
import { CoreAPI } from '../api/CoreAPI';
import { Project, ProjectCreateInput, ProjectUpdateInput } from '../models/Project';
import { CoreEvents } from '../events/CoreEvents';

export class ProjectService extends BaseService {
    constructor(core: CoreAPI) {
        super(core);
    }

    /**
     * Get all projects
     */
    async getAll(): Promise<Project[]> {
        const sql = `SELECT * FROM Project ORDER BY name ASC`;
        return await this.query<Project>(sql);
    }

    /**
     * Get project by ID
     */
    async getById(id: number): Promise<Project | null> {
        const sql = `SELECT * FROM Project WHERE id = ?`;
        const results = await this.query<Project>(sql, [id]);
        return results.length > 0 ? results[0] : null;
    }

    /**
     * Get project by name
     */
    async getByName(name: string): Promise<Project | null> {
        const sql = `SELECT * FROM Project WHERE name = ?`;
        const results = await this.query<Project>(sql, [name]);
        return results.length > 0 ? results[0] : null;
    }

    /**
     * Create a new project
     */
    async create(input: ProjectCreateInput): Promise<number> {
        // Check for duplicate name
        const existing = await this.getByName(input.name);
        if (existing) {
            throw new Error('Project with this name already exists');
        }

        const sql = `
            INSERT INTO Project (name, color, icon, client_id, total_time, dark_icons, icon_color, icon_color_mode)
            VALUES (?, ?, ?, ?, 0, ?, ?, ?)
        `;

        const projectId = await this.execute(sql, [
            input.name,
            input.color || '#cccccc',
            input.icon || 'folder-symbolic',
            input.client_id || null,
            input.dark_icons !== undefined ? (input.dark_icons ? 1 : 0) : 0,
            input.icon_color || '#cccccc',
            input.icon_color_mode || 'auto',
        ]);

        this.events.emit(CoreEvents.PROJECT_CREATED, { id: projectId, ...input });

        return projectId;
    }

    /**
     * Update a project
     */
    async update(id: number, input: ProjectUpdateInput): Promise<void> {
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

        const updates: string[] = [];
        const params: any[] = [];

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
        const sql = `UPDATE Project SET ${updates.join(', ')} WHERE id = ?`;

        await this.execute(sql, params);

        this.events.emit(CoreEvents.PROJECT_UPDATED, { id, ...input });
    }

    /**
     * Delete a project
     */
    async delete(id: number): Promise<void> {
        const sql = `DELETE FROM Project WHERE id = ?`;
        await this.execute(sql, [id]);

        this.events.emit(CoreEvents.PROJECT_DELETED, { id });
    }

    /**
     * Update project total time
     */
    async updateTotalTime(id: number, totalTime: number): Promise<void> {
        const sql = `UPDATE Project SET total_time = ? WHERE id = ?`;
        await this.execute(sql, [totalTime, id]);
    }

    /**
     * Get projects by client
     */
    async getByClient(clientId: number): Promise<Project[]> {
        const sql = `SELECT * FROM Project WHERE client_id = ? ORDER BY name ASC`;
        return await this.query<Project>(sql, [clientId]);
    }

    /**
     * Search projects by name
     */
    async search(query: string): Promise<Project[]> {
        const sql = `SELECT * FROM Project WHERE name LIKE ? ORDER BY name ASC`;
        return await this.query<Project>(sql, [`%${query}%`]);
    }
}
