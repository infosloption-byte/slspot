import { useState } from 'react'
import { AssetList } from '../components/market/AssetList'
import { BottomPanel } from '../components/layout/BottomPanel'
import { ChartWorkspace } from '../components/trading/ChartWorkspace'
import { TradePanel } from '../components/trading/TradePanel'
import { marketAssets } from '../data/mockMarket'

export function TradingPage() {
  const initialAsset = marketAssets[0]
  if (!initialAsset) {
    throw new Error('Market asset list is empty')
  }

  const [selectedSymbol, setSelectedSymbol] = useState(initialAsset.symbol)
  const [marketPickerOpen, setMarketPickerOpen] = useState(false)
  const [activityOpen, setActivityOpen] = useState(false)

  const selectedAsset = marketAssets.find((asset) => asset.symbol === selectedSymbol) ?? initialAsset

  return (
    <main className="trading-room">
      <div className="trading-room__main">
        <ChartWorkspace asset={selectedAsset} onOpenMarkets={() => setMarketPickerOpen(true)} />
        <BottomPanel
          selectedSymbol={selectedSymbol}
          collapsed={!activityOpen}
          onToggle={() => setActivityOpen((current) => !current)}
        />
      </div>

      <TradePanel asset={selectedAsset} />

      <AssetList
        open={marketPickerOpen}
        selected={selectedSymbol}
        onSelect={(asset) => {
          setSelectedSymbol(asset.symbol)
          setMarketPickerOpen(false)
        }}
        onClose={() => setMarketPickerOpen(false)}
      />
    </main>
  )
}
