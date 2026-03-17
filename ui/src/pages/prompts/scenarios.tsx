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
import TuneIcon from '@mui/icons-material/Tune';
import type { GraphName, RoleName, StyleName } from '@/content/prompts/index.ts';

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
}

export const SCENARIOS: ScenarioConfig[] = [
  {
    id: 'onboarding',
    label: 'Onboarding',
    description: 'Explore a new project — architecture, code, and docs',
    icon: <SchoolIcon />,
    defaultGraphs: ['docs', 'code', 'files', 'knowledge', 'tasks', 'skills'],
    defaultRole: 'developer',
    defaultStyle: 'reactive',
    focusTools: ['search', 'search_code', 'cross_references', 'explain_symbol', 'get_toc', 'list_topics', 'get_symbol', 'search_all_files'],
    triggers: ['onboarding', 'new developer', 'explore project'],
  },
  {
    id: 'development',
    label: 'Development',
    description: 'Everyday coding — tasks, context, code, knowledge',
    icon: <TerminalIcon />,
    defaultGraphs: ['docs', 'code', 'files', 'knowledge', 'tasks', 'skills'],
    defaultRole: 'developer',
    defaultStyle: 'proactive',
    focusTools: ['search_code', 'get_symbol', 'search_tasks', 'move_task', 'recall_skills', 'create_note', 'find_linked_tasks', 'cross_references'],
    triggers: ['development', 'coding', 'implement', 'write code'],
  },
  {
    id: 'code-review',
    label: 'Code Review',
    description: 'Review changes with full project context',
    icon: <RateReviewIcon />,
    defaultGraphs: ['code', 'docs', 'files', 'tasks'],
    defaultRole: 'reviewer',
    defaultStyle: 'reactive',
    focusTools: ['search_code', 'get_symbol', 'find_linked_tasks', 'find_examples', 'cross_references', 'search_notes', 'get_file_symbols'],
    triggers: ['code review', 'pull request', 'PR review'],
  },
  {
    id: 'bug-investigation',
    label: 'Bug Investigation',
    description: 'Investigate and fix bugs with context',
    icon: <BugReportIcon />,
    defaultGraphs: ['code', 'knowledge', 'tasks', 'files'],
    defaultRole: 'developer',
    defaultStyle: 'proactive',
    focusTools: ['search_code', 'get_symbol', 'search_notes', 'find_linked_tasks', 'create_task', 'create_note', 'get_file_symbols', 'search_all_files'],
    triggers: ['bug', 'debug', 'investigate', 'fix issue'],
  },
  {
    id: 'refactoring',
    label: 'Refactoring',
    description: 'Restructure code, understand dependencies',
    icon: <BuildIcon />,
    defaultGraphs: ['code', 'docs', 'files', 'tasks'],
    defaultRole: 'developer',
    defaultStyle: 'reactive',
    focusTools: ['search_code', 'get_file_symbols', 'get_symbol', 'cross_references', 'find_linked_tasks', 'list_files', 'search_files'],
    triggers: ['refactoring', 'restructure', 'reorganize code'],
  },
  {
    id: 'architecture',
    label: 'Architecture',
    description: 'Design features, analyze patterns and structure',
    icon: <ArchitectureIcon />,
    defaultGraphs: ['code', 'docs', 'files', 'knowledge', 'skills'],
    defaultRole: 'architect',
    defaultStyle: 'proactive',
    focusTools: ['search', 'search_code', 'cross_references', 'list_files', 'get_toc', 'create_note', 'create_skill', 'recall_skills'],
    triggers: ['architecture', 'design', 'system design', 'new feature'],
  },
  {
    id: 'documentation',
    label: 'Documentation',
    description: 'Write and maintain project documentation',
    icon: <DescriptionIcon />,
    defaultGraphs: ['docs', 'code', 'knowledge', 'files'],
    defaultRole: 'tech-writer',
    defaultStyle: 'proactive',
    focusTools: ['search', 'get_toc', 'cross_references', 'search_topic_files', 'get_node', 'search_code', 'create_note', 'list_topics'],
    triggers: ['documentation', 'write docs', 'update docs'],
  },
  {
    id: 'task-planning',
    label: 'Task Planning',
    description: 'Plan sprints, manage priorities, track work',
    icon: <ViewKanbanIcon />,
    defaultGraphs: ['tasks', 'skills', 'knowledge', 'code'],
    defaultRole: 'team-lead',
    defaultStyle: 'proactive',
    focusTools: ['list_tasks', 'search_tasks', 'create_task', 'move_task', 'recall_skills', 'create_note', 'link_task', 'find_linked_tasks'],
    triggers: ['sprint planning', 'task planning', 'backlog grooming'],
  },
  {
    id: 'knowledge-capture',
    label: 'Knowledge Capture',
    description: 'Capture decisions, facts, and procedures',
    icon: <LightbulbIcon />,
    defaultGraphs: ['knowledge', 'tasks', 'skills', 'code'],
    defaultRole: 'developer',
    defaultStyle: 'proactive',
    focusTools: ['create_note', 'create_relation', 'create_skill', 'create_task', 'create_task_link', 'search_notes', 'search_code'],
    triggers: ['knowledge capture', 'meeting notes', 'decision record'],
  },
  {
    id: 'mentoring',
    label: 'Mentoring',
    description: 'Explain code and architecture to others',
    icon: <SchoolOutlinedIcon />,
    defaultGraphs: ['code', 'docs', 'files', 'knowledge'],
    defaultRole: 'developer',
    defaultStyle: 'read-only',
    focusTools: ['explain_symbol', 'cross_references', 'get_toc', 'search', 'search_code', 'get_symbol', 'get_node', 'list_topics'],
    triggers: ['mentoring', 'explain code', 'teach', 'onboard junior'],
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
