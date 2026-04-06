import { verifyToken, signAccessToken, signRefreshToken } from '@/lib/jwt';

const SECRET = 'test-secret-key-for-jwt-edge-cases';

describe('JWT edge cases', () => {
  describe('tampered tokens', () => {
    it('rejects token with modified payload', () => {
      const token = signAccessToken('alice', SECRET, '15m');
      // Tamper with the payload (middle segment)
      const parts = token.split('.');
      // Decode payload, modify, re-encode
      const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
      payload.userId = 'evil';
      parts[1] = Buffer.from(JSON.stringify(payload)).toString('base64url');
      const tampered = parts.join('.');

      expect(verifyToken(tampered, SECRET)).toBeNull();
    });

    it('rejects token with truncated signature', () => {
      const token = signAccessToken('alice', SECRET, '15m');
      const parts = token.split('.');
      parts[2] = parts[2].slice(0, 10);
      expect(verifyToken(parts.join('.'), SECRET)).toBeNull();
    });

    it('rejects token with empty signature', () => {
      const token = signAccessToken('alice', SECRET, '15m');
      const parts = token.split('.');
      parts[2] = '';
      expect(verifyToken(parts.join('.'), SECRET)).toBeNull();
    });
  });

  describe('"none" algorithm attack', () => {
    it('rejects token with alg:none', () => {
      // Craft a token with alg=none (no signature)
      const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
      const payload = Buffer.from(JSON.stringify({ userId: 'admin', type: 'access', exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url');
      const fakeToken = `${header}.${payload}.`;

      expect(verifyToken(fakeToken, SECRET)).toBeNull();
    });
  });

  describe('malformed tokens', () => {
    it('rejects null', () => {
      expect(verifyToken(null as any, SECRET)).toBeNull();
    });

    it('rejects undefined', () => {
      expect(verifyToken(undefined as any, SECRET)).toBeNull();
    });

    it('rejects number', () => {
      expect(verifyToken(123 as any, SECRET)).toBeNull();
    });

    it('rejects token with only two segments', () => {
      expect(verifyToken('abc.def', SECRET)).toBeNull();
    });

    it('rejects token with four segments', () => {
      expect(verifyToken('a.b.c.d', SECRET)).toBeNull();
    });

    it('rejects base64-invalid token', () => {
      expect(verifyToken('not!valid.base64.here', SECRET)).toBeNull();
    });
  });

  describe('expired tokens', () => {
    it('rejects token expired 1 second ago', () => {
      const jwt = require('jsonwebtoken');
      const token = jwt.sign(
        { userId: 'alice', type: 'access', exp: Math.floor(Date.now() / 1000) - 1 },
        SECRET,
      );
      expect(verifyToken(token, SECRET)).toBeNull();
    });

    it('rejects token expired long ago', () => {
      const jwt = require('jsonwebtoken');
      const token = jwt.sign(
        { userId: 'alice', type: 'access', exp: Math.floor(Date.now() / 1000) - 86400 },
        SECRET,
      );
      expect(verifyToken(token, SECRET)).toBeNull();
    });
  });

  describe('token type validation', () => {
    it('access token has type "access"', () => {
      const token = signAccessToken('alice', SECRET, '15m');
      const payload = verifyToken(token, SECRET);
      expect(payload).toEqual({ userId: 'alice', type: 'access' });
    });

    it('refresh token has type "refresh"', () => {
      const token = signRefreshToken('alice', SECRET, '7d');
      const payload = verifyToken(token, SECRET);
      expect(payload).toEqual({ userId: 'alice', type: 'refresh' });
    });
  });

  describe('different secrets', () => {
    it('token signed with secret A cannot be verified with secret B', () => {
      const token = signAccessToken('alice', 'secret-A-long-enough', '15m');
      expect(verifyToken(token, 'secret-B-long-enough')).toBeNull();
    });

    it('empty secret throws (jsonwebtoken rejects empty keys)', () => {
      expect(() => signAccessToken('alice', '', '15m')).toThrow();
    });
  });
});
