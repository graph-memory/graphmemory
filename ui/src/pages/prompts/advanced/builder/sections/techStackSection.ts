import type { TechStackConfig } from '../../types.ts';

export function buildTechStackSection(config: TechStackConfig): string | null {
  const lines: string[] = [];

  if (config.languages.length > 0) lines.push(`**Languages:** ${config.languages.join(', ')}`);
  if (config.runtimes.length > 0) lines.push(`**Runtime:** ${config.runtimes.join(', ')}`);
  if (config.frontend.length > 0) lines.push(`**Frontend:** ${config.frontend.join(', ')}`);
  if (config.backend.length > 0) lines.push(`**Backend:** ${config.backend.join(', ')}`);
  if (config.mobile.length > 0) lines.push(`**Mobile:** ${config.mobile.join(', ')}`);
  if (config.testing.length > 0) lines.push(`**Testing:** ${config.testing.join(', ')}`);
  if (config.bundler.length > 0) lines.push(`**Bundler/Tooling:** ${config.bundler.join(', ')}`);
  if (config.orm.length > 0) lines.push(`**ORM/DB:** ${config.orm.join(', ')}`);
  if (config.stateManagement.length > 0) lines.push(`**State Management:** ${config.stateManagement.join(', ')}`);
  if (config.styling.length > 0) lines.push(`**Styling/UI:** ${config.styling.join(', ')}`);
  if (config.paradigms.length > 0) lines.push(`**Paradigms:** ${config.paradigms.join(', ')}`);
  if (config.testingApproaches.length > 0) lines.push(`**Testing Approach:** ${config.testingApproaches.join(', ')}`);
  if (config.packageManager.length > 0) lines.push(`**Package Manager:** ${config.packageManager.join(', ')}`);

  if (lines.length === 0) return null;

  return `### Tech Context\n\nThis project uses the following technology stack. Tailor your suggestions, code examples, and tool usage to match:\n\n${lines.join('\n')}`;
}
