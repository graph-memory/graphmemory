/**
 * Configuration options for Sandbox.
 */
export interface SandboxOptions {
  /** Project name */
  name: string;
  /** Enable debug logging */
  verbose?: boolean;
  /** Max execution time in milliseconds */
  timeout?: number;
}

/**
 * Status of a sandbox instance.
 */
export type SandboxStatus = 'idle' | 'running' | 'stopped';
