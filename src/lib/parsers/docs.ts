import path from 'path';
import fs from 'fs';
import { extractSymbols } from '@/lib/parsers/codeblock';

export interface Chunk {
  id: string;        // "docs/api.md" | "docs/api.md::Section Title"
  fileId: string;    // "docs/api.md"
  title: string;     // heading text, or filename for root chunk
  content: string;   // full text of this section
  level: number;     // heading level: 1 = root, 2 = ##, 3 = ###
  links: string[];   // fileIds of linked files (local only)
  embedding: number[]; // filled by embedder, empty until then
  language?: string;   // fenced code block language tag (undefined for text chunks)
  symbols: string[];   // extracted symbol names from code blocks ([] for text chunks)
}

// Parse a markdown file into chunks split by headings
export async function parseFile(
  content: string,
  absolutePath: string,
  projectDir: string,
  chunkDepth: number,
): Promise<Chunk[]> {
  const fileId = path.relative(projectDir, absolutePath);
  const lines = content.split('\n');

  const rawChunks: Array<{ level: number; title: string; lines: string[] }> = [];
  let current: { level: number; title: string; lines: string[] } = {
    level: 1,
    title: extractFileTitle(content, absolutePath),
    lines: [],
  };

  for (const line of lines) {
    const heading = matchHeading(line, chunkDepth);
    if (heading) {
      rawChunks.push(current);
      current = { level: heading.level, title: heading.title, lines: [line] };
    } else {
      current.lines.push(line);
    }
  }
  rawChunks.push(current);

  // Build Chunk objects
  const seenIds = new Set<string>();
  const textChunks = rawChunks
    .filter(c => c.lines.join('\n').trim() || c.level === 1)
    .map(c => {
      const chunkContent = c.lines.join('\n').trim();
      const baseId = c.level === 1 ? fileId : `${fileId}::${c.title}`;
      let id = baseId;
      let counter = 2;
      while (seenIds.has(id)) id = `${baseId}::${counter++}`;
      seenIds.add(id);
      return {
        id,
        fileId,
        title: c.title,
        content: chunkContent,
        level: c.level,
        links: extractLinks(chunkContent, absolutePath, projectDir),
        embedding: [], // filled later by embedder
        symbols: [] as string[],
      };
    });

  return await spliceCodeBlocks(textChunks, seenIds);
}

// --- code block extraction ---

const FENCE_RE = /^(`{3,}|~{3,})(\S*)\s*\n([\s\S]*?)^\1\s*$/gm;

async function spliceCodeBlocks(chunks: Chunk[], seenIds: Set<string>): Promise<Chunk[]> {
  const result: Chunk[] = [];

  for (const chunk of chunks) {
    // Skip chunks that are already code blocks (shouldn't happen, but guard)
    if (chunk.language !== undefined) { result.push(chunk); continue; }

    const codeBlocks: Array<{ language: string; code: string; index: number }> = [];
    let match: RegExpExecArray | null;
    FENCE_RE.lastIndex = 0;

    while ((match = FENCE_RE.exec(chunk.content)) !== null) {
      const lang = match[2].toLowerCase();
      const code = match[3].trimEnd();
      if (code) codeBlocks.push({ language: lang, code, index: match.index });
    }

    result.push(chunk);

    // Create child chunks for each code block
    let codeIdx = 0;
    for (const cb of codeBlocks) {
      codeIdx++;
      const baseId = `${chunk.id}::code-${codeIdx}`;
      let id = baseId;
      let counter = 2;
      while (seenIds.has(id)) id = `${baseId}::${counter++}`;
      seenIds.add(id);

      const lang = cb.language || undefined;
      const symbols = lang ? await extractSymbols(cb.code, lang) : [];

      result.push({
        id,
        fileId: chunk.fileId,
        title: lang || 'code',
        content: cb.code,
        level: chunk.level + 1,
        links: [],
        embedding: [],
        language: lang,
        symbols,
      });
    }
  }

  return result;
}

// --- helpers ---

function matchHeading(
  line: string,
  maxDepth: number,
): { level: number; title: string } | null {
  const match = line.match(/^(#{1,6})\s+(.+)$/);
  if (!match) return null;
  const level = match[1].length;
  if (level < 2 || level > maxDepth) return null; // # is file title, not a chunk split
  return { level, title: match[2].trim() };
}

function extractFileTitle(content: string, filePath: string): string {
  const match = content.match(/^#\s+(.+)$/m);
  if (match) return match[1].trim();
  return path.basename(filePath, '.md');
}

function extractLinks(
  content: string,
  fromFile: string,
  projectDir: string,
): string[] {
  const results = new Set<string>();
  const fileDir = path.dirname(fromFile);

  // [text](./path.md)
  const mdLinks = content.matchAll(/\[[^\]]*\]\(([^)#\s]+)/g);
  for (const [, href] of mdLinks) {
    if (isExternal(href)) continue;
    const resolved = path.resolve(fileDir, href);
    const fileId = toFileId(resolved, projectDir);
    if (fileId) results.add(fileId);
  }

  // [[wiki link]] or [[wiki link|alias]]
  const wikiLinks = content.matchAll(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g);
  for (const [, name] of wikiLinks) {
    const resolved = findWikiFile(name.trim(), projectDir);
    if (!resolved) continue;
    const fileId = toFileId(resolved, projectDir); // same guard as md links
    if (fileId) results.add(fileId);
  }

  return [...results];
}

// Reject anything that looks like an external URL
function isExternal(href: string): boolean {
  return /^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(href) // http://, ftp://, mailto://, etc.
    || href.startsWith('//')                           // protocol-relative //cdn.example.com
    || href.startsWith('data:')                        // data URIs
    || href.startsWith('mailto:');
}

function toFileId(absolutePath: string, projectDir: string): string | null {
  const rel = path.relative(projectDir, absolutePath);
  if (rel.startsWith('..') || path.isAbsolute(rel)) return null;
  if (fs.existsSync(absolutePath)) return rel;
  // try adding .md
  const withMd = absolutePath + '.md';
  if (fs.existsSync(withMd)) return path.relative(projectDir, withMd);
  return null;
}

function findWikiFile(name: string, projectDir: string): string | null {
  const direct = path.join(projectDir, name);
  if (fs.existsSync(direct)) return direct;
  const withMd = direct + '.md';
  if (fs.existsSync(withMd)) return withMd;
  return searchRecursive(name, projectDir);
}

const MAX_SEARCH_DEPTH = 10;

function searchRecursive(name: string, dir: string, depth = 0): string | null {
  if (depth >= MAX_SEARCH_DEPTH) return null;
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return null;
  }
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const found = searchRecursive(name, full, depth + 1);
      if (found) return found;
    } else if (entry.isFile()) {
      if (entry.name === name || entry.name === `${name}.md` || path.basename(entry.name, '.md') === name) {
        return full;
      }
    }
  }
  return null;
}
