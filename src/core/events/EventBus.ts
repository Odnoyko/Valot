type EventHandler = (data: any) => void | Promise<void>;

export class EventBus {
    private handlers: Map<string, Set<EventHandler>>;

    constructor() {
        this.handlers = new Map();
    }

    on(event: string, handler: EventHandler): void {
        if (!this.handlers.has(event)) {
            this.handlers.set(event, new Set());
        }
        this.handlers.get(event)!.add(handler);
    }

    off(event: string, handler: EventHandler): void {
        const eventHandlers = this.handlers.get(event);
        if (eventHandlers) {
            eventHandlers.delete(handler);
            if (eventHandlers.size === 0) {
                this.handlers.delete(event);
            }
        }
    }

    emit(event: string, data?: any): void {
        const eventHandlers = this.handlers.get(event);
        if (eventHandlers) {
            eventHandlers.forEach(handler => {
                try {
                    handler(data);
                } catch (error) {
                    console.error(`Error in event handler for ${event}:`, error);
                }
            });
        }
    }

    async emitAsync(event: string, data?: any): Promise<void> {
        const eventHandlers = this.handlers.get(event);
        if (eventHandlers) {
            const promises = Array.from(eventHandlers).map(handler =>
                Promise.resolve(handler(data))
            );
            await Promise.all(promises);
        }
    }

    clear(): void {
        this.handlers.clear();
    }
}
