/**
 * Common translatable strings used throughout the application
 * This file centralizes frequently used strings to ensure consistency
 * and reduce duplication in translation files.
 *
 * Note: The _() function is provided globally by pkg.initGettext() in main.js
 * We use getters to defer translation until runtime (after gettext is initialized)
 */

const Gettext = imports.gettext;
const Domain = Gettext.domain('valot');
const _ = Domain.gettext;
globalThis._ = _;


// Dialog button labels
export const BUTTON = {
    CANCEL: _('Cancel'),
    OK: _('OK'),
    SAVE: _('Save'),
    SAVE_CHANGES: _('Save Changes'),
    DELETE: _('Delete'),
    CREATE: _('Create'),
    CREATE_TASK: _('Create Task'),
    CREATE_PROJECT: _('Create Project'),
    CREATE_CLIENT: _('Create Client'),
    SELECT: _('Select'),
    CLOSE: _('Close'),
    OPEN_FOLDER: _('Open Folder'),
};

// Common dialog headings
export const HEADING = {
    INVALID_INPUT: _('Invalid Input'),
    DELETE_TASK: _('Delete Task'),
    DELETE_TASKS: _('Delete Tasks'),
    DELETE_PROJECT: _('Delete Project'),
    DELETE_CLIENT: _('Delete Client'),
    EDIT_PROJECT: _('Edit Project'),
    EDIT_CLIENT: _('Edit Client'),
    CREATE_PROJECT: _('Create New Project'),
    ADD_NEW_TASK: _('Add New Task'),
    ERROR: _('Error'),
    DATABASE_ERROR: _('Database Error'),
    VALIDATION_ERROR: _('Validation Error'),
    DUPLICATE_PROJECT: _('Duplicate Project'),
    DUPLICATE_CLIENT: _('Duplicate Client'),
    LOAD_ERROR: _('Load Error'),
    UPDATE_ERROR: _('Update Error'),
    DELETE_ERROR: _('Delete Error'),
    CREATION_ERROR: _('Creation Error'),
    INVALID_DATETIME: _('Invalid Date/Time'),
};

// Common messages
export const MESSAGE = {
    TASK_NAME_REQUIRED: _('Task name is required'),
    PROJECT_NAME_REQUIRED: _('Project name is required'),
    CLIENT_NAME_REQUIRED: _('Client name is required'),
    INVALID_INPUT_MSG: _('Please enter a task name and select a project'),
    END_TIME_AFTER_START: _('End time must be after start time'),
    PROJECT_EXISTS: _('A project with this name already exists'),
    CLIENT_EXISTS: _('A client with this name already exists'),
    DATABASE_FAILED: _('Failed to initialize database'),
    NO_TASKS_SELECTED: _('No tasks selected. Right-click a task to select it first.'),
};

// Form labels
export const LABEL = {
    TASK_NAME: _('Task Name:'),
    PROJECT_NAME: _('Project Name:'),
    CLIENT_NAME: _('Client Name'),
    PROJECT: _('Project:'),
    CLIENT: _('Client'),
    DESCRIPTION: _('Description (optional):'),
    START_TIME: _('Start Time:'),
    END_TIME: _('End Time:'),
    DURATION: _('Duration:'),
    PROJECT_ICON: _('Project Icon:'),
    PROJECT_COLOR: _('Project Color:'),
    ICON_MODE: _('Icon Mode:'),
    ICON_COLOR: _('Icon Color:'),
    HOURLY_RATE: _('Hourly Rate'),
};

// Placeholder text
export const PLACEHOLDER = {
    SEARCH_TASKS: _('Search tasks...'),
    SEARCH_PROJECTS: _('Search projects...'),
    SEARCH_CLIENTS: _('Search clients...'),
    TASK_NAME: _('Task name'),
    ENTER_TASK_NAME: _('Enter task name...'),
    PROJECT_NAME: _('Project name'),
    CLIENT_NAME: _('Client name'),
};

