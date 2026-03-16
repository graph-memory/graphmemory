type EventHandler = (...args: any[]) => void | Promise<void>

export class EventBus {
  private handlers = new Map<string, EventHandler[]>()
  private onceHandlers = new Map<string, EventHandler[]>()

  on(event: string, handler: EventHandler): () => void {
    const handlers = this.handlers.get(event) ?? []
    handlers.push(handler)
    this.handlers.set(event, handlers)

    return () => this.off(event, handler)
  }

  once(event: string, handler: EventHandler): void {
    const handlers = this.onceHandlers.get(event) ?? []
    handlers.push(handler)
    this.onceHandlers.set(event, handlers)
  }

  off(event: string, handler: EventHandler): void {
    const handlers = this.handlers.get(event)
    if (!handlers) return
    const idx = handlers.indexOf(handler)
    if (idx >= 0) handlers.splice(idx, 1)
  }

  emit(event: string, ...args: any[]): void {
    const handlers = this.handlers.get(event) ?? []
    for (const handler of handlers) {
      try {
        handler(...args)
      } catch (err) {
        console.error(`Event handler error for "${event}":`, err)
      }
    }

    const onceHandlers = this.onceHandlers.get(event) ?? []
    this.onceHandlers.delete(event)
    for (const handler of onceHandlers) {
      try {
        handler(...args)
      } catch (err) {
        console.error(`Once handler error for "${event}":`, err)
      }
    }
  }

  async emitAsync(event: string, ...args: any[]): Promise<void> {
    const handlers = this.handlers.get(event) ?? []
    await Promise.all(handlers.map(h => h(...args)))

    const onceHandlers = this.onceHandlers.get(event) ?? []
    this.onceHandlers.delete(event)
    await Promise.all(onceHandlers.map(h => h(...args)))
  }

  listenerCount(event: string): number {
    return (this.handlers.get(event)?.length ?? 0) + (this.onceHandlers.get(event)?.length ?? 0)
  }

  removeAllListeners(event?: string): void {
    if (event) {
      this.handlers.delete(event)
      this.onceHandlers.delete(event)
    } else {
      this.handlers.clear()
      this.onceHandlers.clear()
    }
  }

  eventNames(): string[] {
    const names = new Set([...this.handlers.keys(), ...this.onceHandlers.keys()])
    return [...names]
  }
}
