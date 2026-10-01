import { Search, SlidersHorizontal } from 'lucide-react'
import { marketAssets, type MarketAsset } from '../../data/mockMarket'
import { formatPercent, formatPrice } from '../../lib/format'

type AssetListProps = {
  selected: string
  onSelect: (asset: MarketAsset) => void
}

export function AssetList({ selected, onSelect }: AssetListProps) {
  return (
    <section className="asset-panel panel">
      <div className="panel__header panel__header--stacked">
        <div>
          <div className="eyebrow">Markets</div>
          <h2>Watchlist</h2>
        </div>
        <button className="quiet-button" type="button" aria-label="Filter markets">
          <SlidersHorizontal size={15} />
        </button>
      </div>

      <label className="market-search">
        <Search size={15} />
        <input aria-label="Search assets" placeholder="Find asset" />
      </label>

      <div className="market-filter-row">
        <button className="filter-pill filter-pill--active" type="button">All</button>
        <button className="filter-pill" type="button">Crypto</button>
        <button className="filter-pill" type="button">FX</button>
      </div>

      <div className="asset-list">
        {marketAssets.map((asset) => {
          const isSelected = asset.symbol === selected
          const positive = asset.change >= 0
          return (
            <button
              key={asset.symbol}
              className={`asset-row ${isSelected ? 'asset-row--active' : ''}`}
              onClick={() => onSelect(asset)}
              type="button"
            >
              <span className={`asset-icon asset-icon--${asset.accent}`}>{asset.symbol.slice(0, 1)}</span>
              <span className="asset-row__identity">
                <strong>{asset.symbol}</strong>
                <small>{asset.name}</small>
              </span>
              <span className="asset-row__value">
                <strong>{formatPrice(asset.price, asset.price < 10 ? 5 : 2)}</strong>
                <small className={positive ? 'text-positive' : 'text-negative'}>{formatPercent(asset.change)}</small>
              </span>
            </button>
          )
        })}
      </div>

      <div className="panel__footer-note">
        <span>Prices shown for interface preview</span>
        <span className="muted-dot" />
      </div>
    </section>
  )
}
