import { useCallback, useEffect, useMemo, useState } from 'react'
import { AssetList } from '../components/market/AssetList'
import { BottomPanel } from '../components/layout/BottomPanel'
import { TradePanel } from '../components/trading/TradePanel'
import { ChartWorkspace } from '../components/trading/ChartWorkspace'
import { Toast, type ToastTone } from '../components/ui/Toast'
import { ApiState } from '../components/ui/ApiState'
import { useLiveMarketAssets } from '../hooks/useMarketState'
import { resolveTrade, type OpenTrade } from '../types/trading'

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
    // Audio is optional and can be unavailable in some browsers.
  }
}

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext
  }
}

export function TradingPage() {
  const market = useLiveMarketAssets()
  const [selectedSymbol, setSelectedSymbol] = useState('')
  const [marketPickerOpen, setMarketPickerOpen] = useState(false)
  const [activityOpen, setActivityOpen] = useState(true)
  const [now, setNow] = useState(() => Date.now())
  const [soundEnabled, setSoundEnabled] = useState(() => window.localStorage.getItem('slspot.trade-sounds') === 'on')
  const [openTrades, setOpenTrades] = useState<OpenTrade[]>([])
  const [settledTrades, setSettledTrades] = useState<OpenTrade[]>([])
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

  const addToast = useCallback((tone: ToastTone, title: string, message: string) => {
    const id = Date.now()
    setToasts((items) => [{ id, tone, title, message }, ...items].slice(0, 4))
    window.setTimeout(() => setToasts((items) => items.filter((item) => item.id !== id)), 4500)
  }, [])

  useEffect(() => {
    const expired = openTrades.filter((trade) => trade.status === 'OPEN' && trade.expiresAt <= now)
    if (expired.length === 0) return

    const resolved = expired.map((trade) => {
      const current = market.assets.find((asset) => asset.symbol === trade.symbol)
      return resolveTrade(trade, current?.price ?? trade.entryPrice)
    })

    const expiredIds = new Set(expired.map((trade) => trade.id))
    setOpenTrades((current) => current.filter((trade) => !expiredIds.has(trade.id)))
    setSettledTrades((history) => [...resolved, ...history])

    resolved.forEach((trade) => {
      const won = trade.status === 'WON'
      addToast(
        won ? 'success' : 'error',
        won ? 'Demo trade won' : 'Demo trade lost',
        trade.symbol + ' ' + trade.direction + ' · local demo settlement',
      )
      if (soundEnabled) playTradeSound(won ? 'win' : 'lose')
    })
  }, [addToast, market.assets, now, openTrades, soundEnabled])

  if (market.loading || market.error || !selectedAsset) {
    return (
      <main className="trading-room">
        <div className="trading-room__main panel">
          <ApiState loading={market.loading} error={market.error} onRetry={() => void market.reload()}>
            {!market.loading && !market.error ? <div className="dashboard-note">No active market assets are configured.</div> : null}
          </ApiState>
        </div>
      </main>
    )
  }

  const openTrade = (request: {
    direction: 'UP' | 'DOWN'
    amount: number
    durationSeconds: number
    entryPrice: number
    payoutRate: number
  }) => {
    const openedAt = Date.now()
    const trade: OpenTrade = {
      id: 'SL-' + String(openedAt).slice(-6),
      symbol: selectedAsset.symbol,
      direction: request.direction,
      amount: request.amount,
      durationSeconds: request.durationSeconds,
      openedAt,
      expiresAt: openedAt + request.durationSeconds * 1000,
      entryPrice: request.entryPrice,
      payoutRate: request.payoutRate,
      status: 'OPEN',
    }

    setOpenTrades((current) => [trade, ...current])
    addToast('success', 'Demo trade opened', trade.symbol + ' ' + trade.direction + ' · server trading is not enabled yet')
    if (soundEnabled) playTradeSound('open')
  }

  const closeTrade = (tradeId: string) => {
    const trade = openTrades.find((item) => item.id === tradeId)
    if (!trade) return

    const current = market.assets.find((asset) => asset.symbol === trade.symbol)
    const result = resolveTrade(trade, current?.price ?? trade.entryPrice)

    setOpenTrades((items) => items.filter((item) => item.id !== tradeId))
    setSettledTrades((history) => [result, ...history])

    const won = result.status === 'WON'
    addToast(won ? 'success' : 'error', won ? 'Demo trade won' : 'Demo trade closed', result.symbol + ' ' + result.direction)
    if (soundEnabled) playTradeSound(won ? 'win' : 'lose')
  }

  const toggleSound = () => {
    setSoundEnabled((current) => {
      const next = !current
      window.localStorage.setItem('slspot.trade-sounds', next ? 'on' : 'off')
      return next
    })
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
          now={now}
          collapsed={!activityOpen}
          onToggle={() => setActivityOpen((current) => !current)}
          onCloseTrade={closeTrade}
        />
      </div>

      <TradePanel
        asset={selectedAsset}
        soundEnabled={soundEnabled}
        onToggleSound={toggleSound}
        onOpenTrade={openTrade}
      />

      <AssetList
        open={marketPickerOpen}
        selected={selectedSymbol}
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
