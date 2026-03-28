import parse from 'parse-duration';

/**
 * Parse a human-readable duration string into seconds.
 * Supports combined formats: "1d2h", "1h30m", "30s", "7d", etc.
 * @returns duration in seconds
 */
export function parseDuration(input: string): number {
  const ms = parse(input);
  if (ms == null || ms <= 0) {
    throw new Error(`Invalid duration: "${input}". Expected e.g. "15m", "1h", "7d", "1d2h".`);
  }
  return Math.round(ms / 1000);
}
