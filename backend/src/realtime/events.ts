import { randomUUID } from 'node:crypto'
import { isValidRequestId } from '../contracts/api.js'
import {
  isRealtimeChannel,
  type RealtimeChannel,
  type RealtimeClientMessage,
} from '../contracts/realtime.js'

export const REALTIME_EVENT_VERSION = 1 as const

export type RealtimeEventType =
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

export type RealtimeEvent<T = unknown> = {
  version: typeof REALTIME_EVENT_VERSION
  id: string
  type: RealtimeEventType
  timestamp: string
  channel?: RealtimeChannel
  data: T
}

export function createRealtimeEvent<T>(
  type: RealtimeEventType,
  data: T,
  channel?: RealtimeChannel,
): RealtimeEvent<T> {
  return {
    version: REALTIME_EVENT_VERSION,
    id: randomUUID(),
    type,
    timestamp: new Date().toISOString(),
    ...(channel ? { channel } : {}),
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
      (candidate.channel !== undefined && !isRealtimeChannel(candidate.channel)) ||
      !('data' in candidate)
    ) {
      return null
    }

    return candidate as unknown as RealtimeEvent
  } catch {
    return null
  }
}

export function parseRealtimeClientMessage(value: string): RealtimeClientMessage | null {
  try {
    const parsed: unknown = JSON.parse(value)

    if (!parsed || typeof parsed !== 'object') return null

    const candidate = parsed as Record<string, unknown>

    if (candidate.type === 'connection.ping') {
      return candidate.requestId === undefined || isValidRequestId(candidate.requestId)
        ? { type: 'connection.ping', ...(candidate.requestId ? { requestId: candidate.requestId } : {}) }
        : null
    }

    if (
      (candidate.type !== 'subscription.subscribe' &&
        candidate.type !== 'subscription.unsubscribe') ||
      !isValidRequestId(candidate.requestId) ||
      !isRealtimeChannel(candidate.channel)
    ) {
      return null
    }

    return {
      type: candidate.type,
      requestId: candidate.requestId,
      channel: candidate.channel,
    } as RealtimeClientMessage
  } catch {
    return null
  }
}
