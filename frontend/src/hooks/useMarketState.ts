import { useEffect, useMemo } from 'react'
import type { MarketPrice } from '../api/contracts'
import type { MarketAsset } from '../data/mockMarket'
import { useRealtime } from '../realtime/useRealtime'
import { marketChannel } from '../realtime/subscriptions'
import { useMarketAssets } from './useServerState'
import { setMarketQuote, setMarketStatus, useMarketStore } from '../state/marketStore'

export function useLiveMarketAssets() {
  const resource = useMarketAssets(100)
  const realtime = useRealtime()
  const { quotes, statuses } = useMarketStore()

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
      if (event.type === 'market.status') {
        const data = event.data as { assetId?: unknown; status?: unknown }
        if (
          typeof data.assetId === 'string' &&
          (data.status === 'open' || data.status === 'closed' || data.status === 'halted' || data.status === 'maintenance')
        ) {
          setMarketStatus(data.assetId, data.status.toUpperCase() as 'OPEN' | 'CLOSED' | 'HALTED' | 'MAINTENANCE')
        }
        return
      }

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
        provider: typeof data.provider === 'string' ? data.provider : undefined,
        sequence: typeof data.sequence === 'string' ? data.sequence : undefined,
        timestamp,
      }

      setMarketQuote(quote)
    })
  }, [realtime])

  const assets = useMemo<MarketAsset[]>(() => (
    (resource.data?.items ?? []).map((asset) => {
      const quote = quotes[asset.assetId]
      const price = Number(quote?.last ?? asset.market?.lastPrice ?? 0)
      const change = Number(quote?.changePct ?? asset.market?.lastChangePct ?? 0)
      const volume = Number(quote?.volume ?? asset.market?.lastVolume ?? 0)
      const lastUpdatedAt = quote?.timestamp ?? asset.market?.lastPriceAt ?? null

      return {
        assetId: asset.assetId,
        symbol: asset.symbol,
        name: asset.name,
        quoteCurrency: asset.quoteCurrency ?? 'USD',
        category: categoryLabel(asset.type),
        price: Number.isFinite(price) ? price : 0,
        change: Number.isFinite(change) ? change : 0,
        volume: volume > 0 ? compactVolume(volume) : '—',
        volumeValue: Number.isFinite(volume) && volume > 0 ? volume : null,
        lastUpdatedAt,
        marketStatus: statuses[asset.assetId] ?? normalizeMarketStatus(asset.market?.status),
        priceProvider: quote?.provider ?? asset.market?.lastPriceProvider ?? asset.market?.provider ?? null,
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
  ), [quotes, resource.data, statuses])

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

function normalizeMarketStatus(value: string | null | undefined): MarketAsset['marketStatus'] {
  if (value === 'OPEN' || value === 'CLOSED' || value === 'HALTED' || value === 'MAINTENANCE') return value
  return null
}

function compactVolume(value: number): string {
  if (value >= 1_000_000_000) return '$' + (value / 1_000_000_000).toFixed(1) + 'B'
  if (value >= 1_000_000) return '$' + (value / 1_000_000).toFixed(1) + 'M'
  if (value >= 1_000) return '$' + (value / 1_000).toFixed(1) + 'K'
  return '$' + value.toFixed(0)
}
