import {
  hashPassword, verifyPassword,
  signAccessToken, signRefreshToken, verifyToken,
  parseTtl, resolveUserByEmail,
} from '@/lib/jwt';
import type { UserConfig } from '@/lib/multi-config';

describe('hashPassword / verifyPassword', () => {
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
    // Sign with 0 seconds TTL
    const token = signAccessToken('alice', secret, '0s');
    // Token expires immediately — but jwt allows 0s, it will be expired on verify
    // We need a small delay or just check that 0s produces an instantly-expired token
    const payload = verifyToken(token, secret);
    // jwt.sign with expiresIn: 0 sets exp to iat, so it's expired immediately
    expect(payload).toBeNull();
  });

  it('rejects garbage token', () => {
    expect(verifyToken('not.a.token', secret)).toBeNull();
    expect(verifyToken('', secret)).toBeNull();
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
