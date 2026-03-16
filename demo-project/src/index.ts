// TaskFlow — Project Management API
//
// A modern task and project management platform built with TypeScript.
// Features include: multi-team workspaces, kanban boards, time tracking,
// webhooks, real-time notifications, and OAuth integration.

export { UserModel, SessionModel } from './models/user'
export { ProjectModel } from './models/project'
export { TaskModel, CommentModel, ActivityModel } from './models/task'
export { TeamModel } from './models/team'
export { NotificationModel } from './models/notification'
export { WebhookModel } from './models/webhook'

export { AuthService, AuthError } from './services/auth-service'
export { TaskService, TaskNotFoundError, TaskError } from './services/task-service'
export { ProjectService, ProjectNotFoundError, ProjectError } from './services/project-service'
export { NotificationService } from './services/notification-service'
export { WebhookService } from './services/webhook-service'

export { AuthController } from './controllers/auth-controller'
export { TaskController } from './controllers/task-controller'
export { ProjectController } from './controllers/project-controller'
export { WebhookController } from './controllers/webhook-controller'

export { authRequired, roleRequired, projectAccess, rateLimit } from './middleware/auth'
export { errorHandler, AppError } from './middleware/error-handler'

export { Logger, RequestLogger } from './utils/logger'
export { EventBus } from './utils/event-bus'
export { LRUCache } from './utils/cache'
export { RateLimiter, SlidingWindowCounter } from './utils/rate-limiter'
export * from './utils/validation'

export { loadConfig, config } from './config'
export type * from './types'
