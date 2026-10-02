import type { RealtimeEvent } from './contracts'

export function parseRealtimeEvent(value: unknown): RealtimeEvent | null {
  if (!value || typeof value !== 'object') return null

  const event = value as Partial<RealtimeEvent>
  if (event.version !== 1 || typeof event.id !== 'string' || typeof event.type !== 'string' || typeof event.timestamp !== 'string') {
    return null
  }

  return event as RealtimeEvent
}

export function parseRealtimeMessage(raw: string): RealtimeEvent | null {
  try {
    return parseRealtimeEvent(JSON.parse(raw))
  } catch {
    return null
  }
}
