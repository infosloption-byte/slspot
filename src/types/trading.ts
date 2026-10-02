export type TradeDirection = 'UP' | 'DOWN'
export type TradeStatus = 'OPEN' | 'WON' | 'LOST' | 'CLOSED'

export type OpenTrade = {
  id: string
  symbol: string
  direction: TradeDirection
  amount: number
  durationSeconds: number
  openedAt: number
  expiresAt: number
  entryPrice: number
  payoutRate: number
  status: TradeStatus
  closedAt?: number
  exitPrice?: number
}

export function tradeRemainingSeconds(trade: OpenTrade, now: number) {
  return Math.max(0, Math.ceil((trade.expiresAt - now) / 1000))
}

export function tradeProgress(trade: OpenTrade, now: number) {
  if (trade.durationSeconds <= 0) return 1
  return Math.min(1, Math.max(0, (now - trade.openedAt) / 1000 / trade.durationSeconds))
}

export function calculateTradePnl(trade: OpenTrade, currentPrice: number) {
  const movement = trade.entryPrice > 0 ? (currentPrice - trade.entryPrice) / trade.entryPrice : 0
  const directionalMovement = trade.direction === 'UP' ? movement : -movement
  return trade.amount * Math.max(-1, Math.min(1, directionalMovement * 15))
}

export function resolveTrade(trade: OpenTrade, exitPrice: number): OpenTrade {
  const won = trade.direction === 'UP' ? exitPrice >= trade.entryPrice : exitPrice <= trade.entryPrice
  return {
    ...trade,
    status: won ? 'WON' : 'LOST',
    closedAt: Date.now(),
    exitPrice,
  }
}
