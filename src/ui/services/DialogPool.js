/**
 * DialogPool Service
 * Centralized dialog management with reuse pattern
 * Creates dialogs once and reuses them with updated data
 * 
 * IMPORTANT: Only use for dialogs that support reusability!
 * - ✅ FormDialog-based dialogs (ProjectDialog, ClientDialog)
 * - ✅ Custom dialogs with manual close control
 * - ❌ AdwAlertDialog (closes automatically after response)
 * - ❌ Gtk.MessageDialog (closes automatically)
 */

export class DialogPool {
    constructor() {
        // Store dialog instances by type
        this._dialogInstances = new Map();
        
        // Track active dialogs
        this._activeDialogs = new Set();
    }

    /**
     * Get or create dialog instance
     * @param {string} dialogType - Unique type identifier (e.g. 'project-edit', 'client-create')
     * @param {Function} createFn - Factory function to create dialog if not exists
     * @param {Function} updateFn - Function to update dialog data
     * @param {Object} data - Data to pass to dialog
     * @returns {Promise<Object>} Dialog instance
     */
    async getDialog(dialogType, createFn, updateFn, data) {
        let dialogInstance = this._dialogInstances.get(dialogType);
        
        if (dialogInstance && dialogInstance._isInitialized) {
            // Reuse existing dialog - just update data
            if (updateFn) {
                await updateFn(dialogInstance, data);
            }
            return dialogInstance;
        }
        
        // Create new dialog instance
        dialogInstance = await createFn(data);
        dialogInstance._isInitialized = true;
        dialogInstance._poolType = dialogType;
        
        this._dialogInstances.set(dialogType, dialogInstance);
        return dialogInstance;
    }

    /**
     * Show dialog from pool
     * @param {string} dialogType - Dialog type
     * @param {Function} createFn - Factory to create if needed
     * @param {Function} updateFn - Update function
     * @param {Object} data - Dialog data
     * @param {Object} parentWindow - Parent window
     * @returns {Promise<Object>} Dialog instance
     */
    async show(dialogType, createFn, updateFn, data, parentWindow) {
        const dialog = await this.getDialog(dialogType, createFn, updateFn, data);
        
        // Mark as active
        this._activeDialogs.add(dialog);
        
        // Present dialog
        if (dialog.present) {
            dialog.present(parentWindow);
        } else if (dialog.widget && dialog.widget.present) {
            dialog.widget.present(parentWindow);
        }
        
        // Setup close handler to track active state
        this._setupCloseHandler(dialog);
        
        return dialog;
    }

    /**
     * Setup handler to track when dialog is closed
     */
    _setupCloseHandler(dialog) {
        if (dialog._poolCloseHandlerSetup) return;
        
        const widget = dialog.widget || dialog;
        
        if (widget && widget.connect) {
            widget.connect('close-request', () => {
                this._activeDialogs.delete(dialog);
            });
            
            dialog._poolCloseHandlerSetup = true;
        }
    }

    /**
     * Close specific dialog type
     * @param {string} dialogType - Dialog type to close
     */
    close(dialogType) {
        const dialog = this._dialogInstances.get(dialogType);
        if (dialog) {
            const widget = dialog.widget || dialog;
            if (widget && widget.close) {
                widget.close();
            }
            this._activeDialogs.delete(dialog);
        }
    }

    /**
     * Close all active dialogs
     */
    closeAll() {
        this._activeDialogs.forEach(dialog => {
            const widget = dialog.widget || dialog;
            if (widget && widget.close) {
                widget.close();
            }
        });
        this._activeDialogs.clear();
    }

    /**
     * Destroy dialog instance (remove from pool)
     * @param {string} dialogType - Dialog type to destroy
     */
    destroy(dialogType) {
        const dialog = this._dialogInstances.get(dialogType);
        if (dialog) {
            this.close(dialogType);
            this._dialogInstances.delete(dialogType);
        }
    }

    /**
     * Destroy all dialogs (cleanup)
     */
    destroyAll() {
        this.closeAll();
        this._dialogInstances.clear();
    }

    /**
     * Check if dialog type exists in pool
     * @param {string} dialogType - Dialog type
     * @returns {boolean}
     */
    has(dialogType) {
        return this._dialogInstances.has(dialogType);
    }

    /**
     * Get active dialog count
     * @returns {number}
     */
    getActiveCount() {
        return this._activeDialogs.size;
    }

    /**
     * Get pool size
     * @returns {number}
     */
    getPoolSize() {
        return this._dialogInstances.size;
    }
}

// Singleton instance
let dialogPoolInstance = null;

/**
 * Get singleton DialogPool instance
 * @returns {DialogPool}
 */
export function getDialogPool() {
    if (!dialogPoolInstance) {
        dialogPoolInstance = new DialogPool();
    }
    return dialogPoolInstance;
}

