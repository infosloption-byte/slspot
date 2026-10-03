import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AssetList } from '../components/market/AssetList'
import { BottomPanel } from '../components/layout/BottomPanel'
import { TradePanel } from '../components/trading/TradePanel'
import { ChartWorkspace } from '../components/trading/ChartWorkspace'
import { Toast, type ToastTone } from '../components/ui/Toast'
import { ApiState } from '../components/ui/ApiState'
import { useLiveMarketAssets } from '../hooks/useMarketState'
import { usePortfolioPositions, useTrades, useWallet, useWalletTransactions } from '../hooks/useServerState'
import {
  tradesApi,
  type TradeHistoryFilters,
  type TradeListQuery,
} from '../api/trades'
import type { OpenTrade } from '../types/trading'
import { useAuth } from '../auth/AuthProvider'
import { useWalletMode } from '../hooks/useWalletMode'
import { useRealtime, useRealtimeState } from '../realtime/RealtimeProvider'
import { userChannel } from '../realtime/subscriptions'

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

  const [historyPage, setHistoryPage] = useState(1)
  const [historyFilters, setHistoryFilters] = useState<TradeHistoryFilters>({
    search: '',
    assetId: '',
    direction: '',
    status: '',
    from: '',
    to: '',
    sortBy: 'openedAt',
    sortOrder: 'desc',
  })
  const [historyExporting, setHistoryExporting] = useState(false)

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

  const [selectedSymbol, setSelectedSymbol] = useState('')
  const [marketPickerOpen, setMarketPickerOpen] = useState(false)
  const [activityOpen, setActivityOpen] = useState(true)
  const [now, setNow] = useState(() => Date.now())
  const [soundEnabled, setSoundEnabled] = useState(
    () => window.localStorage.getItem('slspot.trade-sounds') === 'on',
  )
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const eventRefreshTimer = useRef<number | null>(null)

  const addToast = useCallback((tone: ToastTone, title: string, message: string) => {
    const id = Date.now() + Math.floor(Math.random() * 1000)
    setToasts((items) => [{ id, tone, title, message }, ...items].slice(0, 4))
    window.setTimeout(() => {
      setToasts((items) => items.filter((item) => item.id !== id))
    }, 4500)
  }, [])

  const updateHistoryFilters = useCallback((patch: Partial<TradeHistoryFilters>) => {
    setHistoryFilters((current) => ({ ...current, ...patch }))
    setHistoryPage(1)
  }, [])

  const resetHistoryFilters = useCallback(() => {
    setHistoryFilters({
      search: '',
      assetId: '',
      direction: '',
      status: '',
      from: '',
      to: '',
      sortBy: 'openedAt',
      sortOrder: 'desc',
    })
    setHistoryPage(1)
  }, [])

  const exportTradeHistory = useCallback(async () => {
    setHistoryExporting(true)
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
      setHistoryExporting(false)
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

  const reloadTradingState = useCallback(async () => {
    await Promise.all([
      positions.reload(),
      trades.reload(),
      wallet.reload(),
      walletTransactions.reload(),
    ])
  }, [positions.reload, trades.reload, wallet.reload, walletTransactions.reload])

  useEffect(() => {
    if (!user?.id) return
    return realtime.subscribe(userChannel(user.id))
  }, [realtime, user?.id])

  useEffect(() => {
    return realtime.onEvent((event) => {
      if (
        event.type !== 'trade.status' &&
        event.type !== 'position.update' &&
        event.type !== 'wallet.update'
      ) {
        return
      }

      if (eventRefreshTimer.current !== null) {
        window.clearTimeout(eventRefreshTimer.current)
      }

      eventRefreshTimer.current = window.setTimeout(() => {
        eventRefreshTimer.current = null
        void reloadTradingState()
      }, 150)
    })
  }, [realtime, reloadTradingState])

  useEffect(() => {
    return () => {
      if (eventRefreshTimer.current !== null) {
        window.clearTimeout(eventRefreshTimer.current)
        eventRefreshTimer.current = null
      }
    }
  }, [])

  useEffect(() => {
    if (realtimeState === 'connected' || realtimeState === 'connecting') return undefined

    const timer = window.setInterval(() => {
      void reloadTradingState()
    }, 5000)

    return () => window.clearInterval(timer)
  }, [realtimeState, reloadTradingState])

  const openTrades = useMemo<OpenTrade[]>(() => {
    return (positions.data?.items ?? [])
      .filter((position) => position.status === 'OPEN' && position.tradeId)
      .map((position) => ({
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
  }, [positions.data])

  useEffect(() => {
    if (openTrades.length === 0) return undefined

    const timer = window.setInterval(() => {
      void reloadTradingState()
    }, 2500)

    return () => window.clearInterval(timer)
  }, [openTrades.length, reloadTradingState])

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
  }) => {
    if (!selectedAsset?.assetId) {
      throw new Error('No market asset is selected')
    }

    const result = await tradesApi.create({
      assetId: selectedAsset.assetId,
      direction: request.direction,
      amount: request.amount.toFixed(8),
      durationSeconds: request.durationSeconds,
      clientRequestId: crypto.randomUUID(),
    }, mode)

    await reloadTradingState()

    addToast(
      'success',
      'Trade opened',
      result.direction + ' · ' + selectedAsset.symbol + ' · ' + result.tradeId,
    )

    if (soundEnabled) playTradeSound('open')
  }, [addToast, mode, reloadTradingState, selectedAsset, soundEnabled])

  const toggleSound = () => {
    setSoundEnabled((current) => {
      const next = !current
      window.localStorage.setItem('slspot.trade-sounds', next ? 'on' : 'off')
      return next
    })
  }

  const loading = market.loading || positions.loading || trades.loading || wallet.loading
  const error = market.error || positions.error || trades.error || wallet.error

  if (!selectedAsset || (loading && !market.assets.length)) {
    return (
      <main className="trading-room">
        <div className="trading-room__main panel">
          <ApiState
            loading={loading}
            error={error}
            onRetry={() => void Promise.all([market.reload(), reloadTradingState()])}
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
          asset={selectedAsset}
          onOpenMarkets={() => setMarketPickerOpen(true)}
          openTrades={openTrades}
          now={now}
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
          onHistoryPageChange={setHistoryPage}
          onHistoryFiltersChange={updateHistoryFilters}
          onHistoryReset={resetHistoryFilters}
          onHistoryRetry={() => void trades.reload()}
          onHistoryExport={() => void exportTradeHistory()}
          onToggle={() => setActivityOpen((current) => !current)}
        />
      </div>

      <TradePanel
        key={selectedAsset.assetId}
        asset={selectedAsset}
        balance={Number(wallet.data?.availableBalance ?? '0')}
        walletMode={mode}
        soundEnabled={soundEnabled}
        onToggleSound={toggleSound}
        onOpenTrade={openTrade}
      />

      <AssetList
        open={marketPickerOpen}
        selected={activeSymbol}
        assets={market.assets}
        onSelect={(asset) => {
          setSelectedSymbol(asset.symbol)
          setMarketPickerOpen(false)
        }}
        onClose={() => setMarketPickerOpen(false)}
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
