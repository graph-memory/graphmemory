import { compressEmbeddings, decompressEmbeddings, float32ToBase64, base64ToFloat32 } from '@/lib/embedding-codec';

describe('float32ToBase64 / base64ToFloat32', () => {
  it('round-trips typical embedding values', () => {
    const original = [0.1, -0.5, 3.14, 0, -1e10, 1e-10, 1, -1];
    const b64 = float32ToBase64(original);
    const decoded = base64ToFloat32(b64);
    expect(decoded.length).toBe(original.length);
    for (let i = 0; i < original.length; i++) {
      expect(decoded[i]).toBeCloseTo(original[i], 5);
    }
  });

  it('round-trips empty array', () => {
    const b64 = float32ToBase64([]);
    expect(b64).toBe('');
    const decoded = base64ToFloat32(b64);
    expect(decoded).toEqual([]);
  });

  it('round-trips single element', () => {
    const b64 = float32ToBase64([42.5]);
    const decoded = base64ToFloat32(b64);
    expect(decoded.length).toBe(1);
    expect(decoded[0]).toBeCloseTo(42.5);
  });

  it('round-trips 384-dim vector', () => {
    const original = Array.from({ length: 384 }, (_, i) => Math.sin(i * 0.1));
    const b64 = float32ToBase64(original);
    const decoded = base64ToFloat32(b64);
    expect(decoded.length).toBe(384);
    for (let i = 0; i < original.length; i++) {
      expect(decoded[i]).toBeCloseTo(original[i], 5);
    }
  });

  it('produces valid base64 string', () => {
    const b64 = float32ToBase64([1.0, 2.0, 3.0]);
    expect(typeof b64).toBe('string');
    expect(b64).toMatch(/^[A-Za-z0-9+/=]*$/);
  });

  it('handles special float values', () => {
    const original = [0, -0, Infinity, -Infinity, NaN];
    const b64 = float32ToBase64(original);
    const decoded = base64ToFloat32(b64);
    expect(decoded[0]).toBe(0);
    expect(Object.is(decoded[1], -0)).toBe(true);
    expect(decoded[2]).toBe(Infinity);
    expect(decoded[3]).toBe(-Infinity);
    expect(Number.isNaN(decoded[4])).toBe(true);
  });
});

describe('compressEmbeddings / decompressEmbeddings', () => {
  it('compresses and decompresses embedding fields', () => {
    const exported = {
      nodes: [
        { attributes: { title: 'test', embedding: [0.1, 0.2, 0.3], fileEmbedding: [0.4, 0.5] } },
        { attributes: { title: 'no-embed', embedding: [] } },
      ],
    };
    compressEmbeddings(exported);
    expect(typeof exported.nodes[0].attributes.embedding).toBe('string');
    expect(typeof exported.nodes[0].attributes.fileEmbedding).toBe('string');
    expect(exported.nodes[1].attributes.embedding).toEqual([]);

    decompressEmbeddings(exported);
    const emb = exported.nodes[0].attributes.embedding as unknown as number[];
    expect(Array.isArray(emb)).toBe(true);
    expect(emb.length).toBe(3);
    expect(emb[0]).toBeCloseTo(0.1);
  });

  it('handles null/undefined gracefully', () => {
    expect(() => compressEmbeddings(null)).not.toThrow();
    expect(() => compressEmbeddings({})).not.toThrow();
    expect(() => decompressEmbeddings(null)).not.toThrow();
  });

  it('preserves old number[] format on decompress', () => {
    const exported = { nodes: [{ attributes: { embedding: [0.1, 0.2] } }] };
    decompressEmbeddings(exported);
    expect(exported.nodes[0].attributes.embedding).toEqual([0.1, 0.2]);
  });
});
