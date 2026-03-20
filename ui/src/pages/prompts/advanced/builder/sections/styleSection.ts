import { STYLES, type StyleName } from '@/content/prompts/index.ts';

export function buildStyleSection(style: StyleName): string | null {
  return STYLES[style] || null;
}
