import { Outlet } from 'react-router'
import { useCallback, useEffect, useState } from 'react'
import { useRealtimeState } from '../../realtime/useRealtime'
import { Sidebar } from './Sidebar'
import { TopBar } from './TopBar'
import { NetworkStatus } from '../ui/NetworkStatus'

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
  const [menuOpen, setMenuOpen] = useState(false)
  const closeMenu = useCallback(() => setMenuOpen(false), [])
  useEffect(() => {
    if (!menuOpen) return undefined
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') setMenuOpen(false) }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [menuOpen])
  const busy = realtimeState === 'connecting' || realtimeState === 'reconnecting' || networkBusyCount > 0

  return (
    <div className={'app-shell' + (busy ? ' app-shell--busy' : '')}>
      {busy ? <div className="app-shell__loading-bar" role="status" aria-label="Loading or connecting to live services" /> : null}
      <Sidebar open={menuOpen} onClose={closeMenu} />
      {menuOpen ? <div className="sidebar-backdrop" onClick={closeMenu} aria-hidden="true" /> : null}
      <div className="app-main">
        <TopBar onMenuClick={() => setMenuOpen((value) => !value)} menuOpen={menuOpen} />
        <NetworkStatus />
        <div className="app-content">
          <Outlet />
        </div>
      </div>
    </div>
  )
}
