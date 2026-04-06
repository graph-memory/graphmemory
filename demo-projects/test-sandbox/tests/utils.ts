/**
 * Shared test utilities for functional testing.
 *
 * Provides: REST helpers, MCP tool caller, assertions, reporting.
 */

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:3737';
const PROJECT = process.env.PROJECT_ID ?? 'sandbox';
const API = `${BASE}/api/projects/${PROJECT}`;

// ─── Result types ────────────────────────────────────────────────

export interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
  duration: number;
}

export interface GroupResult {
  group: string;
  tests: TestResult[];
}

export interface PhaseResult {
  phase: string;
  groups: GroupResult[];
}

// ─── REST helpers ────────────────────────────────────────────────

type Method = 'GET' | 'POST' | 'PUT' | 'DELETE';

interface RestResponse<T = any> {
  status: number;
  ok: boolean;
  data: T;
  headers: Headers;
}

export async function rest<T = any>(
  method: Method,
  path: string,
  body?: any,
): Promise<RestResponse<T>> {
  const url = path.startsWith('http')
    ? path
    : path.startsWith('/api/')
      ? `${BASE}${path}`
      : `${API}${path}`;

  const opts: RequestInit = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (body !== undefined) {
    opts.body = JSON.stringify(body);
  }

  const res = await fetch(url, opts);
  let data: any = null;
  const ct = res.headers.get('content-type') ?? '';
  if (ct.includes('application/json')) {
    data = await res.json();
  } else if (res.status !== 204) {
    data = await res.text();
  }

  return { status: res.status, ok: res.ok, data, headers: res.headers };
}

export const get = <T = any>(path: string) => rest<T>('GET', path);
export const post = <T = any>(path: string, body?: any) => rest<T>('POST', path, body);
export const put = <T = any>(path: string, body?: any) => rest<T>('PUT', path, body);
export const del = <T = any>(path: string, body?: any) => rest<T>('DELETE', path, body);

// ─── MCP tool caller (via REST tools explorer) ──────────────────

export async function mcpCall<T = any>(
  toolName: string,
  args: Record<string, any> = {},
): Promise<{ data: T; duration: number; isError: boolean }> {
  const res = await post(`/tools/${toolName}/call`, { arguments: args });
  if (!res.ok) {
    return { data: res.data, duration: 0, isError: true };
  }

  // tools/call returns { result: [...content], isError, duration }
  const raw = res.data;
  const resultArr = Array.isArray(raw?.result) ? raw.result : raw?.result?.content ?? [];
  const content = resultArr[0];
  let parsed: any;
  if (content?.type === 'text') {
    try {
      parsed = JSON.parse(content.text);
    } catch {
      parsed = content.text;
    }
  } else {
    parsed = content;
  }

  const isError = raw?.isError ?? raw?.result?.isError ?? false;
  return { data: parsed as T, duration: raw.duration ?? 0, isError };
}

// ─── Assertions ──────────────────────────────────────────────────

export class AssertionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AssertionError';
  }
}

export function assert(condition: boolean, message: string): void {
  if (!condition) throw new AssertionError(message);
}

export function assertEqual(actual: any, expected: any, label?: string): void {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) {
    throw new AssertionError(
      `${label ? label + ': ' : ''}expected ${e}, got ${a}`,
    );
  }
}

export function assertIncludes(arr: any[], predicate: (item: any) => boolean, label?: string): void {
  if (!arr.some(predicate)) {
    throw new AssertionError(
      `${label ? label + ': ' : ''}no matching item in array (${arr.length} items)`,
    );
  }
}

export function assertExists(value: any, label?: string): void {
  if (value === null || value === undefined) {
    throw new AssertionError(`${label ? label + ': ' : ''}expected value to exist`);
  }
}

export function assertStatus(res: RestResponse, expected: number, label?: string): void {
  if (res.status !== expected) {
    const detail = typeof res.data === 'object' ? JSON.stringify(res.data) : res.data;
    throw new AssertionError(
      `${label ? label + ': ' : ''}expected status ${expected}, got ${res.status} — ${detail}`,
    );
  }
}

export function assertOk(res: RestResponse, label?: string): void {
  if (!res.ok) {
    const detail = typeof res.data === 'object' ? JSON.stringify(res.data) : res.data;
    throw new AssertionError(
      `${label ? label + ': ' : ''}request failed with status ${res.status} — ${detail}`,
    );
  }
}

