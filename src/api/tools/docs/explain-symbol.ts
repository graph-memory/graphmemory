import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { DocsStore, DocNode } from '@/store/types';
import { MAX_SEARCH_QUERY_LEN, LIST_LIMIT_SMALL } from '@/lib/defaults';

interface DocsToolDeps { docs: DocsStore; }

export function register(server: McpServer, { docs }: DocsToolDeps): void {
  server.registerTool(
    'docs_explain_symbol',
    {
      description:
        'Find documentation that explains a specific symbol. ' +
        'Searches code blocks in docs for the symbol, then returns both the code example ' +
        'and the surrounding text section that provides context/explanation. ' +
        'Use this to understand what a function, class, or type does based on documentation.',
      inputSchema: {
        symbol: z.string().min(1).max(MAX_SEARCH_QUERY_LEN).describe('Symbol name to look up, e.g. "createUser", "AuthService"'),
        limit:  z.number().optional().describe('Max results to return (default 10)'),
      },
    },
    async ({ symbol, limit = LIST_LIMIT_SMALL }) => {
      const matches = docs.findBySymbol(symbol);

      // Filter to code blocks (have a language)
      const codeBlocks = matches.filter(n => n.language !== undefined).slice(0, limit);

      if (codeBlocks.length === 0) {
        return { content: [{ type: 'text', text: `No documentation found for symbol: ${symbol}` }] };
      }

      const results = codeBlocks.map(block => {
        const parent = findParentTextSection(docs, block);
        return {
          codeBlock: {
            id: block.id,
            language: block.language,
            symbols: block.symbols,
            content: block.content,
          },
          explanation: parent
            ? { id: parent.id, title: parent.title, content: parent.content }
            : undefined,
          fileId: block.fileId,
        };
      });

      const clean = (_k: string, v: unknown) => (v === undefined || (Array.isArray(v) && v.length === 0) ? undefined : v);
      return { content: [{ type: 'text', text: JSON.stringify(results, clean, 2) }] };
    },
  );
}

function findParentTextSection(
  docs: DocsStore,
  block: DocNode,
): { id: number; title: string; content: string } | null {
  const chunks = docs.getFileChunks(block.fileId);
  // Walk backwards: find closest preceding chunk with lower level and no language
  let best: DocNode | undefined;
  for (const c of chunks) {
    if (c.id >= block.id) break;
    if (c.language === undefined && c.level < block.level) {
      best = c;
    }
  }
  return best ? { id: best.id, title: best.title, content: best.content } : null;
}
