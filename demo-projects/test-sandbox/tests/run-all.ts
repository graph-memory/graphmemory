/**
 * Test runner — executes all phases in order and prints combined summary.
 *
 * Usage:
 *   npx tsx tests/run-all.ts                # run all phases
 *   npx tsx tests/run-all.ts --phase 1 3    # run specific phases
 *   npx tsx tests/run-all.ts --phase 10 11  # run auth + oauth only
 *
 * Phases 1-9 require a running server on port 3737 (default sandbox).
 * Phases 10-18 start/stop their own servers with different configs.
 */

import { PhaseResult, printSummary } from './utils';

async function main() {
  const args = process.argv.slice(2);
  const phaseFilter = new Set<number>();

  const phaseIdx = args.indexOf('--phase');
  if (phaseIdx !== -1) {
    for (let i = phaseIdx + 1; i < args.length; i++) {
      const n = parseInt(args[i], 10);
      if (isNaN(n)) break;
      phaseFilter.add(n);
    }
  }

  const shouldRun = (n: number) => phaseFilter.size === 0 || phaseFilter.has(n);
  const results: PhaseResult[] = [];

  // Phases 1-9: require external server on port 3737
  if (shouldRun(1)) {
    const { run } = require('./01-server-indexing');
    results.push(await run());
  }

  if (shouldRun(2)) {
    const { run } = require('./02-knowledge');
    results.push(await run());
  }

  if (shouldRun(3)) {
    const { run } = require('./03-tasks');
    results.push(await run());
  }

  if (shouldRun(4)) {
    const { run } = require('./04-epics');
    results.push(await run());
  }

  if (shouldRun(5)) {
    const { run } = require('./05-skills');
    results.push(await run());
  }

  if (shouldRun(6)) {
    const { run } = require('./06-auth-oauth');
    results.push(await run());
  }

  if (shouldRun(7)) {
    const { run } = require('./07-embedding');
    results.push(await run());
  }

  if (shouldRun(8)) {
    const { run } = require('./08-edge-cases');
    results.push(await run());
  }

  if (shouldRun(9)) {
    const { run } = require('./09-db-filesystem');
    results.push(await run());
  }

  // Phases 10-18: self-contained (start/stop own servers)
  if (shouldRun(10)) {
    const { run } = require('./10-auth');
    results.push(await run());
  }

  if (shouldRun(11)) {
    const { run } = require('./11-oauth');
    results.push(await run());
  }

  if (shouldRun(12)) {
    const { run } = require('./12-embedding-api');
    results.push(await run());
  }

  if (shouldRun(13)) {
    const { run } = require('./13-websocket');
    results.push(await run());
  }

  if (shouldRun(14)) {
    const { run } = require('./14-watcher');
    results.push(await run());
  }

  if (shouldRun(15)) {
    const { run } = require('./15-workspace');
    results.push(await run());
  }

  if (shouldRun(16)) {
    const { run } = require('./16-ratelimit');
    results.push(await run());
  }

  if (shouldRun(17)) {
    const { run } = require('./17-concurrent');
    results.push(await run());
  }

  if (shouldRun(18)) {
    const { run } = require('./18-mirror-import');
    results.push(await run());
  }

  printSummary(results);

  const hasFails = results.some(r =>
    r.groups.some(g => g.tests.some(t => !t.passed)),
  );

  process.exit(hasFails ? 1 : 0);
}

main();
