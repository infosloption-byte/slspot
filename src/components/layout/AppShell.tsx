import { useState } from 'react'
import { AssetList } from '../market/AssetList'
import { Sidebar } from './Sidebar'
import { TopBar } from './TopBar'
import { ChartWorkspace } from '../trading/ChartWorkspace'
import { TradePanel } from '../trading/TradePanel'
import { BottomPanel } from './BottomPanel'
import { marketAssets } from '../../data/mockMarket'

export function AppShell() {
  const initialAsset = marketAssets[0]
  if (!initialAsset) {
    throw new Error('Market asset list is empty')
  }

  const [selectedSymbol, setSelectedSymbol] = useState(initialAsset.symbol)
  const [marketPickerOpen, setMarketPickerOpen] = useState(false)
  const [activityOpen, setActivityOpen] = useState(false)

  const selectedAsset = marketAssets.find((asset) => asset.symbol === selectedSymbol) ?? initialAsset

  return (
    <div className="app-shell">
      <Sidebar />
      <div className="app-main">
        <TopBar />
        <main className="trading-room">
          <ChartWorkspace asset={selectedAsset} onOpenMarkets={() => setMarketPickerOpen(true)} />
          <TradePanel asset={selectedAsset} />
          <BottomPanel
            selectedSymbol={selectedSymbol}
            collapsed={!activityOpen}
            onToggle={() => setActivityOpen((current) => !current)}
          />
        </main>

        <AssetList
          open={marketPickerOpen}
          selected={selectedSymbol}
          onSelect={(asset) => {
            setSelectedSymbol(asset.symbol)
            setMarketPickerOpen(false)
          }}
          onClose={() => setMarketPickerOpen(false)}
        />
      </div>
    </div>
  )
}
