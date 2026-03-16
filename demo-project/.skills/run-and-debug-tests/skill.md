---
id: run-and-debug-tests
source: user
confidence: 1
triggers:
  - run tests
  - test failing
  - write test
  - debug test
inputHints:
  - test file or pattern
  - error output
filePatterns:
  - tests/**/*.test.ts
  - jest.config.ts
tags:
  - testing
  - debugging
createdAt: 2026-03-16T20:40:55.251Z
updatedAt: 2026-03-16T20:40:55.251Z
---

# Run and Debug Tests

How to run the test suite, debug failing tests, and write new tests for the TaskFlow project.

## Steps
1. Run all tests: npm test
2. Run specific suite: npm test -- --testPathPatterns=auth
3. Debug with inspector: node --inspect-brk node_modules/.bin/jest --testPathPatterns=auth
4. Check test database connection in .env.test
5. Reset test database: npm run db:test:reset
