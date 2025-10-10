export interface Client {
    id: number;
    name: string;
    rate: number;
    currency: string;
    created_at: string;
    updated_at: string;
}

export interface ClientCreateInput {
    name: string;
    rate?: number;
    currency?: string;
}

export interface ClientUpdateInput {
    name?: string;
    rate?: number;
    currency?: string;
}
