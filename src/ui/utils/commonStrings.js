/**
 * Common strings used throughout the application
 * Using _ function for translations (initialized by pkg in Application)
 */

// Ensure _ function is available (fallback if gettext not initialized yet)
const translate = (str) => (typeof _ !== 'undefined' && _ !== null) ? _(str) : str;

// Dialog button labels
export const BUTTON = {
    CANCEL: translate('Cancel'),
    OK: translate('OK'),
    SAVE: translate('Save'),
    SAVE_CHANGES: translate('Save Changes'),
    DELETE: translate('Delete'),
    CREATE: translate('Create'),
    CREATE_TASK: translate('Create Task'),
    CREATE_PROJECT: translate('Create Project'),
    CREATE_CLIENT: translate('Create Client'),
    SELECT: translate('Select'),
    CLOSE: translate('Close'),
    OPEN_FOLDER: translate('Open Folder'),
};

// Common dialog headings
export const HEADING = {
    INVALID_INPUT: translate('Invalid Input'),
    DELETE_TASK: translate('Delete Task'),
    DELETE_TASKS: translate('Delete Tasks'),
    DELETE_PROJECT: translate('Delete Project'),
    DELETE_CLIENT: translate('Delete Client'),
    EDIT_PROJECT: translate('Edit Project'),
    EDIT_CLIENT: translate('Edit Client'),
    CREATE_PROJECT: translate('Create New Project'),
    ADD_NEW_TASK: translate('Add New Task'),
    ERROR: translate('Error'),
    DATABASE_ERROR: translate('Database Error'),
    VALIDATION_ERROR: translate('Validation Error'),
    DUPLICATE_PROJECT: translate('Duplicate Project'),
    DUPLICATE_CLIENT: translate('Duplicate Client'),
    LOAD_ERROR: translate('Load Error'),
    UPDATE_ERROR: translate('Update Error'),
    DELETE_ERROR: translate('Delete Error'),
};

// Common messages
export const MESSAGE = {
    CONFIRM_DELETE_TASK: translate('Are you sure you want to delete this task?'),
    CONFIRM_DELETE_TASKS: translate('Are you sure you want to delete {0} tasks?'),
    CONFIRM_DELETE_PROJECT: translate('Are you sure you want to delete this project?'),
    CONFIRM_DELETE_CLIENT: translate('Are you sure you want to delete this client?'),
    NO_RESULTS: translate('No results found'),
    DATABASE_ERROR: translate('Failed to connect to database'),
    LOAD_FAILED: translate('Failed to load data'),
    SAVE_FAILED: translate('Failed to save changes'),
    DELETE_FAILED: translate('Failed to delete'),
    INVALID_INPUT_MESSAGE: translate('Please check your input and try again'),
};

// Common labels
export const LABEL = {
    NAME: translate('Name'),
    CLIENT: translate('Client'),
    PROJECT: translate('Project'),
    TASK: translate('Task'),
    DESCRIPTION: translate('Description'),
    COLOR: translate('Color'),
    CURRENCY: translate('Currency'),
    HOURLY_RATE: translate('Hourly Rate'),
    EMAIL: translate('Email'),
    PHONE: translate('Phone'),
    WEBSITE: translate('Website'),
    NOTES: translate('Notes'),
    STATUS: translate('Status'),
    DURATION: translate('Duration'),
    TOTAL: translate('Total'),
    FILTER: translate('Filter'),
    SEARCH: translate('Search'),
    SORT_BY: translate('Sort by'),
};

// Placeholders
export const PLACEHOLDER = {
    ENTER_NAME: translate('Enter name...'),
    ENTER_DESCRIPTION: translate('Enter description...'),
    SEARCH: translate('Search...'),
    SEARCH_PROJECTS: translate('Search projects...'),
    SEARCH_CLIENTS: translate('Search clients...'),
    SELECT_CLIENT: translate('Select client...'),
    SELECT_PROJECT: translate('Select project...'),
    SELECT_COLOR: translate('Select color...'),
    SELECT_CURRENCY: translate('Select currency...'),
    OPTIONAL: translate('Optional'),
};

// Tooltips
export const TOOLTIP = {
    REFRESH: translate('Refresh'),
    SEARCH: translate('Search'),
    FILTER: translate('Filter'),
    DELETE: translate('Delete'),
    EDIT: translate('Edit'),
    ADD: translate('Add'),
    SETTINGS: translate('Settings'),
    CHANGE_APPEARANCE: translate('Change color and icon'),
};

// Empty state messages
export const EMPTY_STATE = {
    NO_TASKS: translate('No tasks yet'),
    NO_PROJECTS: translate('No projects yet'),
    NO_CLIENTS: translate('No clients yet'),
    NO_REPORTS: translate('No reports yet'),
    CREATE_FIRST_TASK: translate('Create your first task to get started'),
    CREATE_FIRST_PROJECT: translate('Create your first project to get started'),
    CREATE_FIRST_CLIENT: translate('Create your first client to get started'),
};

// Loading message
export const LOADING = translate('Loading...');

// Success messages
export const SUCCESS = {
    TASK_CREATED: translate('Task created successfully'),
    TASK_UPDATED: translate('Task updated successfully'),
    TASK_DELETED: translate('Task deleted successfully'),
    PROJECT_CREATED: translate('Project created successfully'),
    PROJECT_UPDATED: translate('Project updated successfully'),
    PROJECT_DELETED: translate('Project deleted successfully'),
    CLIENT_CREATED: translate('Client created successfully'),
    CLIENT_UPDATED: translate('Client updated successfully'),
    CLIENT_DELETED: translate('Client deleted successfully'),
};

// Error messages
export const ERROR = {
    UNKNOWN: translate('An unknown error occurred'),
    DATABASE: translate('Database error'),
    NETWORK: translate('Network error'),
    VALIDATION: translate('Validation error'),
    NOT_FOUND: translate('Not found'),
};

// Status labels
export const STATUS = {
    ACTIVE: translate('Active'),
    INACTIVE: translate('Inactive'),
    COMPLETED: translate('Completed'),
    PENDING: translate('Pending'),
    IN_PROGRESS: translate('In Progress'),
};

// Dialog body texts
export const DIALOG_BODY = {
    DELETE_WARNING: translate('This action cannot be undone.'),
    UNSAVED_CHANGES: translate('You have unsaved changes.'),
};
