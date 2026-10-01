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
  const selectedAsset = marketAssets.find((asset) => asset.symbol === selectedSymbol) ?? initialAsset

  return (
    <div className="app-shell">
      <Sidebar />
      <div className="app-main">
        <TopBar />
        <main className="trading-layout">
          <AssetList selected={selectedSymbol} onSelect={(asset) => setSelectedSymbol(asset.symbol)} />
          <div className="center-column">
            <ChartWorkspace asset={selectedAsset} />
            <BottomPanel />
          </div>
          <TradePanel asset={selectedAsset} />
        </main>
      </div>
    </div>
  )
}
