import type { BehaviorConfig } from '../../types.ts';

const VERBOSITY_INSTRUCTIONS: Record<string, string> = {
  concise: 'Be extremely concise. One-sentence answers when possible. Skip explanations unless asked.',
  normal: 'Provide balanced responses — enough detail to be useful without being verbose.',
  detailed: 'Provide thorough explanations with examples and context for each point.',
  exhaustive: 'Provide comprehensive analysis covering all angles, edge cases, and alternatives.',
};

const CODE_EXAMPLE_INSTRUCTIONS: Record<string, string> = {
  always: 'Always include code examples to illustrate your points.',
  'when-helpful': 'Include code examples when they help clarify the explanation.',
  never: 'Do not include code examples unless explicitly asked.',
};

const DEPTH_INSTRUCTIONS: Record<string, string> = {
  brief: 'Keep explanations brief — state the key point and move on.',
  standard: 'Explain the reasoning behind your suggestions at a moderate depth.',
  'deep-dive': 'Provide deep-dive explanations — cover the why, alternatives, trade-offs, and implications.',
};

export function buildBehaviorSection(config: BehaviorConfig): string | null {
  const lines = [
    '### Response Style\n',
    VERBOSITY_INSTRUCTIONS[config.verbosity] || '',
    CODE_EXAMPLE_INSTRUCTIONS[config.codeExamples] || '',
    DEPTH_INSTRUCTIONS[config.explanationDepth] || '',
  ];

  if (config.responseLanguage && config.responseLanguage !== 'en') {
    lines.push(`Respond in **${config.responseLanguage}** language.`);
  }

  const formatMap: Record<string, string> = {
    bullets: 'Prefer bullet-point lists for structured information.',
    tables: 'Prefer tables for comparisons and structured data.',
    prose: 'Prefer prose paragraphs over lists.',
    mixed: 'Use the most appropriate format for each type of content.',
  };
  if (formatMap[config.formatPreference]) {
    lines.push(formatMap[config.formatPreference]);
  }

  return lines.filter(Boolean).join('\n');
}
