import { Bell, Check, ChevronDown, LogOut, WalletCards } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { useAuth } from '../../auth/AuthProvider'
import { useNotifications, useWallets } from '../../hooks/useServerState'
import { useWalletMode } from '../../hooks/useWalletMode'

function formatBalance(value: string | null | undefined, currency: string | null | undefined): string {
  const amount = Number(value ?? 0)
  if (!Number.isFinite(amount)) return '—'

  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency ?? 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}

export function TopBar() {
  const navigate = useNavigate()
  const { user, logout } = useAuth()
  const { mode, setMode } = useWalletMode()
  const wallets = useWallets()
  const notifications = useNotifications(1, 1, true)
  const unreadCount = notifications.data?.pagination.total ?? 0
  const [walletMenuOpen, setWalletMenuOpen] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)
  const [logoutError, setLogoutError] = useState('')

  const selectedWallet = wallets.data?.find((wallet) => wallet.mode === mode) ?? null

  const signOut = async () => {
    if (loggingOut) return
    setLoggingOut(true)
    setLogoutError('')
    try {
      await logout()
      navigate('/login', { replace: true, state: { message: 'You have been signed out.' } })
    } catch (error) {
      setLogoutError(error instanceof Error ? error.message : 'Unable to sign out right now.')
    } finally {
      setLoggingOut(false)
    }
  }

  return (
    <header className="topbar">
      <Link to="/app/trading" className="topbar__brand" aria-label="SL Spot home">
        <span className="topbar__brand-name">SL<b>SPOT</b></span>
        <span className="topbar__live"><i className="live-dot" /> Live</span>
      </Link>

      <div className="topbar__spacer" />

      <Link
        to="/app/alerts"
        className="icon-button topbar__bell"
        aria-label={unreadCount > 0 ? unreadCount + ' unread notifications' : 'Notifications'}
        title={unreadCount > 0 ? unreadCount + ' unread notifications' : 'Notifications'}
      >
        <Bell size={18} />
        {unreadCount > 0 ? <span className="topbar__bell-dot" /> : null}
      </Link>

      <div className="wallet-selector">
        <button
          type="button"
          className="account-chip"
          aria-haspopup="menu"
          aria-expanded={walletMenuOpen}
          onClick={() => setWalletMenuOpen((open) => !open)}
        >
          <span className="account-chip__icon"><WalletCards size={15} /></span>
          <span className="account-chip__body">
            <small>{mode === 'DEMO' ? 'Demo wallet' : 'Real wallet'}</small>
            <strong>{formatBalance(selectedWallet?.availableBalance, selectedWallet?.currency)}</strong>
            <small className="topbar__account-email">{mode === 'REAL' ? 'Deposits coming soon' : user?.email ?? 'Practice account'}</small>
          </span>
          <ChevronDown size={15} className={walletMenuOpen ? 'account-chip__chevron account-chip__chevron--open' : 'account-chip__chevron'} />
        </button>

        {walletMenuOpen ? (
          <div className="wallet-selector__menu" role="menu">
            {(['DEMO', 'REAL'] as const).map((walletMode) => {
              const wallet = wallets.data?.find((item) => item.mode === walletMode)
              const active = mode === walletMode
              return (
                <button
                  key={walletMode}
                  type="button"
                  role="menuitemradio"
                  aria-checked={active}
                  className={active ? 'wallet-selector__option wallet-selector__option--active' : 'wallet-selector__option'}
                  onClick={() => {
                    setMode(walletMode)
                    setWalletMenuOpen(false)
                  }}
                >
                  <span>
                    <strong>{walletMode === 'DEMO' ? 'Demo Wallet' : 'Real Wallet'}</strong>
                    <small>{walletMode === 'DEMO' ? 'Practice trading · auto-refills' : 'Live funds · deposits coming soon'}</small>
                    <em>{formatBalance(wallet?.availableBalance, wallet?.currency)}</em>
                  </span>
                  {active ? <Check size={15} /> : null}
                </button>
              )
            })}
            <Link to="/app/wallet" className="wallet-selector__footer" onClick={() => setWalletMenuOpen(false)}>
              <WalletCards size={14} /> Open wallet
            </Link>
          </div>
        ) : null}
      </div>

      {logoutError ? <span className="topbar__auth-error" role="alert">{logoutError}</span> : null}

      <button className="icon-button" type="button" disabled={loggingOut} onClick={() => void signOut()} aria-label="Sign out" title="Sign out">
        <LogOut size={17} />
      </button>
    </header>
  )
}
