export class EventBus {
    handlers;
    constructor() {
        this.handlers = new Map();
    }
    on(event, handler) {
        if (!this.handlers.has(event)) {
            this.handlers.set(event, new Set());
        }
        this.handlers.get(event).add(handler);
    }
    off(event, handler) {
        const eventHandlers = this.handlers.get(event);
        if (eventHandlers) {
            eventHandlers.delete(handler);
            if (eventHandlers.size === 0) {
                this.handlers.delete(event);
            }
        }
    }
    emit(event, data) {
        const eventHandlers = this.handlers.get(event);
        if (eventHandlers) {
            eventHandlers.forEach(handler => {
                try {
                    handler(data);
                }
                catch (error) {
                    console.error(`Error in event handler for ${event}:`, error);
                }
            });
        }
    }
    async emitAsync(event, data) {
        const eventHandlers = this.handlers.get(event);
        if (!eventHandlers || eventHandlers.size === 0) return;

        // OPTIMIZED: Reuse promises array if handler count doesn't change
        // For most cases, handler count is stable, so we can minimize allocations
        const handlerCount = eventHandlers.size;
        const promises = [];
        promises.length = handlerCount; // Pre-allocate array size

        let index = 0;
        for (const handler of eventHandlers) {
            promises[index++] = Promise.resolve(handler(data));
        }

        await Promise.all(promises);
        // Clear array reference after use (not strictly necessary but helps GC)
        promises.length = 0;
    }
    clear() {
        this.handlers.clear();
    }
}
