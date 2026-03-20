import { GRAPHS, type GraphName } from '@/content/prompts/index.ts';
import type { GraphStats } from '../../../prompt-builder.ts';

export function buildGraphsSection(
  graphs: Record<GraphName, boolean>,
  graphStats: GraphStats[],
): string | null {
  const enabled = graphStats.filter(g => graphs[g.name] && g.available);
  if (enabled.length === 0) return '### Available Graphs\n\n*No graphs indexed yet.*';

  return '### Available Graphs\n\n' + enabled
    .map(g => `${GRAPHS[g.name].trimEnd()}\n\n**Indexed:** ${g.nodeCount} nodes`)
    .join('\n\n');
}
