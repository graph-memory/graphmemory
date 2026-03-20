import { STYLES, type StyleName } from '@/content/prompts/index.ts';

export function buildStyleSection(style: StyleName): string | null {
  const content = STYLES[style];
  if (!content) return null;
  return `### Style\n\n${content}`;
}