// Tooltip text
export const TOOLTIP = {
    EDIT_TASK: _('Edit task'),
    DELETE_TASK: _('Delete task'),
    START_TRACKING: _('Start tracking'),
    STOP_TRACKING: _('Stop tracking'),
    SELECT_PROJECT: _('Select Project'),
    SELECT_CLIENT: _('Select Client'),
    SELECT_START_DATETIME: _('Select start date and time'),
    SELECT_END_DATETIME: _('Select end date and time'),
    PREVIOUS_PAGE: _('Previous page'),
    NEXT_PAGE: _('Next page'),
    CHANGE_COLOR: _('Click to change color'),
    CHANGE_ICON: _('Click to change icon'),
    CHANGE_APPEARANCE: _('Change project appearance'),
};

// Empty state messages
export const EMPTY_STATE = {
    NO_TASKS: _('No tasks yet'),
    NO_TASKS_FOUND: _('No tasks found'),
    NO_PROJECTS: _('No projects found'),
    NO_CLIENTS: _('No clients found'),
    NO_PROJECT: _('No Project'),
    NO_DATA: _('No data available'),
    NO_ACTIVITY: _('No activity data'),
    CREATE_FIRST_TASK: _('Create your first task to get started'),
    CREATE_FIRST_PROJECT: _('Create your first project to get started'),
    CREATE_FIRST_CLIENT: _('Create your first client to get started'),
    TYPE_TASK_NAME: _('Type a task name and click track to create one'),
};

// Loading messages
export const LOADING = {
    LOADING_TASKS: _('Loading tasks...'),
    LOADING_PROJECTS: _('Loading projects...'),
    LOADING_CLIENTS: _('Loading clients...'),
    LOADING: _('Loading...'),
};

// Success messages
export const SUCCESS = {
    TASK_CREATED: _('Task created successfully'),
    TASK_UPDATED: _('Task updated successfully'),
    TASK_DELETED: _('Task deleted successfully'),
    PROJECT_CREATED: _('Project created successfully'),
    PROJECT_UPDATED: _('Project updated successfully'),
    PROJECT_DELETED: _('Project deleted successfully'),
    CLIENT_CREATED: _('Client created successfully'),
    CLIENT_UPDATED: _('Client updated successfully'),
    CLIENT_DELETED: _('Client deleted successfully'),
};

// Error messages
export const ERROR = {
    FAILED_LOAD_TASKS: _('Failed to load tasks'),
    FAILED_CREATE_TASK: _('Failed to create task'),
    FAILED_UPDATE_TASK: _('Failed to update task'),
    FAILED_DELETE_TASK: _('Failed to delete task'),
    FAILED_CREATE_PROJECT: _('Failed to create project'),
    FAILED_UPDATE_PROJECT: _('Failed to update project'),
    FAILED_DELETE_PROJECT: _('Failed to delete project'),
    FAILED_LOAD_PROJECTS: _('Failed to load projects'),
    FAILED_LOAD_CLIENTS: _('Failed to load clients'),
};

// Icon modes
export const ICON_MODE = {
    AUTO: _('Auto'),
    LIGHT: _('Light'),
    DARK: _('Dark'),
    DEFAULT: _('Default'),
    WHITE: _('White'),
    BLACK: _('Black'),
};

// Status messages
export const STATUS = {
    CURRENTLY_TRACKING: _('Currently Tracking'),
    INVALID_RANGE: _('Invalid range'),
    INVALID_FORMAT: _('Invalid format'),
};

// Pagination
export const PAGINATION = {
    PAGE_INFO: _('Page 1 of 1'),
};

// Dialog bodies
export const DIALOG_BODY = {
    CREATE_PROJECT: _('Create a new project with icon and color.'),
    UPDATE_PROJECT: _('Update project name, icon, and color.'),
    CREATE_TASK: _('Create a new task for tracking your work'),
    SELECT_START_DATETIME: _('Choose the start date and time for this task'),
    SELECT_END_DATETIME: _('Choose the end date and time for this task'),
    DELETE_TASK_CONFIRM: _('Are you sure you want to delete this task?'),
    DELETE_TASK_WARNING: _('This action cannot be undone.'),
};
