import { TOOL_CATALOG, type GraphName } from '@/content/prompts/index.ts';
import type { ToolConfig, ToolChain } from '../../types.ts';
import type { GraphStats } from '../../../prompt-builder.ts';

export function buildToolsSection(
  graphs: Record<GraphName, boolean>,
  graphStats: GraphStats[],
  toolConfigs: Record<string, ToolConfig>,
  toolChains: ToolChain[],
): string | null {
  const enabledGraphs = new Set(
    graphStats.filter(g => graphs[g.name] && g.available).map(g => g.name),
  );

  const availableTools = Object.entries(TOOL_CATALOG)
    .filter(([, info]) => enabledGraphs.has(info.graph));

  if (availableTools.length === 0) return null;

  const parts: string[] = ['### Tools\n'];

  // Group by priority
  const always = availableTools.filter(([name]) => toolConfigs[name]?.priority === 'always');
  const prefer = availableTools.filter(([name]) => toolConfigs[name]?.priority === 'prefer');
  const available = availableTools.filter(([name]) => {
    const p = toolConfigs[name]?.priority;
    return !p || p === 'available';
  });
  const avoid = availableTools.filter(([name]) => toolConfigs[name]?.priority === 'avoid');

  // Always-use tools as table
  if (always.length > 0) {
    parts.push('**Always use these tools:**\n');
    parts.push('| Tool | Purpose |');
    parts.push('|------|---------|');
    for (const [name] of always) {
      const custom = toolConfigs[name]?.customInstructions;
      const desc = custom || TOOL_CATALOG[name].description;
      parts.push(`| \`${name}\` | ${desc} |`);
    }
  }

  // Preferred tools
  if (prefer.length > 0) {
    parts.push(`\n**Preferred:** ${prefer.map(([n]) => `\`${n}\``).join(', ')}`);
  }

  // Available tools
  if (available.length > 0) {
    parts.push(`\n**Available:** ${available.map(([n]) => `\`${n}\``).join(', ')}`);
  }

  // Avoid tools
  if (avoid.length > 0) {
    parts.push(`\n**Avoid unless necessary:** ${avoid.map(([n]) => `\`${n}\``).join(', ')}`);
  }

  // Custom instructions for specific tools
  const customized = availableTools.filter(([name]) =>
    toolConfigs[name]?.customInstructions && toolConfigs[name].priority !== 'always',
  );
  if (customized.length > 0) {
    parts.push('\n**Tool-specific instructions:**');
    for (const [name] of customized) {
      parts.push(`- \`${name}\`: ${toolConfigs[name].customInstructions}`);
    }
  }

  // Tool chains
  if (toolChains.length > 0) {
    parts.push('\n**Tool chains (follow this order):**');
    for (const chain of toolChains) {
      parts.push(`- **${chain.name}**: ${chain.steps.map(s => `\`${s}\``).join(' → ')}${chain.description ? ` — ${chain.description}` : ''}`);
    }
  }

  return parts.join('\n');
}
