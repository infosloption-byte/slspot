import { Navigate, Route, Routes } from 'react-router'
import { AppShell } from './components/layout/AppShell'
import { AccessPage } from './pages/AccessPage'
import { TradingPage } from './pages/TradingPage'
import { WorkspacePage } from './pages/WorkspacePage'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/app/trading" replace />} />

      <Route path="/login" element={<AccessPage title="Welcome back" eyebrow="Secure access" description="Sign in is intentionally UI-only until the authentication backend is connected." />} />
      <Route path="/register" element={<AccessPage title="Create your workspace" eyebrow="Registration" description="Account creation will be wired to server-managed sessions in the authentication phase." />} />
      <Route path="/forgot-password" element={<AccessPage title="Recover access" eyebrow="Password recovery" description="Password recovery is reserved for the production authentication flow." />} />
      <Route path="/reset-password" element={<AccessPage title="Set a new password" eyebrow="Password reset" description="Reset links will be validated by the backend before this screen becomes executable." />} />
      <Route path="/verify-email" element={<AccessPage title="Verify your email" eyebrow="Verification" description="Email verification will become active with the authentication service." />} />
      <Route path="/2fa" element={<AccessPage title="Two-factor verification" eyebrow="2FA" description="Two-factor challenges will be server-driven once authentication is connected." />} />

      <Route path="/app" element={<AppShell />}>
        <Route index element={<Navigate to="/app/trading" replace />} />
        <Route path="trading" element={<TradingPage />} />
        <Route path="dashboard" element={<WorkspacePage title="Dashboard" eyebrow="Overview" description="Portfolio, trading activity, and market summaries will appear here." />} />
        <Route path="portfolio" element={<WorkspacePage title="Performance" eyebrow="Analytics" description="Performance metrics and trading analytics will be connected after the server data layer is introduced." />} />
        <Route path="wallet" element={<WorkspacePage title="Wallet" eyebrow="Funds" description="Balances, deposits, withdrawals, and transaction history will be server-authoritative." />} />
        <Route path="history" element={<WorkspacePage title="Trade history" eyebrow="Records" description="Completed trades and settlement details will be loaded through the trading API." />} />
        <Route path="alerts" element={<WorkspacePage title="Notifications" eyebrow="Activity" description="Trade, security, and system notifications will be delivered through the realtime layer." />} />
        <Route path="security" element={<WorkspacePage title="Security" eyebrow="Account protection" description="Sessions, devices, two-factor authentication, and security events will live here." />} />
        <Route path="account" element={<WorkspacePage title="Account" eyebrow="Preferences" description="Account preferences and profile settings will be connected in a later frontend milestone." />} />
        <Route path="support" element={<WorkspacePage title="Support" eyebrow="Help center" description="Support conversations and service notices will be added after the core account flows." />} />
      </Route>

      <Route path="*" element={<Navigate to="/app/trading" replace />} />
    </Routes>
  )
}
