import { type ReactElement } from 'react';
import SchoolIcon from '@mui/icons-material/School';
import TerminalIcon from '@mui/icons-material/Terminal';
import RateReviewIcon from '@mui/icons-material/RateReview';
import BugReportIcon from '@mui/icons-material/BugReport';
import BuildIcon from '@mui/icons-material/Build';
import ArchitectureIcon from '@mui/icons-material/Architecture';
import DescriptionIcon from '@mui/icons-material/Description';
import ViewKanbanIcon from '@mui/icons-material/ViewKanban';
import LightbulbIcon from '@mui/icons-material/Lightbulb';
import SchoolOutlinedIcon from '@mui/icons-material/SchoolOutlined';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import AccountTreeIcon from '@mui/icons-material/AccountTree';
import AssessmentIcon from '@mui/icons-material/Assessment';
import TuneIcon from '@mui/icons-material/Tune';
import type { GraphName, RoleName, StyleName } from '@/content/prompts/index.ts';
import type {
  BehaviorConfig, MemoryStrategyConfig, SearchStrategyConfig, CollaborationConfig,
} from './advanced/types.ts';

export interface ScenarioAdvancedDefaults {
  behavior?: Partial<BehaviorConfig>;
  memoryStrategy?: Partial<MemoryStrategyConfig>;
  searchStrategy?: Partial<SearchStrategyConfig>;
  collaboration?: Partial<CollaborationConfig>;
  enableSections?: string[];  // section ids to enable beyond the always-on ones
}

export interface ScenarioConfig {
  id: string;
  label: string;
  description: string;
  icon: ReactElement;
  defaultGraphs: GraphName[];
  defaultRole: RoleName;
  defaultStyle: StyleName;
  focusTools: string[];
  triggers: string[];
  advancedDefaults?: ScenarioAdvancedDefaults;
}

