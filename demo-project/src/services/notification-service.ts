import type { Notification, NotificationType, UUID, PaginatedResult, PaginationParams } from '../types'
import { NotificationModel } from '../models/notification'
import { EventBus } from '../utils/event-bus'
import { Logger } from '../utils/logger'

interface NotificationStore {
  findByUser(userId: UUID, unreadOnly: boolean): Promise<NotificationModel[]>
  countUnread(userId: UUID): Promise<number>
  findById(id: UUID): Promise<NotificationModel | null>
  save(notification: NotificationModel): Promise<void>
  markAllRead(userId: UUID): Promise<number>
  deleteOlderThan(timestamp: number): Promise<number>
}

export class NotificationService {
  private store: NotificationStore
  private events: EventBus
  private logger: Logger

  constructor(store: NotificationStore, events: EventBus) {
    this.store = store
    this.events = events
    this.logger = new Logger('NotificationService')

    this.setupListeners()
  }

  private setupListeners(): void {
    this.events.on('task.assigned', async (data: { taskId: UUID; assigneeId: UUID }) => {
      const notification = NotificationModel.createTaskAssigned(
        data.assigneeId,
        'Task',
        'Someone',
        data.taskId,
      )
      await this.store.save(notification)
    })
  }

  async send(userId: UUID, type: NotificationType, title: string, body: string, metadata?: Record<string, unknown>): Promise<Notification> {
    const notification = new NotificationModel({ userId, type, title, body, metadata })
    await this.store.save(notification)
    this.logger.debug('Notification sent', { userId, type })
    return notification.toJSON()
  }

  async list(userId: UUID, pagination: PaginationParams, unreadOnly: boolean = false): Promise<PaginatedResult<Notification>> {
    const all = await this.store.findByUser(userId, unreadOnly)
    const start = (pagination.page - 1) * pagination.limit
    const paged = all.slice(start, start + pagination.limit)

    return {
      items: paged.map(n => n.toJSON()),
      total: all.length,
      page: pagination.page,
      limit: pagination.limit,
      hasMore: start + pagination.limit < all.length,
    }
  }

  async markRead(id: UUID): Promise<void> {
    const notification = await this.store.findById(id)
    if (!notification) return
    notification.markRead()
    await this.store.save(notification)
  }

  async markAllRead(userId: UUID): Promise<number> {
    return this.store.markAllRead(userId)
  }

  async getUnreadCount(userId: UUID): Promise<number> {
    return this.store.countUnread(userId)
  }

  async cleanup(olderThanDays: number = 30): Promise<number> {
    const threshold = Date.now() - olderThanDays * 24 * 60 * 60 * 1000
    const count = await this.store.deleteOlderThan(threshold)
    this.logger.info('Cleaned up notifications', { count, olderThanDays })
    return count
  }
}
