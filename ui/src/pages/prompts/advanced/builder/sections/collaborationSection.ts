import type { CollaborationConfig } from '../../types.ts';

export function buildCollaborationSection(config: CollaborationConfig): string | null {
  const lines = ['### Collaboration\n'];

  const modeMap: Record<string, string> = {
    solo: 'You are working with a **solo developer**. Be direct, skip team coordination concerns.',
    pair: 'You are in a **pair programming** session. Think out loud, explain your reasoning, and discuss trade-offs before acting.',
    'team-lead': 'You are working with a **team lead** who directs others. Focus on delegation, task breakdown, and cross-team impact.',
  };
  lines.push(modeMap[config.mode]);

  const strictnessMap: Record<string, string> = {
    lenient: 'Review leniently — focus only on correctness and critical issues. Skip style preferences.',
    standard: 'Review with standard strictness — check correctness, consistency, and major style issues.',
    strict: 'Review strictly — check correctness, consistency, naming, documentation, test coverage, and edge cases.',
    pedantic: 'Review pedantically — flag everything: style, naming, documentation, types, error handling, performance, and test coverage.',
  };
  lines.push(strictnessMap[config.reviewStrictness]);

  if (config.commitStyle !== 'conventional') {
    const commitMap: Record<string, string> = {
      descriptive: 'Use descriptive commit messages that explain the why, not just the what.',
      minimal: 'Use minimal commit messages — short and to the point.',
    };
    if (commitMap[config.commitStyle]) lines.push(commitMap[config.commitStyle]);
  }

  return lines.join('\n');
}
