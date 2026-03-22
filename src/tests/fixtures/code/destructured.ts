/** Handler with destructured parameter. */
export const handler = ({ data }: { data: string }) => {
  return data;
};

/** Single-line arrow with destructured param. */
export const compact = ({ id }: { id: number }) => { return id; };

/** Function with object type parameter. */
export function parse(cfg: { key: string }) {
  return cfg.key;
}

/** Function with default destructured param. */
export function createQueue(opts = {}) {
  return opts;
}

/** Multi-line with type annotation containing braces on body line. */
export function process(
  input: { value: number },
  output: { result: string },
): { ok: boolean } {
  return { ok: true };
}
