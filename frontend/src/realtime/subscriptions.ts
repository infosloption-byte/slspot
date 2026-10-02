import type { RealtimeChannel } from './contracts'

export const marketChannel = (assetId: string): RealtimeChannel => 'market:' + assetId
export const userChannel = (userId: string): RealtimeChannel => 'user:' + userId

export type RealtimeSubscription = {
  channel: RealtimeChannel
  unsubscribe: () => void
}
