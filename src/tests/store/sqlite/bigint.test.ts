import { num, now } from '@/store/sqlite/lib/bigint';

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
