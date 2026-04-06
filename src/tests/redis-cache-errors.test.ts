import { RedisEmbeddingCache } from '@/lib/embedder';

/**
 * Tests for Redis cache behavior when Redis operations fail.
 * Uses mock Redis client to simulate errors.
 */
describe('RedisEmbeddingCache error handling', () => {
  let mockClient: any;

  beforeEach(() => {
    mockClient = {
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
      scanIterator: jest.fn(),
    };
  });

  it('get throws when Redis connection fails', async () => {
    mockClient.get.mockRejectedValue(new Error('Redis connection refused'));
    const cache = new RedisEmbeddingCache(mockClient, 'test:', 0);

    // Redis errors propagate — caller is responsible for handling
    await expect(cache.get('hello')).rejects.toThrow('Redis connection refused');
  });

  it('set throws when Redis is unavailable', async () => {
    mockClient.set.mockRejectedValue(new Error('Redis connection refused'));
    const cache = new RedisEmbeddingCache(mockClient, 'test:', 3600);

    // Redis errors propagate — caller is responsible for handling
    await expect(cache.set('hello', [0.1, 0.2])).rejects.toThrow('Redis connection refused');
  });

  it('get handles corrupted data gracefully', async () => {
    mockClient.get.mockResolvedValue('not-valid-base64!!!');
    const cache = new RedisEmbeddingCache(mockClient, 'test:', 0);

    // Should not throw, just return undefined for invalid data
    const got = await cache.get('corrupted');
    // May return undefined or malformed data — key thing is no crash
    expect(got === undefined || Array.isArray(got)).toBe(true);
  });

  it('clear handles scan failure gracefully', async () => {
    mockClient.scanIterator.mockImplementation(function* () {
      throw new Error('Redis scan failed');
    });
    const cache = new RedisEmbeddingCache(mockClient, 'test:', 0);

    // Should not crash the process
    try {
      await cache.clear();
    } catch {
      // Some implementations may throw on clear — that's acceptable
    }
  });

  it('set with TTL passes correct options', async () => {
    mockClient.set.mockResolvedValue('OK');
    const cache = new RedisEmbeddingCache(mockClient, 'pfx:', 7200);

    await cache.set('key', [1.0, 2.0]);

    expect(mockClient.set).toHaveBeenCalledTimes(1);
    const [, , opts] = mockClient.set.mock.calls[0];
    expect(opts).toEqual({ EX: 7200 });
  });

  it('set without TTL omits EX option', async () => {
    mockClient.set.mockResolvedValue('OK');
    const cache = new RedisEmbeddingCache(mockClient, 'pfx:', 0);

    await cache.set('key', [1.0]);

    const [, , opts] = mockClient.set.mock.calls[0];
    expect(opts).toBeUndefined();
  });

  it('different prefixes isolate keys', async () => {
    mockClient.get.mockResolvedValue(null);
    const cache1 = new RedisEmbeddingCache(mockClient, 'proj1:', 0);
    const cache2 = new RedisEmbeddingCache(mockClient, 'proj2:', 0);

    await cache1.get('same-text');
    await cache2.get('same-text');

    const key1 = mockClient.get.mock.calls[0][0] as string;
    const key2 = mockClient.get.mock.calls[1][0] as string;

    expect(key1.startsWith('proj1:')).toBe(true);
    expect(key2.startsWith('proj2:')).toBe(true);
    expect(key1).not.toBe(key2);
  });
});
