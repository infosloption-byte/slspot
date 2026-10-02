import { Outlet } from 'react-router'
import { Sidebar } from './Sidebar'
import { TopBar } from './TopBar'

/** Shared frame for every /app/* page: left rail + top bar + page content. */
export function AppShell() {
  return (
    <div className="app-shell">
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
