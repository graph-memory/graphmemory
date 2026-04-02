import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { DocsStore, DocNode } from '@/store/types';
import { MAX_SEARCH_QUERY_LEN, LIST_LIMIT_SMALL } from '@/lib/defaults';

interface DocsToolDeps { docs: DocsStore; }

export function register(server: McpServer, { docs }: DocsToolDeps): void {
  server.registerTool(
    'docs_find_examples',
    {
      description:
        'Find code examples in documentation that contain a specific symbol (function, class, interface, etc.). ' +
        'Searches the `symbols` array extracted from fenced code blocks via AST parsing. ' +
        'Use this to find usage examples of a known symbol in the docs. ' +
        'Returns matching code block nodes with id, fileId, language, symbols, content, and the parent section context.',
      inputSchema: {
        symbol: z.string().max(MAX_SEARCH_QUERY_LEN).describe('Symbol name to search for, e.g. "createUser", "UserService"'),
        limit:  z.number().optional().describe('Max results to return (default 10)'),
      },
    },
    async ({ symbol, limit = LIST_LIMIT_SMALL }) => {
      const matches = docs.findBySymbol(symbol);

      // Filter to code blocks (have a language) and limit
      const codeBlocks = matches.filter(n => n.language !== undefined).slice(0, limit);

      if (codeBlocks.length === 0) {
        return { content: [{ type: 'text', text: `No code examples found containing symbol: ${symbol}` }] };
      }

      const results = codeBlocks.map(block => {
        const parent = findParentSection(docs, block);
        return {
          id: block.id,
          fileId: block.fileId,
          language: block.language,
          symbols: block.symbols,
          content: block.content,
          parentId: parent?.id,
          parentTitle: parent?.title,
        };
      });

      return { content: [{ type: 'text', text: JSON.stringify(results, null, 2) }] };
    },
  );
}

function findParentSection(docs: DocsStore, block: DocNode): { id: number; title: string } | undefined {
  const chunks = docs.getFileChunks(block.fileId);
  // Walk backwards from the block to find the closest parent: same fileId, lower level, no language, id < block.id
  let best: DocNode | undefined;
  for (const c of chunks) {
    if (c.id >= block.id) break;
    if (c.language === undefined && c.level < block.level) {
      best = c;
    }
  }
  return best ? { id: best.id, title: best.title } : undefined;
}
