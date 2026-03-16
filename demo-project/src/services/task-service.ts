import type { Task, TaskStatus, TaskPriority, PaginationParams, PaginatedResult, UUID } from '../types'
import { TaskModel, ActivityModel } from '../models/task'
import { EventBus } from '../utils/event-bus'
import { Logger } from '../utils/logger'

interface TaskStore {
  findById(id: UUID): Promise<TaskModel | null>
  findByProject(projectId: UUID, filters?: TaskFilters): Promise<TaskModel[]>
  countByProject(projectId: UUID, filters?: TaskFilters): Promise<number>
  save(task: TaskModel): Promise<void>
  delete(id: UUID): Promise<void>
  saveActivity(activity: ActivityModel): Promise<void>
  getActivities(taskId: UUID, limit: number): Promise<ActivityModel[]>
  findSubtasks(parentId: UUID): Promise<TaskModel[]>
  getMaxPosition(projectId: UUID, status: TaskStatus): Promise<number>
  search(projectId: UUID, query: string, limit: number): Promise<TaskModel[]>
}

export interface TaskFilters {
  status?: TaskStatus[]
  priority?: TaskPriority[]
  assigneeId?: UUID
  type?: string[]
  tags?: string[]
  hasDeadline?: boolean
  isOverdue?: boolean
}

export interface CreateTaskInput {
  title: string
  description?: string
  status?: TaskStatus
  priority?: TaskPriority
  type?: 'feature' | 'bug' | 'chore' | 'spike' | 'epic'
  assigneeId?: UUID
  parentId?: UUID
  tags?: string[]
  dueDate?: number
  estimate?: number
}

export interface UpdateTaskInput {
  title?: string
  description?: string
  priority?: TaskPriority
  type?: 'feature' | 'bug' | 'chore' | 'spike' | 'epic'
  tags?: string[]
  dueDate?: number | null
  estimate?: number | null
}

export class TaskService {
  private store: TaskStore
  private events: EventBus
  private logger: Logger

  constructor(store: TaskStore, events: EventBus) {
    this.store = store
    this.events = events
    this.logger = new Logger('TaskService')
  }

  async create(projectId: UUID, reporterId: UUID, input: CreateTaskInput): Promise<Task> {
    const position = await this.store.getMaxPosition(projectId, input.status ?? 'backlog') + 1

    const task = new TaskModel({
      ...input,
      projectId,
      reporterId,
      position,
    })

    await this.store.save(task)

    await this.store.saveActivity(new ActivityModel({
      taskId: task.id,
      userId: reporterId,
      action: 'created',
    }))

    this.events.emit('task.created', { taskId: task.id, projectId })
    this.logger.info('Task created', { taskId: task.id, title: task.title })

    return task.toJSON()
  }

  async getById(id: UUID): Promise<Task> {
    const task = await this.store.findById(id)
    if (!task) throw new TaskNotFoundError(id)
    return task.toJSON()
  }

  async list(projectId: UUID, filters: TaskFilters, pagination: PaginationParams): Promise<PaginatedResult<Task>> {
    const [tasks, total] = await Promise.all([
      this.store.findByProject(projectId, filters),
      this.store.countByProject(projectId, filters),
    ])

    const sorted = this.sortTasks(tasks, pagination.sortBy, pagination.sortOrder)
    const start = (pagination.page - 1) * pagination.limit
    const paged = sorted.slice(start, start + pagination.limit)

    return {
      items: paged.map(t => t.toJSON()),
      total,
      page: pagination.page,
      limit: pagination.limit,
      hasMore: start + pagination.limit < total,
    }
  }

  async update(id: UUID, userId: UUID, input: UpdateTaskInput): Promise<Task> {
    const task = await this.store.findById(id)
    if (!task) throw new TaskNotFoundError(id)

    const changes: Array<{ field: string; oldValue: string; newValue: string }> = []

    if (input.title !== undefined && input.title !== task.title) {
      changes.push({ field: 'title', oldValue: task.title, newValue: input.title })
    }
    if (input.priority !== undefined && input.priority !== task.priority) {
      changes.push({ field: 'priority', oldValue: task.priority, newValue: input.priority })
    }

    task.update(input)
    await this.store.save(task)

    for (const change of changes) {
      await this.store.saveActivity(new ActivityModel({
        taskId: id,
        userId,
        action: 'updated',
        ...change,
      }))
    }

    this.events.emit('task.updated', { taskId: id })
    return task.toJSON()
  }

