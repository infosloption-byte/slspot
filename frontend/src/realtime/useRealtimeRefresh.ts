import { useCallback, useEffect, useRef } from 'react'
import type { RealtimeEvent } from './contracts'
import { useRealtime, useRealtimeState } from './useRealtime'

type Options = {
  /** Realtime event types that mean "server data changed, refetch". */
  events: ReadonlyArray<RealtimeEvent['type']>
  /** Events arriving within this window collapse into a single refresh. */
  coalesceMs?: number
  /** Polling interval used ONLY while the socket is not connected. */
  fallbackMs?: number
}

/**
 * Keeps server state fresh without constant polling:
 * - a burst of matching WebSocket events triggers one refresh,
 * - one catch-up refresh runs when the socket comes back after an outage,
 * - polling is a fallback that runs only while the socket is down.
 */
export function useRealtimeRefresh(refresh: () => void, { events, coalesceMs = 200, fallbackMs = 5000 }: Options): void {
  const realtime = useRealtime()
  const connection = useRealtimeState()
  const refreshRef = useRef(refresh)
  const timerRef = useRef<number | null>(null)
  const wasDisconnectedRef = useRef(false)
  const eventsKey = events.join('|')

  useEffect(() => {
    refreshRef.current = refresh
  }, [refresh])

  const scheduleRefresh = useCallback(() => {
    if (timerRef.current !== null) return
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null
      refreshRef.current()
    }, coalesceMs)
  }, [coalesceMs])

  useEffect(() => () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])

  useEffect(() => {
    const wanted = new Set(eventsKey.split('|'))
    return realtime.onEvent((event) => {
      if (wanted.has(event.type)) scheduleRefresh()
    })
  }, [realtime, eventsKey, scheduleRefresh])

  useEffect(() => {
    if (connection === 'connected') {
      // Events may have been missed while the socket was down.
      if (wasDisconnectedRef.current) {
        wasDisconnectedRef.current = false
        refreshRef.current()
      }
      return undefined
    }

    // 'connecting' is the short initial handshake; the first load already covers it.
    if (connection === 'connecting') return undefined

    wasDisconnectedRef.current = true
    const timer = window.setInterval(() => refreshRef.current(), fallbackMs)
    return () => window.clearInterval(timer)
  }, [connection, fallbackMs])
}
