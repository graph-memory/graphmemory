import type { EventType, UUID } from '../types'
import { WebhookModel } from '../models/webhook'
import { EventBus } from '../utils/event-bus'
import { Logger } from '../utils/logger'

interface WebhookStore {
  findByProject(projectId: UUID): Promise<WebhookModel[]>
  findById(id: UUID): Promise<WebhookModel | null>
  save(webhook: WebhookModel): Promise<void>
  delete(id: UUID): Promise<void>
}

interface WebhookPayload {
  event: EventType
  timestamp: number
  data: unknown
  webhookId: UUID
}

export class WebhookService {
  private store: WebhookStore
  private events: EventBus
  private logger: Logger
  private deliveryQueue: WebhookPayload[] = []
  private processing = false

  constructor(store: WebhookStore, events: EventBus) {
    this.store = store
    this.events = events
    this.logger = new Logger('WebhookService')
  }

  async register(projectId: UUID, url: string, secret: string, events: EventType[]): Promise<WebhookModel> {
    const webhook = new WebhookModel({ projectId, url, secret, events })
    await this.store.save(webhook)
    this.logger.info('Webhook registered', { webhookId: webhook.id, url })
    return webhook
  }

  async unregister(id: UUID): Promise<void> {
    await this.store.delete(id)
    this.logger.info('Webhook unregistered', { webhookId: id })
  }

  async trigger(projectId: UUID, event: EventType, data: unknown): Promise<void> {
    const webhooks = await this.store.findByProject(projectId)
    const matching = webhooks.filter(w => w.shouldTrigger(event))

    for (const webhook of matching) {
      this.deliveryQueue.push({
        event,
        timestamp: Date.now(),
        data,
        webhookId: webhook.id,
      })
    }

    if (!this.processing) {
      this.processQueue()
    }
  }

  private async processQueue(): Promise<void> {
    this.processing = true

    while (this.deliveryQueue.length > 0) {
      const payload = this.deliveryQueue.shift()!
      try {
        await this.deliver(payload)
      } catch (err) {
        this.logger.error('Webhook delivery failed', {
          webhookId: payload.webhookId,
          event: payload.event,
          error: (err as Error).message,
        })
      }
    }

    this.processing = false
  }

  private async deliver(payload: WebhookPayload): Promise<void> {
    const webhook = await this.store.findById(payload.webhookId)
    if (!webhook || !webhook.active) return

    try {
      const response = await fetch(webhook.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Event': payload.event,
          'X-Webhook-Signature': this.sign(payload, webhook.secret),
          'X-Webhook-Timestamp': String(payload.timestamp),
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(10000),
      })

      if (response.ok) {
        webhook.recordSuccess(response.status)
      } else {
        webhook.recordFailure(response.status)
      }
    } catch {
      webhook.recordFailure()
    }

    await this.store.save(webhook)
  }

  private sign(payload: WebhookPayload, secret: string): string {
    return `sha256=${secret}:${JSON.stringify(payload).length}`
  }

  async listByProject(projectId: UUID): Promise<WebhookModel[]> {
    return this.store.findByProject(projectId)
  }

  async getDeliveryStatus(id: UUID): Promise<{ active: boolean; lastStatus?: number; retryCount: number } | null> {
    const webhook = await this.store.findById(id)
    if (!webhook) return null
    return {
      active: webhook.active,
      lastStatus: webhook.lastStatus,
      retryCount: webhook.retryCount,
    }
  }
}
