import pino from 'pino';

const DEFAULT_LEVEL = process.env.LOG_LEVEL ?? 'info';
const useJson = process.env.LOG_JSON === '1';

const logger = pino({
  level: DEFAULT_LEVEL,
  ...(!useJson && {
    transport: { target: 'pino-pretty' },
  }),
});

export default logger;

/** Create a child logger with a component name. */
export function createLogger(component: string): pino.Logger {
  return logger.child({ component });
}

/** Set log level at runtime (e.g., from --log-level CLI flag). */
export function setLogLevel(level: string): void {
  logger.level = level;
}
