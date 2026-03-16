---
id: troubleshoot-database-connection
source: user
confidence: 1
triggers:
  - database down
  - connection refused
  - pool exhausted
  - db timeout
  - cannot connect to database
inputHints:
  - error message
  - database host
filePatterns:
  - src/config/database.ts
  - .env
tags:
  - database
  - debugging
  - ops
createdAt: 2026-03-16T20:40:55.304Z
updatedAt: 2026-03-16T20:40:55.304Z
---

# Troubleshoot Database Connection

Diagnose and fix database connectivity issues.

## Steps
1. Check DATABASE_URL in .env
2. Verify PostgreSQL is running: pg_isready
3. Test connection: psql DATABASE_URL with SELECT 1
4. Check connection pool stats in /health endpoint
5. If pool exhausted: restart service and check for connection leaks
6. Review slow query log for blocking queries
