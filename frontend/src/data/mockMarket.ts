export type MarketAsset = {
  assetId: string
  symbol: string
  name: string
  quoteCurrency: string
  category: string
  price: number
  change: number
  volume: string
  volumeValue: number | null
  lastUpdatedAt: string | null
  marketStatus: 'OPEN' | 'CLOSED' | 'HALTED' | 'MAINTENANCE' | null
  priceProvider: string | null
  accent: string
  payout: number
  payoutRate: string
  feeRate: string
  minAmount: number
  maxAmount: number
  durationsSeconds: number[]
  tradingEnabled: boolean
}
