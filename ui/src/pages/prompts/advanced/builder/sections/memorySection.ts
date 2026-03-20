import type { MemoryStrategyConfig } from '../../types.ts';

export function buildMemorySection(config: MemoryStrategyConfig): string | null {
  const lines = ['### Knowledge Management\n'];

  // Notes
  const noteRules: Record<string, string> = {
    always: 'Automatically create knowledge notes when you discover important patterns, decisions, or non-obvious behavior.',
    ask: 'Suggest creating knowledge notes when appropriate, but wait for confirmation before creating.',
    never: 'Do not create knowledge notes unless explicitly asked.',
  };
  lines.push(`**Notes:** ${noteRules[config.autoCreateNotes]}`);

  if (config.noteDetailLevel <= 2) {
    lines.push('Keep notes brief — title and 1-2 sentences.');
  } else if (config.noteDetailLevel === 3) {
    lines.push('Write notes with moderate detail — enough context for someone unfamiliar to understand.');
  } else {
    lines.push('Write detailed notes with full context, alternatives considered, and implications.');
  }

  // Relations
  const relationRules: Record<string, string> = {
    aggressive: 'Create relations aggressively — link every note to all relevant code symbols, doc sections, tasks, and other notes.',
    conservative: 'Create relations only for the most important connections — focus on direct relationships.',
    manual: 'Only create relations when explicitly asked.',
  };
  lines.push(`**Relations:** ${relationRules[config.relationStrategy]}`);

  // Skills
  if (config.skillCaptureThreshold <= 2) {
    lines.push('**Skills:** Save procedures as skills frequently — even simple workflows are worth capturing.');
  } else if (config.skillCaptureThreshold === 3) {
    lines.push('**Skills:** Save procedures as skills when they are non-trivial and likely to be reused.');
  } else {
    lines.push('**Skills:** Only save procedures as skills when they are complex, non-obvious, and likely to be reused.');
  }

  // Tasks
  const taskRules: Record<string, string> = {
    always: 'Automatically create tasks for follow-up work, bugs, and improvements you identify.',
    ask: 'Suggest creating tasks when you identify follow-up work, but wait for confirmation.',
    never: 'Do not create tasks unless explicitly asked.',
  };
  lines.push(`**Tasks:** ${taskRules[config.taskAutoCreate]}`);

  return lines.join('\n');
}
