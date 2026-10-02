import { randomUUID } from 'node:crypto'

export const REALTIME_EVENT_VERSION = 1 as const

export type RealtimeEventType =
  | 'connection.ready'
  | 'connection.pong'
  | 'market.price'
  | 'market.candle'
  | 'market.status'
  | 'trade.status'
  | 'position.update'
  | 'wallet.update'
  | 'notification.created'

export type RealtimeEvent<T = unknown> = {
  version: typeof REALTIME_EVENT_VERSION
  id: string
  type: RealtimeEventType
  timestamp: string
  data: T
}

export function createRealtimeEvent<T>(
  type: RealtimeEventType,
  data: T,
): RealtimeEvent<T> {
  return {
    version: REALTIME_EVENT_VERSION,
    id: randomUUID(),
    type,
    timestamp: new Date().toISOString(),
    data,
  }
}

export function serializeRealtimeEvent<T>(event: RealtimeEvent<T>): string {
  return JSON.stringify(event)
}

export function parseRealtimeEvent(value: string): RealtimeEvent | null {
  try {
    const parsed: unknown = JSON.parse(value)

    if (!parsed || typeof parsed !== 'object') return null

    const candidate = parsed as Record<string, unknown>

    if (
      candidate.version !== REALTIME_EVENT_VERSION ||
      typeof candidate.id !== 'string' ||
      typeof candidate.type !== 'string' ||
      typeof candidate.timestamp !== 'string' ||
      !('data' in candidate)
    ) {
      return null
    }

    return candidate as unknown as RealtimeEvent
  } catch {
    return null
  }
}
