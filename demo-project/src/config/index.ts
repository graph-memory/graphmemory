// Application configuration with environment variable support

export interface AppConfig {
  server: ServerConfig
  database: DatabaseConfig
  auth: AuthConfig
  redis: RedisConfig
  email: EmailConfig
  storage: StorageConfig
  logging: LoggingConfig
}

export interface ServerConfig {
  host: string
  port: number
  corsOrigins: string[]
  trustProxy: boolean
  requestTimeout: number
  bodyLimit: string
}

export interface DatabaseConfig {
  host: string
  port: number
  database: string
  username: string
  password: string
  poolMin: number
  poolMax: number
  ssl: boolean
  migrationsDir: string
}

export interface AuthConfig {
  jwtSecret: string
  jwtExpiresIn: string
  refreshTokenExpiresIn: string
  bcryptRounds: number
  maxSessions: number
  passwordMinLength: number
  mfaEnabled: boolean
  oauth: OAuthConfig
}

export interface OAuthConfig {
  google: { clientId: string; clientSecret: string; callbackUrl: string }
  github: { clientId: string; clientSecret: string; callbackUrl: string }
}

export interface RedisConfig {
  host: string
  port: number
  password?: string
  db: number
  keyPrefix: string
}

export interface EmailConfig {
  provider: 'smtp' | 'sendgrid' | 'ses'
  from: string
  replyTo: string
  smtp?: { host: string; port: number; secure: boolean; auth: { user: string; pass: string } }
  sendgridApiKey?: string
}

export interface StorageConfig {
  provider: 'local' | 's3' | 'gcs'
  uploadDir: string
  maxFileSize: number
  allowedTypes: string[]
  s3?: { bucket: string; region: string; accessKeyId: string; secretAccessKey: string }
}

export interface LoggingConfig {
  level: 'debug' | 'info' | 'warn' | 'error'
  format: 'json' | 'pretty'
  file?: string
  sentry?: { dsn: string; environment: string }
}

function env(key: string, fallback?: string): string {
  const value = process.env[key] ?? fallback
  if (value === undefined) throw new Error(`Missing environment variable: ${key}`)
  return value
}

function envInt(key: string, fallback: number): number {
  const raw = process.env[key]
  return raw ? parseInt(raw, 10) : fallback
}

function envBool(key: string, fallback: boolean): boolean {
  const raw = process.env[key]
  if (!raw) return fallback
  return raw === 'true' || raw === '1'
}

export function loadConfig(): AppConfig {
  return {
    server: {
      host: env('HOST', '0.0.0.0'),
      port: envInt('PORT', 3000),
      corsOrigins: env('CORS_ORIGINS', '*').split(','),
      trustProxy: envBool('TRUST_PROXY', false),
      requestTimeout: envInt('REQUEST_TIMEOUT', 30000),
      bodyLimit: env('BODY_LIMIT', '10mb'),
    },
    database: {
      host: env('DB_HOST', 'localhost'),
      port: envInt('DB_PORT', 5432),
      database: env('DB_NAME', 'taskflow'),
      username: env('DB_USER', 'taskflow'),
      password: env('DB_PASSWORD', ''),
      poolMin: envInt('DB_POOL_MIN', 2),
      poolMax: envInt('DB_POOL_MAX', 10),
      ssl: envBool('DB_SSL', false),
      migrationsDir: env('MIGRATIONS_DIR', './migrations'),
    },
    auth: {
      jwtSecret: env('JWT_SECRET', 'dev-secret-change-me'),
      jwtExpiresIn: env('JWT_EXPIRES_IN', '15m'),
      refreshTokenExpiresIn: env('REFRESH_TOKEN_EXPIRES_IN', '7d'),
      bcryptRounds: envInt('BCRYPT_ROUNDS', 12),
      maxSessions: envInt('MAX_SESSIONS', 5),
      passwordMinLength: envInt('PASSWORD_MIN_LENGTH', 8),
      mfaEnabled: envBool('MFA_ENABLED', false),
      oauth: {
        google: {
          clientId: env('GOOGLE_CLIENT_ID', ''),
          clientSecret: env('GOOGLE_CLIENT_SECRET', ''),
          callbackUrl: env('GOOGLE_CALLBACK_URL', '/auth/google/callback'),
        },
        github: {
          clientId: env('GITHUB_CLIENT_ID', ''),
          clientSecret: env('GITHUB_CLIENT_SECRET', ''),
          callbackUrl: env('GITHUB_CALLBACK_URL', '/auth/github/callback'),
        },
      },
    },
    redis: {
      host: env('REDIS_HOST', 'localhost'),
      port: envInt('REDIS_PORT', 6379),
      password: process.env['REDIS_PASSWORD'],
      db: envInt('REDIS_DB', 0),
      keyPrefix: env('REDIS_PREFIX', 'tf:'),
    },
    email: {
      provider: env('EMAIL_PROVIDER', 'smtp') as EmailConfig['provider'],
      from: env('EMAIL_FROM', 'noreply@taskflow.dev'),
      replyTo: env('EMAIL_REPLY_TO', 'support@taskflow.dev'),
    },
    storage: {
      provider: env('STORAGE_PROVIDER', 'local') as StorageConfig['provider'],
      uploadDir: env('UPLOAD_DIR', './uploads'),
      maxFileSize: envInt('MAX_FILE_SIZE', 10 * 1024 * 1024),
      allowedTypes: env('ALLOWED_FILE_TYPES', 'image/*,application/pdf,.doc,.docx').split(','),
    },
    logging: {
      level: env('LOG_LEVEL', 'info') as LoggingConfig['level'],
      format: env('LOG_FORMAT', 'json') as LoggingConfig['format'],
      file: process.env['LOG_FILE'],
    },
  }
}

export const config = loadConfig()
