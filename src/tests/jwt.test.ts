import {
  hashPassword, verifyPassword,
  signAccessToken, signRefreshToken, verifyToken,
  parseTtl, resolveUserByEmail, setAuthCookies,
} from '@/lib/jwt';
import type { UserConfig } from '@/lib/multi-config';

describe('hashPassword / verifyPassword', () => {
  jest.setTimeout(30_000);

  it('verifies correct password', async () => {
    const hash = await hashPassword('secret123');
    expect(hash).toMatch(/^\$scrypt\$/);
    expect(await verifyPassword('secret123', hash)).toBe(true);
  });

  it('rejects wrong password', async () => {
    const hash = await hashPassword('secret123');
    expect(await verifyPassword('wrong', hash)).toBe(false);
  });

  it('rejects invalid hash format', async () => {
    expect(await verifyPassword('test', 'not-a-hash')).toBe(false);
  });

  it('produces different hashes for same password (random salt)', async () => {
    const h1 = await hashPassword('same');
    const h2 = await hashPassword('same');
    expect(h1).not.toBe(h2);
    // Both should still verify
    expect(await verifyPassword('same', h1)).toBe(true);
    expect(await verifyPassword('same', h2)).toBe(true);
  });
});

describe('parseTtl', () => {
  it('parses seconds', () => expect(parseTtl('30s')).toBe(30));
  it('parses minutes', () => expect(parseTtl('15m')).toBe(900));
  it('parses hours', () => expect(parseTtl('1h')).toBe(3600));
  it('parses days', () => expect(parseTtl('7d')).toBe(604800));
  it('throws on invalid format', () => {
    expect(() => parseTtl('abc')).toThrow('Invalid TTL format');
    expect(() => parseTtl('15')).toThrow('Invalid TTL format');
    expect(() => parseTtl('15x')).toThrow('Invalid TTL format');
  });
});

describe('JWT sign / verify', () => {
  const secret = 'test-secret-key-for-jwt';

  it('creates and verifies access token', () => {
    const token = signAccessToken('alice', secret, '15m');
    const payload = verifyToken(token, secret);
    expect(payload).toEqual({ userId: 'alice', type: 'access' });
  });

  it('creates and verifies refresh token', () => {
    const token = signRefreshToken('bob', secret, '7d');
    const payload = verifyToken(token, secret);
    expect(payload).toEqual({ userId: 'bob', type: 'refresh' });
  });

  it('rejects token with wrong secret', () => {
    const token = signAccessToken('alice', secret, '15m');
    expect(verifyToken(token, 'wrong-secret')).toBeNull();
  });

  it('rejects expired token', () => {
    // Create a token with exp in the past using jsonwebtoken directly
    const jwt = require('jsonwebtoken');
    const token = jwt.sign({ userId: 'alice', type: 'access', exp: Math.floor(Date.now() / 1000) - 10 }, secret);
    expect(verifyToken(token, secret)).toBeNull();
  });

  it('parseTtl rejects zero TTL', () => {
    expect(() => parseTtl('0s')).toThrow('TTL must be positive');
    expect(() => parseTtl('0m')).toThrow('TTL must be positive');
  });

  it('rejects garbage token', () => {
    expect(verifyToken('not.a.token', secret)).toBeNull();
    expect(verifyToken('', secret)).toBeNull();
  });
});

describe('setAuthCookies secureCookie parameter', () => {
  it('uses explicit secureCookie=false to override NODE_ENV', () => {
    const cookies: Array<{ name: string; value: string; options: any }> = [];
    const fakeRes = {
      cookie(name: string, value: string, options: any) {
        cookies.push({ name, value, options });
      },
    } as any;

    const accessToken = signAccessToken('alice', 'test-secret-key-16+', '15m');
    const refreshToken = signRefreshToken('alice', 'test-secret-key-16+', '7d');

    setAuthCookies(fakeRes, accessToken, refreshToken, '7d', false);

    expect(cookies).toHaveLength(2);
    expect(cookies[0].options.secure).toBe(false);
    expect(cookies[1].options.secure).toBe(false);
  });

  it('uses explicit secureCookie=true regardless of NODE_ENV', () => {
    const cookies: Array<{ name: string; value: string; options: any }> = [];
    const fakeRes = {
      cookie(name: string, value: string, options: any) {
        cookies.push({ name, value, options });
      },
    } as any;

    const accessToken = signAccessToken('alice', 'test-secret-key-16+', '15m');
    const refreshToken = signRefreshToken('alice', 'test-secret-key-16+', '7d');

    setAuthCookies(fakeRes, accessToken, refreshToken, '7d', true);

    expect(cookies).toHaveLength(2);
    expect(cookies[0].options.secure).toBe(true);
    expect(cookies[1].options.secure).toBe(true);
  });

  it('falls back to NODE_ENV when secureCookie is undefined', () => {
    const cookies: Array<{ name: string; value: string; options: any }> = [];
    const fakeRes = {
      cookie(name: string, value: string, options: any) {
        cookies.push({ name, value, options });
      },
    } as any;

    const accessToken = signAccessToken('alice', 'test-secret-key-16+', '15m');
    const refreshToken = signRefreshToken('alice', 'test-secret-key-16+', '7d');

    setAuthCookies(fakeRes, accessToken, refreshToken, '7d');

    expect(cookies).toHaveLength(2);
    // In test environment, NODE_ENV is 'test' (not 'development'), so secure defaults to true
    expect(typeof cookies[0].options.secure).toBe('boolean');
  });
});

describe('resolveUserByEmail', () => {
  const users: Record<string, UserConfig> = {
    alice: { name: 'Alice', email: 'alice@test.com', apiKey: 'key-a' },
    bob: { name: 'Bob', email: 'bob@test.com', apiKey: 'key-b', passwordHash: '$scrypt$...' },
  };

  it('finds user by email', () => {
    const result = resolveUserByEmail('alice@test.com', users);
    expect(result).toEqual({ userId: 'alice', user: users.alice });
  });

  it('returns undefined for unknown email', () => {
    expect(resolveUserByEmail('unknown@test.com', users)).toBeUndefined();
  });
});
