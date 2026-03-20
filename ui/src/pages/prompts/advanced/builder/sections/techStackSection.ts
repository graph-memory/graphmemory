import type { StackConfig } from '../../types.ts';
import { STACK_DOMAINS } from '@/content/prompts/stackCatalog.ts';

export function buildTechStackSection(config: StackConfig): string | null {
  const lines: string[] = [];

  for (const domain of STACK_DOMAINS) {
    if (!config.enabledDomains.includes(domain.id)) continue;

    const domainLines: string[] = [];
    for (const cat of domain.categories) {
      const key = `${domain.id}.${cat.key}`;
      const selected = config.selections[key];
      if (selected && selected.length > 0) {
        domainLines.push(`- **${cat.label}:** ${selected.join(', ')}`);
      }
    }

    if (domainLines.length > 0) {
      lines.push(`**${domain.label}**`);
      lines.push(...domainLines);
      lines.push('');
    }
  }

  if (lines.length === 0) return null;

  return `### Stack\n\nThis project uses the following technology stack. Tailor your suggestions, code examples, and tool usage to match:\n\n${lines.join('\n').trimEnd()}`;
}
