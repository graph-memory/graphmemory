import fs from 'fs';
import os from 'os';
import path from 'path';
import { readJsonWithTmpFallback } from '@/lib/graph-persistence';

describe('readJsonWithTmpFallback', () => {
  let tmpDir: string;
  beforeEach(() => { tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gm-test-')); });
  afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }); });

  it('reads main file when it exists', () => {
    const file = path.join(tmpDir, 'test.json');
    fs.writeFileSync(file, JSON.stringify({ ok: true }));
    expect(readJsonWithTmpFallback(file)).toEqual({ ok: true });
  });

  it('recovers from .tmp when main file missing', () => {
    const file = path.join(tmpDir, 'test.json');
    fs.writeFileSync(file + '.tmp', JSON.stringify({ recovered: true }));
    const data = readJsonWithTmpFallback(file);
    expect(data).toEqual({ recovered: true });
    // .tmp should have been renamed to main
    expect(fs.existsSync(file)).toBe(true);
  });

  it('falls back to .tmp when main file corrupted', () => {
    const file = path.join(tmpDir, 'test.json');
    fs.writeFileSync(file, 'not json{{{');
    fs.writeFileSync(file + '.tmp', JSON.stringify({ fallback: true }));
    expect(readJsonWithTmpFallback(file)).toEqual({ fallback: true });
  });

  it('returns null when both files corrupted', () => {
    const file = path.join(tmpDir, 'test.json');
    fs.writeFileSync(file, 'broken');
    fs.writeFileSync(file + '.tmp', 'also broken');
    expect(readJsonWithTmpFallback(file)).toBeNull();
  });

  it('returns null when no files exist', () => {
    const file = path.join(tmpDir, 'nonexistent.json');
    expect(readJsonWithTmpFallback(file)).toBeNull();
  });
});
