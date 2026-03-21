/**
 * Encode/decode embedding vectors as Base64 for compact JSON serialization.
 * Float32Array → Base64 string saves ~3x vs JSON number arrays.
 * Backwards compatible: detects old format (number[]) on load.
 */

const EMBEDDING_FIELDS = ['embedding', 'fileEmbedding'];

/** Convert a number[] to a Base64-encoded Float32Array. */
function float32ToBase64(arr: number[]): string {
  const f32 = new Float32Array(arr);
  const bytes = new Uint8Array(f32.buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return Buffer.from(binary, 'binary').toString('base64');
}

/** Convert a Base64-encoded Float32Array back to number[]. */
function base64ToFloat32(b64: string): number[] {
  const buf = Buffer.from(b64, 'base64');
  // Copy to aligned buffer to guarantee 4-byte alignment for Float32Array
  const aligned = new Uint8Array(buf.byteLength);
  aligned.set(new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength));
  const f32 = new Float32Array(aligned.buffer, 0, aligned.byteLength / 4);
  return Array.from(f32);
}

/**
 * Compress embedding fields in a graphology export object (mutates in place).
 * Converts number[] → Base64 string for fields named 'embedding' or 'fileEmbedding'.
 */
export function compressEmbeddings(exported: any): void {
  if (!exported?.nodes) return;
  for (const node of exported.nodes) {
    const attrs = node.attributes;
    if (!attrs) continue;
    for (const field of EMBEDDING_FIELDS) {
      if (Array.isArray(attrs[field]) && attrs[field].length > 0) {
        attrs[field] = float32ToBase64(attrs[field]);
      }
    }
  }
}

/**
 * Decompress embedding fields in a graphology export object (mutates in place).
 * Converts Base64 string → number[]. Handles both old format (number[]) and new (string).
 */
export function decompressEmbeddings(exported: any): void {
  if (!exported?.nodes) return;
  for (const node of exported.nodes) {
    const attrs = node.attributes;
    if (!attrs) continue;
    for (const field of EMBEDDING_FIELDS) {
      if (typeof attrs[field] === 'string' && attrs[field].length > 0) {
        attrs[field] = base64ToFloat32(attrs[field]);
      }
      // number[] stays as-is (backwards compatible with old format)
    }
  }
}
