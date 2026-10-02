import { useCallback, useEffect, useMemo, useState } from 'react'
import { AssetList } from '../components/market/AssetList'
import { BottomPanel } from '../components/layout/BottomPanel'
import { TradePanel } from '../components/trading/TradePanel'
import { ChartWorkspace } from '../components/trading/ChartWorkspace'
import { Toast, type ToastTone } from '../components/ui/Toast'
import { ApiState } from '../components/ui/ApiState'
import { useLiveMarketAssets } from '../hooks/useMarketState'
import { usePortfolioPositions, useTrades, useWallet, useWalletTransactions } from '../hooks/useServerState'
import { tradesApi } from '../api/trades'
import type { OpenTrade } from '../types/trading'
import { useAuth } from '../auth/AuthProvider'
import { useRealtime } from '../realtime/RealtimeProvider'
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
  const realtime = useRealtime()
  const market = useLiveMarketAssets()
  const positions = usePortfolioPositions(1, 50)
  const trades = useTrades(1, 50)
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

  const initialAsset = market.assets[0]

  useEffect(() => {
    if (!selectedSymbol && initialAsset) {
      setSelectedSymbol(initialAsset.symbol)
    }
  }, [initialAsset, selectedSymbol])

  const selectedAsset = useMemo(
    () => market.assets.find((asset) => asset.symbol === selectedSymbol) ?? initialAsset,
    [initialAsset, market.assets, selectedSymbol],
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
    const timer = window.setInterval(() => {
      void reloadTradingState()
    }, 3000)

    return () => window.clearInterval(timer)
  }, [reloadTradingState])

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

      void reloadTradingState()
    })
  }, [realtime, reloadTradingState])

  const addToast = useCallback((tone: ToastTone, title: string, message: string) => {
    const id = Date.now() + Math.floor(Math.random() * 1000)
    setToasts((items) => [{ id, tone, title, message }, ...items].slice(0, 4))
    window.setTimeout(() => {
      setToasts((items) => items.filter((item) => item.id !== id))
    }, 4500)
  }, [])

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
        exitPrice: trade.position.exitPrice ? Number(trade.position.exitPrice) : undefined,
        netPnl: trade.netPnl ? Number(trade.netPnl) : undefined,
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
    })

    await reloadTradingState()

    addToast(
      'success',
      'Trade opened',
      result.direction + ' · ' + selectedAsset.symbol + ' · ' + result.tradeId,
    )

    if (soundEnabled) playTradeSound('open')
  }, [addToast, reloadTradingState, selectedAsset, soundEnabled])

  const closeTrade = useCallback(async (tradeId: string) => {
    const result = await tradesApi.close(tradeId)
    await reloadTradingState()

    const won = result.status === 'WON'
    addToast(
      won ? 'success' : 'error',
      won ? 'Trade won' : 'Trade settled',
      'Server settlement · ' + result.tradeId,
    )

    if (soundEnabled) playTradeSound(won ? 'win' : 'lose')
  }, [addToast, reloadTradingState, soundEnabled])

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
          selectedSymbol={selectedSymbol}
          currentPrice={selectedAsset.price}
          openTrades={openTrades}
          settledTrades={settledTrades}
          walletTransactions={walletTransactions.data?.items ?? []}
          now={now}
          collapsed={!activityOpen}
          onToggle={() => setActivityOpen((current) => !current)}
          onCloseTrade={closeTrade}
        />
      </div>

      <TradePanel
        asset={selectedAsset}
        balance={Number(wallet.data?.availableBalance ?? '0')}
        soundEnabled={soundEnabled}
        onToggleSound={toggleSound}
        onOpenTrade={openTrade}
      />

      <AssetList
        open={marketPickerOpen}
        selected={selectedSymbol}
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
