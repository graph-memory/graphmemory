/**
 * Cryptographic utility functions for the ShopFlow API Gateway.
 * Provides password hashing, secure token generation, and timing-safe comparison.
 * Uses Node.js built-in crypto module — no external dependencies.
 */

import { createHash, randomBytes, timingSafeEqual } from 'crypto';

/** Salt length in bytes for password hashing */
const SALT_LENGTH = 32;

/** Number of iterations for PBKDF2-style stretching */
const HASH_ITERATIONS = 10000;

/**
 * Hashes a plaintext password with a random salt.
 * Returns a string in the format `salt:hash` for storage.
 * @param password - The plaintext password to hash
 * @returns Salt and hash joined by a colon
 */
export function hashPassword(password: string): string {
  const salt = randomBytes(SALT_LENGTH).toString('hex');
  const hash = stretchPassword(password, salt);
  return `${salt}:${hash}`;
}

/**
 * Compares a plaintext password against a stored salt:hash pair.
 * Uses constant-time comparison to prevent timing attacks.
 * @param password - The plaintext password to verify
 * @param stored - The stored `salt:hash` string
 * @returns True if the password matches
 */
export function comparePassword(password: string, stored: string): boolean {
  const [salt, expectedHash] = stored.split(':');
  if (!salt || !expectedHash) return false;

  const actualHash = stretchPassword(password, salt);
  return constantTimeEqual(actualHash, expectedHash);
}

/**
 * Generates a cryptographically secure random token.
 * Suitable for refresh tokens, session IDs, and CSRF tokens.
 * @param length - Token length in bytes (default 48, yielding 64 hex chars)
 * @returns Hex-encoded random token
 */
export function generateToken(length: number = 48): string {
  return randomBytes(length).toString('hex');
}

/**
 * Performs a constant-time string comparison to prevent timing attacks.
 * Both strings are hashed first to ensure equal length for timingSafeEqual.
 * @param a - First string
 * @param b - Second string
 * @returns True if the strings are equal
 */
export function constantTimeEqual(a: string, b: string): boolean {
  const bufA = createHash('sha256').update(a).digest();
  const bufB = createHash('sha256').update(b).digest();
  return timingSafeEqual(bufA, bufB);
}

/**
 * Stretches a password with a salt using iterated SHA-256.
 * This is a simplified PBKDF2-like approach for demonstration purposes.
 * Production systems should use bcrypt, scrypt, or argon2.
 */
function stretchPassword(password: string, salt: string): string {
  let hash = `${salt}:${password}`;
  for (let i = 0; i < HASH_ITERATIONS; i++) {
    hash = createHash('sha256').update(hash).digest('hex');
  }
  return hash;
}
