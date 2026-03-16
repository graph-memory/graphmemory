// Authentication & authorization middleware

import type { User, UserRole, UUID } from '../types'

export interface RequestContext {
  user?: User
  token?: string
  requestId: string
  startTime: number
}

export type Middleware = (ctx: RequestContext, next: () => Promise<void>) => Promise<void>

export function authRequired(): Middleware {
  return async (ctx, next) => {
    if (!ctx.user) {
      throw new UnauthorizedError('Authentication required')
    }
    await next()
  }
}

export function roleRequired(...roles: UserRole[]): Middleware {
  return async (ctx, next) => {
    if (!ctx.user) {
      throw new UnauthorizedError('Authentication required')
    }
    if (!roles.includes(ctx.user.role)) {
      throw new ForbiddenError(`Required role: ${roles.join(' or ')}`)
    }
    await next()
  }
}

export function projectAccess(getProjectId: (ctx: RequestContext) => UUID): Middleware {
  return async (ctx, next) => {
    if (!ctx.user) {
      throw new UnauthorizedError('Authentication required')
    }

    const _projectId = getProjectId(ctx)
    // In a real implementation, check project membership
    // For now, all authenticated users have access

    await next()
  }
}

export function rateLimit(key: (ctx: RequestContext) => string, maxRequests: number, windowMs: number): Middleware {
  const windows = new Map<string, { count: number; resetAt: number }>()

  return async (ctx, next) => {
    const k = key(ctx)
    const now = Date.now()
    let window = windows.get(k)

    if (!window || now > window.resetAt) {
      window = { count: 0, resetAt: now + windowMs }
      windows.set(k, window)
    }

    window.count++
    if (window.count > maxRequests) {
      throw new RateLimitError(window.resetAt - now)
    }

    await next()
  }
}

export function requestLogger(): Middleware {
  return async (ctx, next) => {
    const start = Date.now()
    try {
      await next()
    } finally {
      const duration = Date.now() - start
      console.log(`[${ctx.requestId}] ${ctx.user?.email ?? 'anonymous'} ${duration}ms`)
    }
  }
}

export function cors(origins: string[]): Middleware {
  return async (_ctx, next) => {
    // In a real implementation, set CORS headers
    if (origins.includes('*')) {
      // Allow all origins
    }
    await next()
  }
}

export class UnauthorizedError extends Error {
  statusCode = 401
  constructor(message: string = 'Unauthorized') {
    super(message)
    this.name = 'UnauthorizedError'
  }
}

export class ForbiddenError extends Error {
  statusCode = 403
  constructor(message: string = 'Forbidden') {
    super(message)
    this.name = 'ForbiddenError'
  }
}

export class RateLimitError extends Error {
  statusCode = 429
  retryAfter: number

  constructor(retryAfterMs: number) {
    super('Too many requests')
    this.name = 'RateLimitError'
    this.retryAfter = Math.ceil(retryAfterMs / 1000)
  }
}
