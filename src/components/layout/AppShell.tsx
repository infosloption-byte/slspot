import { useState } from 'react'
import { AssetList } from '../market/AssetList'
import { Sidebar } from './Sidebar'
import { TopBar } from './TopBar'
import { ChartWorkspace } from '../trading/ChartWorkspace'
import { TradePanel } from '../trading/TradePanel'
import { BottomPanel } from './BottomPanel'
import { marketAssets } from '../../data/mockMarket'

export function AppShell() {
  const [selectedSymbol, setSelectedSymbol] = useState(marketAssets[0].symbol)
  const selectedAsset = marketAssets.find((asset) => asset.symbol === selectedSymbol) ?? marketAssets[0]

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
          <TradePanel />
        </main>
      </div>
    </div>
  )
}
