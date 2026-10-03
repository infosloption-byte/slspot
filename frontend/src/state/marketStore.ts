import type { MarketPrice } from '../api/contracts'
import { createStore, useStore } from './createStore'

export type MarketState = {
  quotes: Record<string, MarketPrice>
}

export const marketStore = createStore<MarketState>({ quotes: {} })

export function useMarketStore(): MarketState {
  return useStore(marketStore)
}

export function setMarketQuote(quote: MarketPrice): void {
  marketStore.setState((current) => ({
    quotes: { ...current.quotes, [quote.assetId]: quote },
  }))
}

export function clearMarketQuotes(): void {
  marketStore.setState({ quotes: {} })
}
