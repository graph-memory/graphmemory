import { MemoryEmbeddingCache, RedisEmbeddingCache } from '@/lib/embedder';
import { float32ToBase64 } from '@/lib/embedding-codec';

describe('MemoryEmbeddingCache', () => {
  it('get returns undefined for missing key', async () => {
    const cache = new MemoryEmbeddingCache(10);
    expect(await cache.get('missing')).toBeUndefined();
  });

  it('set and get a vector', async () => {
    const cache = new MemoryEmbeddingCache(10);
    const vec = [0.1, 0.2, 0.3];
    await cache.set('hello', vec);
    expect(await cache.get('hello')).toEqual(vec);
  });

  it('LRU eviction removes oldest entry', async () => {
    const cache = new MemoryEmbeddingCache(2);
    await cache.set('a', [1]);
    await cache.set('b', [2]);
    // 'a' is oldest, adding 'c' should evict it
    await cache.set('c', [3]);
    expect(await cache.get('a')).toBeUndefined();
    expect(await cache.get('b')).toEqual([2]);
    expect(await cache.get('c')).toEqual([3]);
  });

  it('accessing an entry makes it recently used', async () => {
    const cache = new MemoryEmbeddingCache(2);
    await cache.set('a', [1]);
    await cache.set('b', [2]);
    // Access 'a' to make it recent
    await cache.get('a');
    // Now 'b' is oldest, adding 'c' should evict 'b'
    await cache.set('c', [3]);
    expect(await cache.get('a')).toEqual([1]);
    expect(await cache.get('b')).toBeUndefined();
  });

  it('clear removes all entries', async () => {
    const cache = new MemoryEmbeddingCache(10);
    await cache.set('a', [1]);
    await cache.set('b', [2]);
    await cache.clear();
    expect(await cache.get('a')).toBeUndefined();
    expect(await cache.get('b')).toBeUndefined();
  });
});

describe('RedisEmbeddingCache', () => {
  let mockClient: any;

  beforeEach(() => {
    mockClient = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue('OK'),
      del: jest.fn().mockResolvedValue(1),
      scanIterator: jest.fn(),
    };
  });

  it('get returns undefined when key not found', async () => {
    const cache = new RedisEmbeddingCache(mockClient, 'mgm:', 0);
    expect(await cache.get('missing')).toBeUndefined();
    expect(mockClient.get).toHaveBeenCalled();
    // Key should be sha256 hashed
    const key = mockClient.get.mock.calls[0][0] as string;
    expect(key).toMatch(/^mgm:emb:[a-f0-9]{64}$/);
  });

  it('set and get a vector with TTL', async () => {
    const vec = [0.5, -0.3, 0.8];
    const encoded = float32ToBase64(vec);
    const cache = new RedisEmbeddingCache(mockClient, 'mgm:', 3600);

    await cache.set('hello', vec);
    expect(mockClient.set).toHaveBeenCalledTimes(1);
    const [setKey, setValue, setOpts] = mockClient.set.mock.calls[0];
    expect(setKey).toMatch(/^mgm:emb:[a-f0-9]{64}$/);
    expect(setValue).toBe(encoded);
    expect(setOpts).toEqual({ EX: 3600 });

    // Mock redis returning the value
    mockClient.get.mockResolvedValue(encoded);
    const result = await cache.get('hello');
    expect(result).toBeDefined();
    // Float32 encoding has precision limits, check approximate equality
    for (let i = 0; i < vec.length; i++) {
      expect(result![i]).toBeCloseTo(vec[i], 5);
    }
  });

  it('set without TTL when ttlSeconds is 0', async () => {
    const cache = new RedisEmbeddingCache(mockClient, 'test:', 0);
    await cache.set('hello', [1.0]);
    const [, , setOpts] = mockClient.set.mock.calls[0];
    expect(setOpts).toBeUndefined();
  });

  it('same text produces same hash key', async () => {
    const cache = new RedisEmbeddingCache(mockClient, 'mgm:', 0);
    await cache.get('same text');
    await cache.get('same text');
    const key1 = mockClient.get.mock.calls[0][0];
    const key2 = mockClient.get.mock.calls[1][0];
    expect(key1).toBe(key2);
  });

  it('different texts produce different hash keys', async () => {
    const cache = new RedisEmbeddingCache(mockClient, 'mgm:', 0);
    await cache.get('text a');
    await cache.get('text b');
    const key1 = mockClient.get.mock.calls[0][0];
    const key2 = mockClient.get.mock.calls[1][0];
    expect(key1).not.toBe(key2);
  });

  it('clear scans and deletes keys by pattern', async () => {
    const keys = ['mgm:emb:abc', 'mgm:emb:def'];
    mockClient.scanIterator.mockReturnValue((async function* () {
      for (const k of keys) yield k;
    })());

    const cache = new RedisEmbeddingCache(mockClient, 'mgm:', 0);
    await cache.clear();

    expect(mockClient.scanIterator).toHaveBeenCalledWith({ MATCH: 'mgm:emb:*', COUNT: 100 });
    expect(mockClient.del).toHaveBeenCalledTimes(2);
    expect(mockClient.del).toHaveBeenCalledWith('mgm:emb:abc');
    expect(mockClient.del).toHaveBeenCalledWith('mgm:emb:def');
  });
});
