import { env } from '../config/env.js'
import { payoutRateFor, riskLimitsStore } from './risk.js'

export type TradingRules = {
  enabled: boolean
  payoutRate: string
  minAmount: string
  maxAmount: string
  durationsSeconds: number[]
  feeRate: string
}

export const TRADING_RULES = {
  durationsSeconds: [
    5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55,
    60, 120, 180, 240, 300,
  ],
}

/** Per-trade limits and payout rates come from the admin-managed risk settings (see risk.ts), for demo and real trades alike. */
export function getTradingRules(symbol: string, marketOpen = true): TradingRules {
  const limits = riskLimitsStore.get()
  return {
    enabled: marketOpen,
    payoutRate: payoutRateFor(symbol, limits),
    minAmount: limits.minTradeAmount,
    maxAmount: limits.maxTradeAmount,
    durationsSeconds: [...TRADING_RULES.durationsSeconds],
    feeRate: env.trading.feeRate,
  }
}
