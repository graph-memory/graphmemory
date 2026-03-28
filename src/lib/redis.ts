import { createClient, type RedisClientType } from 'redis';
import { parseDuration } from '@/lib/duration';

export interface RedisConfig {
  enabled: boolean;
  url: string;
  prefix: string;
  embeddingCacheTtl: string;  // e.g. "30d", "0" = no TTL
}

export const REDIS_DEFAULTS: RedisConfig = {
  enabled: false,
  url: 'redis://localhost:6379',
  prefix: 'mgm:',
  embeddingCacheTtl: '30d',
};

let _client: RedisClientType | null = null;

/**
 * Get or create a shared Redis client. Returns null if not configured.
 */
export async function getRedisClient(config: RedisConfig): Promise<RedisClientType> {
  if (_client) return _client;

  const client = createClient({ url: config.url }) as RedisClientType;

  client.on('error', (err) => {
    process.stderr.write(`[redis] Error: ${err.message}\n`);
  });

  client.on('reconnecting', () => {
    process.stderr.write('[redis] Reconnecting...\n');
  });

  await client.connect();
  process.stderr.write(`[redis] Connected to ${config.url}\n`);

  _client = client;
  return client;
}

/**
 * Close the shared Redis client.
 */
export async function closeRedis(): Promise<void> {
  if (_client) {
    await _client.quit();
    _client = null;
    process.stderr.write('[redis] Connection closed\n');
  }
}

/**
 * Parse TTL string to seconds (reuse logic from jwt.ts parseTtl).
 * Returns 0 for "0" meaning no TTL.
 */
export function parseRedisTtl(ttl: string): number {
  if (ttl === '0') return 0;
  return parseDuration(ttl);
}
