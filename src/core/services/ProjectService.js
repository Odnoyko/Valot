import { BaseService } from './BaseService.js';
import { CoreEvents } from '../events/CoreEvents.js';
import { Logger } from '../utils/Logger.js';
/**
 * Project Service
 * Uses cache-first approach: reads from cache, writes to cache + DB
 */
export class ProjectService extends BaseService {
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
     * Get all projects (from cache)
     */
    async getAll() {
        if (this.cache) {
            const projects = this.cache.getAllProjects();
            if (projects.length > 0) {
                return projects.sort((a, b) => a.name.localeCompare(b.name));
            }
        }
        
        // Fallback to DB
        const sql = `SELECT * FROM Project ORDER BY name ASC`;
        const results = await this.query(sql);
        
        // Populate cache
        if (this.cache && results.length > 0) {
            results.forEach(project => {
                this.cache.setProject(project);
            });
        }
        
        return results;
    }
    
    /**
     * Get project by ID (from cache, fallback to DB)
     */
    async getById(id) {
        if (this.cache) {
            const project = this.cache.getProject(id);
            if (project) {
                return project;
            }
        }
        
        // Cache miss - fetch from DB
        const sql = `SELECT * FROM Project WHERE id = ?`;
        const results = await this.query(sql, [id]);
        if (results.length > 0) {
            const project = results[0];
            // Update cache
            if (this.cache) {
                this.cache.setProject(project);
            }
            return project;
        }
        
        return null;
    }
    
    /**
     * Get project by name (from cache)
     */
    async getByName(name) {
        // Search in cache
        if (this.cache) {
            const allProjects = this.cache.getAllProjects();
            const found = allProjects.find(p => p.name === name);
            if (found) {
                return found;
            }
        }
        
        // Fallback to DB
        const sql = `SELECT * FROM Project WHERE name = ?`;
        const results = await this.query(sql, [name]);
        if (results.length > 0) {
            const project = results[0];
            // Update cache
            if (this.cache) {
                this.cache.setProject(project);
            }
            return project;
        }
        
        return null;
    }
    /**
     * Create a new project
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
            INSERT INTO Project (name, color, icon, client_id, total_time, dark_icons, icon_color, icon_color_mode)
            VALUES (?, ?, ?, ?, 0, ?, ?, ?)
        `;
        const projectId = await this.execute(sql, [
            finalName,
            input.color || '#cccccc',
            input.icon !== undefined ? input.icon : null,
            input.client_id || null,
            input.dark_icons !== undefined ? (input.dark_icons ? 1 : 0) : 0,
            input.icon_color || '#cccccc',
            input.icon_color_mode || 'auto',
        ]);
        
        // Get created project from DB
        const createdProject = await this.query(`SELECT * FROM Project WHERE id = ?`, [projectId]);
        const project = createdProject[0];
        
        // Update cache
        if (this.cache) {
            this.cache.setProject(project);
        }
        
        this.events.emit(CoreEvents.PROJECT_CREATED, { id: projectId, name: finalName, ...input });
        return projectId;
    }
    /**
     * Update a project
     * Updates cache immediately, then writes to DB (write-back)
     */
    async update(id, input) {
        // Get existing project
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
        
        // Build updates
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
        
        // Update in cache first
        if (this.cache) {
            const updatedProject = { ...project, ...input };
            // Convert dark_icons boolean to number if needed
            if (input.dark_icons !== undefined) {
                updatedProject.dark_icons = input.dark_icons ? 1 : 0;
            }
            this.cache.setProject(updatedProject);
        }
        
        // Write to DB
        params.push(id);
        const sql = `UPDATE Project SET ${updates.join(', ')} WHERE id = ?`;
        await this.execute(sql, params);
        
        this.events.emit(CoreEvents.PROJECT_UPDATED, { id, ...input });
    }
    /**
     * Delete a project
     * Removes from cache and DB
     */
    async delete(id) {
        // Prevent deletion of default project
        if (id === 1) {
            throw new Error('Cannot delete default project');
        }

        // Reassign all TaskInstances using this project to default project (id=1)
        const reassignSql = `UPDATE TaskInstance SET project_id = 1 WHERE project_id = ?`;
        await this.execute(reassignSql, [id]);

        // Remove from cache
        if (this.cache) {
            this.cache.deleteProject(id);
        }

        // Delete from DB
        const sql = `DELETE FROM Project WHERE id = ?`;
        await this.execute(sql, [id]);
        
        this.events.emit(CoreEvents.PROJECT_DELETED, { id });
    }

    /**
     * Delete multiple projects
     * Removes from cache and DB
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

        // Reassign all TaskInstances using these projects to default project (id=1)
        const placeholders = idsToDelete.map(() => '?').join(', ');
        const reassignSql = `UPDATE TaskInstance SET project_id = 1 WHERE project_id IN (${placeholders})`;
        await this.execute(reassignSql, idsToDelete);

        // Remove from cache
        if (this.cache) {
            idsToDelete.forEach(id => {
                this.cache.deleteProject(id);
            });
        }

        // Delete from DB
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
     * Get projects by client (from cache)
     */
    async getByClient(clientId) {
        if (this.cache) {
            const allProjects = this.cache.getAllProjects();
            const filtered = allProjects.filter(p => p.client_id === clientId);
            return filtered.sort((a, b) => a.name.localeCompare(b.name));
        }
        
        // Fallback to DB
        const sql = `SELECT * FROM Project WHERE client_id = ? ORDER BY name ASC`;
        return await this.query(sql, [clientId]);
    }
    
    /**
     * Search projects by name (from cache)
     */
    async search(query) {
        if (this.cache) {
            const allProjects = this.cache.getAllProjects();
            const lowerQuery = query.toLowerCase();
            const filtered = allProjects.filter(p => 
                p.name.toLowerCase().includes(lowerQuery)
            );
            return filtered.sort((a, b) => a.name.localeCompare(b.name));
        }
        
        // Fallback to DB
        const sql = `SELECT * FROM Project WHERE name LIKE ? ORDER BY name ASC`;
        return await this.query(sql, [`%${query}%`]);
    }
}
