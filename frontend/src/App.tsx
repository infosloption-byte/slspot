import { Navigate, Route, Routes } from 'react-router'
import { AppShell } from './components/layout/AppShell'
import { ProtectedRoute } from './components/routing/ProtectedRoute'
import { AccessPage } from './pages/AccessPage'
import { NotFoundPage } from './pages/NotFoundPage'
import { TradingPage } from './pages/TradingPage'
import { WorkspacePage } from './pages/WorkspacePage'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/app/trading" replace />} />

      <Route path="/login" element={<AccessPage />} />
      <Route path="/register" element={<AccessPage />} />
      <Route path="/forgot-password" element={<AccessPage />} />
      <Route path="/reset-password" element={<AccessPage />} />
      <Route path="/verify-email" element={<AccessPage />} />
      <Route path="/2fa" element={<AccessPage />} />

      <Route element={<ProtectedRoute />}>
        <Route path="/app" element={<AppShell />}>
          <Route index element={<Navigate to="/app/trading" replace />} />
          <Route path="trading" element={<TradingPage />} />
          <Route path="dashboard" element={<WorkspacePage title="Dashboard" eyebrow="Overview" description="Portfolio, trading activity, and market summaries will appear here." />} />
          <Route path="portfolio" element={<WorkspacePage title="Performance" eyebrow="Analytics" description="Performance metrics and trading analytics will be connected after the server data layer is introduced." />} />
          <Route path="wallet" element={<WorkspacePage title="Wallet" eyebrow="Funds" description="Balances, deposits, withdrawals, and transaction history will be server-authoritative." />} />
          <Route path="history" element={<WorkspacePage title="Trade history" eyebrow="Records" description="Completed trades and settlement details will be loaded through the trading API." />} />
          <Route path="alerts" element={<WorkspacePage title="Notifications" eyebrow="Activity" description="Trade, security, and system notifications will be delivered through the realtime layer." />} />
          <Route path="security" element={<WorkspacePage title="Security" eyebrow="Account protection" description="Sessions, devices, two-factor authentication, and security events will live here." />} />
          <Route path="account" element={<WorkspacePage title="Account" eyebrow="Preferences" description="Manage your profile, password, workspace behavior and notification delivery." />} />
          <Route path="support" element={<WorkspacePage title="Support" eyebrow="Help center" description="Create a support ticket, follow replies and manage your support conversations." />} />
        </Route>
      </Route>

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  )
}
