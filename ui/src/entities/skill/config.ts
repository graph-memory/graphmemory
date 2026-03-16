export const SOURCE_COLORS: Record<string, string> = {
  user: '#1976d2',
  learned: '#f57c00',
};

export const SOURCE_BADGE_COLOR: Record<string, 'primary' | 'warning'> = {
  user: 'primary',
  learned: 'warning',
};

export function sourceLabel(s: string): string {
  return s === 'learned' ? 'Learned' : 'User';
}

export function confidenceLabel(c: number): string {
  return `${Math.round(c * 100)}%`;
}
