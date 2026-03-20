import type { CustomSection } from '../../types.ts';

export function buildCustomSections(sections: CustomSection[]): string | null {
  const valid = sections.filter(s => s.title.trim() && s.markdown.trim());
  if (valid.length === 0) return null;

  return valid
    .map(s => `### ${s.title}\n\n${s.markdown}`)
    .join('\n\n');
}
