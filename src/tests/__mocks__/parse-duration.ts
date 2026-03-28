// CJS mock for parse-duration (ESM-only package)

const UNITS: Record<string, number> = {
  ms: 1,
  s: 1000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
  w: 604_800_000,
  y: 31_557_600_000,
};

function parse(input: string): number | undefined {
  if (typeof input !== 'string' || !input.trim()) return undefined;

  let total = 0;
  let matched = false;
  const re = /(\d+(?:\.\d+)?)\s*(ms|[smhdwy])/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(input)) !== null) {
    const value = parseFloat(m[1]);
    const unit = m[2].toLowerCase();
    if (UNITS[unit] == null) return undefined;
    total += value * UNITS[unit];
    matched = true;
  }

  return matched ? total : undefined;
}

module.exports = parse;
module.exports.default = parse;
