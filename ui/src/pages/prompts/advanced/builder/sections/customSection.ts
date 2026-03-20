import type { CustomSection } from '../../types.ts';

export function buildCustomSections(sections: CustomSection[]): string | null {
  if (sections.length === 0) return null;

  return sections
    .filter(s => s.title.trim() && s.markdown.trim())
    .map(s => `### ${s.title}\n\n${s.markdown}`)
    .join('\n\n');
}
