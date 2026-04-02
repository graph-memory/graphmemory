import type { Migration } from '../lib/migrate';

export const v002: Migration = {
  version: 2,
  sql: `
-- Composite index for attachment lookups (project_id, graph, entity_id)
CREATE INDEX IF NOT EXISTS idx_attachments_entity ON attachments(project_id, graph, entity_id);
`,
};
