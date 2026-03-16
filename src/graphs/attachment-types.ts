import * as fs from 'fs';
import * as path from 'path';
import mime from 'mime';

export interface AttachmentMeta {
  filename: string;     // "screenshot.png"
  mimeType: string;     // "image/png"
  size: number;         // bytes
  addedAt: number;      // timestamp ms
}

/**
 * Scan a directory for attachment files (everything except the given exclude filename).
 * Returns metadata for each file found.
 */
export function scanAttachments(dir: string, exclude: string): AttachmentMeta[] {
  try {
    if (!fs.existsSync(dir)) return [];
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    const attachments: AttachmentMeta[] = [];

    for (const entry of entries) {
      if (!entry.isFile()) continue;
      if (entry.name === exclude) continue;

      const filePath = path.join(dir, entry.name);
      try {
        const stat = fs.statSync(filePath);
        attachments.push({
          filename: entry.name,
          mimeType: mime.getType(entry.name) ?? 'application/octet-stream',
          size: stat.size,
          addedAt: stat.birthtimeMs || stat.mtimeMs,
        });
      } catch { /* skip unreadable files */ }
    }

    return attachments;
  } catch {
    return [];
  }
}
