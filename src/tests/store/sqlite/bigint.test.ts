import { num, now, likeEscape, assertEmbeddingDim, chunk, safeJson } from '@/store/sqlite/lib/bigint';

describe('BigInt helpers', () => {
  it('num converts BigInt to number', () => {
    expect(num(BigInt(42))).toBe(42);
    expect(num(BigInt(0))).toBe(0);
    expect(num(BigInt(-1))).toBe(-1);
  });

  it('num passes through number unchanged', () => {
    expect(num(42)).toBe(42);
    expect(num(0)).toBe(0);
  });

  it('now returns BigInt timestamp in ms', () => {
    const before = BigInt(Date.now());
    const ts = now();
    const after = BigInt(Date.now());

    expect(typeof ts).toBe('bigint');
    expect(ts >= before).toBe(true);
    expect(ts <= after).toBe(true);
  });
});

describe('likeEscape', () => {
  it('escapes % and _ characters', () => {
    expect(likeEscape('100%')).toBe('100\\%');
    expect(likeEscape('file_name')).toBe('file\\_name');
  });

  it('escapes backslashes', () => {
    expect(likeEscape('path\\to')).toBe('path\\\\to');
  });

  it('handles combined special characters', () => {
    expect(likeEscape('50%_done\\ok')).toBe('50\\%\\_done\\\\ok');
  });

  it('returns plain text unchanged', () => {
    expect(likeEscape('hello world')).toBe('hello world');
  });
});

describe('assertEmbeddingDim', () => {
  it('passes for correct dimension', () => {
    expect(() => assertEmbeddingDim([1, 2, 3], 3)).not.toThrow();
  });

  it('throws for wrong dimension', () => {
    expect(() => assertEmbeddingDim([1, 2], 3)).toThrow('Embedding dimension mismatch: expected 3, got 2');
  });

  it('throws for empty embedding', () => {
    expect(() => assertEmbeddingDim([], 384)).toThrow('expected 384, got 0');
  });
});

describe('chunk', () => {
  it('returns single chunk for small array', () => {
    const result = chunk([1, 2, 3], 10);
    expect(result).toEqual([[1, 2, 3]]);
  });

  it('splits array into multiple chunks', () => {
    const result = chunk([1, 2, 3, 4, 5], 2);
    expect(result).toEqual([[1, 2], [3, 4], [5]]);
  });

  it('handles empty array', () => {
    const result = chunk([], 10);
    expect(result).toEqual([[]]);
  });

  it('handles exact chunk size', () => {
    const result = chunk([1, 2, 3, 4], 2);
    expect(result).toEqual([[1, 2], [3, 4]]);
  });
});

describe('safeJson', () => {
  it('parses valid JSON', () => {
    expect(safeJson('["a","b"]', [])).toEqual(['a', 'b']);
    expect(safeJson('{"x":1}', {})).toEqual({ x: 1 });
  });

  it('returns fallback for invalid JSON', () => {
    expect(safeJson('not json', [])).toEqual([]);
    expect(safeJson('{broken', 'default')).toBe('default');
  });

  it('returns fallback for empty string', () => {
    expect(safeJson('', null)).toBeNull();
  });
});
