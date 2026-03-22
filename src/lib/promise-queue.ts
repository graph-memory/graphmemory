/**
 * A simple serial promise queue.
 * Enqueued functions execute one at a time, in order.
 * If a function rejects, the error propagates to the caller
 * but the queue continues processing subsequent items.
 */
export class PromiseQueue {
  private queue: Array<() => Promise<void>> = [];
  private running = false;

  /**
   * Enqueue an async function. Returns a promise that resolves/rejects
   * with the function's result once it has been executed in turn.
   */
  enqueue<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.queue.push(async () => {
        try { resolve(await fn()); } catch (e) { reject(e as Error); }
      });
      if (!this.running) this.drain();
    });
  }

  private async drain(): Promise<void> {
    this.running = true;
    while (this.queue.length > 0) {
      const task = this.queue.shift()!;
      await task();
    }
    this.running = false;
  }
}
