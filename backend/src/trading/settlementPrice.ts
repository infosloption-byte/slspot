import { Prisma } from '../generated/prisma/client.js'
import { getLivePriceAt } from '../market/live-prices.js'

export type SettlementPrice = { price: Prisma.Decimal; provider: string; timestamp: Date }

export type SettlementPriceInput = {
  assetId: string
  symbol: string
  expiresAt: Date | null
  demo: boolean
  market: { lastPrice: Prisma.Decimal | null; lastPriceAt: Date | null; lastPriceProvider?: string | null } | undefined
  maxAgeMs: number
  now?: number
  demoPrice: (symbol: string, marketPrice: Prisma.Decimal | null | undefined) => Prisma.Decimal
  onLateFallback?: (details: { assetId: string; symbol: string; lateMs: number | null }) => void
}

/**
 * The price a trade settles at: the tick in force at the expiry instant (from the in-memory tick
 * history), so the settlement worker's own lag does not move the result. When no tick covers the
 * expiry instant (for example after a restart) the current fresh price is used and the lateness is
 * reported; the result still carries the real tick timestamp. DEMO accounts may fall back to the
 * simulated price; REAL accounts never do and get null (the trade stays open and is retried).
 */
export function resolveSettlementPrice(input: SettlementPriceInput): SettlementPrice | null {
  const now = input.now ?? Date.now()

  if (input.expiresAt) {
    const exact = getLivePriceAt(input.assetId, input.expiresAt.getTime(), input.maxAgeMs)
    if (exact) {
      return { price: new Prisma.Decimal(exact.price), provider: exact.provider, timestamp: new Date(exact.at) }
    }
  }

  const { market } = input
  if (market?.lastPrice && market.lastPriceAt && now - market.lastPriceAt.getTime() <= input.maxAgeMs) {
    input.onLateFallback?.({
      assetId: input.assetId,
      symbol: input.symbol,
      lateMs: input.expiresAt ? now - input.expiresAt.getTime() : null,
    })
    return { price: market.lastPrice, provider: market.lastPriceProvider ?? 'unknown', timestamp: market.lastPriceAt }
  }

  if (input.demo) {
    return { price: input.demoPrice(input.symbol, market?.lastPrice), provider: 'demo-simulation', timestamp: new Date(now) }
  }
  return null
}
