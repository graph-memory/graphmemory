---
id: database-migration-strategy
tags:
  - database
  - migrations
createdAt: 2026-03-16T20:40:54.814Z
updatedAt: 2026-03-16T20:40:54.814Z
---

# Database Migration Strategy

Migrations are SQL files in the migrations/ directory, numbered sequentially. We use a simple migration runner that tracks applied migrations in a migrations table. Rollbacks are manual SQL. We considered an ORM (Prisma, TypeORM) but raw SQL gives us more control over indexes and complex queries.
