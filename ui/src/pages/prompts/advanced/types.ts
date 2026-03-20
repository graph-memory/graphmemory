import type { GraphName, RoleName, StyleName } from '@/content/prompts/index.ts';

// ── Tool configuration ──
export type ToolPriority = 'always' | 'prefer' | 'available' | 'avoid' | 'disabled';

export interface ToolConfig {
  priority: ToolPriority;
  customInstructions: string;
}

export interface ToolChain {
  id: string;
  name: string;
  steps: string[];  // tool names in order
  description: string;
}

// ── Workflow ──
export interface WorkflowStep {
  id: string;
  description: string;
  tools: string[];
  condition?: string;
}

// ── Tech Stack (JS/TS only) ──
export interface TechStackConfig {
  languages: string[];     // 'TypeScript' | 'JavaScript'
  runtimes: string[];      // 'Node.js' | 'Deno' | 'Bun'
  frontend: string[];
  backend: string[];
  mobile: string[];
  testing: string[];
  bundler: string[];
  orm: string[];
  stateManagement: string[];
  styling: string[];
  paradigms: string[];
  testingApproaches: string[];
  packageManager: string[];
}

// ── Behavior ──
export type Verbosity = 'concise' | 'normal' | 'detailed' | 'exhaustive';
export type CodeExamples = 'always' | 'when-helpful' | 'never';
export type ExplanationDepth = 'brief' | 'standard' | 'deep-dive';
export type FormatPref = 'bullets' | 'tables' | 'prose' | 'mixed';

export interface BehaviorConfig {
  verbosity: Verbosity;
  codeExamples: CodeExamples;
  explanationDepth: ExplanationDepth;
  responseLanguage: string;
  formatPreference: FormatPref;
}

// ── Memory Strategy ──
export type AutoCreate = 'always' | 'ask' | 'never';

export interface MemoryStrategyConfig {
  autoCreateNotes: AutoCreate;
  noteDetailLevel: number;  // 1-5
  relationStrategy: 'aggressive' | 'conservative' | 'manual';
  skillCaptureThreshold: number;  // 1-5
  taskAutoCreate: AutoCreate;
}

// ── Search Strategy ──
export type SearchDepth = 'shallow' | 'medium' | 'deep';

export interface SearchStrategyConfig {
  defaultDepth: SearchDepth;
  crossGraphExpansion: 'always' | 'when-needed' | 'never';
  bfsHops: number;         // 1-5
  resultCount: number;     // 5-50
  keywordWeight: number;   // 0-100, semantic = 100 - keyword
}

// ── Context Budget ──
export interface ContextBudgetConfig {
  maxCodeTokens: number;
  maxDocTokens: number;
  maxKnowledgeTokens: number;
  priorityOrder: GraphName[];
  deduplication: 'strict' | 'fuzzy' | 'none';
}

// ── Project Rules ──
export interface ProjectRulesConfig {
  focusPatterns: string[];
  ignorePatterns: string[];
  namingConventions: string[];
  codeStyleRules: string[];
  architecturePatterns: string[];
  antiPatterns: string[];
}

// ── Collaboration ──
export type CollabMode = 'solo' | 'pair' | 'team-lead';
export type ReviewStrictness = 'lenient' | 'standard' | 'strict' | 'pedantic';

export interface CollaborationConfig {
  mode: CollabMode;
  reviewStrictness: ReviewStrictness;
  commitStyle: 'conventional' | 'descriptive' | 'minimal';
  prFormat: 'detailed' | 'standard' | 'minimal';
}

// ── Prompt Sections ──
export interface PromptSection {
  id: string;
  title: string;
  enabled: boolean;
  weight: number;
  content: string | null;  // null = auto-generated
  conditional: boolean;
}

export interface CustomSection {
  id: string;
  title: string;
  markdown: string;
}

// ── Full State ──
export interface MegaBuilderState {
  // Core (same as simple)
  scenarioId: string;
  graphs: Record<GraphName, boolean>;
  role: RoleName;
  style: StyleName;

  // Advanced sections
  techStack: TechStackConfig;
  toolConfigs: Record<string, ToolConfig>;
  toolChains: ToolChain[];
  workflow: WorkflowStep[];
  behavior: BehaviorConfig;
  memoryStrategy: MemoryStrategyConfig;
  searchStrategy: SearchStrategyConfig;
  contextBudget: ContextBudgetConfig;
  projectRules: ProjectRulesConfig;
  collaboration: CollaborationConfig;
  promptSections: PromptSection[];
  customSections: CustomSection[];

  // Meta
  presetName: string | null;
}
