import type { Project, ProjectStatus, UUID, PaginatedResult, PaginationParams } from '../types'
import { ProjectModel } from '../models/project'
import { EventBus } from '../utils/event-bus'
import { Logger } from '../utils/logger'

interface ProjectStore {
  findById(id: UUID): Promise<ProjectModel | null>
  findBySlug(slug: string): Promise<ProjectModel | null>
  findByTeam(teamId: UUID, status?: ProjectStatus): Promise<ProjectModel[]>
  countByTeam(teamId: UUID, status?: ProjectStatus): Promise<number>
  save(project: ProjectModel): Promise<void>
  delete(id: UUID): Promise<void>
}

export interface CreateProjectInput {
  name: string
  description?: string
  tags?: string[]
}

export class ProjectService {
  private store: ProjectStore
  private events: EventBus
  private logger: Logger

  constructor(store: ProjectStore, events: EventBus) {
    this.store = store
    this.events = events
    this.logger = new Logger('ProjectService')
  }

  async create(teamId: UUID, ownerId: UUID, input: CreateProjectInput): Promise<Project> {
    const slug = ProjectModel.slugify(input.name)
    const existing = await this.store.findBySlug(slug)
    if (existing) {
      throw new ProjectError('SLUG_EXISTS', `Project with slug "${slug}" already exists`)
    }

    const project = new ProjectModel({
      name: input.name,
      description: input.description,
      teamId,
      ownerId,
      tags: input.tags,
    })

    await this.store.save(project)
    this.events.emit('project.created', { projectId: project.id, teamId })
    this.logger.info('Project created', { projectId: project.id, name: project.name })

    return project.toJSON()
  }

  async getById(id: UUID): Promise<Project> {
    const project = await this.store.findById(id)
    if (!project) throw new ProjectNotFoundError(id)
    return project.toJSON()
  }

  async getBySlug(slug: string): Promise<Project> {
    const project = await this.store.findBySlug(slug)
    if (!project) throw new ProjectError('NOT_FOUND', `Project not found: ${slug}`, 404)
    return project.toJSON()
  }

  async list(teamId: UUID, status: ProjectStatus | undefined, pagination: PaginationParams): Promise<PaginatedResult<Project>> {
    const [projects, total] = await Promise.all([
      this.store.findByTeam(teamId, status),
      this.store.countByTeam(teamId, status),
    ])

    const sorted = [...projects].sort((a, b) => b.updatedAt - a.updatedAt)
    const start = (pagination.page - 1) * pagination.limit
    const paged = sorted.slice(start, start + pagination.limit)

    return {
      items: paged.map(p => p.toJSON()),
      total,
      page: pagination.page,
      limit: pagination.limit,
      hasMore: start + pagination.limit < total,
    }
  }

  async update(id: UUID, updates: Partial<Pick<Project, 'name' | 'description' | 'tags'>>): Promise<Project> {
    const project = await this.store.findById(id)
    if (!project) throw new ProjectNotFoundError(id)

    if (updates.name !== undefined) project.name = updates.name.trim()
    if (updates.description !== undefined) project.description = updates.description
    if (updates.tags !== undefined) project.tags = updates.tags
    project.updatedAt = Date.now()

    await this.store.save(project)
    this.events.emit('project.updated', { projectId: id })

    return project.toJSON()
  }

  async archive(id: UUID): Promise<Project> {
    const project = await this.store.findById(id)
    if (!project) throw new ProjectNotFoundError(id)

    project.archive()
    await this.store.save(project)
    this.events.emit('project.archived', { projectId: id })
    this.logger.info('Project archived', { projectId: id })

    return project.toJSON()
  }

  async delete(id: UUID): Promise<void> {
    const project = await this.store.findById(id)
    if (!project) throw new ProjectNotFoundError(id)

    await this.store.delete(id)
    this.logger.info('Project deleted', { projectId: id })
  }

  async getStats(id: UUID): Promise<ReturnType<ProjectModel['computeStats']>> {
    const project = await this.store.findById(id)
    if (!project) throw new ProjectNotFoundError(id)
    return project.computeStats([])
  }
}

export class ProjectNotFoundError extends Error {
  projectId: UUID
  statusCode = 404

  constructor(projectId: UUID) {
    super(`Project not found: ${projectId}`)
    this.projectId = projectId
    this.name = 'ProjectNotFoundError'
  }
}

export class ProjectError extends Error {
  code: string
  statusCode: number

  constructor(code: string, message: string, statusCode: number = 400) {
    super(message)
    this.code = code
    this.name = 'ProjectError'
    this.statusCode = statusCode
  }
}
