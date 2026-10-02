export const REALTIME_CHANNEL_PREFIX = {
  market: 'market:',
  user: 'user:',
} as const

export type RealtimeChannel = `market:${string}` | `user:${string}`

export type RealtimeClientMessage =
  | { type: 'connection.ping'; requestId?: string }
  | { type: 'subscription.subscribe'; requestId: string; channel: RealtimeChannel }
  | { type: 'subscription.unsubscribe'; requestId: string; channel: RealtimeChannel }

export type SubscriptionResult = {
  channel: RealtimeChannel
  subscribed: boolean
}

export function isRealtimeChannel(value: unknown): value is RealtimeChannel {
  if (typeof value !== 'string') return false
  return value.startsWith(REALTIME_CHANNEL_PREFIX.market) ||
    value.startsWith(REALTIME_CHANNEL_PREFIX.user)
}

export function isUserChannelAuthorized(channel: RealtimeChannel, userId: string): boolean {
  return channel.startsWith(REALTIME_CHANNEL_PREFIX.market) ||
    channel === REALTIME_CHANNEL_PREFIX.user + userId
}