export const SCENARIOS: ScenarioConfig[] = [
  {
    id: 'onboarding',
    label: 'Onboarding',
    description: 'Explore a new project — architecture, code, and docs',
    icon: <SchoolIcon />,
    defaultGraphs: ['docs', 'code', 'files', 'knowledge', 'tasks', 'skills'],
    defaultRole: 'developer',
    defaultStyle: 'balanced',
    focusTools: ['docs_search', 'code_search', 'docs_cross_references', 'docs_explain_symbol', 'docs_get_toc', 'docs_list_files', 'code_get_symbol', 'files_search'],
    triggers: ['onboarding', 'new developer', 'explore project'],
    advancedDefaults: {
      behavior: { verbosity: 'detailed', codeExamples: 'always', explanationDepth: 'deep-dive' },
      memoryStrategy: { autoCreateNotes: 'ask', relationStrategy: 'conservative', taskAutoCreate: 'never' },
      searchStrategy: { defaultDepth: 'deep', crossGraphExpansion: 'always', bfsHops: 3 },
      collaboration: { mode: 'solo', reviewStrictness: 'lenient' },
      enableSections: ['behavior', 'docs_search'],
    },
  },
  {
    id: 'development',
    label: 'Development',
    description: 'Everyday coding — tasks, context, code, knowledge',
    icon: <TerminalIcon />,
    defaultGraphs: ['docs', 'code', 'files', 'knowledge', 'tasks', 'skills'],
    defaultRole: 'developer',
    defaultStyle: 'proactive',
    focusTools: ['code_search', 'code_get_symbol', 'tasks_search', 'tasks_move', 'skills_recall', 'notes_create', 'tasks_find_linked', 'docs_cross_references'],
    triggers: ['development', 'coding', 'implement', 'write code'],
    advancedDefaults: {
      memoryStrategy: { autoCreateNotes: 'ask', taskAutoCreate: 'ask', relationStrategy: 'conservative' },
      searchStrategy: { defaultDepth: 'medium', crossGraphExpansion: 'when-needed' },
      enableSections: ['memory', 'workflow'],
    },
  },
  {
    id: 'code-review',
    label: 'Code Review',
    description: 'Review changes with full project context',
    icon: <RateReviewIcon />,
    defaultGraphs: ['code', 'docs', 'files', 'tasks'],
    defaultRole: 'reviewer',
    defaultStyle: 'reactive',
    focusTools: ['code_search', 'code_get_symbol', 'tasks_find_linked', 'docs_find_examples', 'docs_cross_references', 'notes_search', 'code_get_file_symbols'],
    triggers: ['code review', 'pull request', 'PR review'],
    advancedDefaults: {
      behavior: { verbosity: 'concise', codeExamples: 'when-helpful' },
      memoryStrategy: { autoCreateNotes: 'never', relationStrategy: 'manual', taskAutoCreate: 'never' },
      searchStrategy: { defaultDepth: 'medium', crossGraphExpansion: 'when-needed' },
      collaboration: { mode: 'pair', reviewStrictness: 'strict' },
      enableSections: ['collaboration'],
    },
  },
  {
    id: 'bug-investigation',
    label: 'Bug Investigation',
    description: 'Investigate and fix bugs with context',
    icon: <BugReportIcon />,
    defaultGraphs: ['code', 'knowledge', 'tasks', 'files'],
    defaultRole: 'developer',
    defaultStyle: 'proactive',
    focusTools: ['code_search', 'code_get_symbol', 'notes_search', 'tasks_find_linked', 'tasks_create', 'notes_create', 'code_get_file_symbols', 'files_search'],
    triggers: ['bug', 'debug', 'investigate', 'fix issue'],
    advancedDefaults: {
      behavior: { verbosity: 'detailed', codeExamples: 'always', explanationDepth: 'deep-dive' },
      memoryStrategy: { autoCreateNotes: 'always', relationStrategy: 'aggressive', taskAutoCreate: 'always' },
      searchStrategy: { defaultDepth: 'deep', crossGraphExpansion: 'always', bfsHops: 3 },
      enableSections: ['memory', 'docs_search'],
    },
  },
  {
    id: 'refactoring',
    label: 'Refactoring',
    description: 'Restructure code, understand dependencies',
    icon: <BuildIcon />,
    defaultGraphs: ['code', 'docs', 'files', 'tasks'],
    defaultRole: 'developer',
    defaultStyle: 'reactive',
    focusTools: ['code_search', 'code_get_file_symbols', 'code_get_symbol', 'docs_cross_references', 'tasks_find_linked', 'code_list_files', 'code_search_files'],
    triggers: ['refactoring', 'restructure', 'reorganize code'],
    advancedDefaults: {
      memoryStrategy: { autoCreateNotes: 'ask', taskAutoCreate: 'ask' },
      searchStrategy: { defaultDepth: 'deep', crossGraphExpansion: 'always', bfsHops: 3 },
      enableSections: ['docs_search'],
    },
  },
  {
    id: 'architecture',
    label: 'Architecture',
    description: 'Design features, analyze patterns and structure',
    icon: <ArchitectureIcon />,
    defaultGraphs: ['code', 'docs', 'files', 'knowledge', 'skills'],
    defaultRole: 'architect',
    defaultStyle: 'proactive',
    focusTools: ['docs_search', 'code_search', 'docs_cross_references', 'code_list_files', 'docs_get_toc', 'notes_create', 'skills_create', 'skills_recall'],
    triggers: ['architecture', 'design', 'system design', 'new feature'],
    advancedDefaults: {
      behavior: { verbosity: 'detailed', explanationDepth: 'deep-dive' },
      memoryStrategy: { autoCreateNotes: 'always', relationStrategy: 'aggressive', taskAutoCreate: 'ask' },
      searchStrategy: { defaultDepth: 'deep', crossGraphExpansion: 'always', bfsHops: 3 },
      enableSections: ['behavior', 'memory', 'docs_search'],
    },
  },
  {
    id: 'documentation',
    label: 'Documentation',
    description: 'Write and maintain project documentation',
    icon: <DescriptionIcon />,
    defaultGraphs: ['docs', 'code', 'knowledge', 'files'],
    defaultRole: 'tech-writer',
    defaultStyle: 'proactive',
    focusTools: ['docs_search', 'docs_get_toc', 'docs_cross_references', 'docs_search_files', 'docs_get_node', 'code_search', 'notes_create', 'docs_list_files'],
    triggers: ['documentation', 'write docs', 'update docs'],
    advancedDefaults: {
      behavior: { verbosity: 'detailed', codeExamples: 'always', explanationDepth: 'deep-dive' },
      memoryStrategy: { autoCreateNotes: 'always', relationStrategy: 'aggressive', taskAutoCreate: 'never' },
      searchStrategy: { defaultDepth: 'deep', crossGraphExpansion: 'always' },
      enableSections: ['behavior', 'memory'],
    },
  },
  {
    id: 'task-planning',
    label: 'Task Planning',
    description: 'Plan sprints, manage priorities, track work',
    icon: <ViewKanbanIcon />,
    defaultGraphs: ['tasks', 'skills', 'knowledge', 'code'],
    defaultRole: 'team-lead',
    defaultStyle: 'proactive',
    focusTools: ['tasks_list', 'tasks_search', 'tasks_create', 'tasks_move', 'skills_recall', 'notes_create', 'tasks_link', 'tasks_find_linked'],
    triggers: ['sprint planning', 'task planning', 'backlog grooming'],
    advancedDefaults: {
      behavior: { verbosity: 'concise', codeExamples: 'never', explanationDepth: 'brief' },
      memoryStrategy: { autoCreateNotes: 'ask', taskAutoCreate: 'always' },
      collaboration: { mode: 'team-lead', reviewStrictness: 'standard' },
      enableSections: ['collaboration', 'memory'],
    },
  },
  {
    id: 'knowledge-capture',
    label: 'Knowledge Capture',
    description: 'Capture decisions, facts, and procedures',
    icon: <LightbulbIcon />,
    defaultGraphs: ['knowledge', 'tasks', 'skills', 'code'],
    defaultRole: 'developer',
    defaultStyle: 'proactive',
    focusTools: ['notes_create', 'notes_create_link', 'skills_create', 'tasks_create', 'tasks_create_link', 'notes_search', 'code_search'],
    triggers: ['knowledge capture', 'meeting notes', 'decision record'],
    advancedDefaults: {
      behavior: { verbosity: 'detailed' },
      memoryStrategy: { autoCreateNotes: 'always', noteDetailLevel: 4, relationStrategy: 'aggressive', skillCaptureThreshold: 2, taskAutoCreate: 'always' },
      searchStrategy: { defaultDepth: 'deep', crossGraphExpansion: 'always' },
      enableSections: ['memory', 'docs_search'],
    },
  },
  {
    id: 'mentoring',
    label: 'Mentoring',
    description: 'Explain code and architecture to others',
    icon: <SchoolOutlinedIcon />,
    defaultGraphs: ['code', 'docs', 'files', 'knowledge'],
    defaultRole: 'developer',
    defaultStyle: 'read-only',
    focusTools: ['docs_explain_symbol', 'docs_cross_references', 'docs_get_toc', 'docs_search', 'code_search', 'code_get_symbol', 'docs_get_node', 'docs_list_files'],
    triggers: ['mentoring', 'explain code', 'teach', 'onboard junior'],
    advancedDefaults: {
      behavior: { verbosity: 'exhaustive', codeExamples: 'always', explanationDepth: 'deep-dive' },
      memoryStrategy: { autoCreateNotes: 'never', relationStrategy: 'manual', taskAutoCreate: 'never' },
      searchStrategy: { defaultDepth: 'deep', crossGraphExpansion: 'always', bfsHops: 3 },
      collaboration: { mode: 'pair', reviewStrictness: 'lenient' },
      enableSections: ['behavior', 'docs_search', 'collaboration'],
    },
  },
  {
    id: 'incident-response',
    label: 'Incident Response',
    description: 'Investigate production issues, find root cause, track fix',
    icon: <WarningAmberIcon />,
    defaultGraphs: ['code', 'knowledge', 'tasks', 'files', 'skills'],
    defaultRole: 'developer',
    defaultStyle: 'proactive',
    focusTools: ['code_search', 'code_get_symbol', 'notes_search', 'skills_recall', 'tasks_create', 'notes_create', 'tasks_find_linked', 'files_search'],
    triggers: ['incident', 'production issue', 'outage', 'critical bug'],
    advancedDefaults: {
      behavior: { verbosity: 'concise', explanationDepth: 'brief' },
      memoryStrategy: { autoCreateNotes: 'always', relationStrategy: 'aggressive', taskAutoCreate: 'always' },
      searchStrategy: { defaultDepth: 'deep', crossGraphExpansion: 'always', bfsHops: 3 },
      enableSections: ['memory', 'docs_search'],
    },
  },
  {
    id: 'dependency-audit',
    label: 'Dependency Audit',
    description: 'Analyze project dependencies, imports, and module structure',
    icon: <AccountTreeIcon />,
    defaultGraphs: ['code', 'files', 'knowledge', 'tasks'],
    defaultRole: 'architect',
    defaultStyle: 'balanced',
    focusTools: ['files_search', 'files_list', 'files_get_info', 'code_search', 'code_get_file_symbols', 'code_list_files', 'notes_create'],
    triggers: ['dependency audit', 'audit dependencies', 'package analysis'],
    advancedDefaults: {
      memoryStrategy: { autoCreateNotes: 'ask', taskAutoCreate: 'ask' },
      searchStrategy: { defaultDepth: 'deep', crossGraphExpansion: 'always' },
      enableSections: ['docs_search'],
    },
  },
  {
    id: 'sprint-retrospective',
    label: 'Sprint Retrospective',
    description: 'Review completed work, extract learnings, plan improvements',
    icon: <AssessmentIcon />,
    defaultGraphs: ['tasks', 'knowledge', 'skills', 'code'],
    defaultRole: 'team-lead',
    defaultStyle: 'proactive',
    focusTools: ['tasks_list', 'tasks_search', 'notes_list', 'notes_search', 'skills_recall', 'notes_create', 'tasks_create', 'skills_create'],
    triggers: ['retrospective', 'retro', 'sprint review', 'post-mortem'],
    advancedDefaults: {
      memoryStrategy: { autoCreateNotes: 'always', relationStrategy: 'aggressive', skillCaptureThreshold: 2, taskAutoCreate: 'always' },
      collaboration: { mode: 'team-lead' },
      enableSections: ['memory', 'collaboration'],
    },
  },
  {
    id: 'custom',
    label: 'Custom',
    description: 'Build your own prompt from scratch',
    icon: <TuneIcon />,
    defaultGraphs: ['docs', 'code', 'files', 'knowledge', 'tasks', 'skills'],
    defaultRole: 'developer',
    defaultStyle: 'reactive',
    focusTools: [],
    triggers: [],
  },
];
