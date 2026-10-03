import { createStore, useStore } from './createStore'
import type { PortfolioAnalytics, PortfolioPosition, PortfolioSummary } from '../api/portfolio'

export type PortfolioState = {
  summary: PortfolioSummary | null
  analytics: PortfolioAnalytics | null
  positions: PortfolioPosition[]
}

export const portfolioStore = createStore<PortfolioState>({
  summary: null,
  analytics: null,
  positions: [],
})

export function usePortfolioStore(): PortfolioState {
  return useStore(portfolioStore)
}

export function setPortfolioSummary(summary: PortfolioSummary | null): void {
  portfolioStore.setState((current) => ({ ...current, summary }))
}

export function setPortfolioAnalytics(analytics: PortfolioAnalytics | null): void {
  portfolioStore.setState((current) => ({ ...current, analytics }))
}

export function setPortfolioPositions(positions: PortfolioPosition[]): void {
  portfolioStore.setState((current) => ({ ...current, positions }))
}

export function resetPortfolioStore(): void {
  portfolioStore.setState({ summary: null, analytics: null, positions: [] })
}
