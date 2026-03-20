import type { ProjectRulesConfig } from '../../types.ts';

export function buildRulesSection(config: ProjectRulesConfig): string | null {
  const lines: string[] = [];

  if (config.focusPatterns.length > 0) {
    lines.push(`**Focus on these files:** ${config.focusPatterns.map(p => `\`${p}\``).join(', ')}`);
  }
  if (config.ignorePatterns.length > 0) {
    lines.push(`**Ignore these files:** ${config.ignorePatterns.map(p => `\`${p}\``).join(', ')}`);
  }
  if (config.namingConventions.length > 0) {
    lines.push(`**Naming conventions:**\n${config.namingConventions.map(c => `- ${c}`).join('\n')}`);
  }
  if (config.codeStyleRules.length > 0) {
    lines.push(`**Code style:**\n${config.codeStyleRules.map(r => `- ${r}`).join('\n')}`);
  }
  if (config.architecturePatterns.length > 0) {
    lines.push(`**Architecture patterns to follow:**\n${config.architecturePatterns.map(p => `- ${p}`).join('\n')}`);
  }
  if (config.antiPatterns.length > 0) {
    lines.push(`**Anti-patterns to flag:**\n${config.antiPatterns.map(p => `- ${p}`).join('\n')}`);
  }

  if (lines.length === 0) return null;

  return `### Project Rules\n\n${lines.join('\n\n')}`;
}
