import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router'
import { RouteErrorBoundary } from './components/routing/RouteErrorBoundary'

const AppShell = lazy(() => import('./components/layout/AppShell').then((module) => ({ default: module.AppShell })))
const ProtectedRoute = lazy(() => import('./components/routing/ProtectedRoute').then((module) => ({ default: module.ProtectedRoute })))
const AccessPage = lazy(() => import('./pages/AccessPage').then((module) => ({ default: module.AccessPage })))
const NotFoundPage = lazy(() => import('./pages/NotFoundPage').then((module) => ({ default: module.NotFoundPage })))
const TradingPage = lazy(() => import('./pages/TradingPage').then((module) => ({ default: module.TradingPage })))
const WorkspacePage = lazy(() => import('./pages/WorkspacePage').then((module) => ({ default: module.WorkspacePage })))
const PolicyPage = lazy(() => import('./pages/PolicyPage').then((module) => ({ default: module.PolicyPage })))

function RouteLoading() {
  return (
    <main className="route-loading" role="status" aria-live="polite">
      <div className="route-loading__card panel">
        <span className="route-loading__mark">SL</span>
        <div>
          <span className="eyebrow">Loading</span>
          <strong>Preparing SL Spot</strong>
          <small>Loading this page…</small>
        </div>
      </div>
    </main>
  )
}

export default function App() {
  return (
    <RouteErrorBoundary>
    <Suspense fallback={<RouteLoading />}>
      <Routes>
        <Route path="/" element={<Navigate to="/app/trading" replace />} />

        <Route path="/login" element={<AccessPage />} />
        <Route path="/register" element={<AccessPage />} />
        <Route path="/forgot-password" element={<AccessPage />} />
        <Route path="/reset-password" element={<AccessPage />} />
        <Route path="/verify-email" element={<AccessPage />} />
        <Route path="/2fa" element={<AccessPage />} />
        <Route path="/policies/:slug" element={<PolicyPage />} />

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
    </Suspense>
    </RouteErrorBoundary>
  )
}
