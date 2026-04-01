import type { GraphName } from './common';

// ---------------------------------------------------------------------------
// Attachments Store (metadata registry, files stored externally)
// ---------------------------------------------------------------------------

export interface AttachmentMeta {
  filename: string;
  mimeType: string;
  size: number;
  /** Optional external URL (S3, CDN). If absent — file is in mirror directory */
  url?: string;
  addedAt: number;
}

export interface AttachmentsStore {
  /** Register an attachment */
  add(graph: GraphName, entityId: number, meta: AttachmentMeta): void;

  /** Remove an attachment record */
  remove(graph: GraphName, entityId: number, filename: string): void;

  /** Remove all attachment records for an entity */
  removeAll(graph: GraphName, entityId: number): void;

  /** List attachments for an entity */
  list(graph: GraphName, entityId: number): AttachmentMeta[];
}
