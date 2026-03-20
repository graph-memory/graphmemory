import { tokenize, BM25Index, rrfFuse } from '@/lib/search/bm25';

describe('tokenize', () => {
  it('splits on whitespace', () => {
    expect(tokenize('hello world')).toEqual(['hello', 'world']);
  });

  it('lowercases', () => {
    expect(tokenize('Hello WORLD')).toEqual(['hello', 'world']);
  });

  it('splits camelCase', () => {
    expect(tokenize('getUserById')).toEqual(['get', 'user', 'id']); // 'by' is a stop word
  });

  it('splits PascalCase', () => {
    expect(tokenize('AuthService')).toEqual(['auth', 'service']);
  });

  it('splits acronym boundaries', () => {
    expect(tokenize('XMLParser')).toEqual(['xml', 'parser']);
    expect(tokenize('parseHTML')).toEqual(['parse', 'html']);
  });

  it('splits on punctuation', () => {
    expect(tokenize('hello-world_foo.bar')).toEqual(['hello', 'world', 'foo', 'bar']);
  });

  it('handles mixed camelCase and punctuation', () => {
    expect(tokenize('src/auth.ts::loginUser')).toEqual(['src', 'auth', 'ts', 'login', 'user']);
  });

  it('filters empty tokens', () => {
    expect(tokenize('  hello  ')).toEqual(['hello']);
  });

  it('returns empty for empty string', () => {
    expect(tokenize('')).toEqual([]);
  });

  it('returns empty for null/undefined', () => {
    expect(tokenize(null as any)).toEqual([]);
    expect(tokenize(undefined as any)).toEqual([]);
  });

  it('handles numbers', () => {
    expect(tokenize('auth2 version3')).toEqual(['auth2', 'version3']);
  });

  it('handles single word', () => {
    expect(tokenize('jwt')).toEqual(['jwt']);
  });
});

describe('BM25Index', () => {
  type Doc = { title: string; content: string };
  const extractor = (d: Doc) => `${d.title} ${d.content}`;

  describe('basic operations', () => {
    it('starts empty', () => {
      const idx = new BM25Index(extractor);
      expect(idx.size).toBe(0);
    });

    it('addDocument increases size', () => {
      const idx = new BM25Index(extractor);
      idx.addDocument('a', { title: 'Auth', content: 'JWT tokens for auth' });
      expect(idx.size).toBe(1);
      expect(idx.hasDocument('a')).toBe(true);
    });

    it('removeDocument decreases size', () => {
      const idx = new BM25Index(extractor);
      idx.addDocument('a', { title: 'Auth', content: 'JWT tokens' });
      idx.removeDocument('a');
      expect(idx.size).toBe(0);
      expect(idx.hasDocument('a')).toBe(false);
    });

    it('removeDocument is no-op for missing doc', () => {
      const idx = new BM25Index(extractor);
      idx.removeDocument('nonexistent');
      expect(idx.size).toBe(0);
    });

    it('updateDocument replaces existing', () => {
      const idx = new BM25Index(extractor);
      idx.addDocument('a', { title: 'Auth', content: 'old' });
      idx.updateDocument('a', { title: 'Auth', content: 'new content' });
      expect(idx.size).toBe(1);
      const scores = idx.score('new');
      expect(scores.get('a')).toBeGreaterThan(0);
    });

    it('clear resets everything', () => {
      const idx = new BM25Index(extractor);
      idx.addDocument('a', { title: 'Auth', content: 'test' });
      idx.addDocument('b', { title: 'Code', content: 'test' });
      idx.clear();
      expect(idx.size).toBe(0);
    });

    it('addDocument with same id replaces', () => {
      const idx = new BM25Index(extractor);
      idx.addDocument('a', { title: 'Old', content: 'old content' });
      idx.addDocument('a', { title: 'New', content: 'new content' });
      expect(idx.size).toBe(1);
      expect(idx.score('old').size).toBe(0);
      expect(idx.score('new').get('a')).toBeGreaterThan(0);
    });
  });

  describe('score', () => {
    it('returns empty map for empty query', () => {
      const idx = new BM25Index(extractor);
      idx.addDocument('a', { title: 'Auth', content: 'JWT tokens' });
      expect(idx.score('').size).toBe(0);
    });

    it('returns empty map for empty index', () => {
      const idx = new BM25Index(extractor);
      expect(idx.score('auth').size).toBe(0);
    });

    it('scores matching documents', () => {
      const idx = new BM25Index(extractor);
      idx.addDocument('a', { title: 'Auth', content: 'JWT tokens for authentication' });
      idx.addDocument('b', { title: 'Config', content: 'Database configuration' });

      const scores = idx.score('auth');
      expect(scores.get('a')).toBeGreaterThan(0);
      expect(scores.has('b')).toBe(false); // 'auth' not in doc b
    });

    it('returns zero for non-matching query', () => {
      const idx = new BM25Index(extractor);
      idx.addDocument('a', { title: 'Auth', content: 'JWT tokens' });
      expect(idx.score('database').size).toBe(0);
    });

    it('multi-term query scores higher for more matches', () => {
      const idx = new BM25Index(extractor);
      idx.addDocument('a', { title: 'Auth JWT', content: 'tokens for auth' });
      idx.addDocument('b', { title: 'Auth', content: 'basic auth only' });

      const scores = idx.score('jwt auth');
      // Doc 'a' has both 'jwt' and 'auth', doc 'b' has only 'auth'
      expect(scores.get('a')!).toBeGreaterThan(scores.get('b')!);
    });

    it('IDF weights rare terms higher', () => {
      const idx = new BM25Index(extractor);
      // 'the' appears in all docs, 'jwt' in only one
      idx.addDocument('a', { title: 'JWT Auth', content: 'the jwt token' });
      idx.addDocument('b', { title: 'Config', content: 'the config' });
      idx.addDocument('c', { title: 'Database', content: 'the database' });

      const scores = idx.score('jwt');
      expect(scores.get('a')).toBeGreaterThan(0);
      expect(scores.has('b')).toBe(false);
      expect(scores.has('c')).toBe(false);
    });

    it('handles camelCase in query', () => {
      const idx = new BM25Index(extractor);
      idx.addDocument('a', { title: 'getUserById', content: 'fetches user' });
      idx.addDocument('b', { title: 'Config', content: 'settings' });

      const scores = idx.score('getUserById');
      expect(scores.get('a')).toBeGreaterThan(0);
    });

    it('camelCase query matches camelCase document', () => {
      const idx = new BM25Index(extractor);
      idx.addDocument('a', { title: 'AuthService', content: 'handles login' });

      // Query "auth service" should match "AuthService" after tokenization
      const scores = idx.score('auth service');
      expect(scores.get('a')).toBeGreaterThan(0);
    });

    it('incremental remove updates scores correctly', () => {
      const idx = new BM25Index(extractor);
      idx.addDocument('a', { title: 'Auth', content: 'jwt' });
      idx.addDocument('b', { title: 'Auth', content: 'session' });

      // Before removing b, 'auth' appears in 2 docs
      const before = idx.score('auth');
      expect(before.size).toBe(2);

      idx.removeDocument('b');
      const after = idx.score('auth');
      expect(after.size).toBe(1);
      expect(after.has('a')).toBe(true);
      expect(after.has('b')).toBe(false);
    });
  });
});

