// Auth API controller — handles registration, login, logout, token refresh

import type { UUID } from '../types'
import { AuthService } from '../services/auth-service'
import { validate, required, minLength, isEmail } from '../utils/validation'

interface RequestParams {
  body: Record<string, unknown>
  headers: Record<string, string>
  userId?: UUID
  ip: string
}

export class AuthController {
  private service: AuthService

  constructor(service: AuthService) {
    this.service = service
  }

  async register(req: RequestParams) {
    const { email, password, name } = req.body as { email: string; password: string; name: string }

    const validation = validate(req.body,
      required('email'),
      required('password'),
      required('name'),
      isEmail('email'),
      minLength('password', 8),
      minLength('name', 1),
    )
    if (!validation.valid) {
      return { status: 422, body: { code: 'VALIDATION_ERROR', errors: validation.errors } }
    }

    const user = await this.service.register(email, password, name)
    return { status: 201, body: user }
  }

  async login(req: RequestParams) {
    const { email, password } = req.body as { email: string; password: string }

    const validation = validate(req.body, required('email'), required('password'))
    if (!validation.valid) {
      return { status: 422, body: { code: 'VALIDATION_ERROR', errors: validation.errors } }
    }

    const userAgent = req.headers['user-agent'] ?? 'unknown'
    const token = await this.service.login(email, password, userAgent, req.ip)
    return { status: 200, body: token }
  }

  async logout(req: RequestParams) {
    const token = this.extractToken(req.headers)
    if (token) {
      await this.service.logout(token)
    }
    return { status: 204, body: null }
  }

  async me(req: RequestParams) {
    if (!req.userId) {
      return { status: 401, body: { code: 'UNAUTHORIZED', message: 'Not authenticated' } }
    }

    const token = this.extractToken(req.headers)
    if (!token) {
      return { status: 401, body: { code: 'UNAUTHORIZED', message: 'No token provided' } }
    }

    const user = await this.service.validateToken(token)
    if (!user) {
      return { status: 401, body: { code: 'UNAUTHORIZED', message: 'Invalid or expired token' } }
    }

    return { status: 200, body: user }
  }

  async refresh(req: RequestParams) {
    const { refreshToken } = req.body as { refreshToken: string }

    const validation = validate(req.body, required('refreshToken'))
    if (!validation.valid) {
      return { status: 422, body: { code: 'VALIDATION_ERROR', errors: validation.errors } }
    }

    const token = await this.service.refreshToken(refreshToken)
    return { status: 200, body: token }
  }

  async changePassword(req: RequestParams) {
    if (!req.userId) {
      return { status: 401, body: { code: 'UNAUTHORIZED', message: 'Not authenticated' } }
    }

    const { currentPassword, newPassword } = req.body as { currentPassword: string; newPassword: string }

    const validation = validate(req.body,
      required('currentPassword'),
      required('newPassword'),
      minLength('newPassword', 8),
    )
    if (!validation.valid) {
      return { status: 422, body: { code: 'VALIDATION_ERROR', errors: validation.errors } }
    }

    await this.service.changePassword(req.userId, currentPassword, newPassword)
    return { status: 200, body: { message: 'Password changed successfully' } }
  }

  private extractToken(headers: Record<string, string>): string | undefined {
    const auth = headers['authorization']
    if (!auth?.startsWith('Bearer ')) return undefined
    return auth.slice(7)
  }
}
