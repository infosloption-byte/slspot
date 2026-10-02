import type { RealtimeChannel } from './contracts'

export const marketChannel = (assetId: string): RealtimeChannel => `market:${assetId}` as RealtimeChannel
export const userChannel = (userId: string): RealtimeChannel => `user:${userId}` as RealtimeChannel

export type RealtimeSubscription = {
  channel: RealtimeChannel
  unsubscribe: () => void
}
