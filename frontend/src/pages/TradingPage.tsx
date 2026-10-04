import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AssetList } from '../components/market/AssetList'
import { BottomPanel } from '../components/layout/BottomPanel'
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
  const realtime = useRealtime()
  const realtimeState = useRealtimeState()
  const market = useLiveMarketAssets()
  const positions = usePortfolioPositions(1, 50)
  const capabilities = useTradingCapabilities()
  const tradingUi = useTradingUiStore()
  const { historyPage, historyFilters, historyExporting, selectedSymbol, marketPickerOpen, activityOpen, soundEnabled } = tradingUi

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
      status: historyFilters.status || 'WON,LOST,CANCELLED,EXPIRED',
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
  const [optimisticTrades, setOptimisticTrades] = useState<OpenTrade[]>([])

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
  const activeSymbol = selectedSymbol || initialAsset?.symbol || ''

  const selectedAsset = useMemo(
    () => market.assets.find((asset) => asset.symbol === activeSymbol) ?? initialAsset,
    [activeSymbol, initialAsset, market.assets],
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
        status: trade.status === 'WON' ? 'WON' : trade.status === 'LOST' ? 'LOST' : 'CLOSED',
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
      setOptimisticTrades((items) => [
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
        ...items.filter((item) => item.id !== result.tradeId && item.expiresAt > Date.now() - 10_000),
      ])
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

  if (!selectedAsset || (loading && !market.assets.length)) {
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
        <ChartWorkspace
          key={selectedAsset.assetId + ':' + selectedAsset.symbol}
          asset={selectedAsset}
          onOpenMarkets={() => setTradingUiState({ marketPickerOpen: true })}
          openTrades={openTrades}
          now={now}
          realtimeState={realtimeState}
        />

        <BottomPanel
          selectedSymbol={activeSymbol}
          currentPrice={selectedAsset.price}
          openTrades={openTrades}
          settledTrades={settledTrades}
          walletTransactions={walletTransactions.data?.items ?? []}
          now={now}
          collapsed={!activityOpen}
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
          onToggle={() => setTradingUiState({ activityOpen: !activityOpen })}
        />
      </div>

      <TradePanel
        key={selectedAsset.assetId}
        asset={selectedAsset}
        balance={Number(wallet.data?.availableBalance ?? '0')}
        walletMode={mode}
        soundEnabled={soundEnabled}
        canTrade={capabilities.data?.trading[mode].enabled === true}
        tradeDisabledReason={capabilities.data?.trading[mode].reason}
        onToggleSound={toggleSound}
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