export function assertMcpOk(result: { isError: boolean; data: any }, label?: string): void {
  if (result.isError) {
    const detail = typeof result.data === 'object' ? JSON.stringify(result.data) : result.data;
    throw new AssertionError(
      `${label ? label + ': ' : ''}MCP tool returned error — ${detail}`,
    );
  }
}

// ─── Test runner ─────────────────────────────────────────────────

type TestFn = () => Promise<void>;

interface TestEntry {
  name: string;
  fn: TestFn;
}

let currentGroup: string = '';
let groups: Map<string, TestEntry[]> = new Map();

export function group(name: string): void {
  currentGroup = name;
  if (!groups.has(name)) groups.set(name, []);
}

export function test(name: string, fn: TestFn): void {
  const g = currentGroup || 'default';
  if (!groups.has(g)) groups.set(g, []);
  groups.get(g)!.push({ name, fn });
}

export async function runPhase(phaseName: string): Promise<PhaseResult> {
  const result: PhaseResult = { phase: phaseName, groups: [] };
  let totalPass = 0;
  let totalFail = 0;

  console.log(`\n${'='.repeat(60)}`);
  console.log(`  ${phaseName}`);
  console.log('='.repeat(60));

  for (const [groupName, tests] of groups) {
    const groupResult: GroupResult = { group: groupName, tests: [] };
    console.log(`\n  ${groupName}`);

    for (const t of tests) {
      const start = performance.now();
      try {
        await t.fn();
        const duration = performance.now() - start;
        groupResult.tests.push({ name: t.name, passed: true, duration });
        console.log(`    ✓ ${t.name} (${duration.toFixed(0)}ms)`);
        totalPass++;
      } catch (err: any) {
        const duration = performance.now() - start;
        const msg = err?.message ?? String(err);
        groupResult.tests.push({ name: t.name, passed: false, error: msg, duration });
        console.log(`    ✗ ${t.name} (${duration.toFixed(0)}ms)`);
        console.log(`      → ${msg}`);
        totalFail++;
      }
    }

    result.groups.push(groupResult);
  }

  console.log(`\n  ${'─'.repeat(40)}`);
  console.log(`  Results: ${totalPass} passed, ${totalFail} failed, ${totalPass + totalFail} total`);
  console.log('');

  // Reset for next phase
  groups = new Map();
  currentGroup = '';

  return result;
}

// ─── Report ──────────────────────────────────────────────────────

export function printSummary(results: PhaseResult[]): void {
  console.log('\n' + '='.repeat(60));
  console.log('  SUMMARY');
  console.log('='.repeat(60));

  let totalPass = 0;
  let totalFail = 0;
  const bugs: { phase: string; test: string; error: string }[] = [];

  for (const phase of results) {
    let pp = 0;
    let pf = 0;
    for (const g of phase.groups) {
      for (const t of g.tests) {
        if (t.passed) pp++;
        else {
          pf++;
          bugs.push({ phase: phase.phase, test: t.name, error: t.error! });
        }
      }
    }
    totalPass += pp;
    totalFail += pf;
    const icon = pf === 0 ? '✓' : '✗';
    console.log(`  ${icon} ${phase.phase}: ${pp}/${pp + pf}`);
  }

  console.log(`\n  Total: ${totalPass} passed, ${totalFail} failed, ${totalPass + totalFail} total`);

  if (bugs.length > 0) {
    console.log(`\n  ${'─'.repeat(40)}`);
    console.log('  FAILURES:\n');
    for (const b of bugs) {
      console.log(`  [${b.phase}] ${b.test}`);
      console.log(`    → ${b.error}\n`);
    }
  }
}

// ─── Filesystem helpers ──────────────────────────────────────────

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

export function fileExists(path: string): boolean {
  return existsSync(path);
}

export function readFile(path: string): string {
  return readFileSync(path, 'utf-8');
}

export function projectPath(...segments: string[]): string {
  const projectDir = process.env.PROJECT_DIR
    ?? join(__dirname, '..');
  return join(projectDir, ...segments);
}

// ─── Wait helper ─────────────────────────────────────────────────

export function wait(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ─── Exports ─────────────────────────────────────────────────────

export { BASE, PROJECT, API };
