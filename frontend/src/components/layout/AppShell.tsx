import { Outlet } from 'react-router'
import { useEffect, useState } from 'react'
import { useRealtimeState } from '../../realtime/RealtimeProvider'
import { Sidebar } from './Sidebar'
import { TopBar } from './TopBar'

/** Shared frame for every /app/* page: left rail + top bar + page content. */
export function AppShell() {
  const realtimeState = useRealtimeState()
  const [networkBusyCount, setNetworkBusyCount] = useState(0)
  useEffect(() => {
    const start = () => setNetworkBusyCount((count) => count + 1)
    const end = () => setNetworkBusyCount((count) => Math.max(0, count - 1))
    window.addEventListener('slspot:network-start', start)
    window.addEventListener('slspot:network-end', end)
    return () => {
      window.removeEventListener('slspot:network-start', start)
      window.removeEventListener('slspot:network-end', end)
    }
  }, [])
  const busy = realtimeState === 'connecting' || realtimeState === 'reconnecting' || networkBusyCount > 0

  return (
    <div className={'app-shell' + (busy ? ' app-shell--busy' : '')}>
      {busy ? <div className="app-shell__loading-bar" role="status" aria-label="Loading or connecting to live services" /> : null}
      <Sidebar />
      <div className="app-main">
        <TopBar />
        <div className="app-content">
          <Outlet />
        </div>
      </div>
    </div>
  )
}
