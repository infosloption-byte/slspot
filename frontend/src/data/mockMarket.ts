export type MarketAsset = {
  symbol: string
  name: string
  category: string
  price: number
  change: number
  volume: string
  accent: string
  payout: number
}

export const marketAssets: MarketAsset[] = [
  { symbol: 'BTC/USD', name: 'Bitcoin', category: 'Crypto', price: 113842.12, change: 1.82, volume: '$2.1B', accent: 'btc', payout: 88 },
  { symbol: 'ETH/USD', name: 'Ethereum', category: 'Crypto', price: 4216.44, change: -0.37, volume: '$1.2B', accent: 'eth', payout: 86 },
  { symbol: 'SOL/USD', name: 'Solana', category: 'Crypto', price: 246.18, change: 3.21, volume: '$842M', accent: 'sol', payout: 84 },
  { symbol: 'XRP/USD', name: 'XRP', category: 'Crypto', price: 3.08, change: 0.91, volume: '$511M', accent: 'xrp', payout: 82 },
  { symbol: 'EUR/USD', name: 'Euro / US Dollar', category: 'FX', price: 1.17482, change: 0.18, volume: '$98M', accent: 'eur', payout: 80 },
  { symbol: 'GBP/USD', name: 'British Pound / US Dollar', category: 'FX', price: 1.35126, change: -0.12, volume: '$74M', accent: 'gbp', payout: 81 },
  { symbol: 'AAPL/USD', name: 'Apple Inc.', category: 'Stocks', price: 257.14, change: 0.64, volume: '$412M', accent: 'aapl', payout: 78 },
  { symbol: 'TSLA/USD', name: 'Tesla Inc.', category: 'Stocks', price: 441.28, change: -1.12, volume: '$389M', accent: 'tsla', payout: 79 },
  { symbol: 'XAU/USD', name: 'Gold / US Dollar', category: 'Commodities', price: 3874.62, change: 0.47, volume: '$156M', accent: 'xau', payout: 83 },
  { symbol: 'NAS100/USD', name: 'Nasdaq 100', category: 'Indices', price: 24784.21, change: 0.31, volume: '$204M', accent: 'nas', payout: 80 },
]
