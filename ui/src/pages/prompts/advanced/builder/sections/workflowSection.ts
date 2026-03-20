import { WORKFLOWS } from '@/content/prompts/index.ts';
import type { WorkflowStep } from '../../types.ts';

export function buildWorkflowSection(
  scenarioId: string,
  customWorkflow: WorkflowStep[],
): string | null {
  // Custom workflow takes precedence
  if (customWorkflow.length > 0) {
    const lines = ['### Workflow\n'];
    for (let i = 0; i < customWorkflow.length; i++) {
      const step = customWorkflow[i];
      const toolBadges = step.tools.length > 0
        ? ` (${step.tools.map(t => `\`${t}\``).join(', ')})`
        : '';
      lines.push(`${i + 1}. ${step.description}${toolBadges}`);
      if (step.condition) {
        lines.push(`   - *If:* ${step.condition}`);
      }
    }
    return lines.join('\n');
  }

  // Fall back to predefined workflow
  return WORKFLOWS[scenarioId] || null;
}
