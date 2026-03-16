// Core domain types for TaskFlow

export type UUID = string

export type Timestamp = number

export interface BaseEntity {
  id: UUID
  createdAt: Timestamp
  updatedAt: Timestamp
}

// === User & Auth ===

export type UserRole = 'admin' | 'manager' | 'member' | 'viewer'

export interface User extends BaseEntity {
  email: string
  name: string
  role: UserRole
  avatarUrl?: string
  teamId?: UUID
  lastLoginAt?: Timestamp
  preferences: UserPreferences
}

export interface UserPreferences {
  theme: 'light' | 'dark' | 'system'
  locale: string
  notifications: NotificationSettings
  timezone: string
}

export interface NotificationSettings {
  email: boolean
  push: boolean
  slack: boolean
  digest: 'daily' | 'weekly' | 'none'
}

export interface AuthToken {
  accessToken: string
  refreshToken: string
  expiresAt: Timestamp
  userId: UUID
}

export interface Session extends BaseEntity {
  userId: UUID
  token: string
  userAgent: string
  ipAddress: string
  expiresAt: Timestamp
}

// === Team & Organization ===

export interface Team extends BaseEntity {
  name: string
  slug: string
  description: string
  ownerId: UUID
  memberIds: UUID[]
  settings: TeamSettings
}

export interface TeamSettings {
  defaultProjectVisibility: 'public' | 'private'
  requireApproval: boolean
  maxProjects: number
  allowGuests: boolean
}

// === Project ===

export type ProjectStatus = 'active' | 'archived' | 'paused' | 'completed'

export interface Project extends BaseEntity {
  name: string
  slug: string
  description: string
  status: ProjectStatus
  teamId: UUID
  ownerId: UUID
  settings: ProjectSettings
  tags: string[]
}

export interface ProjectSettings {
  defaultAssignee?: UUID
  autoCloseStale: boolean
  staleDays: number
  requireDescription: boolean
  allowSubtasks: boolean
  maxPriority: number
  workflow: WorkflowConfig
}

export interface WorkflowConfig {
  columns: WorkflowColumn[]
  transitions: WorkflowTransition[]
}

export interface WorkflowColumn {
  id: string
  name: string
  color: string
  wipLimit?: number
}

export interface WorkflowTransition {
  from: string
  to: string
  requiresApproval?: boolean
}

// === Task ===

export type TaskStatus = 'backlog' | 'todo' | 'in_progress' | 'review' | 'done' | 'cancelled'
export type TaskPriority = 'critical' | 'high' | 'medium' | 'low'
export type TaskType = 'feature' | 'bug' | 'chore' | 'spike' | 'epic'

export interface Task extends BaseEntity {
  title: string
  description: string
  status: TaskStatus
  priority: TaskPriority
  type: TaskType
  projectId: UUID
  assigneeId?: UUID
  reporterId: UUID
  parentId?: UUID
  tags: string[]
  dueDate?: Timestamp
  estimate?: number
  timeSpent?: number
  completedAt?: Timestamp
  position: number
}

export interface TaskComment extends BaseEntity {
  taskId: UUID
  authorId: UUID
  content: string
  parentId?: UUID
  editedAt?: Timestamp
}

export interface TaskActivity extends BaseEntity {
  taskId: UUID
  userId: UUID
  action: TaskAction
  field?: string
  oldValue?: string
  newValue?: string
}

export type TaskAction = 'created' | 'updated' | 'moved' | 'assigned' | 'commented' | 'attached'

// === Notification ===

export type NotificationType = 'task_assigned' | 'task_mentioned' | 'task_updated' | 'comment_reply' | 'deadline_approaching'

export interface Notification extends BaseEntity {
  userId: UUID
  type: NotificationType
  title: string
  body: string
  read: boolean
  readAt?: Timestamp
  metadata: Record<string, unknown>
}

// === API ===

export interface PaginationParams {
  page: number
  limit: number
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
}

export interface PaginatedResult<T> {
  items: T[]
  total: number
  page: number
  limit: number
  hasMore: boolean
}

export interface ApiError {
  code: string
  message: string
  details?: Record<string, unknown>
  statusCode: number
}

// === Events ===

export type EventType =
  | 'task.created' | 'task.updated' | 'task.deleted' | 'task.moved'
  | 'project.created' | 'project.updated' | 'project.archived'
  | 'team.member_added' | 'team.member_removed'
  | 'comment.created' | 'comment.updated'

export interface DomainEvent<T = unknown> {
  id: UUID
  type: EventType
  timestamp: Timestamp
  payload: T
  metadata: {
    userId: UUID
    correlationId: UUID
    source: string
  }
}

// === Webhooks ===

export interface WebhookConfig extends BaseEntity {
  projectId: UUID
  url: string
  secret: string
  events: EventType[]
  active: boolean
  retryCount: number
  lastDeliveryAt?: Timestamp
  lastStatus?: number
}

// === Analytics ===

export interface ProjectStats {
  totalTasks: number
  byStatus: Record<TaskStatus, number>
  byPriority: Record<TaskPriority, number>
  byType: Record<TaskType, number>
  avgCompletionTime: number
  overdueCount: number
  completionRate: number
  velocity: number[]
}

export interface UserStats {
  tasksAssigned: number
  tasksCompleted: number
  avgCompletionTime: number
  currentStreak: number
}
