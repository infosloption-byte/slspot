import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AssetList } from '../components/market/AssetList'
import { BottomPanel, type ActivityTab } from '../components/layout/BottomPanel'
import { TradePanel } from '../components/trading/TradePanel'
import { ChartWorkspace } from '../components/trading/ChartWorkspace'
import { Toast, type ToastTone } from '../components/ui/Toast'
import { ApiState } from '../components/ui/ApiState'
import { useLiveMarketAssets } from '../hooks/useMarketState'
import { usePortfolioPositions, useTrades, useTradingCapabilities, useWallet, useWalletTransactions } from '../hooks/useServerState'
import {
  tradesApi,
  type TradeHistoryFilters,
  type TradeListQuery,
} from '../api/trades'
import type { OpenTrade } from '../types/trading'
import { useAuth } from '../auth/useAuth'
import { useWalletMode } from '../hooks/useWalletMode'
import { useRealtime, useRealtimeState } from '../realtime/useRealtime'
import { useRealtimeRefresh } from '../realtime/useRealtimeRefresh'
import { userChannel } from '../realtime/subscriptions'
import { defaultHistoryFilters, setSoundEnabled, setTradingUiState, useTradingUiStore } from '../state/tradingUiStore'
import { usePreferences } from '../state/preferencesStore'

type ToastItem = {
  id: number
  tone: ToastTone
  title: string
  message: string
}

function playTradeSound(outcome: 'open' | 'win' | 'lose') {
  try {
    const AudioContextCtor = window.AudioContext || window.webkitAudioContext
    const context = new AudioContextCtor()
    const oscillator = context.createOscillator()
    const gain = context.createGain()

    oscillator.type = 'sine'
    oscillator.frequency.value = outcome === 'win' ? 740 : outcome === 'lose' ? 220 : 520
    gain.gain.setValueAtTime(0.0001, context.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.06, context.currentTime + 0.01)
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.16)
    oscillator.connect(gain)
    gain.connect(context.destination)
    oscillator.start()
    oscillator.stop(context.currentTime + 0.17)
    window.setTimeout(() => void context.close(), 250)
  } catch {
    // Audio is optional.
  }
}

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext
  }
}

