export type MarketAsset = {
  symbol: string
  name: string
  category: string
  price: number
  change: number
  volume: string
  accent: string
}

export const marketAssets: MarketAsset[] = [
  { symbol: 'BTC/USD', name: 'Bitcoin', category: 'Crypto', price: 113842.12, change: 1.82, volume: '$2.1B', accent: 'btc' },
  { symbol: 'ETH/USD', name: 'Ethereum', category: 'Crypto', price: 4216.44, change: -0.37, volume: '$1.2B', accent: 'eth' },
  { symbol: 'SOL/USD', name: 'Solana', category: 'Crypto', price: 246.18, change: 3.21, volume: '$842M', accent: 'sol' },
  { symbol: 'XRP/USD', name: 'XRP', category: 'Crypto', price: 3.08, change: 0.91, volume: '$511M', accent: 'xrp' },
  { symbol: 'EUR/USD', name: 'Euro / US Dollar', category: 'FX', price: 1.17482, change: 0.18, volume: '$98M', accent: 'eur' },
  { symbol: 'GBP/USD', name: 'British Pound / US Dollar', category: 'FX', price: 1.35126, change: -0.12, volume: '$74M', accent: 'gbp' },
]
