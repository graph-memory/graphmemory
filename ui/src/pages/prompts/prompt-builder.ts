import {
  TEMPLATE, ROLES, STYLES, GRAPHS, WORKFLOWS, TOOL_CATALOG, GRAPH_LABELS,
  type GraphName, type RoleName, type StyleName,
} from '@/content/prompts/index.ts';

export interface GraphStats {
  name: GraphName;
  nodeCount: number;
  available: boolean;
}

export interface BuilderState {
  scenarioId: string;
  graphs: Record<GraphName, boolean>;
  role: RoleName;
  style: StyleName;
}

export function buildPrompt(
  state: BuilderState,
  graphStats: GraphStats[],
  focusTools: string[],
): string {
  const enabledGraphs = graphStats.filter(
    g => state.graphs[g.name] && g.available,
  );
  const enabledGraphNames = new Set(enabledGraphs.map(g => g.name));

  // Role
  const roleContent = ROLES[state.role] || '';

  // Style
  const styleContent = STYLES[state.style] || '';

  // Graphs — insert full .md content as-is, append node count
  let graphsContent = '';
  if (enabledGraphs.length > 0) {
    graphsContent = enabledGraphs
      .map(g => {
        const content = GRAPHS[g.name].trimEnd();
        return `${content}\n\n**Indexed:** ${g.nodeCount} nodes`;
      })
      .join('\n\n');
  } else {
    graphsContent = '*No graphs indexed yet.*';
  }

  // Tools — focus tools as table, rest as compact list
  let toolsContent = '';
  const availableTools = Object.entries(TOOL_CATALOG)
    .filter(([, info]) => enabledGraphNames.has(info.graph));

  if (focusTools.length > 0) {
    // Focus tools — detailed table
    const focusEntries = focusTools
      .filter(name => TOOL_CATALOG[name] && enabledGraphNames.has(TOOL_CATALOG[name].graph));

    if (focusEntries.length > 0) {
      toolsContent += '| Tool | Purpose |\n|------|---------|';
      for (const name of focusEntries) {
        toolsContent += `\n| \`${name}\` | ${TOOL_CATALOG[name].description} |`;
      }
    }

    // Remaining tools — grouped by graph
    const focusSet = new Set(focusEntries);
    const remaining = availableTools.filter(([name]) => !focusSet.has(name));

    if (remaining.length > 0) {
      toolsContent += '\n\n**Also available:**';
      for (const g of enabledGraphs) {
        const graphTools = remaining
          .filter(([, info]) => info.graph === g.name)
          .map(([name]) => `\`${name}\``);
        if (graphTools.length > 0) {
          toolsContent += `\n- **${GRAPH_LABELS[g.name]}:** ${graphTools.join(', ')}`;
        }
      }
    }
  } else {
    // Custom scenario — show all tools grouped by graph
    for (const g of enabledGraphs) {
      const graphTools = availableTools.filter(([, info]) => info.graph === g.name);
      if (graphTools.length > 0) {
        toolsContent += `\n\n**${GRAPH_LABELS[g.name]}:** ${graphTools.map(([name]) => `\`${name}\``).join(', ')}`;
      }
    }
    toolsContent = toolsContent.trim();
  }

  // Workflow
  const workflowContent = WORKFLOWS[state.scenarioId] || '';

  // Build from template
  let result = TEMPLATE
    .replace('{{role}}', roleContent)
    .replace('{{style}}', styleContent)
    .replace('{{graphs}}', graphsContent)
    .replace('{{tools}}', toolsContent)
    .replace('{{workflow}}', workflowContent);

  // Clean up blank lines
  result = result.replace(/\n{3,}/g, '\n\n');

  return result.trim();
}
