import { loadModel, embed, embedQuery, cosineSimilarity } from '@/lib/embedder';

describe('embedder', () => {
  beforeAll(async () => {
    await loadModel({
      model: 'Xenova/bge-m3',
      pooling: 'cls',
      normalize: true,
      queryPrefix: '',
      documentPrefix: '',
    }, './models', 4000);
  }, 60_000);

  it.each([
    { a: 'JWT authentication token', b: 'OAuth2 access token refresh',  expected: 'close' },
    { a: 'JWT authentication token', b: 'database migration scripts',    expected: 'far'   },
    { a: 'deploy to kubernetes',      b: 'k8s deployment configuration', expected: 'close' },
  ])('similarity: "$a" vs "$b" should be $expected', async ({ a, b, expected }) => {
    const va = await embed(a, '');
    const vb = await embed(b, '');
    const score = cosineSimilarity(va, vb);
    const actual = score > 0.7 ? 'close' : 'far';
    expect(actual).toBe(expected);
  }, 60_000);

  it('self-similarity should be ~1.0 (L2-normalized vectors)', async () => {
    const v = await embed('test', '');
    const selfSim = cosineSimilarity(v, v);
    expect(Math.abs(selfSim - 1)).toBeLessThan(1e-5);
  }, 60_000);

  it('embedQuery applies queryPrefix (different from embed)', async () => {
    const doc = await embed('auth', '');
    const query = await embedQuery('auth');
    // With empty prefixes they should be very similar but embed wraps as "title\ncontent"
    const sim = cosineSimilarity(doc, query);
    expect(sim).toBeGreaterThan(0.5);
  }, 60_000);
});
