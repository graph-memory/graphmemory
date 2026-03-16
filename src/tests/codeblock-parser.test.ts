import path from 'path';
import { readFileSync } from 'fs';
import { extractSymbols } from '@/lib/parsers/codeblock';
import { parseFile } from '@/lib/parsers/docs';

describe('extractSymbols', () => {
  const tsCode = `
interface TokenPayload {
  userId: string;
  role: string;
}

function createToken(payload: TokenPayload): string {
  return 'token';
}

class AuthService {
  verify(token: string) { return true; }
}

type Role = 'admin' | 'editor' | 'viewer';

enum Status {
  Active,
  Inactive,
}

const SECRET = 'abc';
const handler = () => {};
`;

  it('extracts interface from TS', () => {
    expect(extractSymbols(tsCode, 'typescript')).toContain('TokenPayload');
  });

  it('extracts function from TS', () => {
    expect(extractSymbols(tsCode, 'typescript')).toContain('createToken');
  });

  it('extracts class from TS', () => {
    expect(extractSymbols(tsCode, 'typescript')).toContain('AuthService');
  });

  it('extracts type alias from TS', () => {
    expect(extractSymbols(tsCode, 'typescript')).toContain('Role');
  });

  it('extracts enum from TS', () => {
    expect(extractSymbols(tsCode, 'typescript')).toContain('Status');
  });

  it('extracts const variable from TS', () => {
    expect(extractSymbols(tsCode, 'typescript')).toContain('SECRET');
  });

  it('extracts arrow function from TS', () => {
    expect(extractSymbols(tsCode, 'typescript')).toContain('handler');
  });

  it('extracts correct count from TS', () => {
    expect(extractSymbols(tsCode, 'typescript')).toHaveLength(7);
  });

  describe('JavaScript code', () => {
    const jsCode = `
function query(text, params) {
  return pool.query(text, params);
}

const pool = new Pool();
`;

    it('extracts function', () => {
      expect(extractSymbols(jsCode, 'javascript')).toContain('query');
    });

    it('extracts const', () => {
      expect(extractSymbols(jsCode, 'javascript')).toContain('pool');
    });
  });

  describe('TSX/JSX variants', () => {
    it('tsx language accepted', () => {
      expect(extractSymbols('const x = 1;', 'tsx')).toContain('x');
    });

    it('jsx language accepted', () => {
      expect(extractSymbols('const x = 1;', 'jsx')).toContain('x');
    });

    it('ts language accepted', () => {
      expect(extractSymbols('const x = 1;', 'ts')).toContain('x');
    });

    it('js language accepted', () => {
      expect(extractSymbols('const x = 1;', 'js')).toContain('x');
    });
  });

  describe('non-TS/JS languages', () => {
    it('yaml returns empty', () => {
      expect(extractSymbols('key: value', 'yaml')).toHaveLength(0);
    });

    it('python returns empty', () => {
      expect(extractSymbols('def foo(): pass', 'python')).toHaveLength(0);
    });

    it('empty language returns empty', () => {
      expect(extractSymbols('const x = 1;', '')).toHaveLength(0);
    });
  });

  it('malformed code returns empty', () => {
    const badCode = `
function {{{ this is not valid
  syntax at all !!!
`;
    expect(extractSymbols(badCode, 'typescript')).toHaveLength(0);
  });

  it('empty code returns empty', () => {
    expect(extractSymbols('', 'typescript')).toHaveLength(0);
  });
});

