/** Attributes stored on each graph node. */
export interface NodeAttrs {
  id: string;
  label: string;
  weight: number;
}

/** A node identifier — opaque string alias. */
export type NodeId = string;

/** Direction of edge traversal. */
export enum Direction {
  Forward = 'forward',
  Backward = 'backward',
}
