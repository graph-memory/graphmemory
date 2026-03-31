import type { GraphName } from './common';

// ---------------------------------------------------------------------------
// Attachments Store (shared across all graphs)
// ---------------------------------------------------------------------------

export interface AttachmentMeta {
  filename: string;
  mimeType: string;
  size: number;
  addedAt: number;
}

export interface AttachmentRecord extends AttachmentMeta {
  graph: GraphName;
  entityId: number;
}

export interface AttachmentsStore {
  /** Add an attachment to an entity */
  add(graph: GraphName, entityId: number, filename: string, data: Buffer): AttachmentMeta;

  /** Remove an attachment from an entity */
  remove(graph: GraphName, entityId: number, filename: string): void;

  /** Remove all attachments for an entity (e.g. on delete) */
  removeAll(graph: GraphName, entityId: number): void;

  /** List attachments for an entity */
  list(graph: GraphName, entityId: number): AttachmentMeta[];

  /** Get attachment file path (for serving) */
  getPath(graph: GraphName, entityId: number, filename: string): string | null;
}