  async move(id: UUID, userId: UUID, status: TaskStatus): Promise<Task> {
    const task = await this.store.findById(id)
    if (!task) throw new TaskNotFoundError(id)

    const oldStatus = task.status
    task.moveTo(status)
    task.position = await this.store.getMaxPosition(task.projectId, status) + 1

    await this.store.save(task)

    await this.store.saveActivity(new ActivityModel({
      taskId: id,
      userId,
      action: 'moved',
      field: 'status',
      oldValue: oldStatus,
      newValue: status,
    }))

    this.events.emit('task.moved', { taskId: id, from: oldStatus, to: status })
    this.logger.info('Task moved', { taskId: id, from: oldStatus, to: status })

    return task.toJSON()
  }

  async assign(id: UUID, userId: UUID, assigneeId: UUID | undefined): Promise<Task> {
    const task = await this.store.findById(id)
    if (!task) throw new TaskNotFoundError(id)

    const oldAssignee = task.assigneeId
    task.assign(assigneeId)
    await this.store.save(task)

    await this.store.saveActivity(new ActivityModel({
      taskId: id,
      userId,
      action: 'assigned',
      field: 'assignee',
      oldValue: oldAssignee,
      newValue: assigneeId,
    }))

    if (assigneeId && assigneeId !== userId) {
      this.events.emit('task.assigned', { taskId: id, assigneeId })
    }

    return task.toJSON()
  }

  async delete(id: UUID, userId: UUID): Promise<void> {
    const task = await this.store.findById(id)
    if (!task) throw new TaskNotFoundError(id)

    const subtasks = await this.store.findSubtasks(id)
    if (subtasks.length > 0) {
      throw new TaskError('HAS_SUBTASKS', 'Cannot delete task with subtasks')
    }

    await this.store.delete(id)
    this.events.emit('task.deleted', { taskId: id, projectId: task.projectId })
    this.logger.info('Task deleted', { taskId: id })
  }

  async logTime(id: UUID, userId: UUID, hours: number): Promise<Task> {
    const task = await this.store.findById(id)
    if (!task) throw new TaskNotFoundError(id)

    task.logTime(hours)
    await this.store.save(task)

    this.logger.info('Time logged', { taskId: id, hours })
    return task.toJSON()
  }

  async getSubtasks(id: UUID): Promise<Task[]> {
    const subtasks = await this.store.findSubtasks(id)
    return subtasks.map(t => t.toJSON())
  }

  async search(projectId: UUID, query: string, limit: number = 20): Promise<Task[]> {
    const results = await this.store.search(projectId, query, limit)
    return results.map(t => t.toJSON())
  }

  async getActivities(taskId: UUID, limit: number = 50): Promise<ActivityModel[]> {
    return this.store.getActivities(taskId, limit)
  }

  async getOverdueTasks(projectId: UUID): Promise<Task[]> {
    const tasks = await this.store.findByProject(projectId, { isOverdue: true })
    return tasks.filter(t => t.isOverdue).map(t => t.toJSON())
  }

  private sortTasks(tasks: TaskModel[], sortBy?: string, sortOrder?: 'asc' | 'desc'): TaskModel[] {
    const direction = sortOrder === 'desc' ? -1 : 1

    return [...tasks].sort((a, b) => {
      switch (sortBy) {
        case 'priority': return TaskModel.comparePriority(a, b) * direction
        case 'status': return TaskModel.compareStatus(a, b) * direction
        case 'dueDate': return TaskModel.compareDueDate(a, b) * direction
        case 'title': return a.title.localeCompare(b.title) * direction
        case 'createdAt': return (a.createdAt - b.createdAt) * direction
        default: return (a.position - b.position) * direction
      }
    })
  }
}

export class TaskNotFoundError extends Error {
  taskId: UUID
  statusCode = 404

  constructor(taskId: UUID) {
    super(`Task not found: ${taskId}`)
    this.taskId = taskId
    this.name = 'TaskNotFoundError'
  }
}

export class TaskError extends Error {
  code: string
  statusCode: number

  constructor(code: string, message: string, statusCode: number = 400) {
    super(message)
    this.code = code
    this.name = 'TaskError'
    this.statusCode = statusCode
  }
}
