/**
 * Valot Core - TypeScript Business Logic Layer
 *
 * This module contains platform-independent business logic
 * that can be used by any UI implementation (GTK, React, etc.)
 */

// API
export { CoreAPI, CoreServices } from './api/CoreAPI';

// Models
export { Task, TaskCreateInput, TaskUpdateInput } from './models/Task';
export { TaskInstance, TaskInstanceCreateInput, TaskInstanceUpdateInput, TaskInstanceView } from './models/TaskInstance';
export { Project, ProjectCreateInput, ProjectUpdateInput } from './models/Project';
export { Client, ClientCreateInput, ClientUpdateInput } from './models/Client';
export { TimeEntry, TimeEntryCreateInput, TimeEntryUpdateInput } from './models/TimeEntry';

// Services
export { BaseService } from './services/BaseService';
export { ProjectService } from './services/ProjectService';
export { ClientService } from './services/ClientService';
export { TaskService } from './services/TaskService';
export { TaskInstanceService } from './services/TaskInstanceService';
export { TimeTrackingService } from './services/TimeTrackingService';
export { ReportService } from './services/ReportService';
export type { ReportOptions, ReportData, ReportSummary, ReportGroup, ReportFormat, ReportGroupBy, ReportSortBy, ChartDataPoint } from './services/ReportService';

// Database
export { DatabaseAdapter, QueryResult } from './database/DatabaseAdapter';
export { GdaAdapter } from './database/GdaAdapter';

// State
export { StateManager, AppState, TrackingState, UIState } from './state/StateManager';

// Events
export { EventBus } from './events/EventBus';
export { CoreEvents, CoreEventType } from './events/CoreEvents';

// Utils
export { TimeUtils } from './utils/TimeUtils';
export { ColorUtils } from './utils/ColorUtils';
export type { RGB, RGBA, HSL } from './utils/ColorUtils';
export { DateFilters } from './utils/DateFilters';
export type { DateRange, DateFilterPreset } from './utils/DateFilters';
export { ValidationUtils } from './utils/ValidationUtils';
export type { ValidationResult, ValidationRules } from './utils/ValidationUtils';
