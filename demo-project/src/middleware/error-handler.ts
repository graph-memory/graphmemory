// Centralized error handling middleware

import type { ApiError } from '../types'
import { Logger } from '../utils/logger'

const logger = new Logger('ErrorHandler')

interface HttpError extends Error {
  statusCode?: number
  code?: string
  details?: Record<string, unknown>
}

export function errorHandler(err: HttpError): ApiError {
  const statusCode = err.statusCode ?? 500
  const code = err.code ?? mapStatusToCode(statusCode)
  const message = statusCode >= 500 ? 'Internal server error' : err.message

  if (statusCode >= 500) {
    logger.error('Unhandled error', {
      error: err.message,
      stack: err.stack,
      code: err.code,
    })
  } else {
    logger.warn('Client error', {
      error: err.message,
      code,
      statusCode,
    })
  }

  return {
    code,
    message,
    details: err.details,
    statusCode,
  }
}

function mapStatusToCode(status: number): string {
  switch (status) {
    case 400: return 'BAD_REQUEST'
    case 401: return 'UNAUTHORIZED'
    case 403: return 'FORBIDDEN'
    case 404: return 'NOT_FOUND'
    case 409: return 'CONFLICT'
    case 422: return 'VALIDATION_ERROR'
    case 429: return 'RATE_LIMITED'
    default: return 'INTERNAL_ERROR'
  }
}

export class AppError extends Error {
  statusCode: number
  code: string
  details?: Record<string, unknown>

  constructor(statusCode: number, code: string, message: string, details?: Record<string, unknown>) {
    super(message)
    this.name = 'AppError'
    this.statusCode = statusCode
    this.code = code
    this.details = details
  }

  static badRequest(message: string, details?: Record<string, unknown>): AppError {
    return new AppError(400, 'BAD_REQUEST', message, details)
  }

  static notFound(resource: string, id?: string): AppError {
    return new AppError(404, 'NOT_FOUND', id ? `${resource} not found: ${id}` : `${resource} not found`)
  }

  static conflict(message: string): AppError {
    return new AppError(409, 'CONFLICT', message)
  }

  static validation(errors: string[]): AppError {
    return new AppError(422, 'VALIDATION_ERROR', 'Validation failed', { errors })
  }

  static internal(message: string = 'Internal server error'): AppError {
    return new AppError(500, 'INTERNAL_ERROR', message)
  }
}
