export type RealtimeChannel = `market:${string}` | `user:${string}`

export type RealtimeClientMessage =
  | {
      type: 'connection.ping'
      requestId?: string
    }
  | {
      type: 'subscription.subscribe'
      requestId: string
      channel: RealtimeChannel
    }
  | {
      type: 'subscription.unsubscribe'
      requestId: string
      channel: RealtimeChannel
    }

export type RealtimeEvent<T = unknown> = {
  version: 1
  id: string
  type:
    | 'connection.ready'
    | 'connection.pong'
    | 'subscription.updated'
    | 'subscription.rejected'
    | 'market.price'
    | 'market.candle'
    | 'market.status'
    | 'trade.status'
    | 'position.update'
    | 'wallet.update'
    | 'notification.created'
  timestamp: string
  channel?: RealtimeChannel
  data: T
}
