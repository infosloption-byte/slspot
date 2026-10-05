import { Bell, Check, ChevronDown, LogOut, Menu, WalletCards } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { useAuth } from '../../auth/useAuth'
import { useNotifications, useWallets } from '../../hooks/useServerState'
import { useWalletMode } from '../../hooks/useWalletMode'
import { setUnreadCount, useNotificationStore } from '../../state/notificationStore'
import { useRealtime, useRealtimeState } from '../../realtime/useRealtime'
import { useRealtimeRefresh } from '../../realtime/useRealtimeRefresh'
import { userChannel } from '../../realtime/subscriptions'

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

export function TopBar({ onMenuClick, menuOpen }: { onMenuClick: () => void; menuOpen: boolean }) {
  const navigate = useNavigate()
  const { user, logout } = useAuth()
  const { mode, setMode } = useWalletMode()
  const realtime = useRealtime()
  const realtimeState = useRealtimeState()
  const wallets = useWallets()
  const notifications = useNotifications(1, 1, true)
  const { unreadCount } = useNotificationStore()
  const [walletMenuOpen, setWalletMenuOpen] = useState(false)
  const walletSelectorRef = useRef<HTMLDivElement>(null)
  const walletTriggerRef = useRef<HTMLButtonElement>(null)
  const walletMenuRef = useRef<HTMLDivElement>(null)
  const walletMenuId = useId()
  const [loggingOut, setLoggingOut] = useState(false)
  const [logoutError, setLogoutError] = useState('')

  const selectedWallet = wallets.data?.find((wallet) => wallet.mode === mode) ?? null
  const reloadWallets = wallets.reload
  const reloadNotifications = notifications.reload

  useEffect(() => {
    if (notifications.data) setUnreadCount(notifications.data.pagination.total)
  }, [notifications.data])

  useEffect(() => {
    if (!user?.id) return
    return realtime.subscribe(userChannel(user.id))
  }, [realtime, user?.id])

  // Balance and unread count are pushed over the WebSocket. Polling only runs while the socket is down.
  useRealtimeRefresh(() => void reloadWallets(), { events: ['wallet.update', 'trade.status'], fallbackMs: 30_000 })
  useRealtimeRefresh(() => void reloadNotifications(), { events: ['notification.created'], fallbackMs: 60_000 })

  useEffect(() => {
    if (!walletMenuOpen) return
    requestAnimationFrame(() => walletMenuRef.current?.querySelector<HTMLElement>('[role="menuitemradio"]')?.focus())
    const handlePointerDown = (event: PointerEvent) => {
      if (walletSelectorRef.current && !walletSelectorRef.current.contains(event.target as Node)) {
        setWalletMenuOpen(false)
      }
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setWalletMenuOpen(false)
    }
    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [walletMenuOpen])

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
      <button type="button" className="icon-button topbar__menu" onClick={onMenuClick} aria-label="Open menu" aria-expanded={menuOpen} aria-controls="app-menu"><Menu size={20} /></button>
      <Link to="/app/trading" className="topbar__brand" aria-label="SL Spot home">
        <span className="topbar__brand-name">SL<b>SPOT</b></span>
        <span className="topbar__live"><i className="live-dot" /> Live</span>
      </Link>

      <div className="topbar__spacer" />

      <div className={'topbar__connection topbar__connection--' + realtimeState} aria-live="polite" title="Realtime market and account connection">
        <i className="live-dot" />
        <span>{realtimeState === 'connected' ? 'Connected' : realtimeState === 'connecting' ? 'Connecting' : realtimeState === 'reconnecting' ? 'Reconnecting' : realtimeState === 'closed' ? 'Offline' : 'Starting'}</span>
      </div>

      <Link
        to="/app/alerts"
        className="icon-button topbar__bell"
        aria-label={unreadCount > 0 ? unreadCount + ' unread notifications' : 'Notifications'}
        title={unreadCount > 0 ? unreadCount + ' unread notifications' : 'Notifications'}
      >
        <Bell size={18} />
        {unreadCount > 0 ? <span className="topbar__bell-dot" /> : null}
      </Link>

      <div className="wallet-selector" ref={walletSelectorRef}>
        <button
          ref={walletTriggerRef}
          type="button"
          className={mode === 'DEMO' ? 'account-chip account-chip--demo' : 'account-chip account-chip--real'}
          aria-haspopup="menu"
          aria-expanded={walletMenuOpen}
          aria-controls={walletMenuOpen ? walletMenuId : undefined}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') {
              event.preventDefault()
              setWalletMenuOpen(true)
            } else if (event.key === 'Escape' && walletMenuOpen) {
              event.preventDefault()
              setWalletMenuOpen(false)
            }
          }}
          onClick={() => setWalletMenuOpen((open) => !open)}
        >
          <span className="account-chip__icon"><WalletCards size={15} /></span>
          <span className="account-chip__body">
            <small>Trading wallet</small>
            <strong>{mode === 'DEMO' ? 'Demo' : 'Real'}</strong>
            <em>{formatBalance(selectedWallet?.availableBalance, selectedWallet?.currency)}</em>
          </span>
          <ChevronDown size={15} className={walletMenuOpen ? 'account-chip__chevron account-chip__chevron--open' : 'account-chip__chevron'} />
        </button>

        {walletMenuOpen ? (
          <div ref={walletMenuRef} className="wallet-selector__menu" id={walletMenuId} role="menu" aria-label="Select trading wallet">
            <div className="wallet-selector__header">
              <span><WalletCards size={14} /> Trading wallet</span>
              <strong>{mode === 'DEMO' ? 'Practice mode' : 'Real account'}</strong>
            </div>

            {(['DEMO', 'REAL'] as const).map((walletMode) => {
              const wallet = wallets.data?.find((item) => item.mode === walletMode)
              const active = mode === walletMode
              const demo = walletMode === 'DEMO'
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
                    walletTriggerRef.current?.focus()
                  }}
                  onKeyDown={(event) => {
                    const options = walletMenuRef.current
                      ? Array.from(walletMenuRef.current.querySelectorAll<HTMLElement>('[role="menuitemradio"]'))
                      : []
                    const index = options.indexOf(event.currentTarget)
                    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                      event.preventDefault()
                      const delta = event.key === 'ArrowDown' ? 1 : -1
                      options[(index + delta + options.length) % options.length]?.focus()
                    } else if (event.key === 'Home') {
                      event.preventDefault()
                      options[0]?.focus()
                    } else if (event.key === 'End') {
                      event.preventDefault()
                      options.at(-1)?.focus()
                    } else if (event.key === 'Escape') {
                      event.preventDefault()
                      setWalletMenuOpen(false)
                      walletTriggerRef.current?.focus()
                    } else if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      setMode(walletMode)
                      setWalletMenuOpen(false)
                      walletTriggerRef.current?.focus()
                    }
                  }}
                >
                  <span className={demo ? 'wallet-selector__badge wallet-selector__badge--demo' : 'wallet-selector__badge wallet-selector__badge--real'}>
                    <WalletCards size={15} />
                  </span>
                  <span className="wallet-selector__copy">
                    <strong>{demo ? 'Demo Wallet' : 'Real Wallet'}</strong>
                    <small>{demo ? 'Practice trading · auto-refills' : 'Live funds · deposits coming soon'}</small>
                    <em>{formatBalance(wallet?.availableBalance, wallet?.currency)}</em>
                  </span>
                  <span className={demo ? 'wallet-selector__status wallet-selector__status--ready' : 'wallet-selector__status'}>{demo ? 'READY' : 'SOON'}</span>
                  {active ? <Check size={16} className="wallet-selector__check" /> : null}
                </button>
              )
            })}

            <Link to="/app/wallet" className="wallet-selector__footer" onClick={() => setWalletMenuOpen(false)}>
              <WalletCards size={14} /> Manage wallets
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
