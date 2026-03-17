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
 * Scan the attachments/ subdirectory of an entity directory.
 * Returns metadata for each file found.
 */
export function scanAttachments(entityDir: string): AttachmentMeta[] {
  try {
    const attachmentsDir = path.join(entityDir, 'attachments');
    if (!fs.existsSync(attachmentsDir)) return [];
    const entries = fs.readdirSync(attachmentsDir, { withFileTypes: true });
    const attachments: AttachmentMeta[] = [];

    for (const entry of entries) {
      if (!entry.isFile()) continue;

      const filePath = path.join(attachmentsDir, entry.name);
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
