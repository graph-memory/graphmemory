import { stringify, parse } from 'yaml';

export function serializeMarkdown(frontmatter: Record<string, unknown>, body: string): string {
  const yamlStr = stringify(frontmatter, { lineWidth: 0 }).trimEnd();
  return `---\n${yamlStr}\n---\n\n${body}\n`;
}

export function parseMarkdown(raw: string): { frontmatter: Record<string, unknown>; body: string } {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n\n?([\s\S]*)$/);
  if (!match) return { frontmatter: {}, body: raw };
  const frontmatter = (parse(match[1], { maxAliasCount: 10 }) as Record<string, unknown>) ?? {};
  const body = match[2].replace(/\n$/, '');
  return { frontmatter, body };
}
