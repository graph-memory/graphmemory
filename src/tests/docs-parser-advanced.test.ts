import path from 'path';
import { readFileSync } from 'fs';
import { parseFile, clearWikiIndexCache } from '@/lib/parsers/docs';
import type { Chunk } from '@/lib/parsers/docs';

const FIXTURES = path.resolve(__dirname, 'fixtures');

function chunk(chunks: Chunk[], id: string): Chunk | undefined {
  return chunks.find(c => c.id === id);
}

// ---------------------------------------------------------------------------
// extractLinks — markdown links, external filtering, wiki links
// ---------------------------------------------------------------------------

describe('extractLinks', () => {
  let chunks: Chunk[];

  beforeAll(async () => {
    clearWikiIndexCache();
    const content = readFileSync(path.join(FIXTURES, 'links.md'), 'utf-8');
    chunks = await parseFile(content, path.join(FIXTURES, 'links.md'), FIXTURES, 4);
  });

  describe('markdown links', () => {
    it('root chunk extracts relative links', () => {
      const root = chunk(chunks, 'links.md')!;
      expect(root.links).toContain('api.md');
      expect(root.links).toContain('auth.md');
    });

    it('root chunk does NOT include external https link', () => {
      const root = chunk(chunks, 'links.md')!;
      expect(root.links.some(l => l.includes('google'))).toBe(false);
    });

    it('root chunk does NOT include ftp link', () => {
      const root = chunk(chunks, 'links.md')!;
      expect(root.links.some(l => l.includes('ftp'))).toBe(false);
    });

    it('root chunk does NOT include protocol-relative link', () => {
      const root = chunk(chunks, 'links.md')!;
      expect(root.links.some(l => l.includes('cdn'))).toBe(false);
    });

    it('root chunk does NOT include mailto link', () => {
      const root = chunk(chunks, 'links.md')!;
      expect(root.links.some(l => l.includes('mailto'))).toBe(false);
    });

    it('root chunk does NOT include data: URI', () => {
      const root = chunk(chunks, 'links.md')!;
      expect(root.links.some(l => l.includes('data:'))).toBe(false);
    });
  });

  describe('wiki links', () => {
    it('resolves [[api]] to api.md', () => {
      const wikiChunk = chunk(chunks, 'links.md::Wiki Links')!;
      expect(wikiChunk.links).toContain('api.md');
    });

    it('resolves [[auth|alias]] to auth.md', () => {
      const wikiChunk = chunk(chunks, 'links.md::Wiki Links')!;
      expect(wikiChunk.links).toContain('auth.md');
    });

    it('non-existent [[ghost]] not included', () => {
      const wikiChunk = chunk(chunks, 'links.md::Wiki Links')!;
      expect(wikiChunk.links.some(l => l.includes('ghost'))).toBe(false);
    });
  });

  describe('links inside code blocks', () => {
    it('link inside fenced code is NOT extracted', () => {
      const codeChunk = chunk(chunks, 'links.md::Links In Code')!;
      expect(codeChunk.links.some(l => l.includes('fake'))).toBe(false);
    });

    it('link after code block IS extracted', () => {
      const codeChunk = chunk(chunks, 'links.md::Links In Code')!;
      expect(codeChunk.links).toContain('auth.md');
    });
  });

  describe('relative links edge cases', () => {
    it('link without .md extension resolves with .md fallback', () => {
      const relChunk = chunk(chunks, 'links.md::Relative Links')!;
      // [setup](api) should resolve to api.md via toFileId .md fallback
      expect(relChunk.links).toContain('api.md');
    });

    it('link to parent dir outside project is excluded', () => {
      const relChunk = chunk(chunks, 'links.md::Relative Links')!;
      expect(relChunk.links.some(l => l.includes('nonexistent'))).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// extractFileTitle — filename fallback
// ---------------------------------------------------------------------------

describe('extractFileTitle fallback', () => {
  let chunks: Chunk[];

  beforeAll(async () => {
    const content = readFileSync(path.join(FIXTURES, 'notitle.md'), 'utf-8');
    chunks = await parseFile(content, path.join(FIXTURES, 'notitle.md'), FIXTURES, 4);
  });

  it('root chunk title falls back to filename without .md', () => {
    const root = chunk(chunks, 'notitle.md')!;
    expect(root.title).toBe('notitle');
  });

  it('root chunk level is 1', () => {
    const root = chunk(chunks, 'notitle.md')!;
    expect(root.level).toBe(1);
  });

  it('sections are still extracted', () => {
    expect(chunk(chunks, 'notitle.md::Section A')).toBeDefined();
    expect(chunk(chunks, 'notitle.md::Section B')).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// chunkDepth limiting
// ---------------------------------------------------------------------------

describe('chunkDepth limiting', () => {
  const content = readFileSync(path.join(FIXTURES, 'api.md'), 'utf-8');

  it('depth=4: ### Users and ### Sessions are separate chunks', async () => {
    const chunks = await parseFile(content, path.join(FIXTURES, 'api.md'), FIXTURES, 4);
    expect(chunk(chunks, 'api.md::Users')).toBeDefined();
    expect(chunk(chunks, 'api.md::Sessions')).toBeDefined();
  });

  it('depth=2: ### headings are NOT split (merged into parent)', async () => {
    const chunks = await parseFile(content, path.join(FIXTURES, 'api.md'), FIXTURES, 2);
    // ### Users should NOT exist as a separate chunk
    expect(chunk(chunks, 'api.md::Users')).toBeUndefined();
    expect(chunk(chunks, 'api.md::Sessions')).toBeUndefined();
    // ## Endpoints should still contain Users/Sessions content
    const endpoints = chunk(chunks, 'api.md::Endpoints')!;
    expect(endpoints.content).toContain('/users');
    expect(endpoints.content).toContain('/sessions');
  });

  it('depth=2: ## headings are still split', async () => {
    const chunks = await parseFile(content, path.join(FIXTURES, 'api.md'), FIXTURES, 2);
    expect(chunk(chunks, 'api.md::Endpoints')).toBeDefined();
    expect(chunk(chunks, 'api.md::Error Codes')).toBeDefined();
    expect(chunk(chunks, 'api.md::Rate Limiting')).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Tilde fences and empty code blocks
// ---------------------------------------------------------------------------

describe('tilde fences and empty code blocks', () => {
  let chunks: Chunk[];

  beforeAll(async () => {
    const content = readFileSync(path.join(FIXTURES, 'tilde-fences.md'), 'utf-8');
    chunks = await parseFile(content, path.join(FIXTURES, 'tilde-fences.md'), FIXTURES, 4);
  });

  it('tilde fence javascript block is extracted', () => {
    const codeChunks = chunks.filter(c => c.language === 'javascript');
    expect(codeChunks.length).toBeGreaterThanOrEqual(1);
    expect(codeChunks[0].content).toContain('hello');
  });

  it('tilde fence block has extracted symbols', () => {
    const codeChunks = chunks.filter(c => c.language === 'javascript');
    expect(codeChunks[0].symbols).toContain('hello');
    expect(codeChunks[0].symbols).toContain('x');
  });

  it('empty code block is skipped (no child chunk created)', () => {
    // The ``` typescript\n``` block has empty code — should not create child
    const blockBChildren = chunks.filter(c => c.id.startsWith('tilde-fences.md::Block B::code-'));
    // Only tilde block without language should appear (if non-empty)
    for (const child of blockBChildren) {
      expect(child.content.trim().length).toBeGreaterThan(0);
    }
  });

  it('tilde fence without language tag has language=undefined', () => {
    const plain = chunks.filter(c => c.language === undefined && c.id.includes('::code-'));
    expect(plain.length).toBeGreaterThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// Edge cases: heading parsing, dedup, empty chunks
// ---------------------------------------------------------------------------

describe('heading parsing edge cases', () => {
  let chunks: Chunk[];

  beforeAll(async () => {
    const content = readFileSync(path.join(FIXTURES, 'edge-cases.md'), 'utf-8');
    chunks = await parseFile(content, path.join(FIXTURES, 'edge-cases.md'), FIXTURES, 4);
  });

  it('##NoSpace is NOT treated as a heading (no space)', () => {
    expect(chunk(chunks, 'edge-cases.md::NoSpace')).toBeUndefined();
  });

  it('## with empty title is NOT treated as a heading', () => {
    // matchHeading requires text after #
    const emptyTitle = chunks.find(c => c.title === '');
    // Should not exist as a separate chunk split
    expect(emptyTitle).toBeUndefined();
  });

  it('triple duplicate heading gets ::3 suffix', () => {
    // First Chunk B
    expect(chunk(chunks, 'edge-cases.md::Chunk B')).toBeDefined();
    // Second Chunk B
    expect(chunk(chunks, 'edge-cases.md::Chunk B::2')).toBeDefined();
    // Third Chunk B
    expect(chunk(chunks, 'edge-cases.md::Chunk B::3')).toBeDefined();
  });

  it('all three Chunk B have different content', () => {
    const b1 = chunk(chunks, 'edge-cases.md::Chunk B')!;
    const b2 = chunk(chunks, 'edge-cases.md::Chunk B::2')!;
    const b3 = chunk(chunks, 'edge-cases.md::Chunk B::3')!;
    expect(b1.content).toContain('Content B');
    expect(b2.content).toContain('Duplicate');
    expect(b3.content).toContain('Third');
  });

  it('##NoSpace and ## empty are absorbed into Chunk A content', () => {
    const a = chunk(chunks, 'edge-cases.md::Chunk A')!;
    expect(a.content).toContain('##NoSpace');
    expect(a.content).toContain('##');
  });
});

// ---------------------------------------------------------------------------
// parseFile with empty content
// ---------------------------------------------------------------------------

describe('empty and minimal content', () => {
  it('empty string produces 1 root chunk', async () => {
    const chunks = await parseFile('', path.join(FIXTURES, 'empty.md'), FIXTURES, 4);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].level).toBe(1);
    expect(chunks[0].title).toBe('empty');
  });

  it('only whitespace produces 1 root chunk', async () => {
    const chunks = await parseFile('   \n\n  ', path.join(FIXTURES, 'ws.md'), FIXTURES, 4);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].title).toBe('ws');
  });

  it('only heading, no body', async () => {
    const chunks = await parseFile('# Just Title', path.join(FIXTURES, 'title.md'), FIXTURES, 4);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].title).toBe('Just Title');
    expect(chunks[0].level).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// clearWikiIndexCache
// ---------------------------------------------------------------------------

describe('clearWikiIndexCache', () => {
  it('clearing specific projectDir does not crash', () => {
    expect(() => clearWikiIndexCache(FIXTURES)).not.toThrow();
  });

  it('clearing all does not crash', () => {
    expect(() => clearWikiIndexCache()).not.toThrow();
  });

  it('wiki links still resolve after cache clear', async () => {
    clearWikiIndexCache();
    const content = readFileSync(path.join(FIXTURES, 'links.md'), 'utf-8');
    const chunks = await parseFile(content, path.join(FIXTURES, 'links.md'), FIXTURES, 4);
    const wikiChunk = chunk(chunks, 'links.md::Wiki Links')!;
    expect(wikiChunk.links).toContain('api.md');
  });
});

// ---------------------------------------------------------------------------
// Remaining coverage gaps
// ---------------------------------------------------------------------------

describe('link with #anchor', () => {
  it('anchor is stripped, file part is extracted', async () => {
    const md = '# Test\n\nSee [tokens](auth.md#jwt-section) for details.\n';
    const chunks = await parseFile(md, path.join(FIXTURES, 'anchor.md'), FIXTURES, 4);
    expect(chunks[0].links).toContain('auth.md');
  });
});

describe('wiki link with extension [[api.md]]', () => {
  it('resolves direct path with extension', async () => {
    clearWikiIndexCache();
    const md = '# Test\n\nSee [[api.md]] for reference.\n';
    const chunks = await parseFile(md, path.join(FIXTURES, 'wiki-ext.md'), FIXTURES, 4);
    expect(chunks[0].links).toContain('api.md');
  });
});

describe('wiki link to file in subdirectory', () => {
  const subDir = path.join(FIXTURES, '_wiki_sub');

  beforeAll(() => {
    const fs = require('fs');
    fs.mkdirSync(path.join(subDir, 'nested'), { recursive: true });
    fs.writeFileSync(path.join(subDir, 'nested', 'deep.md'), '# Deep\n');
    fs.writeFileSync(path.join(subDir, 'main.md'), '# Main\n\nLink: [[deep]].\n');
  });

  afterAll(() => {
    const fs = require('fs');
    fs.rmSync(subDir, { recursive: true, force: true });
  });

  it('wiki index finds file in nested subdirectory', async () => {
    clearWikiIndexCache();
    const content = readFileSync(path.join(subDir, 'main.md'), 'utf-8');
    const chunks = await parseFile(content, path.join(subDir, 'main.md'), subDir, 4);
    expect(chunks[0].links).toContain('nested/deep.md');
  });
});

describe('heading level > 6', () => {
  it('####### (7 hashes) is not treated as a heading', async () => {
    const md = '# Title\n\n####### Not a heading\n\n## Real\n\nContent.\n';
    const chunks = await parseFile(md, path.join(FIXTURES, 'deep-h.md'), FIXTURES, 6);
    // ####### should NOT create a separate chunk
    expect(chunk(chunks, 'deep-h.md::Not a heading')).toBeUndefined();
    // Should be absorbed into root chunk
    expect(chunks[0].content).toContain('#######');
    // ## Real should still work
    expect(chunk(chunks, 'deep-h.md::Real')).toBeDefined();
  });
});