describe('rrfFuse', () => {
  it('fuses two ranked lists', () => {
    const vector = new Map([['a', 0.9], ['b', 0.7], ['c', 0.5]]);
    const bm25 = new Map([['b', 3.0], ['a', 2.0], ['d', 1.0]]);

    const fused = rrfFuse(vector, bm25, 60);

    // All unique IDs should be present
    expect(fused.has('a')).toBe(true);
    expect(fused.has('b')).toBe(true);
    expect(fused.has('c')).toBe(true);
    expect(fused.has('d')).toBe(true);
  });

  it('ranks higher when appearing in both lists', () => {
    const vector = new Map([['a', 0.9], ['b', 0.5]]);
    const bm25 = new Map([['a', 2.0], ['c', 1.0]]);

    const fused = rrfFuse(vector, bm25, 60);

    // 'a' appears in both → should have highest fused score
    expect(fused.get('a')!).toBeGreaterThan(fused.get('b')!);
    expect(fused.get('a')!).toBeGreaterThan(fused.get('c')!);
  });

  it('handles node in only one list', () => {
    const vector = new Map([['a', 0.9]]);
    const bm25 = new Map([['b', 2.0]]);

    const fused = rrfFuse(vector, bm25, 60);

    // Both should be present with score from their respective list
    expect(fused.get('a')!).toBeGreaterThan(0);
    expect(fused.get('b')!).toBeGreaterThan(0);
  });

  it('returns empty for empty inputs', () => {
    const fused = rrfFuse(new Map(), new Map(), 60);
    expect(fused.size).toBe(0);
  });

  it('respects k parameter', () => {
    const vector = new Map([['a', 0.9]]);
    const bm25 = new Map([['a', 2.0]]);

    const fusedSmallK = rrfFuse(vector, bm25, 1);
    const fusedLargeK = rrfFuse(vector, bm25, 1000);

    // With small k, scores are higher overall
    expect(fusedSmallK.get('a')!).toBeGreaterThan(fusedLargeK.get('a')!);
  });

  it('preserves rank ordering within each source', () => {
    // Vector: a > b; BM25: b > a — should be close
    const vector = new Map([['a', 0.9], ['b', 0.1]]);
    const bm25 = new Map([['b', 5.0], ['a', 0.1]]);

    const fused = rrfFuse(vector, bm25, 60);

    // Both docs get 1/(k+1) + 1/(k+2) from their respective ranks
    // Scores should be equal since each is rank 1 in one and rank 2 in the other
    expect(Math.abs(fused.get('a')! - fused.get('b')!)).toBeLessThan(0.001);
  });
});
