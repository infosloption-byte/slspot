import { createRealtimeEvent, INTERNAL_SESSION_REVOCATION_CHANNEL, serializeRealtimeEvent } from './events.js'
import { publishRealtime } from './bus.js'

type SessionRevocationPayload =
  | { sessionIds: string[] }
  | { userId: string; exceptSessionId?: string }

/**
 * Sends an internal-only control event to every API instance. The gateway consumes this
 * event locally and never forwards it to browser WebSocket clients.
 */
async function publishRevocation(payload: SessionRevocationPayload): Promise<void> {
  try {
    await publishRealtime(serializeRealtimeEvent(createRealtimeEvent('session.revoked', payload, INTERNAL_SESSION_REVOCATION_CHANNEL)))
  } catch {
    // Database session state remains authoritative; gateway heartbeat/message validation
    // is the fail-closed fallback if the realtime bus cannot deliver the signal.
  }
}

export function publishSessionsRevoked(sessionIds: readonly string[]): Promise<void> {
  const normalized = [...new Set(sessionIds.filter((id) => typeof id === 'string' && id.length > 0))]
  if (normalized.length === 0) return Promise.resolve()
  return publishRevocation({ sessionIds: normalized })
}

export function publishUserSessionsRevoked(userId: string, exceptSessionId?: string): Promise<void> {
  if (!userId) return Promise.resolve()
  return publishRevocation({
    userId,
    ...(exceptSessionId ? { exceptSessionId } : {}),
  })
}
