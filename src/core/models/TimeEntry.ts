export interface TimeEntry {
    id: number;
    task_instance_id: number;
    start_time: string;
    end_time: string | null;
    duration: number;
    created_at: string;
}

export interface TimeEntryCreateInput {
    task_instance_id: number;
    start_time: string;
}

export interface TimeEntryUpdateInput {
    end_time?: string;
    duration?: number;
}
