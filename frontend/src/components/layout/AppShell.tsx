import { Outlet } from 'react-router'
import { useRealtimeState } from '../../realtime/RealtimeProvider'
import { Sidebar } from './Sidebar'
import { TopBar } from './TopBar'

/** Shared frame for every /app/* page: left rail + top bar + page content. */
export function AppShell() {
  const realtimeState = useRealtimeState()
  const busy = realtimeState === 'connecting' || realtimeState === 'reconnecting'

  return (
    <div className={'app-shell' + (busy ? ' app-shell--busy' : '')}>
      {busy ? <div className="app-shell__loading-bar" role="status" aria-label="Connecting to live services" /> : null}
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
