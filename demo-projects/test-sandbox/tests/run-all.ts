/**
 * Test runner — executes all phases in order and prints combined summary.
 *
 * Usage:
 *   npx tsx tests/run-all.ts              # run all phases
 *   npx tsx tests/run-all.ts --phase 1 3  # run specific phases
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

  printSummary(results);

  const hasFails = results.some(r =>
    r.groups.some(g => g.tests.some(t => !t.passed)),
  );

  process.exit(hasFails ? 1 : 0);
}

main();
