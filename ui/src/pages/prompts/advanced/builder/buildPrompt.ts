import type { MegaBuilderState } from '../types.ts';
import type { GraphStats } from '../../prompt-builder.ts';
import { buildRoleSection } from './sections/roleSection.ts';
import { buildStyleSection } from './sections/styleSection.ts';
import { buildGraphsSection } from './sections/graphsSection.ts';
import { buildToolsSection } from './sections/toolsSection.ts';
import { buildWorkflowSection } from './sections/workflowSection.ts';
import { buildTechStackSection } from './sections/techStackSection.ts';
import { buildBehaviorSection } from './sections/behaviorSection.ts';
import { buildMemorySection } from './sections/memorySection.ts';
import { buildSearchSection } from './sections/searchSection.ts';
import { buildContextSection } from './sections/contextSection.ts';
import { buildRulesSection } from './sections/rulesSection.ts';
import { buildCollaborationSection } from './sections/collaborationSection.ts';
import { buildCustomSections } from './sections/customSection.ts';

type SectionGenerator = () => string | null;

export function buildAdvancedPrompt(
  state: MegaBuilderState,
  graphStats: GraphStats[],
): string {
  const generators: Record<string, SectionGenerator> = {
    role: () => buildRoleSection(state.role),
    style: () => buildStyleSection(state.style),
    'tech-stack': () => buildTechStackSection(state.techStack),
    graphs: () => buildGraphsSection(state.graphs, graphStats),
    tools: () => buildToolsSection(state.graphs, graphStats, state.toolConfigs, state.toolChains),
    behavior: () => buildBehaviorSection(state.behavior),
    memory: () => buildMemorySection(state.memoryStrategy),
    search: () => buildSearchSection(state.searchStrategy),
    context: () => buildContextSection(state.contextBudget),
    rules: () => buildRulesSection(state.projectRules),
    collaboration: () => buildCollaborationSection(state.collaboration),
    workflow: () => buildWorkflowSection(state.scenarioId, state.workflow),
    custom: () => buildCustomSections(state.customSections),
  };

  const sections = state.promptSections
    .filter(s => s.enabled)
    .sort((a, b) => a.weight - b.weight);

  const parts = [
    '## Graph Memory\n\nYou have access to **Graph Memory** — an MCP server that maintains a semantic graph of this project. Use it as your primary source of context before reading files directly.',
  ];

  for (const section of sections) {
    const gen = generators[section.id];
    const output = gen?.();
    if (output) {
      parts.push(output);
      if (section.id === 'tools') {
        parts.push('**Important:** Only use tools listed in the "Tools" section above. If a tool is mentioned elsewhere in this prompt but not listed under "Tools", it means the corresponding graph is not enabled — do not call it.');
      }
    }
  }

  parts.push('**Always search Graph Memory before reading files directly — the graph provides faster, more structured access to project context.**');

  return parts.join('\n\n').replace(/\n{3,}/g, '\n\n').trim();
}
