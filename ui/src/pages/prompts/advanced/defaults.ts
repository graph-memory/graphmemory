import { ALL_GRAPHS, TOOL_CATALOG, type GraphName } from '@/content/prompts/index.ts';
import { SCENARIOS } from '../scenarios.tsx';
import type { MegaBuilderState, ToolConfig, PromptSection } from './types.ts';

const DEFAULT_TOOL_CONFIG: ToolConfig = { priority: 'available', customInstructions: '' };

function buildToolConfigs(): Record<string, ToolConfig> {
  const configs: Record<string, ToolConfig> = {};
  for (const name of Object.keys(TOOL_CATALOG)) {
    configs[name] = { ...DEFAULT_TOOL_CONFIG };
  }
  return configs;
}

const DEFAULT_SECTIONS: PromptSection[] = [
  { id: 'role', title: 'Role', enabled: true, weight: 1, content: null, conditional: false },
  { id: 'style', title: 'Style', enabled: true, weight: 2, content: null, conditional: false },
  { id: 'tech-stack', title: 'Tech Stack', enabled: false, weight: 3, content: null, conditional: false },
  { id: 'graphs', title: 'Available Graphs', enabled: true, weight: 4, content: null, conditional: false },
  { id: 'tools', title: 'Tools', enabled: true, weight: 5, content: null, conditional: false },
  { id: 'behavior', title: 'Response Style', enabled: false, weight: 6, content: null, conditional: false },
  { id: 'memory', title: 'Knowledge Management', enabled: false, weight: 7, content: null, conditional: false },
  { id: 'search', title: 'Search Strategy', enabled: false, weight: 8, content: null, conditional: false },
  { id: 'context', title: 'Context Budget', enabled: false, weight: 9, content: null, conditional: false },
  { id: 'rules', title: 'Project Rules', enabled: false, weight: 10, content: null, conditional: false },
  { id: 'collaboration', title: 'Collaboration', enabled: false, weight: 11, content: null, conditional: false },
  { id: 'workflow', title: 'Workflow', enabled: true, weight: 12, content: null, conditional: false },
  { id: 'custom', title: 'Custom Sections', enabled: false, weight: 13, content: null, conditional: false },
];

export function createDefaultState(): MegaBuilderState {
  const scenario = SCENARIOS[0];
  const graphs = {} as Record<GraphName, boolean>;
  for (const g of ALL_GRAPHS) {
    graphs[g] = scenario.defaultGraphs.includes(g);
  }

  return {
    scenarioId: scenario.id,
    graphs,
    role: scenario.defaultRole,
    style: scenario.defaultStyle,

    techStack: {
      languages: [],
      runtimes: [],
      frontend: [],
      backend: [],
      mobile: [],
      testing: [],
      bundler: [],
      orm: [],
      stateManagement: [],
      styling: [],
      paradigms: [],
      testingApproaches: [],
      packageManager: [],
    },

    toolConfigs: buildToolConfigs(),
    toolChains: [],

    workflow: [],

    behavior: {
      verbosity: 'normal',
      codeExamples: 'when-helpful',
      explanationDepth: 'standard',
      responseLanguage: 'en',
      formatPreference: 'mixed',
    },

    memoryStrategy: {
      autoCreateNotes: 'ask',
      noteDetailLevel: 3,
      relationStrategy: 'conservative',
      skillCaptureThreshold: 3,
      taskAutoCreate: 'ask',
    },

    searchStrategy: {
      defaultDepth: 'medium',
      crossGraphExpansion: 'when-needed',
      bfsHops: 2,
      resultCount: 10,
      keywordWeight: 50,
    },

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

    collaboration: {
      mode: 'solo',
      reviewStrictness: 'standard',
      commitStyle: 'conventional',
      prFormat: 'standard',
    },

    promptSections: DEFAULT_SECTIONS.map(s => ({ ...s })),
    customSections: [],

    presetName: null,
  };
}
