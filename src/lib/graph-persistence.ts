import * as fs from 'fs';

/**
 * Try to read and parse a JSON file, falling back to .tmp if main file
 * is missing or corrupted (recovery from interrupted save).
 */
export function readJsonWithTmpFallback(file: string): any | null {
  const tmp = file + '.tmp';

  // If main file missing but .tmp exists, recover it
  if (!fs.existsSync(file) && fs.existsSync(tmp)) {
    try { fs.renameSync(tmp, file); } catch { /* ignore */ }
  }

  if (fs.existsSync(file)) {
    try {
      return JSON.parse(fs.readFileSync(file, 'utf-8'));
    } catch {
      // Main file corrupted — try .tmp as fallback
      if (fs.existsSync(tmp)) {
        try {
          const data = JSON.parse(fs.readFileSync(tmp, 'utf-8'));
          process.stderr.write(`[graph] Recovered from .tmp file: ${file}\n`);
          return data;
        } catch { /* .tmp also bad */ }
      }
    }
  }

  return null;
}
