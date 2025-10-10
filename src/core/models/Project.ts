export interface Project {
    id: number;
    name: string;
    color: string;
    icon: string | null;
    client_id: number | null;
    total_time: number;
    dark_icons: boolean;
    icon_color: string;
    icon_color_mode: string;
    created_at: string;
    updated_at: string;
}

export interface ProjectCreateInput {
    name: string;
    color?: string;
    icon?: string;
    client_id?: number;
    dark_icons?: boolean;
    icon_color?: string;
    icon_color_mode?: string;
}

export interface ProjectUpdateInput {
    name?: string;
    color?: string;
    icon?: string;
    client_id?: number;
    dark_icons?: boolean;
    icon_color?: string;
    icon_color_mode?: string;
}
