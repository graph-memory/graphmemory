import type { SearchStrategyConfig } from '../../types.ts';

export function buildSearchSection(config: SearchStrategyConfig): string | null {
  const lines = ['### Search Strategy\n'];

  const depthMap: Record<string, string> = {
    shallow: 'Use quick, focused searches. Prefer `list_*` tools for browsing and `search_*` with specific queries.',
    medium: 'Use a balanced search approach — start specific, broaden if needed. Follow up with `get_*` tools for details.',
    deep: 'Search thoroughly — query multiple graphs, use broad terms, then narrow down. Always cross-reference across graphs.',
  };
  if (depthMap[config.defaultDepth]) lines.push(depthMap[config.defaultDepth]);

  const crossGraph: Record<string, string> = {
    always: 'Always expand search across graphs — when you find something in code, also check docs, notes, and tasks.',
    'when-needed': 'Expand search across graphs when the initial results are insufficient or when you need full context.',
    never: 'Stay within the primary graph for each query. Only cross-reference when explicitly asked.',
  };
  if (crossGraph[config.crossGraphExpansion]) lines.push(crossGraph[config.crossGraphExpansion]);

  lines.push(`When traversing graph relationships, explore up to **${config.bfsHops}** hops from the starting node.`);

  lines.push(`Request up to **${config.resultCount}** results per search query.`);

  if (config.keywordWeight < 30) {
    lines.push('Favor **semantic search** — use natural language descriptions rather than exact keywords.');
  } else if (config.keywordWeight > 70) {
    lines.push('Favor **keyword search** — use specific function names, class names, and exact terms.');
  } else {
    lines.push('Use a **balanced mix** of semantic and keyword search.');
  }

  return lines.join('\n');
}
