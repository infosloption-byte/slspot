import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { MarketAsset } from '../../data/mockMarket'
import { TradePanel } from './TradePanel'

const asset: MarketAsset = {
  assetId: 'asset-1',
  symbol: 'EUR/USD',
  name: 'Euro / US Dollar',
  quoteCurrency: 'USD',
  category: 'FX',
  price: 1.08,
  change: 0,
  volume: '1K',
  volumeValue: 1000,
  lastUpdatedAt: new Date().toISOString(),
  marketStatus: 'OPEN',
  priceProvider: 'test',
  accent: 'eur',
  payout: 85,
  payoutRate: '0.85',
  feeRate: '0.02',
  minAmount: 10,
  maxAmount: 500,
  durationsSeconds: [30, 60],
  tradingEnabled: true,
}

test('trade panel renders both desktop and mobile order controls with net profit labels', () => {
  const html = renderToStaticMarkup(createElement(TradePanel, {
    asset, balance: 40, walletMode: 'DEMO', canTrade: true,
    onOpenTrade: async () => { throw Error('Must not submit while rendering') },
  }))
  assert.match(html, /aria-label="Trade controls"/)
  assert.match(html, /Potential net profit/)
  assert.match(html, /Potential settlement/)
  assert.match(html, /Stake amount/)
  assert.match(html, /trade-btn--up/)
  assert.match(html, /trade-btn--down/)
  assert.match(html, /\$25\.00/)
  assert.doesNotMatch(html, /\$250\.00/)
})
