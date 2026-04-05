/** Embed function: text → embedding vector. */
export type EmbedFn = (query: string) => Promise<number[]>;

/** Document (indexing) and query (search) embed functions. */
export interface EmbedFns {
  document: EmbedFn;
  query: EmbedFn;
}
