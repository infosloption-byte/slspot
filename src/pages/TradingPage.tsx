import { useEffect, useMemo, useState } from 'react'
import { AssetList } from '../components/market/AssetList'
import { BottomPanel } from '../components/layout/BottomPanel'
import { TradePanel } from '../components/trading/TradePanel'
import { ChartWorkspace } from '../components/trading/ChartWorkspace'
import { Toast, type ToastTone } from '../components/ui/Toast'
import { marketAssets } from '../data/mockMarket'
import { calculateTradePnl, resolveTrade, type OpenTrade } from '../types/trading'

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
  const initialAsset = marketAssets[0]
  if (!initialAsset) throw new Error('Market asset list is empty')

  const [selectedSymbol, setSelectedSymbol] = useState(initialAsset.symbol)
  const [livePrices, setLivePrices] = useState<Record<string, number>>(() => Object.fromEntries(marketAssets.map((asset) => [asset.symbol, asset.price])))
  const [marketPickerOpen, setMarketPickerOpen] = useState(false)
  const [activityOpen, setActivityOpen] = useState(true)
  const [now, setNow] = useState(() => Date.now())
  const [soundEnabled, setSoundEnabled] = useState(() => window.localStorage.getItem('slspot.trade-sounds') === 'on')
  const [openTrades, setOpenTrades] = useState<OpenTrade[]>(() => [{
    id: 'SL-DEMO-01',
    symbol: initialAsset.symbol,
    direction: 'UP',
    amount: 25,
    durationSeconds: 90,
    openedAt: Date.now() - 35000,
    expiresAt: Date.now() + 55000,
    entryPrice: initialAsset.price * 0.9994,
    payoutRate: initialAsset.payout / 100,
    status: 'OPEN',
  }])
  const [settledTrades, setSettledTrades] = useState<OpenTrade[]>([])
  const [toasts, setToasts] = useState<ToastItem[]>([])

  const selectedAsset = useMemo(() => {
    const base = marketAssets.find((asset) => asset.symbol === selectedSymbol) ?? initialAsset
    const price = livePrices[base.symbol] ?? base.price
    const change = base.change + ((price - base.price) / base.price) * 100
    return { ...base, price, change }
  }, [initialAsset, livePrices, selectedSymbol])

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    const timer = window.setInterval(() => {
      setLivePrices((current) => {
        const next = { ...current }
        marketAssets.forEach((asset, index) => {
          const previous = current[asset.symbol] ?? asset.price
          const wave = Math.sin(Date.now() / 4600 + index * 1.7) * asset.price * 0.00018
          const drift = Math.cos(Date.now() / 8100 + index) * asset.price * 0.00007
          next[asset.symbol] = Math.max(asset.price * 0.00001, previous + wave + drift)
        })
        return next
      })
    }, 1000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    const expired = openTrades.filter((trade) => trade.status === 'OPEN' && trade.expiresAt <= now)
    if (expired.length === 0) return

    const resolved = expired.map((trade) => {
      const price = livePrices[trade.symbol] ?? trade.entryPrice
      return resolveTrade(trade, price)
    })

    const expiredIds = new Set(expired.map((trade) => trade.id))
    setOpenTrades((current) => current.filter((trade) => !expiredIds.has(trade.id)))
    setSettledTrades((history) => [...resolved, ...history])

    resolved.forEach((trade) => {
      const won = trade.status === 'WON'
      setToasts((items) => [{
        id: Date.now() + items.length,
        tone: won ? 'success' : 'error',
        title: won ? 'Trade won' : 'Trade lost',
        message: trade.symbol + ' ' + trade.direction + ' · ' + (won ? 'Payout credited' : 'Position settled below target'),
      }, ...items].slice(0, 4))
      if (soundEnabled) playTradeSound(won ? 'win' : 'lose')
    })
  }, [livePrices, now, openTrades, soundEnabled])

  const addToast = (tone: ToastTone, title: string, message: string) => {
    const id = Date.now()
    setToasts((items) => [{ id, tone, title, message }, ...items].slice(0, 4))
    window.setTimeout(() => setToasts((items) => items.filter((item) => item.id !== id)), 4500)
  }

  const openTrade = (request: { direction: 'UP' | 'DOWN'; amount: number; durationSeconds: number; entryPrice: number; payoutRate: number }) => {
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
    addToast('success', 'Trade opened', trade.symbol + ' ' + trade.direction + ' · ' + request.durationSeconds + 's countdown started')
    if (soundEnabled) playTradeSound('open')
  }

  const closeTrade = (tradeId: string) => {
    const trade = openTrades.find((item) => item.id === tradeId)
    if (!trade) return
    const price = livePrices[trade.symbol] ?? trade.entryPrice
    const result = resolveTrade(trade, price)
    setOpenTrades((current) => current.filter((item) => item.id !== tradeId))
    setSettledTrades((history) => [result, ...history])
    const won = result.status === 'WON'
    addToast(won ? 'success' : 'error', won ? 'Trade won' : 'Trade closed', result.symbol + ' ' + result.direction + ' · ' + (won ? 'Positive result' : 'Closed below target'))
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
        <ChartWorkspace asset={selectedAsset} onOpenMarkets={() => setMarketPickerOpen(true)} openTrades={openTrades} now={now} />
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
          <Toast key={toast.id} title={toast.title} message={toast.message} tone={toast.tone} onClose={() => setToasts((items) => items.filter((item) => item.id !== toast.id))} />
        ))}
      </div>
    </main>
  )
}
