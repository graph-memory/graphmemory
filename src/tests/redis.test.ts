import { parseRedisTtl, REDIS_DEFAULTS } from '@/lib/redis';

// We can't test getRedisClient/closeRedis without a Redis server,
// but we can test the pure functions and defaults.

describe('Redis utilities', () => {
  describe('REDIS_DEFAULTS', () => {
    it('has correct default values', () => {
      expect(REDIS_DEFAULTS.enabled).toBe(false);
      expect(REDIS_DEFAULTS.url).toBe('redis://localhost:6379');
      expect(REDIS_DEFAULTS.prefix).toBe('mgm:');
      expect(REDIS_DEFAULTS.embeddingCacheTtl).toBe('30d');
    });
  });

  describe('parseRedisTtl', () => {
    it('returns 0 for "0"', () => {
      expect(parseRedisTtl('0')).toBe(0);
    });

    it('parses seconds', () => {
      expect(parseRedisTtl('30s')).toBe(30);
    });

    it('parses minutes', () => {
      expect(parseRedisTtl('10m')).toBe(600);
    });

    it('parses hours', () => {
      expect(parseRedisTtl('1h')).toBe(3600);
    });

    it('parses days', () => {
      expect(parseRedisTtl('7d')).toBe(604800);
    });

    it('parses combined durations', () => {
      expect(parseRedisTtl('1h30m')).toBe(5400);
    });

    it('parses 30d (default embedding cache TTL)', () => {
      expect(parseRedisTtl('30d')).toBe(2592000);
    });
  });
});
