import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { NodeAttributes } from '@/graphs/docs';
import type { DocGraphManager } from '@/graphs/docs';
import type { CodeGraphManager } from '@/graphs/code';

export function register(server: McpServer, docMgr: DocGraphManager, codeMgr: CodeGraphManager): void {
  const docGraph = docMgr.graph;
  const codeGraph = codeMgr.graph;

  server.registerTool(
    'cross_references',
    {
      description:
        'Find all references to a symbol across both code and documentation graphs. ' +
        'Returns: definitions (from CodeGraph — where the symbol is defined), ' +
        'documentation (text sections in docs that contain examples using the symbol), ' +
        'and examples (code blocks in docs that contain the symbol). ' +
        'This is the most comprehensive way to understand a symbol — combining source code, docs, and examples.',
      inputSchema: {
        symbol: z.string().describe('Symbol name to look up, e.g. "createUser", "AuthService"'),
      },
    },
    async ({ symbol }) => {
      // 1. Search CodeGraph for definitions
      const definitions: Array<{
        id: string;
        fileId: string;
        kind: string;
        name: string;
        signature: string;
        docComment: string;
        startLine: number;
        endLine: number;
      }> = [];

      codeGraph.forEachNode((id, attrs) => {
        if (attrs.name === symbol) {
          definitions.push({
            id,
            fileId: attrs.fileId,
            kind: attrs.kind,
            name: attrs.name,
            signature: attrs.signature,
            docComment: attrs.docComment,
            startLine: attrs.startLine,
            endLine: attrs.endLine,
          });
        }
      });

      // 2. Search DocGraph for code blocks containing the symbol
      const examples: Array<{
        id: string;
        fileId: string;
        language: string | undefined;
        symbols: string[];
        content: string;
      }> = [];

      const documentation: Array<{
        id: string;
        fileId: string;
        title: string;
        content: string;
      }> = [];

      const seenDocs = new Set<string>();

      docGraph.forEachNode((id, attrs: NodeAttributes) => {
        if (attrs.symbols.length === 0) return;
        if (!attrs.symbols.includes(symbol)) return;

        examples.push({
          id,
          fileId: attrs.fileId,
          language: attrs.language,
          symbols: attrs.symbols,
          content: attrs.content,
        });

        // Find parent text section for documentation context
        for (const neighbor of docGraph.inNeighbors(id)) {
          if (seenDocs.has(neighbor)) continue;
          const nAttrs = docGraph.getNodeAttributes(neighbor);
          if (nAttrs.fileId === attrs.fileId && nAttrs.language === undefined && nAttrs.level < attrs.level) {
            seenDocs.add(neighbor);
            documentation.push({
              id: neighbor,
              fileId: nAttrs.fileId,
              title: nAttrs.title,
              content: nAttrs.content,
            });
          }
        }
      });

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
