/**
 * Global keyboard event handling logic
 */

// keyboardHandler.js verbunden

import Gdk from 'gi://Gdk';
import Gtk from 'gi://Gtk';
import Gio from 'gi://Gio';

/**
 * Handle Delete key press based on current page context
 * @param {Object} window - The main window instance
 * @param {Object} pageComponents - Available page components
 * @param {string} currentPageName - Currently active page name
 */
export function handleDeleteKey(window, pageComponents, currentPageName) {
    
    switch (currentPageName) {
        case 'tasks':
            if (pageComponents.tasks && typeof pageComponents.tasks._deleteSelectedTasks === 'function') {
                pageComponents.tasks._deleteSelectedTasks();
                return true;
            }
            break;
            
        case 'projects':
            if (pageComponents.projects && typeof pageComponents.projects._deleteSelectedProjects === 'function') {
                pageComponents.projects._deleteSelectedProjects();
                return true;
            } else {
            }
            break;
            
        case 'clients':
            if (pageComponents.clients && typeof pageComponents.clients._deleteSelectedClients === 'function') {
                pageComponents.clients._deleteSelectedClients();
                return true;
            } else {
            }
            break;
            
        case 'reports':
            return true;
            
        default:
            break;
    }
    
    return false;
}

/**
 * Get current active page name from main content
 * @param {Object} mainContent - The main content stack
 * @param {Object} pages - Available page objects
 * @returns {string} - Current page name
 */
export function getCurrentPageName(mainContent, pages) {
    if (!mainContent || !pages) return 'unknown';
    
    try {
        const visiblePage = mainContent.get_visible_page();
        
        if (visiblePage === pages.tasks) return 'tasks';
        if (visiblePage === pages.projects) return 'projects';
        if (visiblePage === pages.clients) return 'clients';
        if (visiblePage === pages.reports) return 'reports';
        
        return 'unknown';
    } catch (error) {
        //('❌ Error determining current page:', error);
        return 'unknown';
    }
}

/**
 * Setup application-wide keyboard handler that works from startup
 * @param {Object} application - The Gtk.Application instance
 * @param {Object} window - The main window instance
 */
export function setupApplicationKeyboardHandler(application, window) {
    
    // Create application-level keyboard shortcut for Delete key
    const deleteAction = new Gio.SimpleAction({
        name: 'delete-selected',
        parameter_type: null
    });
    
    deleteAction.connect('activate', () => {
        
        if (!window || !window.pageComponents) {
            return;
        }
        
        // Get current page and handle deletion
        const pages = {
            tasks: window._tasks_page,
            projects: window._projects_page,
            clients: window._clients_page,
            reports: window._reports_page
        };
        
        const currentPageName = getCurrentPageName(window._main_content, pages);
        const handled = handleDeleteKey(window, window.pageComponents, currentPageName);
        
    });
    
    application.add_action(deleteAction);
    application.set_accels_for_action('app.delete-selected', ['Delete']);
    
}