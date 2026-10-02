import { useEffect, useMemo, useState } from 'react'
import type { MarketPrice } from '../api/contracts'
import type { MarketAsset } from '../data/mockMarket'
import { useRealtime } from '../realtime/RealtimeProvider'
import { marketChannel } from '../realtime/subscriptions'
import { useMarketAssets } from './useServerState'

export function useLiveMarketAssets() {
  const resource = useMarketAssets(100)
  const realtime = useRealtime()
  const [quotes, setQuotes] = useState<Record<string, MarketPrice>>({})

  useEffect(() => {
    if (!resource.data) return

    const unsubs = resource.data.items.map((asset) =>
      realtime.subscribe(marketChannel(asset.assetId)),
    )

    return () => {
      unsubs.forEach((unsubscribe) => unsubscribe())
    }
  }, [resource.data, realtime])

  useEffect(() => {
    return realtime.onEvent((event) => {
      if (event.type !== 'market.price') return

      const data = event.data as Partial<MarketPrice>
      if (
        typeof data.assetId !== 'string' ||
        typeof data.symbol !== 'string' ||
        typeof data.last !== 'string'
      ) return

      const assetId = data.assetId
      const symbol = data.symbol
      const last = data.last
      const bid = typeof data.bid === 'string' ? data.bid : last
      const ask = typeof data.ask === 'string' ? data.ask : last
      const changePct = typeof data.changePct === 'string' ? data.changePct : '0'
      const volume = typeof data.volume === 'string' ? data.volume : null
      const timestamp = typeof data.timestamp === 'string'
        ? data.timestamp
        : new Date().toISOString()

      const quote: MarketPrice = {
        assetId,
        symbol,
        bid,
        ask,
        last,
        changePct,
        volume,
        timestamp,
      }

      setQuotes((current) => ({
        ...current,
        [assetId]: quote,
      }))
    })
  }, [realtime])

  const assets = useMemo<MarketAsset[]>(() => (
    (resource.data?.items ?? []).map((asset) => {
      const quote = quotes[asset.assetId]
      const price = Number(quote?.last ?? asset.market?.lastPrice ?? 0)
      const change = Number(quote?.changePct ?? 0)
      const volume = Number(quote?.volume ?? 0)

      return {
        assetId: asset.assetId,
        symbol: asset.symbol,
        name: asset.name,
        category: categoryLabel(asset.type),
        price: Number.isFinite(price) ? price : 0,
        change: Number.isFinite(change) ? change : 0,
        volume: volume > 0 ? compactVolume(volume) : '—',
        accent: accentForSymbol(asset.symbol),
        payout: Number(asset.trading.payoutRate) * 100,
        payoutRate: asset.trading.payoutRate,
        feeRate: asset.trading.feeRate,
        minAmount: Number(asset.trading.minAmount),
        maxAmount: Number(asset.trading.maxAmount),
        durationsSeconds: asset.trading.durationsSeconds,
        tradingEnabled: asset.trading.enabled,
      }
    })
  ), [quotes, resource.data])

  return { ...resource, assets }
}

function categoryLabel(type: string): string {
  if (type === 'FOREX') return 'FX'
  if (type === 'STOCK') return 'Stocks'
  if (type === 'COMMODITY') return 'Commodities'
  if (type === 'INDEX') return 'Indices'
  if (type === 'CRYPTO') return 'Crypto'
  return 'Other'
}

function accentForSymbol(symbol: string): string {
  const value = symbol.split('/')[0]?.toLowerCase() ?? 'asset'
  return value === 'nas100' ? 'nas' : value
}

function compactVolume(value: number): string {
  if (value >= 1_000_000_000) return '$' + (value / 1_000_000_000).toFixed(1) + 'B'
  if (value >= 1_000_000) return '$' + (value / 1_000_000).toFixed(1) + 'M'
  if (value >= 1_000) return '$' + (value / 1_000).toFixed(1) + 'K'
  return '$' + value.toFixed(0)
}
