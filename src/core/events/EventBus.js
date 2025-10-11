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
        if (eventHandlers) {
            const promises = Array.from(eventHandlers).map(handler => Promise.resolve(handler(data)));
            await Promise.all(promises);
        }
    }
    clear() {
        this.handlers.clear();
    }
}
