/**
 * Memory Cleanup Service - Periodic Memory Management
 * 
 * Distributes cleanup tasks across 5 ticks to avoid blocking:
 * - Tick 1: Check cache sizes and identify cleanup candidates
 * - Tick 2: Cleanup unused UI elements
 * - Tick 3: Cleanup old/expired data from caches
 * - Tick 4: Prepare data for deletion (mark unused items)
 * - Tick 5: Actually delete marked items to free RAM
 */

import { Logger } from '../utils/Logger.js';

export class MemoryCleanupService {
    constructor(coreAPI) {
        this.core = coreAPI;
        this.checkInterval = 30; // Check memory every 30 seconds (not every 5) to avoid RAM overhead
        this.lastCheckTick = 0;
        this._cleanupCycleStartTick = null; // Tracks start of current cleanup cycle
        
        // Items marked for deletion (on tick 4)
        this.itemsToDelete = {
            cache: {
                tasks: [],
                projects: [],
                clients: [],
                taskInstances: [],
                timeEntries: []
            },
            ui: {
                oldRows: [],
                oldTemplates: [],
                oldCache: []
            }
        };
        
        // Cleanup configuration
        this.config = {
            maxCacheSize: 1000,        // Max items in cache
            maxUICacheSize: 500,       // Max items in UI cache
            maxTimeEntriesCache: 2000, // Max completed time entries in cache
            cleanupThreshold: 0.8      // Cleanup when 80% full
        };
    }
    
    /**
     * Called every tick (1 second) from TimerScheduler
     * Runs cleanup every 30 seconds to prevent RAM accumulation
     */
    onTick() {
        // Get global tick count from TimerScheduler
        const scheduler = this.core?.services?.timerScheduler;
        if (!scheduler) return;
        
        const globalTick = scheduler.getTickCount();
        
        // Check if it's time for cleanup (every 30 seconds)
        const ticksSinceLastCheck = globalTick - this.lastCheckTick;
        
        if (ticksSinceLastCheck < this.checkInterval) {
            // Not time yet
            return;
        }
        
        // Time for cleanup - run full 5-tick cycle
        // Use relative tick counter for cycle phase
        if (!this._cleanupCycleStartTick) {
            // Start new cleanup cycle
            this._cleanupCycleStartTick = globalTick;
        }
        
        const ticksInCycle = globalTick - this._cleanupCycleStartTick;
        const cyclePhase = (ticksInCycle % 5) || 5;
        
        this._runCleanupCycle(cyclePhase);
        
        // Reset cycle after tick 5 completes
        if (cyclePhase === 5) {
            this._cleanupCycleStartTick = null;
            this.lastCheckTick = globalTick;
        }
    }
    
    /**
     * Run cleanup cycle across 5 ticks
     * @param {number} tick - Current tick (1-5)
     */
    _runCleanupCycle(tick) {
        
        try {
            switch (tick) {
                case 1:
                    this._tick1_CheckSizes();
                    break;
                case 2:
                    this._tick2_CleanupUI();
                    break;
                case 3:
                    this._tick3_CleanupCaches();
                    break;
                case 4:
                    this._tick4_PrepareDeletion();
                    break;
                case 5:
                    this._tick5_DeleteMarked();
                    break;
            }
        } catch (error) {
            Logger.error('[MemoryCleanup] Error on tick', tick, ':', error);
        }
    }
    
    /**
     * Tick 1: Check cache sizes (for logging and planning)
     */
    _tick1_CheckSizes() {
        if (!this.core?.services?.cache) return;
        
        const cache = this.core.services.cache;
        const sizes = {
            tasks: cache.tasks?.size || 0,
            projects: cache.projects?.size || 0,
            clients: cache.clients?.size || 0,
            taskInstances: cache.taskInstances?.size || 0,
            timeEntries: cache.timeEntries?.size || 0
        };
        
        // Store sizes for next ticks
        this._lastCacheSizes = sizes;
    }
    
    /**
     * Tick 2: Cleanup unused UI elements
     */
    _tick2_CleanupUI() {
        // Trigger UI cleanup via events
        if (this.core?.events) {
            this.core.events.emit('memory-cleanup-ui');
        }
    }
    
    /**
     * Tick 3: Cleanup old/expired data from caches
     */
    _tick3_CleanupCaches() {
        if (!this.core?.services?.cache) return;
        
        const cache = this.core.services.cache;
        
        // Cleanup TimeEntries cache (only completed ones are cached)
        // Remove oldest entries if cache is too large
        if (cache.timeEntries?.size > this.config.maxTimeEntriesCache) {
            const entriesToKeep = Math.floor(this.config.maxTimeEntriesCache * 0.8);
            const entriesArray = Array.from(cache.timeEntries.entries());
            
            // Sort by id (assuming higher id = newer)
            entriesArray.sort((a, b) => b[0] - a[0]);
            
            // Remove oldest entries
            const entriesToRemove = entriesArray.slice(entriesToKeep);
            entriesToRemove.forEach(([id]) => {
                cache.timeEntries.delete(id);
            });
            
            Logger.debug('[MemoryCleanup] Tick 3: Cleaned', entriesToRemove.length, 'old time entries');
        }
        
        // Cleanup TaskInstances that haven't been used recently
        // (This is handled by CacheService's own logic, but we can add extra cleanup here)
    }
    
