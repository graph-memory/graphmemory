import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { scanTeamDir, ensureAuthorInTeam } from '@/lib/team';

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'gm-team-'));
}

describe('scanTeamDir', () => {
  it('returns empty for non-existent dir', () => {
    expect(scanTeamDir('/nonexistent/.team')).toEqual([]);
  });

  it('returns empty for empty dir', () => {
    const dir = tmpDir();
    expect(scanTeamDir(dir)).toEqual([]);
  });

  it('scans team member files', () => {
    const dir = tmpDir();
    fs.writeFileSync(path.join(dir, 'alice.md'), '---\nname: Alice\nemail: alice@test.com\n---\n# Alice\n');
    fs.writeFileSync(path.join(dir, 'bob.md'), '---\nname: Bob\nemail: bob@test.com\n---\n# Bob\n');

    const members = scanTeamDir(dir);
    expect(members).toHaveLength(2);
    expect(members.find(m => m.id === 'alice')).toMatchObject({ name: 'Alice', email: 'alice@test.com' });
    expect(members.find(m => m.id === 'bob')).toMatchObject({ name: 'Bob', email: 'bob@test.com' });
  });

  it('skips non-md files', () => {
    const dir = tmpDir();
    fs.writeFileSync(path.join(dir, 'alice.md'), '---\nname: Alice\nemail: a@t.com\n---\n');
    fs.writeFileSync(path.join(dir, 'notes.txt'), 'not a team file');

    const members = scanTeamDir(dir);
    expect(members).toHaveLength(1);
  });

  it('skips directories', () => {
    const dir = tmpDir();
    fs.mkdirSync(path.join(dir, 'subdir.md'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'alice.md'), '---\nname: Alice\nemail: a@t.com\n---\n');

    const members = scanTeamDir(dir);
    expect(members).toHaveLength(1);
  });

  it('uses filename as fallback name', () => {
    const dir = tmpDir();
    fs.writeFileSync(path.join(dir, 'charlie.md'), '---\nemail: c@t.com\n---\n');

    const members = scanTeamDir(dir);
    expect(members[0].name).toBe('charlie');
  });

  it('handles malformed frontmatter gracefully', () => {
    const dir = tmpDir();
    fs.writeFileSync(path.join(dir, 'bad.md'), 'no frontmatter at all');
    fs.writeFileSync(path.join(dir, 'good.md'), '---\nname: Good\nemail: g@t.com\n---\n');

    const members = scanTeamDir(dir);
    // Should still have at least the good one; bad one may parse with empty fm
    expect(members.length).toBeGreaterThanOrEqual(1);
  });
});

describe('ensureAuthorInTeam', () => {
  it('creates team member file', () => {
    const dir = tmpDir();
    const teamDir = path.join(dir, '.team');
    ensureAuthorInTeam(teamDir, { name: 'Alice Dev', email: 'alice@dev.com' });

    expect(fs.existsSync(path.join(teamDir, 'alice-dev.md'))).toBe(true);
    const content = fs.readFileSync(path.join(teamDir, 'alice-dev.md'), 'utf-8');
    expect(content).toContain('Alice Dev');
    expect(content).toContain('alice@dev.com');
  });

  it('does not overwrite existing file', () => {
    const dir = tmpDir();
    const teamDir = path.join(dir, '.team');
    fs.mkdirSync(teamDir, { recursive: true });
    fs.writeFileSync(path.join(teamDir, 'alice.md'), 'existing content');

    ensureAuthorInTeam(teamDir, { name: 'Alice', email: 'new@email.com' });
    const content = fs.readFileSync(path.join(teamDir, 'alice.md'), 'utf-8');
    expect(content).toBe('existing content');
  });

  it('skips if no name', () => {
    const dir = tmpDir();
    const teamDir = path.join(dir, '.team');
    ensureAuthorInTeam(teamDir, { name: '', email: 'a@b.com' });
    expect(fs.existsSync(teamDir)).toBe(false);
  });

  it('slugifies name correctly', () => {
    const dir = tmpDir();
    const teamDir = path.join(dir, '.team');
    ensureAuthorInTeam(teamDir, { name: 'John O\'Brien III', email: 'j@b.com' });
    expect(fs.existsSync(path.join(teamDir, 'john-o-brien-iii.md'))).toBe(true);
  });
});
