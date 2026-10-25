import type { RealtimeConnectionState } from '../realtime/connection'

export type TradeInput = {
  amount: number
  duration: number
  minAmount: number
  maxAmount: number
  durations: number[]
  balance: number
  canTrade: boolean
}
export function validateTradeInput(input: TradeInput): 'stake' | 'duration' | 'balance' | 'unavailable' | null {
  if (!Number.isFinite(input.amount) || input.amount < input.minAmount || input.amount > input.maxAmount) return 'stake'
  if (!input.durations.includes(input.duration)) return 'duration'
  if (!Number.isFinite(input.balance) || input.amount > input.balance) return 'balance'
  if (!input.canTrade) return 'unavailable'
  return null
}
export function getStakePresets(minAmount: number, maxAmount: number, balance: number): number[] {
  if (!Number.isFinite(minAmount) || !Number.isFinite(maxAmount) || !Number.isFinite(balance)) return []
  const ceiling = Math.min(maxAmount, balance)
  if (ceiling < minAmount) return []
  return [...new Set([minAmount, 25, 50, 100, 250])].filter((value) => value > 0 && value >= minAmount && value <= ceiling).sort((a, b) => a - b).slice(0, 5)
}
export function calculateTradeEstimate(amount: number, payoutRate: number, feeRate: number) {
  const fee = amount * (Number.isFinite(feeRate) ? Math.max(0, feeRate) : 0)
  const netProfit = amount * payoutRate - fee
  return { fee, netProfit, totalReturn: amount + netProfit }
}
// UI safety guard, not a replacement for server-side quote freshness checks.
export function getTradeFeedIssue(
  state: RealtimeConnectionState,
  lastUpdatedAt: string | null,
  marketStatus: string | null,
  now: number,
): string | null {
  if (marketStatus && marketStatus !== 'OPEN') return 'This market is currently ' + marketStatus.toLowerCase() + '.'
  if (state !== 'connected') return 'Live market connection is unavailable. Wait for reconnection.'
  const timestamp = lastUpdatedAt ? Date.parse(lastUpdatedAt) : NaN
  if (!Number.isFinite(timestamp) || now - timestamp > 45_000 || timestamp - now > 60_000) {
    return 'Live market price is stale. Wait for a fresh quote.'
  }
  return null
}
