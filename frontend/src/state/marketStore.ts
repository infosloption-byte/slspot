import type { MarketPrice } from '../api/contracts'
import { createStore, useStore } from './createStore'

export type MarketState = {
  quotes: Record<string, MarketPrice>
  statuses: Record<string, 'OPEN' | 'CLOSED' | 'HALTED' | 'MAINTENANCE'>
}

export const marketStore = createStore<MarketState>({ quotes: {}, statuses: {} })

export function useMarketStore(): MarketState {
  return useStore(marketStore)
}

export function setMarketQuote(quote: MarketPrice): void {
  marketStore.setState((current) => ({
    ...current,
    quotes: { ...current.quotes, [quote.assetId]: quote },
  }))
}

export function setMarketStatus(assetId: string, status: 'OPEN' | 'CLOSED' | 'HALTED' | 'MAINTENANCE'): void {
  marketStore.setState((current) => ({
    ...current,
    statuses: { ...current.statuses, [assetId]: status },
  }))
}

export function clearMarketQuotes(): void {
  marketStore.setState({ quotes: {}, statuses: {} })
}
