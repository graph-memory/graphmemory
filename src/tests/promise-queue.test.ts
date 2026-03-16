import { PromiseQueue } from '@/lib/promise-queue';

describe('PromiseQueue', () => {
  it('executes tasks sequentially', async () => {
    const queue = new PromiseQueue();
    const order: number[] = [];

    const p1 = queue.enqueue(async () => {
      await new Promise(r => setTimeout(r, 30));
      order.push(1);
      return 'a';
    });
    const p2 = queue.enqueue(async () => {
      order.push(2);
      return 'b';
    });
    const p3 = queue.enqueue(async () => {
      order.push(3);
      return 'c';
    });

    const results = await Promise.all([p1, p2, p3]);
    expect(results).toEqual(['a', 'b', 'c']);
    expect(order).toEqual([1, 2, 3]);
  });

  it('returns the result of each task', async () => {
    const queue = new PromiseQueue();
    const result = await queue.enqueue(async () => 42);
    expect(result).toBe(42);
  });

  it('propagates errors without breaking the queue', async () => {
    const queue = new PromiseQueue();

    const p1 = queue.enqueue(async () => 'ok');
    const p2 = queue.enqueue(async () => { throw new Error('fail'); });
    const p3 = queue.enqueue(async () => 'recovered');

    expect(await p1).toBe('ok');
    await expect(p2).rejects.toThrow('fail');
    expect(await p3).toBe('recovered');
  });

  it('prevents concurrent execution (simulates race condition)', async () => {
    const queue = new PromiseQueue();
    let counter = 0;

    // Without the queue, these would interleave and both read counter=0
    const increment = async () => {
      const current = counter;
      await new Promise(r => setTimeout(r, 10));
      counter = current + 1;
      return counter;
    };

    const p1 = queue.enqueue(increment);
    const p2 = queue.enqueue(increment);

    await Promise.all([p1, p2]);
    expect(counter).toBe(2); // With queue: 2 (serial). Without: would be 1 (race)
  });
});
