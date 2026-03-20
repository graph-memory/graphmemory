import type { GraphName, RoleName, StyleName } from '@/content/prompts/index.ts';
import type {
  MegaBuilderState, ToolConfig, ToolChain, WorkflowStep,
  TechStackConfig, BehaviorConfig, MemoryStrategyConfig,
  SearchStrategyConfig, ContextBudgetConfig, ProjectRulesConfig,
  CollaborationConfig, PromptSection, CustomSection,
} from '../types.ts';

export type BuilderAction =
  | { type: 'SET_SCENARIO'; scenarioId: string }
  | { type: 'SET_GRAPHS'; graphs: Record<GraphName, boolean> }
  | { type: 'TOGGLE_GRAPH'; name: GraphName }
  | { type: 'SET_ROLE'; role: RoleName }
  | { type: 'SET_STYLE'; style: StyleName }
  | { type: 'SET_TECH_STACK'; techStack: TechStackConfig }
  | { type: 'UPDATE_TECH_STACK'; key: keyof TechStackConfig; value: string[] }
  | { type: 'SET_TOOL_CONFIG'; tool: string; config: ToolConfig }
  | { type: 'SET_TOOL_CHAINS'; chains: ToolChain[] }
  | { type: 'SET_WORKFLOW'; workflow: WorkflowStep[] }
  | { type: 'SET_BEHAVIOR'; behavior: BehaviorConfig }
  | { type: 'SET_MEMORY_STRATEGY'; strategy: MemoryStrategyConfig }
  | { type: 'SET_SEARCH_STRATEGY'; strategy: SearchStrategyConfig }
  | { type: 'SET_CONTEXT_BUDGET'; budget: ContextBudgetConfig }
  | { type: 'SET_PROJECT_RULES'; rules: ProjectRulesConfig }
  | { type: 'SET_COLLABORATION'; collaboration: CollaborationConfig }
  | { type: 'SET_PROMPT_SECTIONS'; sections: PromptSection[] }
  | { type: 'TOGGLE_SECTION'; sectionId: string }
  | { type: 'SET_CUSTOM_SECTIONS'; sections: CustomSection[] }
  | { type: 'SET_PRESET_NAME'; name: string | null }
  | { type: 'LOAD_STATE'; state: MegaBuilderState };

export function builderReducer(state: MegaBuilderState, action: BuilderAction): MegaBuilderState {
  switch (action.type) {
    case 'SET_SCENARIO':
      return { ...state, scenarioId: action.scenarioId };
    case 'SET_GRAPHS':
      return { ...state, graphs: action.graphs };
    case 'TOGGLE_GRAPH':
      return { ...state, graphs: { ...state.graphs, [action.name]: !state.graphs[action.name] } };
    case 'SET_ROLE':
      return { ...state, role: action.role };
    case 'SET_STYLE':
      return { ...state, style: action.style };
    case 'SET_TECH_STACK':
      return { ...state, techStack: action.techStack };
    case 'UPDATE_TECH_STACK':
      return { ...state, techStack: { ...state.techStack, [action.key]: action.value } };
    case 'SET_TOOL_CONFIG':
      return { ...state, toolConfigs: { ...state.toolConfigs, [action.tool]: action.config } };
    case 'SET_TOOL_CHAINS':
      return { ...state, toolChains: action.chains };
    case 'SET_WORKFLOW':
      return { ...state, workflow: action.workflow };
    case 'SET_BEHAVIOR':
      return { ...state, behavior: action.behavior };
    case 'SET_MEMORY_STRATEGY':
      return { ...state, memoryStrategy: action.strategy };
    case 'SET_SEARCH_STRATEGY':
      return { ...state, searchStrategy: action.strategy };
    case 'SET_CONTEXT_BUDGET':
      return { ...state, contextBudget: action.budget };
    case 'SET_PROJECT_RULES':
      return { ...state, projectRules: action.rules };
    case 'SET_COLLABORATION':
      return { ...state, collaboration: action.collaboration };
    case 'SET_PROMPT_SECTIONS':
      return { ...state, promptSections: action.sections };
    case 'TOGGLE_SECTION': {
      const sections = state.promptSections.map(s =>
        s.id === action.sectionId ? { ...s, enabled: !s.enabled } : s,
      );
      return { ...state, promptSections: sections };
    }
    case 'SET_CUSTOM_SECTIONS':
      return { ...state, customSections: action.sections };
    case 'SET_PRESET_NAME':
      return { ...state, presetName: action.name };
    case 'LOAD_STATE':
      return action.state;
    default:
      return state;
  }
}
