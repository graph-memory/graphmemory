/**
 * A simple serial promise queue.
 * Enqueued functions execute one at a time, in order.
 * If a function rejects, the error propagates to the caller
 * but the queue continues processing subsequent items.
 */
export class PromiseQueue {
  private chain: Promise<void> = Promise.resolve();

  /**
   * Enqueue an async function. Returns a promise that resolves/rejects
   * with the function's result once it has been executed in turn.
   */
  enqueue<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.chain = this.chain.then(fn).then(resolve, reject);
    });
  }
}
