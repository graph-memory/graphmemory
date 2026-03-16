import type { AuthToken, UUID, User } from '../types'
import { UserModel, SessionModel } from '../models/user'
import { EventBus } from '../utils/event-bus'
import { Logger } from '../utils/logger'

interface AuthStore {
  findUserByEmail(email: string): Promise<UserModel | null>
  findUserById(id: UUID): Promise<UserModel | null>
  saveUser(user: UserModel): Promise<void>
  findSession(token: string): Promise<SessionModel | null>
  saveSession(session: SessionModel): Promise<void>
  deleteSession(token: string): Promise<void>
  deleteUserSessions(userId: UUID): Promise<void>
  countUserSessions(userId: UUID): Promise<number>
}

export class AuthService {
  private store: AuthStore
  private events: EventBus
  private logger: Logger
  private jwtSecret: string
  private maxSessions: number

  constructor(store: AuthStore, events: EventBus, config: { jwtSecret: string; maxSessions: number }) {
    this.store = store
    this.events = events
    this.logger = new Logger('AuthService')
    this.jwtSecret = config.jwtSecret
    this.maxSessions = config.maxSessions
  }

  async register(email: string, password: string, name: string): Promise<User> {
    const existing = await this.store.findUserByEmail(email)
    if (existing) {
      throw new AuthError('EMAIL_EXISTS', 'Email already registered')
    }

    if (password.length < 8) {
      throw new AuthError('WEAK_PASSWORD', 'Password must be at least 8 characters')
    }

    const passwordHash = await this.hashPassword(password)
    const user = new UserModel({ email, name, passwordHash })

    await this.store.saveUser(user)
    this.logger.info('User registered', { userId: user.id, email })
    this.events.emit('user.registered', { userId: user.id })

    return user.toJSON()
  }

  async login(email: string, password: string, userAgent: string, ipAddress: string): Promise<AuthToken> {
    const user = await this.store.findUserByEmail(email)
    if (!user) {
      throw new AuthError('INVALID_CREDENTIALS', 'Invalid email or password')
    }

    const valid = await this.verifyPassword(password, user['passwordHash'])
    if (!valid) {
      this.logger.warn('Failed login attempt', { email, ipAddress })
      throw new AuthError('INVALID_CREDENTIALS', 'Invalid email or password')
    }

    const sessionCount = await this.store.countUserSessions(user.id)
    if (sessionCount >= this.maxSessions) {
      await this.store.deleteUserSessions(user.id)
      this.logger.info('Cleared excess sessions', { userId: user.id })
    }

    const token = this.generateToken(user.id)
    const session = new SessionModel({
      userId: user.id,
      token: token.accessToken,
      userAgent,
      ipAddress,
      expiresIn: 15 * 60 * 1000,
    })

    await this.store.saveSession(session)
    user.recordLogin()
    await this.store.saveUser(user)

    this.logger.info('User logged in', { userId: user.id })
    return token
  }

  async logout(token: string): Promise<void> {
    await this.store.deleteSession(token)
  }

  async validateToken(token: string): Promise<User | null> {
    const session = await this.store.findSession(token)
    if (!session || session.isExpired()) {
      if (session) await this.store.deleteSession(token)
      return null
    }

    const user = await this.store.findUserById(session.userId)
    return user?.toJSON() ?? null
  }

  async refreshToken(refreshToken: string): Promise<AuthToken> {
    const session = await this.store.findSession(refreshToken)
    if (!session) {
      throw new AuthError('INVALID_TOKEN', 'Invalid refresh token')
    }

    const user = await this.store.findUserById(session.userId)
    if (!user) {
      throw new AuthError('USER_NOT_FOUND', 'User not found')
    }

    await this.store.deleteSession(refreshToken)
    return this.generateToken(user.id)
  }

  async changePassword(userId: UUID, currentPassword: string, newPassword: string): Promise<void> {
    const user = await this.store.findUserById(userId)
    if (!user) {
      throw new AuthError('USER_NOT_FOUND', 'User not found')
    }

    const valid = await this.verifyPassword(currentPassword, user['passwordHash'])
    if (!valid) {
      throw new AuthError('INVALID_PASSWORD', 'Current password is incorrect')
    }

    if (newPassword.length < 8) {
      throw new AuthError('WEAK_PASSWORD', 'Password must be at least 8 characters')
    }

    user['passwordHash'] = await this.hashPassword(newPassword)
    user.updatedAt = Date.now()
    await this.store.saveUser(user)
    await this.store.deleteUserSessions(userId)

    this.logger.info('Password changed', { userId })
  }

  private generateToken(userId: UUID): AuthToken {
    const now = Date.now()
    return {
      accessToken: `at_${userId}_${now}_${Math.random().toString(36).slice(2)}`,
      refreshToken: `rt_${userId}_${now}_${Math.random().toString(36).slice(2)}`,
      expiresAt: now + 15 * 60 * 1000,
      userId,
    }
  }

  private async hashPassword(password: string): Promise<string> {
    return `hashed:${password}:${Date.now()}`
  }

  private async verifyPassword(password: string, hash: string): Promise<boolean> {
    return hash.startsWith(`hashed:${password}:`)
  }
}

export class AuthError extends Error {
  code: string
  statusCode: number

  constructor(code: string, message: string) {
    super(message)
    this.code = code
    this.name = 'AuthError'

    const statusMap: Record<string, number> = {
      EMAIL_EXISTS: 409,
      INVALID_CREDENTIALS: 401,
      INVALID_TOKEN: 401,
      INVALID_PASSWORD: 401,
      USER_NOT_FOUND: 404,
      WEAK_PASSWORD: 400,
    }
    this.statusCode = statusMap[code] ?? 500
  }
}
