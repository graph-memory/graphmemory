import { MemorySessionStore, RedisSessionStore } from '@/lib/session-store';

describe('MemorySessionStore', () => {
  let store: MemorySessionStore;

  beforeEach(() => {
    store = new MemorySessionStore();
  });

  it('set and get a value', async () => {
    await store.set('key1', 'value1', 60);
    expect(await store.get('key1')).toBe('value1');
  });

  it('returns null for missing key', async () => {
    expect(await store.get('missing')).toBeNull();
  });

  it('delete removes the key', async () => {
    await store.set('key1', 'value1', 60);
    const deleted = await store.delete('key1');
    expect(deleted).toBe(true);
    expect(await store.get('key1')).toBeNull();
  });

  it('delete returns false for missing key', async () => {
    expect(await store.delete('missing')).toBe(false);
  });

  it('overwrite replaces value and resets timer', async () => {
    await store.set('key1', 'v1', 60);
    await store.set('key1', 'v2', 60);
    expect(await store.get('key1')).toBe('v2');
  });

  it('TTL expires the entry', async () => {
    jest.useFakeTimers();
    try {
      await store.set('key1', 'value1', 1);
      expect(await store.get('key1')).toBe('value1');
      jest.advanceTimersByTime(1100);
      expect(await store.get('key1')).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });

  it('getAndDelete returns value and removes key atomically', async () => {
    await store.set('key1', 'value1', 60);
    const result = await store.getAndDelete('key1');
    expect(result).toBe('value1');
    expect(await store.get('key1')).toBeNull();
  });

  it('getAndDelete returns null for missing key', async () => {
    expect(await store.getAndDelete('missing')).toBeNull();
  });

  it('stores multiple keys independently', async () => {
    await store.set('a', '1', 60);
    await store.set('b', '2', 60);
    expect(await store.get('a')).toBe('1');
    expect(await store.get('b')).toBe('2');
    await store.delete('a');
    expect(await store.get('a')).toBeNull();
    expect(await store.get('b')).toBe('2');
  });
});

describe('RedisSessionStore', () => {
  let mockClient: any;
  let store: RedisSessionStore;

  beforeEach(() => {
    mockClient = {
      set: jest.fn().mockResolvedValue('OK'),
      get: jest.fn().mockResolvedValue(null),
      del: jest.fn().mockResolvedValue(0),
    };
    store = new RedisSessionStore(mockClient, 'mgm:session:');
  });

  it('set calls redis SET with EX', async () => {
    await store.set('key1', 'value1', 300);
    expect(mockClient.set).toHaveBeenCalledWith('mgm:session:key1', 'value1', { EX: 300 });
  });

  it('get calls redis GET with prefix', async () => {
    mockClient.get.mockResolvedValue('value1');
    const result = await store.get('key1');
    expect(mockClient.get).toHaveBeenCalledWith('mgm:session:key1');
    expect(result).toBe('value1');
  });

  it('get returns null when key not found', async () => {
    expect(await store.get('missing')).toBeNull();
  });

  it('delete calls redis DEL and returns true when deleted', async () => {
    mockClient.del.mockResolvedValue(1);
    const result = await store.delete('key1');
    expect(mockClient.del).toHaveBeenCalledWith('mgm:session:key1');
    expect(result).toBe(true);
  });

  it('delete returns false when key not found', async () => {
    mockClient.del.mockResolvedValue(0);
    expect(await store.delete('missing')).toBe(false);
  });

  it('getAndDelete calls redis GETDEL with prefix', async () => {
    mockClient.getDel = jest.fn().mockResolvedValue('value1');
    const result = await store.getAndDelete('key1');
    expect(mockClient.getDel).toHaveBeenCalledWith('mgm:session:key1');
    expect(result).toBe('value1');
  });

  it('getAndDelete returns null when key not found', async () => {
    mockClient.getDel = jest.fn().mockResolvedValue(null);
    expect(await store.getAndDelete('missing')).toBeNull();
  });
});
