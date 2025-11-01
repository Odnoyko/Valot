export const CoreEvents = {
    // Core lifecycle
    CORE_INITIALIZED: 'core:initialized',
    DATABASE_CONNECTED: 'database:connected',
    // Tracking events
    TRACKING_STARTED: 'tracking:started',
    TRACKING_STOPPED: 'tracking:stopped',
    TRACKING_PAUSED: 'tracking:paused',
    TRACKING_RESUMED: 'tracking:resumed',
    TRACKING_UPDATED: 'tracking:updated',
    TRACKING_RECOVERED: 'tracking:recovered',
    // Project events
    PROJECT_CREATED: 'project:created',
    PROJECT_UPDATED: 'project:updated',
    PROJECT_DELETED: 'project:deleted',
    PROJECTS_DELETED: 'projects:deleted',
    // Client events
    CLIENT_CREATED: 'client:created',
    CLIENT_UPDATED: 'client:updated',
    CLIENT_DELETED: 'client:deleted',
    CLIENTS_DELETED: 'clients:deleted',
    // Task events
    TASK_CREATED: 'task:created',
    TASK_UPDATED: 'task:updated',
    TASK_DELETED: 'task:deleted',
    // Time entry events
    TIME_ENTRY_CREATED: 'time-entry:created',
    TIME_ENTRY_UPDATED: 'time-entry:updated',
    TIME_ENTRY_DELETED: 'time-entry:deleted',
    // UI events (для расширений)
    UI_PAGE_CHANGED: 'ui:page-changed',
    UI_REGISTER_PAGE: 'ui:register-page',
    UI_REGISTER_WIDGET: 'ui:register-widget',
};
