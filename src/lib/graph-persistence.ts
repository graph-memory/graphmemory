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

/**
 * Basic structural validation for Graphology serialized graph data.
 * Ensures the shape matches what graph.import() expects, preventing
 * injection of unexpected properties.
 */
export function validateGraphStructure(data: unknown): boolean {
  if (data == null || typeof data !== 'object') return false;
  const obj = data as Record<string, unknown>;

  if (!Array.isArray(obj.nodes)) return false;
  if (!Array.isArray(obj.edges)) return false;

  for (const node of obj.nodes) {
    if (node == null || typeof node !== 'object') return false;
    const n = node as Record<string, unknown>;
    if (typeof n.key !== 'string') return false;
    if (n.attributes !== undefined) {
      if (n.attributes == null || typeof n.attributes !== 'object') return false;
      if (Object.prototype.hasOwnProperty.call(n.attributes, '__proto__') || Object.prototype.hasOwnProperty.call(n.attributes, 'constructor')) return false;
    }
  }

  for (const edge of obj.edges) {
    if (edge == null || typeof edge !== 'object') return false;
    const e = edge as Record<string, unknown>;
    if (typeof e.source !== 'string' || typeof e.target !== 'string') return false;
    if (e.attributes !== undefined) {
      if (e.attributes == null || typeof e.attributes !== 'object') return false;
      if (Object.prototype.hasOwnProperty.call(e.attributes, '__proto__') || Object.prototype.hasOwnProperty.call(e.attributes, 'constructor')) return false;
    }
  }

  return true;
}
