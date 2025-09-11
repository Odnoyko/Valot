import { trackingStateManager } from './trackingStateManager.js';
import { InputValidator } from './inputValidation.js';

/**
 * Global tracking system that handles all tracker types:
 * - Header tracking widgets
 * - Compact tracker
 * - Task list buttons
 */
export class GlobalTracking {
    /**
     * Register any tracking component (header, compact, task button)
     * @param {Object} component - The tracking component
     * @param {Object} options - Registration options
     */
    static registerTrackingComponent(component, options = {}) {
        const { 
            button, 
            input, 
            timeLabel, 
            taskGroupKey = null, 
            parentWindow = null 
        } = options;

        // Register with trackingStateManager
        if (button) {
            trackingStateManager.registerTrackingButton(button, taskGroupKey, input);
        }
        if (timeLabel) {
            trackingStateManager.registerTimeLabel(timeLabel, taskGroupKey);
        }

        // Set up click handler
        if (button) {
            button.connect('clicked', async () => {
                await this.handleTrackingClick({
                    input,
                    taskGroupKey,
                    parentWindow,
                    sourceComponent: component
                });
            });
        }

        // Set up enter key support for input
        if (input) {
            input.connect('activate', () => {
                if (button) {
                    button.emit('clicked');
                }
            });
        }
    }

    /**
     * Handle tracking click from any component
     * @param {Object} options - Click options
     */
    static async handleTrackingClick(options = {}) {
        const { input, taskGroupKey, parentWindow, sourceComponent } = options;
        
        const currentTracking = trackingStateManager.getCurrentTracking();
        
        if (currentTracking) {
            // Stop current tracking
            console.log(`🛑 Stopping tracking: ${currentTracking.name}`);
            await trackingStateManager.stopTracking();
        } else {
            // Start new tracking
            const taskName = input ? input.get_text().trim() : '';
            
            if (taskName.length === 0) {
                console.log('⚠️ No task name provided');
                return;
            }

            // Validate task name
            const validation = InputValidator.validateTaskName(taskName);
            if (!validation.valid) {
                if (input) {
                    InputValidator.showValidationTooltip(input, validation.error, true);
                }
                return;
            }

            console.log(`▶️ Starting tracking: ${validation.sanitized}`);
            
            // Get context with DEBUG
            const context = this.getTrackingContext(parentWindow, sourceComponent);
            console.log(`🔧 Final context:`, context);
            
            // Create baseName for grouping
            const baseName = validation.sanitized.match(/^(.+?)\s*(?:\(\d+\))?$/)?.[1]?.trim() || validation.sanitized;
            
            // Start tracking - handle both context formats
            const projectId = context.project?.id || context.projectId || 1;
            const projectName = context.project?.name || context.projectName || 'Default';
            const clientId = context.client?.id || context.clientId || 1;
            const clientName = context.client?.name || context.clientName || 'Default Client';
            
            console.log(`🔧 Using: projectName="${projectName}", clientName="${clientName}"`);
            
            await trackingStateManager.startTracking({
                name: validation.sanitized,
                baseName: baseName,
                projectId: projectId,
                projectName: projectName,
                clientId: clientId,
                clientName: clientName,
                startTime: new Date().toISOString().replace('T', ' ').substring(0, 19)
            });
        }
    }

    /**
     * Get tracking context from various sources
     * @param {Object} parentWindow - Parent window reference
     * @param {Object} sourceComponent - Source component
     * @returns {Object} Context object
     */
    static getTrackingContext(parentWindow, sourceComponent) {
        // Try to get context from parent window
        if (parentWindow && typeof parentWindow.getSelectedContext === 'function') {
            return parentWindow.getSelectedContext();
        }

        // Try to get context from current project/client state
        if (parentWindow) {
            let projectId = 1;
            let projectName = 'Default';
            let clientId = 1; 
            let clientName = 'Default Client';
            
            // Get current project using parentWindow methods directly
            console.log(`🔧 DEBUG: getCurrentProjectName exists: ${typeof parentWindow.getCurrentProjectName === 'function'}`);
            if (typeof parentWindow.getCurrentProjectName === 'function') {
                const currentProjectName = parentWindow.getCurrentProjectName();
                console.log(`🔧 DEBUG: getCurrentProjectName() returned:`, currentProjectName);
                if (currentProjectName) {
                    projectName = currentProjectName;
                    console.log(`🔧 DEBUG: Set project name: ${projectName}`);
                }
            }
            
            // Try to get project ID from currentProjectId property
            if (parentWindow.currentProjectId) {
                projectId = parentWindow.currentProjectId;
                console.log(`🔧 DEBUG: Set project ID from property: ${projectId}`);
            }
            
            // Get current client using parentWindow method directly
            console.log(`🔧 DEBUG: getCurrentClient exists: ${typeof parentWindow.getCurrentClient === 'function'}`);
            if (typeof parentWindow.getCurrentClient === 'function') {
                const currentClient = parentWindow.getCurrentClient();
                console.log(`🔧 DEBUG: getCurrentClient() returned:`, currentClient);
                if (currentClient) {
                    clientId = currentClient.id;
                    clientName = currentClient.name;
                    console.log(`🔧 DEBUG: Set client: ${clientName} (${clientId})`);
                }
            }
            
            // Try to get client ID from currentClientId property
            if (parentWindow.currentClientId) {
                clientId = parentWindow.currentClientId;
                console.log(`🔧 DEBUG: Set client ID from property: ${clientId}`);
            }
            
            return {
                projectId,
                projectName,
                clientId,
                clientName
            };
        }

        // Default context
        return {
            projectId: 1,
            projectName: 'Default',
            clientId: 1,
            clientName: 'Default Client'
        };
    }

