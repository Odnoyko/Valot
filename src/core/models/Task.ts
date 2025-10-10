/**
 * Task - template/name only
 * Multiple TaskInstances can reference the same Task
 */
export interface Task {
    id: number;
    name: string;
    created_at: string;
    updated_at: string;
}

export interface TaskCreateInput {
    name: string;
}

export interface TaskUpdateInput {
    name?: string;
}
