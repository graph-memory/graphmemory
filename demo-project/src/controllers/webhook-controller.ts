// Webhook management controller

import type { EventType, UUID } from '../types'
import { WebhookService } from '../services/webhook-service'
import { validate, required } from '../utils/validation'

interface RequestParams {
  params: Record<string, string>
  body: Record<string, unknown>
  userId: UUID
}

const VALID_EVENTS: EventType[] = [
  'task.created', 'task.updated', 'task.deleted', 'task.moved',
  'project.created', 'project.updated', 'project.archived',
  'team.member_added', 'team.member_removed',
  'comment.created', 'comment.updated',
]

export class WebhookController {
  private service: WebhookService

  constructor(service: WebhookService) {
    this.service = service
  }

  async register(req: RequestParams) {
    const { url, secret, events } = req.body as { url: string; secret: string; events: EventType[] }

    const validation = validate(req.body, required('url'), required('secret'), required('events'))
    if (!validation.valid) {
      return { status: 422, body: { code: 'VALIDATION_ERROR', errors: validation.errors } }
    }

    try {
      new URL(url)
    } catch {
      return { status: 422, body: { code: 'VALIDATION_ERROR', errors: ['Invalid URL'] } }
    }

    const invalidEvents = events.filter(e => !VALID_EVENTS.includes(e))
    if (invalidEvents.length > 0) {
      return { status: 422, body: { code: 'VALIDATION_ERROR', errors: [`Invalid events: ${invalidEvents.join(', ')}`] } }
    }

    const webhook = await this.service.register(req.params.projectId, url, secret, events)
    return { status: 201, body: webhook.toJSON() }
  }

  async unregister(req: RequestParams) {
    await this.service.unregister(req.params.webhookId)
    return { status: 204, body: null }
  }

  async list(req: RequestParams) {
    const webhooks = await this.service.listByProject(req.params.projectId)
    return { status: 200, body: { items: webhooks.map(w => w.toJSON()), total: webhooks.length } }
  }

  async getStatus(req: RequestParams) {
    const status = await this.service.getDeliveryStatus(req.params.webhookId)
    if (!status) {
      return { status: 404, body: { code: 'NOT_FOUND', message: 'Webhook not found' } }
    }
    return { status: 200, body: status }
  }
}
