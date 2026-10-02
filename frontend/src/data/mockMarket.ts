export type MarketAsset = {
  assetId: string
  symbol: string
  name: string
  category: string
  price: number
  change: number
  volume: string
  accent: string
  payout: number
  payoutRate: string
  feeRate: string
  minAmount: number
  maxAmount: number
  durationsSeconds: number[]
  tradingEnabled: boolean
}