describe('parseFile code block extraction', () => {
  const fixturePath = path.resolve('src/tests/fixtures/codeblocks.md');
  const fixtureContent = readFileSync(fixturePath, 'utf-8');
  const projectDir = path.resolve('src/tests/fixtures');
  const chunks = parseFile(fixtureContent, fixturePath, projectDir, 4);

  const textChunks = chunks.filter(c => c.language === undefined);
  const codeChunks = chunks.filter(c => c.language !== undefined);
  const allChildChunks = chunks.filter(c => c.id.includes('::code-'));

  it('has text chunks', () => {
    expect(textChunks.length).toBeGreaterThan(0);
  });

  it('has code chunks', () => {
    expect(codeChunks.length).toBeGreaterThan(0);
  });

  it('has 6 total code block child chunks', () => {
    expect(allChildChunks).toHaveLength(6);
  });

  it('has 3 typescript code blocks', () => {
    const tsChunks = chunks.filter(c => c.language === 'typescript');
    expect(tsChunks).toHaveLength(3);
  });

  it('has 1 javascript code block', () => {
    const jsChunks = chunks.filter(c => c.language === 'javascript');
    expect(jsChunks).toHaveLength(1);
  });

  it('has 1 yaml code block', () => {
    const yamlChunks = chunks.filter(c => c.language === 'yaml');
    expect(yamlChunks).toHaveLength(1);
  });

  it('has 1 untagged code block', () => {
    const untaggedChunks = allChildChunks.filter(c => c.language === undefined);
    expect(untaggedChunks).toHaveLength(1);
  });

  describe('Authentication TS code blocks', () => {
    const tsChunks = chunks.filter(c => c.language === 'typescript');
    const authTsChunks = tsChunks.filter(
      c => c.fileId === 'codeblocks.md' && c.id.includes('Authentication')
    );

    it('has 2 TS code blocks in Authentication section', () => {
      expect(authTsChunks).toHaveLength(2);
    });

    it('first block has TokenPayload', () => {
      expect(authTsChunks[0].symbols).toContain('TokenPayload');
    });

    it('first block has createToken', () => {
      expect(authTsChunks[0].symbols).toContain('createToken');
    });

    it('first block has verifyToken', () => {
      expect(authTsChunks[0].symbols).toContain('verifyToken');
    });

    it('second block has authMiddleware', () => {
      expect(authTsChunks[1].symbols).toContain('authMiddleware');
    });
  });

  describe('JS code block symbols', () => {
    const jsChunks = chunks.filter(c => c.language === 'javascript');

    it('has pool', () => {
      expect(jsChunks[0].symbols).toContain('pool');
    });

    it('has query', () => {
      expect(jsChunks[0].symbols).toContain('query');
    });
  });

  it('YAML block has no symbols', () => {
    const yamlChunks = chunks.filter(c => c.language === 'yaml');
    expect(yamlChunks[0].symbols).toHaveLength(0);
  });

  it('untagged block has no symbols', () => {
    const untaggedChunks = allChildChunks.filter(c => c.language === undefined);
    expect(untaggedChunks[0].symbols).toHaveLength(0);
  });

  describe('API Client TS block', () => {
    const tsChunks = chunks.filter(c => c.language === 'typescript');
    const apiClientChunk = tsChunks.find(c => c.id.includes('API Client'));

    it('exists', () => {
      expect(apiClientChunk).toBeDefined();
    });

    it('has ApiClient class', () => {
      expect(apiClientChunk!.symbols).toContain('ApiClient');
    });

    it('has defaultClient', () => {
      expect(apiClientChunk!.symbols).toContain('defaultClient');
    });
  });

  it('code block ID has ::code-1', () => {
    expect(allChildChunks.some(c => c.id.endsWith('::code-1'))).toBe(true);
  });

  it('auth code blocks have level = section level + 1', () => {
    const authSection = textChunks.find(c => c.title === 'Authentication');
    expect(authSection).toBeDefined();
    const authCodeBlocks = allChildChunks.filter(c => c.id.includes('Authentication'));
    expect(authCodeBlocks.every(c => c.level === authSection!.level + 1)).toBe(true);
  });

  it('parent still has code fence', () => {
    const authSection = textChunks.find(c => c.title === 'Authentication');
    expect(authSection!.content).toContain('```typescript');
  });
});