    /**
     * Handle task-specific tracking (from task list buttons)
     * @param {Object} task - Task object
     * @param {Object} parentWindow - Parent window reference
     */
    static async handleTaskTracking(task, parentWindow) {
        const baseName = task.name.match(/^(.+?)\s*(?:\(\d+\))?$/)?.[1]?.trim() || task.name;
        const projectName = task.project || task.project_name || 'Unknown Project';
        const clientName = task.client || task.client_name || 'Default Client';
        const taskGroupKey = `${baseName}::${projectName}::${clientName}`;
        
        const isCurrentlyTracking = trackingStateManager.isTaskTracking(taskGroupKey);
        
        if (isCurrentlyTracking) {
            // Stop current tracking
            console.log(`🛑 Stopping task tracking: ${task.name}`);
            await trackingStateManager.stopTracking();
        } else {
            // Start NEW task session with SAME name (will be grouped in stack automatically)
            console.log(`▶️ Starting NEW session for: ${baseName}`);
            
            await trackingStateManager.startTracking({
                name: baseName,
                baseName: baseName,
                projectId: task.project_id || 1,
                projectName: projectName,
                clientId: task.client_id || 1,
                clientName: clientName,
                startTime: new Date().toISOString().replace('T', ' ').substring(0, 19)
            });
        }
    }

    /**
     * Generate new task name for stack session
     * @param {string} baseName - Base name of the task
     * @param {string} projectName - Project name to match
     * @param {string} clientName - Client name to match
     * @param {Object} parentWindow - Parent window reference
     * @returns {string} New task name with session number
     */
    static generateNewStackTaskName(baseName, projectName, clientName, parentWindow) {
        if (!parentWindow || !parentWindow.allTasks) {
            return `${baseName} (1)`;
        }

        // Find all tasks with the same base name AND same project/client (same stack)
        const existingTasks = parentWindow.allTasks.filter(task => {
            const taskBaseName = task.name.match(/^(.+?)\s*(?:\(\d+\))?$/)?.[1]?.trim() || task.name;
            const taskProject = task.project || task.project_name || '';
            const taskClient = task.client || task.client_name || '';
            
            return taskBaseName === baseName && 
                   taskProject === projectName && 
                   taskClient === clientName;
        });

        // Find highest session number within this specific stack
        let highestNumber = 0;
        existingTasks.forEach(task => {
            const match = task.name.match(/\((\d+)\)$/);
            if (match) {
                const sessionNumber = parseInt(match[1], 10);
                if (sessionNumber > highestNumber) {
                    highestNumber = sessionNumber;
                }
            } else if (task.name === baseName) {
                // Task without session number counts as (1)
                if (highestNumber < 1) {
                    highestNumber = 1;
                }
            }
        });

        // Return next session number
        const nextNumber = highestNumber + 1;
        return `${baseName} (${nextNumber})`;
    }

    /**
     * Create standardized task group key
     * @param {string} taskName - Task name
     * @param {string} projectName - Project name
     * @param {string} clientName - Client name
     * @returns {string} Standardized group key
     */
    static createTaskGroupKey(taskName, projectName, clientName) {
        const baseName = taskName.match(/^(.+?)\s*(?:\(\d+\))?$/)?.[1]?.trim() || taskName;
        return `${baseName}::${projectName}::${clientName}`;
    }
}