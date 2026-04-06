import { SandboxOptions } from './types';
import { Logger } from './logger';

/**
 * Main Sandbox class that manages execution lifecycle.
 */
export class Sandbox {
  private name: string;
  private status: 'idle' | 'running' | 'stopped' = 'idle';
  private logger: Logger;
  private timeout: number;

  constructor(options: SandboxOptions) {
    this.name = options.name;
    this.timeout = options.timeout ?? 30000;
    this.logger = new Logger(options.verbose ?? false);
  }

  async run(): Promise<void> {
    this.status = 'running';
    this.logger.info(`Sandbox "${this.name}" started`);
  }

  stop(): void {
    this.status = 'stopped';
    this.logger.info(`Sandbox "${this.name}" stopped`);
  }

  getStatus(): 'idle' | 'running' | 'stopped' {
    return this.status;
  }

  getName(): string {
    return this.name;
  }
}

export { SandboxOptions } from './types';
export { Logger } from './logger';
