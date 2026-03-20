import { ROLES, type RoleName } from '@/content/prompts/index.ts';

export function buildRoleSection(role: RoleName): string | null {
  const content = ROLES[role];
  if (!content) return null;
  return `### Role\n\n${content}`;
}
