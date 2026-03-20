import { GRAPH_LABELS } from '@/content/prompts/index.ts';
import type { ContextBudgetConfig } from '../../types.ts';

export function buildContextSection(config: ContextBudgetConfig): string | null {
  const lines = ['### Context Budget\n'];

  lines.push('When pulling context from the graph, respect these limits:\n');
  lines.push(`- **Code context:** up to ~${config.maxCodeTokens} tokens`);
  lines.push(`- **Documentation context:** up to ~${config.maxDocTokens} tokens`);
  lines.push(`- **Knowledge context:** up to ~${config.maxKnowledgeTokens} tokens`);

  lines.push(`\n**Priority order** (pull context from these first): ${config.priorityOrder.map(g => GRAPH_LABELS[g]).join(' → ')}`);

  const dedup: Record<string, string> = {
    strict: 'Deduplicate strictly — never show the same content from multiple search results.',
    fuzzy: 'Deduplicate similar content — merge overlapping results but keep distinct perspectives.',
    none: 'Do not deduplicate — show all results as returned.',
  };
  lines.push(`\n**Deduplication:** ${dedup[config.deduplication]}`);

  return lines.join('\n');
}
