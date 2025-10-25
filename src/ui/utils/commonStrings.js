/**
 * Common strings used throughout the application
 * Using _ function for translations (initialized by pkg in Application)
 *
 * NOTE: Using getters to ensure _ function is available at runtime
 */

// Dialog button labels
export const BUTTON = {
    get CANCEL() { return _('Cancel'); },
    get OK() { return _('OK'); },
    get SAVE() { return _('Save'); },
    get SAVE_CHANGES() { return _('Save Changes'); },
    get DELETE() { return _('Delete'); },
    get CREATE() { return _('Create'); },
    get CREATE_TASK() { return _('Create Task'); },
    get CREATE_PROJECT() { return _('Create Project'); },
    get CREATE_CLIENT() { return _('Create Client'); },
    get SELECT() { return _('Select'); },
    get CLOSE() { return _('Close'); },
    get OPEN_FOLDER() { return _('Open Folder'); },
};

// Common dialog headings
export const HEADING = {
    get INVALID_INPUT() { return _('Invalid Input'); },
    get DELETE_TASK() { return _('Delete Task'); },
    get DELETE_TASKS() { return _('Delete Tasks'); },
    get DELETE_PROJECT() { return _('Delete Project'); },
    get DELETE_CLIENT() { return _('Delete Client'); },
    get EDIT_PROJECT() { return _('Edit Project'); },
    get EDIT_CLIENT() { return _('Edit Client'); },
    get CREATE_PROJECT() { return _('Create New Project'); },
    get ADD_NEW_TASK() { return _('Add New Task'); },
    get ERROR() { return _('Error'); },
    get DATABASE_ERROR() { return _('Database Error'); },
    get VALIDATION_ERROR() { return _('Validation Error'); },
    get DUPLICATE_PROJECT() { return _('Duplicate Project'); },
    get DUPLICATE_CLIENT() { return _('Duplicate Client'); },
    get LOAD_ERROR() { return _('Load Error'); },
    get UPDATE_ERROR() { return _('Update Error'); },
    get DELETE_ERROR() { return _('Delete Error'); },
};

// Common messages
export const MESSAGE = {
    get CONFIRM_DELETE_TASK() { return _('Are you sure you want to delete this task?'); },
    get CONFIRM_DELETE_TASKS() { return _('Are you sure you want to delete {0} tasks?'); },
    get CONFIRM_DELETE_PROJECT() { return _('Are you sure you want to delete this project?'); },
    get CONFIRM_DELETE_CLIENT() { return _('Are you sure you want to delete this client?'); },
    get NO_RESULTS() { return _('No results found'); },
    get DATABASE_ERROR() { return _('Failed to connect to database'); },
    get LOAD_FAILED() { return _('Failed to load data'); },
    get SAVE_FAILED() { return _('Failed to save changes'); },
    get DELETE_FAILED() { return _('Failed to delete'); },
    get INVALID_INPUT_MESSAGE() { return _('Please check your input and try again'); },
};

// Common labels
export const LABEL = {
    get NAME() { return _('Name'); },
    get CLIENT() { return _('Client'); },
    get PROJECT() { return _('Project'); },
    get TASK() { return _('Task'); },
    get DESCRIPTION() { return _('Description'); },
    get COLOR() { return _('Color'); },
    get CURRENCY() { return _('Currency'); },
    get HOURLY_RATE() { return _('Hourly Rate'); },
    get EMAIL() { return _('Email'); },
    get PHONE() { return _('Phone'); },
    get WEBSITE() { return _('Website'); },
    get NOTES() { return _('Notes'); },
    get STATUS() { return _('Status'); },
    get DURATION() { return _('Duration'); },
    get TOTAL() { return _('Total'); },
    get FILTER() { return _('Filter'); },
    get SEARCH() { return _('Search'); },
    get SORT_BY() { return _('Sort by'); },
};

// Placeholders
export const PLACEHOLDER = {
    get ENTER_NAME() { return _('Enter name...'); },
    get ENTER_DESCRIPTION() { return _('Enter description...'); },
    get SEARCH() { return _('Search...'); },
    get SEARCH_PROJECTS() { return _('Search projects...'); },
    get SEARCH_CLIENTS() { return _('Search clients...'); },
    get SELECT_CLIENT() { return _('Select client...'); },
    get SELECT_PROJECT() { return _('Select project...'); },
    get SELECT_COLOR() { return _('Select color...'); },
    get SELECT_CURRENCY() { return _('Select currency...'); },
    get OPTIONAL() { return _('Optional'); },
};

// Tooltips
export const TOOLTIP = {
    get REFRESH() { return _('Refresh'); },
    get SEARCH() { return _('Search'); },
    get FILTER() { return _('Filter'); },
    get DELETE() { return _('Delete'); },
    get EDIT() { return _('Edit'); },
    get ADD() { return _('Add'); },
    get SETTINGS() { return _('Settings'); },
    get CHANGE_APPEARANCE() { return _('Change color and icon'); },
};

// Empty state messages
export const EMPTY_STATE = {
    get NO_TASKS() { return _('No tasks yet'); },
    get NO_PROJECTS() { return _('No projects yet'); },
    get NO_CLIENTS() { return _('No clients yet'); },
    get NO_REPORTS() { return _('No reports yet'); },
    get CREATE_FIRST_TASK() { return _('Create your first task to get started'); },
    get CREATE_FIRST_PROJECT() { return _('Create your first project to get started'); },
    get CREATE_FIRST_CLIENT() { return _('Create your first client to get started'); },
};

// Loading message
export function getLoadingText() {
    return _('Loading...');
}

// Success messages
export const SUCCESS = {
    get TASK_CREATED() { return _('Task created successfully'); },
    get TASK_UPDATED() { return _('Task updated successfully'); },
    get TASK_DELETED() { return _('Task deleted successfully'); },
    get PROJECT_CREATED() { return _('Project created successfully'); },
    get PROJECT_UPDATED() { return _('Project updated successfully'); },
    get PROJECT_DELETED() { return _('Project deleted successfully'); },
    get CLIENT_CREATED() { return _('Client created successfully'); },
    get CLIENT_UPDATED() { return _('Client updated successfully'); },
    get CLIENT_DELETED() { return _('Client deleted successfully'); },
};

// Error messages
export const ERROR = {
    get UNKNOWN() { return _('An unknown error occurred'); },
    get DATABASE() { return _('Database error'); },
    get NETWORK() { return _('Network error'); },
    get VALIDATION() { return _('Validation error'); },
    get NOT_FOUND() { return _('Not found'); },
};

// Status labels
export const STATUS = {
    get ACTIVE() { return _('Active'); },
    get INACTIVE() { return _('Inactive'); },
    get COMPLETED() { return _('Completed'); },
    get PENDING() { return _('Pending'); },
    get IN_PROGRESS() { return _('In Progress'); },
};

// Dialog body texts
export const DIALOG_BODY = {
    get DELETE_WARNING() { return _('This action cannot be undone.'); },
    get UNSAVED_CHANGES() { return _('You have unsaved changes.'); },
};
