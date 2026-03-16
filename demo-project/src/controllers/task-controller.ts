// Task API controller — handles HTTP request/response mapping

import type { TaskStatus, TaskPriority, UUID, PaginationParams } from '../types'
import { TaskService, type CreateTaskInput, type UpdateTaskInput, type TaskFilters } from '../services/task-service'
import { validate, required, minLength, maxLength, isIn } from '../utils/validation'

const VALID_STATUSES: TaskStatus[] = ['backlog', 'todo', 'in_progress', 'review', 'done', 'cancelled']
const VALID_PRIORITIES: TaskPriority[] = ['critical', 'high', 'medium', 'low']
const VALID_TYPES = ['feature', 'bug', 'chore', 'spike', 'epic']

interface RequestParams {
  params: Record<string, string>
  query: Record<string, string | string[]>
  body: Record<string, unknown>
  userId: UUID
}

export class TaskController {
  private service: TaskService

  constructor(service: TaskService) {
    this.service = service
  }

  async create(req: RequestParams) {
    const { projectId } = req.params
    const body = req.body as CreateTaskInput

    const validation = validate(body,
      required('title'),
      minLength('title', 1),
      maxLength('title', 200),
    )
    if (!validation.valid) {
      return { status: 422, body: { code: 'VALIDATION_ERROR', errors: validation.errors } }
    }

    if (body.status && !VALID_STATUSES.includes(body.status)) {
      return { status: 422, body: { code: 'VALIDATION_ERROR', errors: ['Invalid status'] } }
    }

    if (body.priority && !VALID_PRIORITIES.includes(body.priority)) {
      return { status: 422, body: { code: 'VALIDATION_ERROR', errors: ['Invalid priority'] } }
    }

    const task = await this.service.create(projectId, req.userId, body)
    return { status: 201, body: task }
  }

  async getById(req: RequestParams) {
    const task = await this.service.getById(req.params.taskId)
    return { status: 200, body: task }
  }

  async list(req: RequestParams) {
    const { projectId } = req.params
    const query = req.query

    const filters: TaskFilters = {}
    if (query.status) {
      filters.status = (Array.isArray(query.status) ? query.status : [query.status]) as TaskStatus[]
    }
    if (query.priority) {
      filters.priority = (Array.isArray(query.priority) ? query.priority : [query.priority]) as TaskPriority[]
    }
    if (query.assigneeId) filters.assigneeId = query.assigneeId as string
    if (query.tags) filters.tags = Array.isArray(query.tags) ? query.tags : [query.tags]

    const pagination: PaginationParams = {
      page: parseInt(query.page as string) || 1,
      limit: Math.min(parseInt(query.limit as string) || 20, 100),
      sortBy: query.sortBy as string,
      sortOrder: (query.sortOrder as 'asc' | 'desc') || 'asc',
    }

    const result = await this.service.list(projectId, filters, pagination)
    return { status: 200, body: result }
  }

  async update(req: RequestParams) {
    const body = req.body as UpdateTaskInput

    if (body.title !== undefined) {
      const validation = validate(body as Record<string, unknown>,
        minLength('title', 1),
        maxLength('title', 200),
      )
      if (!validation.valid) {
        return { status: 422, body: { code: 'VALIDATION_ERROR', errors: validation.errors } }
      }
    }

    const task = await this.service.update(req.params.taskId, req.userId, body)
    return { status: 200, body: task }
  }

  async move(req: RequestParams) {
    const { status } = req.body as { status: TaskStatus }

    const validation = validate({ status } as Record<string, unknown>, isIn('status', VALID_STATUSES))
    if (!validation.valid) {
      return { status: 422, body: { code: 'VALIDATION_ERROR', errors: validation.errors } }
    }

    const task = await this.service.move(req.params.taskId, req.userId, status)
    return { status: 200, body: task }
  }

  async assign(req: RequestParams) {
    const { assigneeId } = req.body as { assigneeId?: UUID }
    const task = await this.service.assign(req.params.taskId, req.userId, assigneeId)
    return { status: 200, body: task }
  }

  async delete(req: RequestParams) {
    await this.service.delete(req.params.taskId, req.userId)
    return { status: 204, body: null }
  }

  async search(req: RequestParams) {
    const query = req.query.q as string
    if (!query) {
      return { status: 422, body: { code: 'VALIDATION_ERROR', errors: ['Search query is required'] } }
    }

    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100)
    const tasks = await this.service.search(req.params.projectId, query, limit)
    return { status: 200, body: { items: tasks, total: tasks.length } }
  }

  async logTime(req: RequestParams) {
    const { hours } = req.body as { hours: number }
    if (!hours || hours <= 0) {
      return { status: 422, body: { code: 'VALIDATION_ERROR', errors: ['Hours must be positive'] } }
    }

    const task = await this.service.logTime(req.params.taskId, req.userId, hours)
    return { status: 200, body: task }
  }

  async getSubtasks(req: RequestParams) {
    const subtasks = await this.service.getSubtasks(req.params.taskId)
    return { status: 200, body: { items: subtasks, total: subtasks.length } }
  }

  async getActivities(req: RequestParams) {
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200)
    const activities = await this.service.getActivities(req.params.taskId, limit)
    return { status: 200, body: { items: activities, total: activities.length } }
  }

  async getOverdue(req: RequestParams) {
    const tasks = await this.service.getOverdueTasks(req.params.projectId)
    return { status: 200, body: { items: tasks, total: tasks.length } }
  }
}
