import { useSyncExternalStore } from 'react'
import { useRealtimeState } from '../../realtime/useRealtime'

function subscribe(listener: () => void) {
  window.addEventListener('online', listener)
  window.addEventListener('offline', listener)
  return () => {
    window.removeEventListener('online', listener)
    window.removeEventListener('offline', listener)
  }
}

function getSnapshot() {
  return navigator.onLine
}

export function NetworkStatus() {
  const online = useSyncExternalStore(subscribe, getSnapshot, () => true)
  const realtimeState = useRealtimeState()

  if (!online) {
    return (
      <div className="network-banner network-banner--offline" role="status" aria-live="polite">
        <span className="network-banner__dot" aria-hidden="true" />
        <span><strong>You are offline.</strong> Changes will resume when the connection returns.</span>
      </div>
    )
  }

  if (realtimeState === 'reconnecting') {
    return (
      <div className="network-banner network-banner--reconnecting" role="status" aria-live="polite">
        <span className="network-banner__dot" aria-hidden="true" />
        <span><strong>Reconnecting to live services.</strong> Your current server data remains visible.</span>
      </div>
    )
  }

  return null
}