    /**
     * Tick 4: Prepare data for deletion (mark unused items)
     * Always clean up if cache exceeds limits to prevent RAM growth
     */
    _tick4_PrepareDeletion() {
        if (!this.core?.services?.cache || !this._lastCacheSizes) return;
        
        const cache = this.core.services.cache;
        this.itemsToDelete.cache = {
            tasks: [],
            projects: [],
            clients: [],
            taskInstances: [],
            timeEntries: []
        };
        
        // Mark items for deletion if cache exceeds max size
        if (this._lastCacheSizes.tasks > this.config.maxCacheSize) {
            const toRemove = this._lastCacheSizes.tasks - this.config.maxCacheSize;
            // Get oldest tasks (by id - assuming lower id = older)
            const tasksArray = Array.from(cache.tasks.keys()).sort((a, b) => a - b);
            this.itemsToDelete.cache.tasks = tasksArray.slice(0, toRemove);
        }
        
        // Mark projects for deletion if needed
        if (this._lastCacheSizes.projects > this.config.maxCacheSize) {
            const toRemove = this._lastCacheSizes.projects - this.config.maxCacheSize;
            const projectsArray = Array.from(cache.projects.keys()).sort((a, b) => a - b);
            this.itemsToDelete.cache.projects = projectsArray.slice(0, toRemove);
        }
        
        // Mark clients for deletion if needed
        if (this._lastCacheSizes.clients > this.config.maxCacheSize) {
            const toRemove = this._lastCacheSizes.clients - this.config.maxCacheSize;
            const clientsArray = Array.from(cache.clients.keys()).sort((a, b) => a - b);
            this.itemsToDelete.cache.clients = clientsArray.slice(0, toRemove);
        }
        
        // Mark taskInstances for deletion if needed
        if (this._lastCacheSizes.taskInstances > this.config.maxCacheSize) {
            const toRemove = this._lastCacheSizes.taskInstances - this.config.maxCacheSize;
            const instancesArray = Array.from(cache.taskInstances.keys()).sort((a, b) => a - b);
            this.itemsToDelete.cache.taskInstances = instancesArray.slice(0, toRemove);
        }
    }
    
    /**
     * Tick 5: Actually delete marked items to free RAM
     */
    _tick5_DeleteMarked() {
        if (!this.core?.services?.cache) return;
        
        const cache = this.core.services.cache;
        let deletedCount = 0;
        
        // Delete marked cache items
        if (this.itemsToDelete.cache.tasks.length > 0) {
            this.itemsToDelete.cache.tasks.forEach(id => {
                const task = cache.tasks.get(id);
                if (task && task.name && cache.taskByName) {
                    // Remove from name index
                    cache.taskByName.delete(task.name);
                }
                cache.tasks.delete(id);
                deletedCount++;
            });
            this.itemsToDelete.cache.tasks = [];
        }
        
        if (this.itemsToDelete.cache.projects.length > 0) {
            this.itemsToDelete.cache.projects.forEach(id => {
                cache.projects.delete(id);
                deletedCount++;
            });
            this.itemsToDelete.cache.projects = [];
        }
        
        if (this.itemsToDelete.cache.clients.length > 0) {
            this.itemsToDelete.cache.clients.forEach(id => {
                cache.clients.delete(id);
                deletedCount++;
            });
            this.itemsToDelete.cache.clients = [];
        }
        
        if (this.itemsToDelete.cache.taskInstances.length > 0) {
            this.itemsToDelete.cache.taskInstances.forEach(id => {
                const instance = cache.taskInstances.get(id);
                if (instance && cache.instanceByCombo) {
                    // Remove from instanceByCombo index
                    const comboKey = `${instance.task_id}:${instance.project_id}:${instance.client_id}`;
                    cache.instanceByCombo.delete(comboKey);
                }
                cache.taskInstances.delete(id);
                deletedCount++;
            });
            this.itemsToDelete.cache.taskInstances = [];
        }
        
        if (deletedCount > 0) {
            Logger.debug('[MemoryCleanup] Tick 5: Deleted', deletedCount, 'items from cache');
        }
        
        // Clear UI cleanup markers
        this.itemsToDelete.ui = {
            oldRows: [],
            oldTemplates: [],
            oldCache: []
        };
    }
    
    /**
     * Force immediate cleanup (manual trigger)
     */
    forceCleanup() {
        // Run all 5 ticks immediately
        for (let i = 1; i <= 5; i++) {
            this._runCleanupCycle(i);
        }
    }
    
    /**
     * Cleanup on shutdown
     */
    destroy() {
        // Clear all markers
        this.itemsToDelete = {
            cache: {
                tasks: [],
                projects: [],
                clients: [],
                taskInstances: [],
                timeEntries: []
            },
            ui: {
                oldRows: [],
                oldTemplates: [],
                oldCache: []
            }
        };
        this._cleanupCycleStartTick = null;
        this.lastCheckTick = 0;
    }
}

