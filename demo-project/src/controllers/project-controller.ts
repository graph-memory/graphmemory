// Project API controller

import type { UUID, PaginationParams, ProjectStatus } from '../types'
import { ProjectService, type CreateProjectInput } from '../services/project-service'
import { validate, required, minLength, maxLength } from '../utils/validation'

interface RequestParams {
  params: Record<string, string>
  query: Record<string, string>
  body: Record<string, unknown>
  userId: UUID
  teamId: UUID
}

export class ProjectController {
  private service: ProjectService

  constructor(service: ProjectService) {
    this.service = service
  }

  async create(req: RequestParams) {
    const body = req.body as CreateProjectInput

    const validation = validate(body as Record<string, unknown>,
      required('name'),
      minLength('name', 1),
      maxLength('name', 100),
    )
    if (!validation.valid) {
      return { status: 422, body: { code: 'VALIDATION_ERROR', errors: validation.errors } }
    }

    const project = await this.service.create(req.teamId, req.userId, body)
    return { status: 201, body: project }
  }

  async getById(req: RequestParams) {
    const project = await this.service.getById(req.params.projectId)
    return { status: 200, body: project }
  }

  async getBySlug(req: RequestParams) {
    const project = await this.service.getBySlug(req.params.slug)
    return { status: 200, body: project }
  }

  async list(req: RequestParams) {
    const pagination: PaginationParams = {
      page: parseInt(req.query.page) || 1,
      limit: Math.min(parseInt(req.query.limit) || 20, 100),
      sortBy: req.query.sortBy,
      sortOrder: (req.query.sortOrder as 'asc' | 'desc') || 'desc',
    }

    const status = req.query.status as ProjectStatus | undefined
    const result = await this.service.list(req.teamId, status, pagination)
    return { status: 200, body: result }
  }

  async update(req: RequestParams) {
    const updates = req.body as Partial<{ name: string; description: string; tags: string[] }>

    if (updates.name !== undefined) {
      const validation = validate(updates as Record<string, unknown>,
        minLength('name', 1),
        maxLength('name', 100),
      )
      if (!validation.valid) {
        return { status: 422, body: { code: 'VALIDATION_ERROR', errors: validation.errors } }
      }
    }

    const project = await this.service.update(req.params.projectId, updates)
    return { status: 200, body: project }
  }

  async archive(req: RequestParams) {
    const project = await this.service.archive(req.params.projectId)
    return { status: 200, body: project }
  }

  async delete(req: RequestParams) {
    await this.service.delete(req.params.projectId)
    return { status: 204, body: null }
  }

  async getStats(req: RequestParams) {
    const stats = await this.service.getStats(req.params.projectId)
    return { status: 200, body: stats }
  }
}
