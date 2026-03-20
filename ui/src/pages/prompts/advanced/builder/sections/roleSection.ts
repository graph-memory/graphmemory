import { ROLES, type RoleName } from '@/content/prompts/index.ts';

export function buildRoleSection(role: RoleName): string | null {
  return ROLES[role] || null;
}