export function TradingPage() {
  const { user } = useAuth()
  const { mode } = useWalletMode()
  const { priceMovementAlerts } = usePreferences()
  const realtime = useRealtime()
  const realtimeState = useRealtimeState()
  const market = useLiveMarketAssets()
  const positions = usePortfolioPositions(1, 50)
  const capabilities = useTradingCapabilities()
  const tradingUi = useTradingUiStore()
  // The activity dialog is closed (null) until opened; it reopens on the tab last used.
  const [activityTab, setActivityTab] = useState<ActivityTab | null>(null)
  const [lastActivityTab, setLastActivityTab] = useState<ActivityTab>('open')
  const { historyPage, historyFilters, historyExporting, selectedSymbol, marketPickerOpen, soundEnabled } = tradingUi

  const historyQuery = useMemo<TradeListQuery>(() => {
    const from = historyFilters.from
      ? new Date(historyFilters.from + 'T00:00:00').toISOString()
      : undefined
    const to = historyFilters.to
      ? new Date(historyFilters.to + 'T23:59:59.999').toISOString()
      : undefined

    return {
      page: historyPage,
      pageSize: 25,
      status: historyFilters.status || 'WON,LOST,DRAW,CANCELLED,EXPIRED',
      search: historyFilters.search.trim() || undefined,
      assetId: historyFilters.assetId || undefined,
      direction: historyFilters.direction || undefined,
      from,
      to,
      sortBy: historyFilters.sortBy,
      sortOrder: historyFilters.sortOrder,
      settledOnly: true,
    }
  }, [historyFilters, historyPage])

  const trades = useTrades(historyPage, 25, undefined, historyQuery)
  const wallet = useWallet()
  const walletTransactions = useWalletTransactions(1, 50)

  const [now, setNow] = useState(() => Date.now())
  const [toasts, setToasts] = useState<ToastItem[]>([])
  // Trades the server accepted that the positions list has not returned yet. They make a
  // placed trade appear in "Open positions" immediately instead of waiting for the refetch.
  // Keyed by wallet mode so a Demo trade never shows up while viewing Real, and vice versa.
  const [optimistic, setOptimistic] = useState<{ mode: typeof mode; trades: OpenTrade[] }>({ mode, trades: [] })
  const optimisticTrades = useMemo(() => (optimistic.mode === mode ? optimistic.trades : []), [mode, optimistic])

  const addToast = useCallback((tone: ToastTone, title: string, message: string) => {
    const id = Date.now() + Math.floor(Math.random() * 1000)
    setToasts((items) => [{ id, tone, title, message }, ...items].slice(0, 4))
    window.setTimeout(() => {
      setToasts((items) => items.filter((item) => item.id !== id))
    }, 4500)
  }, [])

  const updateHistoryFilters = useCallback((patch: Partial<TradeHistoryFilters>) => {
    setTradingUiState({ historyFilters: { ...historyFilters, ...patch }, historyPage: 1 })
  }, [historyFilters])

  const resetHistoryFilters = useCallback(() => {
    setTradingUiState({ historyFilters: { ...defaultHistoryFilters }, historyPage: 1 })
  }, [])

  const exportTradeHistory = useCallback(async () => {
    setTradingUiState({ historyExporting: true })
    try {
      const baseQuery = { ...historyQuery, page: 1, pageSize: 100 }
      const firstPage = await tradesApi.list(baseQuery, mode)
      const rows = [...firstPage.items]

      for (let page = 2; page <= firstPage.pagination.totalPages; page += 1) {
        const pageResult = await tradesApi.list({ ...baseQuery, page }, mode)
        rows.push(...pageResult.items)
      }

      if (rows.length === 0) {
        addToast('info', 'Nothing to export', 'No trades match the current history filters.')
        return
      }

      const escapeCsv = (value: string | number | null) => {
        const textValue = value === null ? '' : String(value)
        return '"' + textValue.replace(/"/g, '""') + '"'
      }

      const csvRows = [
        ['Trade ID', 'Pair', 'Direction', 'Amount', 'Open Price', 'Closed Price', 'Result', 'Net P&L', 'Fee', 'Opened At', 'Closed At', 'Duration (s)', 'Settlement Reference'],
        ...rows.map((trade) => [
          trade.id,
          trade.position.asset.symbol,
          trade.direction,
          trade.amount,
          trade.position.entryPrice,
          trade.position.exitPrice,
          trade.status,
          trade.netPnl,
          trade.fee,
          trade.openedAt,
          trade.closedAt,
          trade.durationSeconds,
          trade.settlementReference,
        ]),
      ]
      const csv = '\uFEFF' + csvRows.map((row) => row.map(escapeCsv).join(',')).join('\r\n')
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = 'slspot-trade-history-' + new Date().toISOString().slice(0, 10) + '.csv'
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)

      addToast('success', 'History exported', rows.length + ' trade' + (rows.length === 1 ? '' : 's') + ' exported.')
    } catch (error) {
      addToast('error', 'Export failed', error instanceof Error ? error.message : 'Unable to export trade history.')
    } finally {
      setTradingUiState({ historyExporting: false })
    }
  }, [addToast, historyQuery, mode])

  const initialAsset = market.assets[0]

  // The stored symbol can be stale (asset removed or renamed), so everything downstream uses the
  // symbol of the asset that is really selected.
  const selectedAsset = useMemo(
    () => market.assets.find((asset) => asset.symbol === selectedSymbol) ?? initialAsset,
    [selectedSymbol, initialAsset, market.assets],
  )
  const activeSymbol = selectedAsset?.symbol ?? ''

  const priceBySymbol = useMemo(
    () => Object.fromEntries(market.assets.map((asset) => [asset.symbol, asset.price])),
    [market.assets],
  )

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  const reloadPositions = positions.reload
  const reloadTrades = trades.reload
  const reloadWallet = wallet.reload
  const reloadWalletTransactions = walletTransactions.reload
  const reloadTradingState = useCallback(async () => {
    await Promise.all([
      reloadPositions(),
      reloadTrades(),
      reloadWallet(),
      reloadWalletTransactions(),
    ])
  }, [reloadPositions, reloadTrades, reloadWallet, reloadWalletTransactions])

  useEffect(() => {
    if (!user?.id) return
    return realtime.subscribe(userChannel(user.id))
  }, [realtime, user?.id])

  // The WebSocket drives updates. A burst of trade/position/wallet events becomes one refresh,
  // and polling runs only while the socket is disconnected.
  useRealtimeRefresh(() => void reloadTradingState(), {
    events: ['trade.status', 'position.update', 'wallet.update'],
    coalesceMs: 150,
    fallbackMs: 30_000,
  })

  const openTrades = useMemo<OpenTrade[]>(() => {
    const items = positions.data?.items ?? []
    const serverTrades = items
      .filter((position) => position.status === 'OPEN' && position.tradeId)
      .map((position): OpenTrade => ({
        id: position.tradeId as string,
        symbol: position.asset.symbol,
        direction: position.direction,
        amount: Number(position.amount),
        durationSeconds: position.durationSeconds,
        openedAt: Date.parse(position.openedAt),
        expiresAt: Date.parse(position.expiresAt ?? position.openedAt),
        entryPrice: Number(position.entryPrice),
        payoutRate: Number(position.payoutRate),
        status: 'OPEN',
      }))

    // Once the server list contains a trade (open or already settled) it is authoritative.
    const knownIds = new Set(items.map((position) => position.tradeId).filter(Boolean))
    const pending = optimisticTrades.filter((trade) => !knownIds.has(trade.id))
    return pending.length > 0 ? [...pending, ...serverTrades] : serverTrades
  }, [positions.data, optimisticTrades])

  // Win/loss feedback. trade.status carries the outcome; position.update (sent just after it)
  // carries the net P&L, so the toast waits a moment for it and falls back to an estimate.
  const knownTradesRef = useRef<Map<string, OpenTrade>>(new Map())
  const settledPnlRef = useRef<Map<string, number>>(new Map())
  const notifiedTradesRef = useRef<Set<string>>(new Set())
  const soundEnabledRef = useRef(soundEnabled)
  const priceAlertBaselineRef = useRef<Map<string, number>>(new Map())

  useEffect(() => {
    soundEnabledRef.current = soundEnabled
  }, [soundEnabled])

  useEffect(() => {
    if (!priceMovementAlerts || !selectedAsset?.assetId) return undefined

    const unsubscribe = realtime.onEvent((event) => {
      if (event.type !== 'market.price') return
      const data = event.data as { assetId?: unknown; symbol?: unknown; last?: unknown }
      if (data.assetId !== selectedAsset.assetId || typeof data.symbol !== 'string' || typeof data.last !== 'string') return

      const price = Number(data.last)
      if (!Number.isFinite(price) || price <= 0) return

      const baseline = priceAlertBaselineRef.current.get(selectedAsset.assetId)
      if (baseline === undefined) {
        priceAlertBaselineRef.current.set(selectedAsset.assetId, price)
        return
      }

      const movementPct = ((price - baseline) / baseline) * 100
      if (Math.abs(movementPct) < 1) return

      priceAlertBaselineRef.current.set(selectedAsset.assetId, price)
      const direction = movementPct > 0 ? 'up' : 'down'
      addToast('info', 'Price movement alert', data.symbol + ' moved ' + direction + ' ' + Math.abs(movementPct).toFixed(2) + '%')
    })

    return unsubscribe
  }, [addToast, priceMovementAlerts, realtime, selectedAsset?.assetId])

  useEffect(() => {
    if (!selectedAsset?.assetId) return
    priceAlertBaselineRef.current.delete(selectedAsset.assetId)
  }, [selectedAsset?.assetId])

  useEffect(() => {
    for (const trade of openTrades) knownTradesRef.current.set(trade.id, trade)
  }, [openTrades])

  useEffect(() => {
    const timers = new Set<number>()

    const unsubscribe = realtime.onEvent((event) => {
      if (event.type === 'position.update') {
        const data = event.data as { tradeId?: unknown; status?: unknown; netPnl?: unknown }
        if (typeof data.tradeId === 'string' && (data.status === 'WON' || data.status === 'LOST' || data.status === 'DRAW') && data.netPnl != null) {
          const pnl = Number(data.netPnl)
          if (Number.isFinite(pnl)) settledPnlRef.current.set(data.tradeId, pnl)
        }
        return
      }

      if (event.type !== 'trade.status') return
      const data = event.data as { tradeId?: unknown; status?: unknown }
      if (typeof data.tradeId !== 'string' || (data.status !== 'WON' && data.status !== 'LOST' && data.status !== 'DRAW')) return

      const tradeId = data.tradeId
      const outcome = data.status
      // A trade is announced once, however many times its settlement event is delivered.
      if (notifiedTradesRef.current.has(tradeId)) return
      notifiedTradesRef.current.add(tradeId)

      const timer = window.setTimeout(() => {
        timers.delete(timer)
        const trade = knownTradesRef.current.get(tradeId)
        const estimate = trade ? (outcome === 'WON' ? trade.amount * trade.payoutRate : outcome === 'DRAW' ? 0 : -trade.amount) : undefined
        const pnl = settledPnlRef.current.get(tradeId) ?? estimate
        settledPnlRef.current.delete(tradeId)

        const label = trade ? trade.symbol + ' · ' + trade.direction : 'Trade ' + tradeId
        const pnlText = pnl === undefined ? '' : ' · ' + (pnl >= 0 ? '+' : '-') + '$' + Math.abs(pnl).toFixed(2)
        if (outcome === 'DRAW') {
          addToast('info', 'Draw: stake returned', label + ' · price unchanged')
          return
        }
        addToast(outcome === 'WON' ? 'success' : 'error', outcome === 'WON' ? 'Trade won' : 'Trade lost', label + pnlText)
        if (soundEnabledRef.current) playTradeSound(outcome === 'WON' ? 'win' : 'lose')
      }, 250)
      timers.add(timer)
    })

    return () => {
      unsubscribe()
      timers.forEach((timer) => window.clearTimeout(timer))
    }
  }, [addToast, realtime])

  // Safety net for a missed trade.status event: check once shortly after each trade expiry.
  // The same trade expiry is never re-armed just because the refresh still reports it as OPEN.
  const expiryCheckKeysRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    const checkedKeys = expiryCheckKeysRef.current
    const activeKeys = new Set(
      openTrades
        .filter((trade) => Number.isFinite(trade.expiresAt))
        .map((trade) => trade.id + ':' + trade.expiresAt),
    )

    // Drop entries for trades that are no longer open so the guard cannot grow forever.
    for (const key of checkedKeys) {
      if (!activeKeys.has(key)) checkedKeys.delete(key)
    }

    const nextExpiry = openTrades
      .filter((trade) => Number.isFinite(trade.expiresAt))
      .filter((trade) => !checkedKeys.has(trade.id + ':' + trade.expiresAt))
      .sort((a, b) => a.expiresAt - b.expiresAt)[0]

    if (!nextExpiry) return undefined

    const checkKey = nextExpiry.id + ':' + nextExpiry.expiresAt
    const delay = Math.max(2000, nextExpiry.expiresAt - Date.now() + 1500)
    const timer = window.setTimeout(() => {
      // Mark this expiry before refreshing so an unchanged OPEN trade cannot
      // re-arm the timer every few seconds.
      checkedKeys.add(checkKey)
      void reloadTradingState()
    }, delay)

    return () => window.clearTimeout(timer)
  }, [openTrades, reloadTradingState])

  const settledTrades = useMemo<OpenTrade[]>(() => {
    return (trades.data?.items ?? [])
      .filter((trade) => trade.status !== 'OPEN')
      .map((trade) => ({
        id: trade.id,
        symbol: trade.position.asset.symbol,
        direction: trade.direction,
        amount: Number(trade.amount),
        durationSeconds: trade.durationSeconds,
        openedAt: Date.parse(trade.openedAt),
        expiresAt: Date.parse(trade.expiresAt ?? trade.openedAt),
        entryPrice: Number(trade.position.entryPrice),
        payoutRate: Number(trade.payoutRate),
        status: trade.status === 'WON' ? 'WON' : trade.status === 'LOST' ? 'LOST' : trade.status === 'DRAW' ? 'DRAW' : 'CLOSED',
        closedAt: trade.closedAt ? Date.parse(trade.closedAt) : undefined,
        exitPrice: trade.position.exitPrice !== null ? Number(trade.position.exitPrice) : undefined,
        netPnl: trade.netPnl !== null ? Number(trade.netPnl) : undefined,
      }))
  }, [trades.data])

  const openTrade = useCallback(async (request: {
    direction: 'UP' | 'DOWN'
    amount: number
    durationSeconds: number
    entryPrice: number
    payoutRate: number
    clientRequestId: string
  }) => {
    if (!selectedAsset?.assetId) {
      throw new Error('No market asset is selected')
    }

    const result = await tradesApi.create({
      assetId: selectedAsset.assetId,
      direction: request.direction,
      amount: request.amount.toFixed(8),
      durationSeconds: request.durationSeconds,
      clientRequestId: request.clientRequestId,
    }, mode)

    // Show the trade right away; the server list replaces this entry once it contains the trade.
    if (result.status === 'OPEN') {
      const openedAt = Date.parse(result.openedAt)
      setOptimistic((previous) => ({ mode, trades: [
        {
          id: result.tradeId,
          symbol: selectedAsset.symbol,
          direction: result.direction,
          amount: Number(result.amount),
          durationSeconds: request.durationSeconds,
          openedAt,
          expiresAt: result.expiresAt ? Date.parse(result.expiresAt) : openedAt + request.durationSeconds * 1000,
          entryPrice: Number(result.entryPrice),
          payoutRate: Number(result.payoutRate),
          status: 'OPEN',
        },
        // Also forget entries that expired long ago without the server ever returning them.
        ...(previous.mode === mode ? previous.trades : []).filter((item) => item.id !== result.tradeId && item.expiresAt > Date.now() - 10_000),
      ] }))
    }

    // Refresh immediately instead of waiting for the realtime events, which only arrive while the
    // socket is connected. Later trade/position/wallet events still trigger coalesced refreshes.
    void reloadTradingState()

    addToast(
      'success',
      'Trade opened',
      result.direction + ' · ' + selectedAsset.symbol + ' · ' + result.tradeId,
    )

    if (soundEnabled) playTradeSound('open')
    return result
  }, [addToast, mode, reloadTradingState, selectedAsset, soundEnabled])

  const toggleSound = () => setSoundEnabled(!soundEnabled)

  const loading = market.loading || positions.loading || trades.loading || wallet.loading || capabilities.loading
  const error = market.error || positions.error || trades.error || wallet.error || capabilities.error

  // Trading stays disabled until both the wallet and the permissions for the current mode have loaded,
  // and the panel says why instead of showing dead buttons.
  const walletReady = wallet.data !== null
  const capabilitiesReady = capabilities.data !== null
  const tradeAllowedByServer = capabilities.data?.trading[mode].enabled === true
  const canTrade = capabilitiesReady && walletReady && tradeAllowedByServer
  const tradeDisabledReason = capabilities.error
    ? 'Could not check trading permissions. Use Retry above.'
    : wallet.error
      ? 'Could not load your wallet. Use Retry above.'
      : !capabilitiesReady || !walletReady
        ? 'Loading your account…'
        : capabilities.data?.trading[mode].reason

  // Account data that failed while the markets loaded fine. Without this the page looks normal with
  // empty positions or dead trade buttons.
  const accountFailures: Array<{ label: string; retry: () => Promise<unknown> }> = []
  if (capabilities.error) accountFailures.push({ label: 'trading permissions', retry: capabilities.reload })
  if (wallet.error) accountFailures.push({ label: 'wallet balance', retry: wallet.reload })
  if (positions.error) accountFailures.push({ label: 'open positions', retry: positions.reload })

  if (!selectedAsset || (loading && !market.assets.length)) {
    const cancelTrade = useCallback(async (tradeId: string) => {
    try {
      const result = await tradesApi.cancel(tradeId, mode)
      await reloadTradingState()
      addToast('info', 'Trade cancelled', result.direction ? result.direction + ' · stake returned' : 'Stake returned to available balance.')
    } catch (error) {
      addToast('error', 'Cancel failed', error instanceof Error ? error.message : 'Unable to cancel trade.')
      throw error
    }
  }, [addToast, mode, reloadTradingState])

  const settleTrade = useCallback(async (tradeId: string) => {
    try {
      const result = await tradesApi.close(tradeId, mode)
      await reloadTradingState()
      const label = result.direction ? result.direction + ' · ' : ''
      const pnl = result.netPnl === null ? '' : ' · P&L ' + result.netPnl
      addToast('success', 'Trade settled', label + result.status + pnl)
    } catch (error) {
      addToast('error', 'Settlement failed', error instanceof Error ? error.message : 'Unable to settle trade.')
      throw error
    }
  }, [addToast, mode, reloadTradingState])

  return (
      <main className="trading-room">
        <div className="trading-room__main panel">
          <ApiState
            loading={loading}
            error={error}
            onRetry={() => void Promise.all([market.reload(), reloadTradingState(), capabilities.reload()])}
          >
            {!loading && !error ? (
              <div className="dashboard-note">No active market assets are configured.</div>
            ) : null}
          </ApiState>
        </div>
      </main>
    )
  }

  return (
    <main className="trading-room">
      <div className="trading-room__main">
        {accountFailures.length > 0 ? (
          <div className="trading-alert" role="alert">
            <span>Couldn&apos;t load {accountFailures.map((item) => item.label).join(', ')}.</span>
            <button type="button" className="quiet-button" onClick={() => accountFailures.forEach((item) => void item.retry())}>Retry</button>
          </div>
        ) : null}

        <ChartWorkspace
          key={selectedAsset.assetId + ':' + selectedAsset.symbol}
          asset={selectedAsset}
          onOpenMarkets={() => setTradingUiState({ marketPickerOpen: true })}
          onOpenActivity={() => setActivityTab(lastActivityTab)}
          soundEnabled={soundEnabled}
          onToggleSound={toggleSound}
          openTrades={openTrades}
          now={now}
          realtimeState={realtimeState}
        />

        <BottomPanel
          priceBySymbol={priceBySymbol}
          openTrades={openTrades}
          openLoading={positions.loading}
          openError={positions.error?.message ?? null}
          onOpenRetry={() => void positions.reload()}
          onCancelTrade={cancelTrade}
          onSettleTrade={settleTrade}
          walletLoading={walletTransactions.loading}
          walletError={walletTransactions.error?.message ?? null}
          onWalletRetry={() => void walletTransactions.reload()}
          settledTrades={settledTrades}
          walletTransactions={walletTransactions.data?.items ?? []}
          now={now}
          open={activityTab !== null}
          onClose={() => setActivityTab(null)}
          tab={activityTab ?? lastActivityTab}
          onTabChange={(next) => { setLastActivityTab(next); setActivityTab(next) }}
          historyPage={historyPage}
          historyTotalPages={trades.data?.pagination.totalPages ?? 1}
          historyTotal={trades.data?.pagination.total ?? 0}
          historyLoading={trades.loading}
          historyError={trades.error?.message ?? null}
          historyFilters={historyFilters}
          historyAssets={market.assets.map((asset) => ({ id: asset.assetId, symbol: asset.symbol, name: asset.name }))}
          historyExporting={historyExporting}
          onHistoryPageChange={(page) => setTradingUiState({ historyPage: page })}
          onHistoryFiltersChange={updateHistoryFilters}
          onHistoryReset={resetHistoryFilters}
          onHistoryRetry={() => void trades.reload()}
          onHistoryExport={() => void exportTradeHistory()}
        />
      </div>

      <TradePanel
        key={selectedAsset.assetId}
        asset={selectedAsset}
        balance={Number(wallet.data?.availableBalance ?? '0')}
        walletMode={mode}
        canTrade={canTrade}
        tradeDisabledReason={tradeDisabledReason}
        onOpenTrade={openTrade}
      />

      <AssetList
        open={marketPickerOpen}
        selected={activeSymbol}
        assets={market.assets}
        onSelect={(asset) => {
          setTradingUiState({ selectedSymbol: asset.symbol, marketPickerOpen: false })
        }}
        onClose={() => setTradingUiState({ marketPickerOpen: false })}
        loading={market.loading}
        errorMessage={market.error?.message ?? null}
        onRetry={() => void market.reload()}
      />

      <div className="toast-viewport" aria-live="polite">
        {toasts.map((toast) => (
          <Toast
            key={toast.id}
            title={toast.title}
            message={toast.message}
            tone={toast.tone}
            onClose={() => setToasts((items) => items.filter((item) => item.id !== toast.id))}
          />
        ))}
      </div>
    </main>
  )
}
