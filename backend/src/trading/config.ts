import { env } from '../config/env.js'

export type TradingRules = {
  enabled: boolean
  payoutRate: string
  minAmount: string
  maxAmount: string
  durationsSeconds: number[]
  feeRate: string
}

const PAYOUT_RATES: Record<string, string> = {
  'BTC/USD': '0.88',
  'ETH/USD': '0.86',
  'SOL/USD': '0.84',
  'XRP/USD': '0.82',
  'EUR/USD': '0.80',
  'GBP/USD': '0.81',
  'AAPL/USD': '0.78',
  'TSLA/USD': '0.79',
  'XAU/USD': '0.83',
  'NAS100/USD': '0.80',
}

export const TRADING_RULES = {
  minAmount: '1.00000000',
  maxAmount: '100000.00000000',
  durationsSeconds: [15, 30, 60, 300] as const,
}

export function getTradingRules(symbol: string, marketOpen = true): TradingRules {
  return {
    enabled: marketOpen,
    payoutRate: PAYOUT_RATES[symbol] ?? '0.80',
    minAmount: TRADING_RULES.minAmount,
    maxAmount: TRADING_RULES.maxAmount,
    durationsSeconds: [...TRADING_RULES.durationsSeconds],
    feeRate: env.trading.feeRate,
  }
}
