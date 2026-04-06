/**
 * Simple logger with verbose mode support.
 */
export class Logger {
  private verbose: boolean;

  constructor(verbose: boolean) {
    this.verbose = verbose;
  }

  info(message: string): void {
    console.log(`[INFO] ${message}`);
  }

  debug(message: string): void {
    if (this.verbose) {
      console.log(`[DEBUG] ${message}`);
    }
  }

  error(message: string, err?: Error): void {
    console.error(`[ERROR] ${message}`, err?.message ?? '');
  }
}
