import { ALL_GRAPHS, TOOL_CATALOG, type GraphName } from '@/content/prompts/index.ts';
import { SCENARIOS } from '../scenarios.tsx';
import type { MegaBuilderState, ToolConfig, PromptSection, StackConfig } from './types.ts';

const DEFAULT_TOOL_CONFIG: ToolConfig = { priority: 'available', customInstructions: '' };

function buildToolConfigs(): Record<string, ToolConfig> {
  const configs: Record<string, ToolConfig> = {};
  for (const name of Object.keys(TOOL_CATALOG)) {
    configs[name] = { ...DEFAULT_TOOL_CONFIG };
  }
  return configs;
}

const DEFAULT_SECTIONS: PromptSection[] = [
  { id: 'role', title: 'Role', enabled: true, weight: 1 },
  { id: 'style', title: 'Style', enabled: true, weight: 2 },
  { id: 'stack', title: 'Stack', enabled: false, weight: 3 },
  { id: 'graphs', title: 'Available Graphs', enabled: true, weight: 4 },
  { id: 'tools', title: 'Tools', enabled: true, weight: 5 },
  { id: 'behavior', title: 'Response Style', enabled: false, weight: 6 },
  { id: 'memory', title: 'Knowledge Management', enabled: false, weight: 7 },
  { id: 'search', title: 'Search Strategy', enabled: false, weight: 8 },
  { id: 'context', title: 'Context Budget', enabled: false, weight: 9 },
  { id: 'rules', title: 'Project Rules', enabled: false, weight: 10 },
  { id: 'collaboration', title: 'Collaboration', enabled: false, weight: 11 },
  { id: 'workflow', title: 'Workflow', enabled: true, weight: 12 },
  { id: 'custom', title: 'Custom Sections', enabled: false, weight: 13 },
];

const DEFAULT_BEHAVIOR = {
  verbosity: 'normal' as const,
  codeExamples: 'when-helpful' as const,
  explanationDepth: 'standard' as const,
  responseLanguage: 'en',
  formatPreference: 'mixed' as const,
};

const DEFAULT_MEMORY = {
  autoCreateNotes: 'ask' as const,
  noteDetailLevel: 3,
  relationStrategy: 'conservative' as const,
  skillCaptureThreshold: 3,
  taskAutoCreate: 'ask' as const,
};

const DEFAULT_SEARCH = {
  defaultDepth: 'medium' as const,
  crossGraphExpansion: 'when-needed' as const,
  bfsHops: 2,
  resultCount: 10,
  keywordWeight: 50,
};

const DEFAULT_COLLABORATION = {
  mode: 'solo' as const,
  reviewStrictness: 'standard' as const,
  commitStyle: 'conventional' as const,
  prFormat: 'standard' as const,
};

export function createDefaultState(): MegaBuilderState {
  const scenario = SCENARIOS[0];
  const adv = scenario.advancedDefaults;

  const graphs = {} as Record<GraphName, boolean>;
  for (const g of ALL_GRAPHS) {
    graphs[g] = scenario.defaultGraphs.includes(g);
  }

  // Apply scenario focusTools as 'prefer' priority
  const focusSet = new Set(scenario.focusTools);
  const toolConfigs = buildToolConfigs();
  for (const name of Object.keys(toolConfigs)) {
    if (focusSet.has(name)) {
      toolConfigs[name] = { priority: 'prefer', customInstructions: '' };
    }
  }

  // Enable sections based on scenario
  const alwaysOn = new Set(['role', 'style', 'graphs', 'tools', 'workflow']);
  const scenarioSections = new Set(adv?.enableSections ?? []);
  const promptSections = DEFAULT_SECTIONS.map(s => ({
    ...s,
    enabled: alwaysOn.has(s.id) || scenarioSections.has(s.id),
  }));

  return {
    scenarioId: scenario.id,
    graphs,
    role: scenario.defaultRole,
    style: scenario.defaultStyle,

    stack: { enabledDomains: [], selections: {} } as StackConfig,

    toolConfigs,
    toolChains: [],
    workflow: [],

    behavior: { ...DEFAULT_BEHAVIOR, ...adv?.behavior },
    memoryStrategy: { ...DEFAULT_MEMORY, ...adv?.memoryStrategy },
    searchStrategy: { ...DEFAULT_SEARCH, ...adv?.searchStrategy },

    contextBudget: {
      maxCodeTokens: 4000,
      maxDocTokens: 2000,
      maxKnowledgeTokens: 1000,
      priorityOrder: ['code', 'docs', 'knowledge', 'tasks', 'skills', 'files'],
      deduplication: 'fuzzy',
    },

    projectRules: {
      focusPatterns: [],
      ignorePatterns: [],
      namingConventions: [],
      codeStyleRules: [],
      architecturePatterns: [],
      antiPatterns: [],
    },

    collaboration: { ...DEFAULT_COLLABORATION, ...adv?.collaboration },

    promptSections,
    customSections: [],

    presetName: null,
  };
}
