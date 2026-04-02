import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { DocsStore, CodeStore, DocNode } from '@/store/types';
import { MAX_SEARCH_QUERY_LEN } from '@/lib/defaults';

interface CrossRefDeps { docs: DocsStore; code: CodeStore; }

export function register(server: McpServer, { docs, code }: CrossRefDeps): void {
  server.registerTool(
    'docs_cross_references',
    {
      description:
        'Find all references to a symbol across both code and documentation graphs. ' +
        'Returns: definitions (from CodeStore — where the symbol is defined), ' +
        'documentation (text sections in docs that contain examples using the symbol), ' +
        'and examples (code blocks in docs that contain the symbol). ' +
        'This is the most comprehensive way to understand a symbol — combining source code, docs, and examples.',
      inputSchema: {
        symbol: z.string().min(1).max(MAX_SEARCH_QUERY_LEN).describe('Symbol name to look up, e.g. "createUser", "AuthService"'),
      },
    },
    async ({ symbol }) => {
      // 1. Search CodeStore for definitions
      const codeNodes = code.findByName(symbol);
      const definitions = codeNodes.map(n => ({
        id: n.id,
        fileId: n.fileId,
        kind: n.kind,
        name: n.name,
        signature: n.signature,
        docComment: n.docComment,
        startLine: n.startLine,
        endLine: n.endLine,
      }));

      // 2. Search DocsStore for code blocks containing the symbol
      const docMatches = docs.findBySymbol(symbol);

      const examples: Array<{
        id: number;
        fileId: string;
        language: string | undefined;
        symbols: string[];
        content: string;
      }> = [];

      const documentation: Array<{
        id: number;
        fileId: string;
        title: string;
        content: string;
      }> = [];

      const seenDocs = new Set<number>();

      for (const match of docMatches) {
        examples.push({
          id: match.id,
          fileId: match.fileId,
          language: match.language,
          symbols: match.symbols,
          content: match.content,
        });

        // Find parent text section for documentation context
        const parent = findParentTextSection(docs, match);
        if (parent && !seenDocs.has(parent.id)) {
          seenDocs.add(parent.id);
          documentation.push({
            id: parent.id,
            fileId: parent.fileId,
            title: parent.title,
            content: parent.content,
          });
        }
      }

      if (definitions.length === 0 && examples.length === 0) {
        return { content: [{ type: 'text', text: `No references found for symbol: ${symbol}` }] };
      }

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ definitions, documentation, examples }, null, 2),
        }],
      };
    },
  );
}

function findParentTextSection(
  docs: DocsStore,
  block: DocNode,
): { id: number; fileId: string; title: string; content: string } | null {
  const chunks = docs.getFileChunks(block.fileId);
  let best: DocNode | undefined;
  for (const c of chunks) {
    if (c.id >= block.id) break;
    if (c.language === undefined && c.level < block.level) {
      best = c;
    }
  }
  return best ? { id: best.id, fileId: best.fileId, title: best.title, content: best.content } : null;
}
