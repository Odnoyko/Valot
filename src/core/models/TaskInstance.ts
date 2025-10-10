/**
 * TaskInstance - unique combination of Task + Project + Client
 * Represents a specific work context
 */
export interface TaskInstance {
    id: number;
    task_id: number;
    project_id: number | null;
    client_id: number | null;
    total_time: number;
    last_used_at: string;
    is_favorite: boolean;
    created_at: string;
    updated_at: string;
}

export interface TaskInstanceCreateInput {
    task_id: number;
    project_id?: number | null;
    client_id?: number | null;
}

export interface TaskInstanceUpdateInput {
    task_id?: number;
    project_id?: number | null;
    client_id?: number | null;
    total_time?: number;
    last_used_at?: string;
    is_favorite?: boolean;
}

/**
 * Extended view with related data for UI
 */
export interface TaskInstanceView extends TaskInstance {
    task_name: string;
    project_name: string | null;
    client_name: string | null;
    entry_count: number;
}
