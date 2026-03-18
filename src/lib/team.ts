import * as fs from 'fs';
import * as path from 'path';
import { serializeMarkdown, parseMarkdown } from './frontmatter';
import type { AuthorConfig } from './multi-config';

export interface TeamMember {
  id: string;
  name: string;
  email: string;
}

/**
 * Scan `.team/` directory for team member markdown files.
 * Each file: `.team/{id}.md` with frontmatter { name, email }.
 */
export function scanTeamDir(teamDir: string): TeamMember[] {
  if (!fs.existsSync(teamDir)) return [];
  const members: TeamMember[] = [];
  for (const entry of fs.readdirSync(teamDir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
    const id = entry.name.replace(/\.md$/, '');
    try {
      const raw = fs.readFileSync(path.join(teamDir, entry.name), 'utf-8');
      const { frontmatter: fm } = parseMarkdown(raw);
      members.push({
        id,
        name: (fm.name as string) ?? id,
        email: (fm.email as string) ?? '',
      });
    } catch {
      // Skip unreadable files
    }
  }
  return members;
}

/**
 * Ensure the author from config exists as a team member file.
 * Creates `.team/{id}.md` if it doesn't exist. The id is derived from the author name (slugified).
 */
export function ensureAuthorInTeam(teamDir: string, author: AuthorConfig): void {
  if (!author.name) return;
  const id = author.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  if (!id) return;
  const filePath = path.join(teamDir, `${id}.md`);
  if (fs.existsSync(filePath)) return;
  try {
    fs.mkdirSync(teamDir, { recursive: true });
    const content = serializeMarkdown(
      { name: author.name, email: author.email },
      `# ${author.name}\n`,
    );
    fs.writeFileSync(filePath, content, 'utf-8');
  } catch (err) {
    process.stderr.write(`[team] Failed to create team member file for "${author.name}": ${err}\n`);
  }
}
