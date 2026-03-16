type LogLevel = 'debug' | 'info' | 'warn' | 'error'

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
}

interface LogEntry {
  level: LogLevel
  message: string
  context: string
  timestamp: string
  data?: Record<string, unknown>
}

export class Logger {
  private context: string
  private static globalLevel: LogLevel = 'info'
  private static handlers: Array<(entry: LogEntry) => void> = []

  constructor(context: string) {
    this.context = context
  }

  static setLevel(level: LogLevel): void {
    Logger.globalLevel = level
  }

  static addHandler(handler: (entry: LogEntry) => void): void {
    Logger.handlers.push(handler)
  }

  debug(message: string, data?: Record<string, unknown>): void {
    this.log('debug', message, data)
  }

  info(message: string, data?: Record<string, unknown>): void {
    this.log('info', message, data)
  }

  warn(message: string, data?: Record<string, unknown>): void {
    this.log('warn', message, data)
  }

  error(message: string, data?: Record<string, unknown>): void {
    this.log('error', message, data)
  }

  child(subContext: string): Logger {
    return new Logger(`${this.context}:${subContext}`)
  }

  private log(level: LogLevel, message: string, data?: Record<string, unknown>): void {
    if (LOG_LEVELS[level] < LOG_LEVELS[Logger.globalLevel]) return

    const entry: LogEntry = {
      level,
      message,
      context: this.context,
      timestamp: new Date().toISOString(),
      data,
    }

    for (const handler of Logger.handlers) {
      try {
        handler(entry)
      } catch {
        // ignore handler errors
      }
    }

    const prefix = `[${entry.timestamp}] [${level.toUpperCase()}] [${this.context}]`
    const suffix = data ? ` ${JSON.stringify(data)}` : ''

    switch (level) {
      case 'debug': console.debug(`${prefix} ${message}${suffix}`); break
      case 'info': console.info(`${prefix} ${message}${suffix}`); break
      case 'warn': console.warn(`${prefix} ${message}${suffix}`); break
      case 'error': console.error(`${prefix} ${message}${suffix}`); break
    }
  }
}

export class RequestLogger {
  private logger: Logger

  constructor() {
    this.logger = new Logger('HTTP')
  }

  logRequest(method: string, path: string, statusCode: number, durationMs: number, userId?: string): void {
    const data: Record<string, unknown> = {
      method,
      path,
      statusCode,
      durationMs,
    }
    if (userId) data.userId = userId

    if (statusCode >= 500) {
      this.logger.error(`${method} ${path} ${statusCode}`, data)
    } else if (statusCode >= 400) {
      this.logger.warn(`${method} ${path} ${statusCode}`, data)
    } else {
      this.logger.info(`${method} ${path} ${statusCode}`, data)
    }
  }
}
