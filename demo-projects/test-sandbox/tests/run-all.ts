/**
 * Test runner — fully autonomous, starts/stops servers as needed.
 *
 * Usage:
 *   npx tsx tests/run-all.ts              # run all 18 phases
 *   npx tsx tests/run-all.ts --phase 1 3  # run specific phases
 *   npx tsx tests/run-all.ts --phase 10   # run auth only
 *
 * Lifecycle:
 *   Phases 1-9:   share one sandbox server (port 3737) — started once, stopped after phase 9
 *   Phases 10-18: each starts/stops its own server with a dedicated config
 */

import { PhaseResult, printSummary, startServer, stopServer } from './utils';

// ─── Phase registry ──────────────────────────────────────────────

interface PhaseEntry {
  id: number;
  file: string;
  group: 'sandbox' | 'self'; // sandbox = needs shared server, self = manages own
}

const PHASES: PhaseEntry[] = [
  { id: 1,  file: './01-server-indexing',  group: 'sandbox' },
  { id: 2,  file: './02-knowledge',        group: 'sandbox' },
  { id: 3,  file: './03-tasks',            group: 'sandbox' },
  { id: 4,  file: './04-epics',            group: 'sandbox' },
  { id: 5,  file: './05-skills',           group: 'sandbox' },
  { id: 6,  file: './06-auth-oauth',       group: 'sandbox' },
  { id: 7,  file: './07-embedding',        group: 'sandbox' },
  { id: 8,  file: './08-edge-cases',       group: 'sandbox' },
  { id: 9,  file: './09-db-filesystem',    group: 'sandbox' },
  { id: 10, file: './10-auth',             group: 'self' },
  { id: 11, file: './11-oauth',            group: 'self' },
  { id: 12, file: './12-embedding-api',    group: 'self' },
  { id: 13, file: './13-websocket',        group: 'self' },
  { id: 14, file: './14-watcher',          group: 'self' },
  { id: 15, file: './15-workspace',        group: 'self' },
  { id: 16, file: './16-ratelimit',        group: 'self' },
  { id: 17, file: './17-concurrent',       group: 'self' },
  { id: 18, file: './18-mirror-import',    group: 'self' },
];

// ─── Main ────────────────────────────────────────────────────────

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
  const startTime = Date.now();

  // ── Sandbox phases (1-9): shared server ──────────────────────
  const sandboxPhases = PHASES.filter(p => p.group === 'sandbox' && shouldRun(p.id));
  if (sandboxPhases.length > 0) {
    console.log('\n  Starting sandbox server (port 3737)...');
    await startServer({ config: 'graph-memory.yaml', port: 3737 });
    console.log('  Server ready.\n');

    for (const phase of sandboxPhases) {
      const { run } = require(phase.file);
      results.push(await run());
    }

    stopServer();
    console.log('\n  Sandbox server stopped.\n');
  }

  // ── Self-contained phases (10-18): each manages own server ───
  const selfPhases = PHASES.filter(p => p.group === 'self' && shouldRun(p.id));
  for (const phase of selfPhases) {
    const { run } = require(phase.file);
    results.push(await run());
  }

  // ── Summary ──────────────────────────────────────────────────
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  printSummary(results);
  console.log(`  Duration: ${elapsed}s\n`);

  const hasFails = results.some(r =>
    r.groups.some(g => g.tests.some(t => !t.passed)),
  );

  process.exit(hasFails ? 1 : 0);
}

main();
