---
id: add-database-migration
source: user
confidence: 1
triggers:
  - add migration
  - change schema
  - alter table
  - new column
  - database change
inputHints:
  - table name
  - column details
  - change description
filePatterns:
  - migrations/*.sql
tags:
  - database
  - migrations
createdAt: 2026-03-16T20:40:55.277Z
updatedAt: 2026-03-16T20:40:55.277Z
---

# Add Database Migration

How to create and apply database migrations for schema changes in the TaskFlow project.

## Steps
1. Create migration file: npm run migration:create -- --name=description
2. Write UP SQL (schema change) in migrations/NNN_description.up.sql
3. Write DOWN SQL (rollback) in migrations/NNN_description.down.sql
4. Test locally: npm run db:migrate
5. Verify with: npm run db:status
6. Test rollback: npm run db:rollback
