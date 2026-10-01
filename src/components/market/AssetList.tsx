import { Search, Star, SlidersHorizontal } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { marketAssets, type MarketAsset } from '../../data/mockMarket'
import { formatPercent, formatPrice } from '../../lib/format'

type AssetListProps = {
  selected: string
  onSelect: (asset: MarketAsset) => void
}

const favoriteStorageKey = 'slspot.watchlist.favorites'

export function AssetList({ selected, onSelect }: AssetListProps) {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('All')
  const [favorites, setFavorites] = useState<string[]>(() => {
    try {
      const stored = window.localStorage.getItem(favoriteStorageKey)
      return stored ? JSON.parse(stored) : []
    } catch {
      return []
    }
  })

  useEffect(() => {
    window.localStorage.setItem(favoriteStorageKey, JSON.stringify(favorites))
  }, [favorites])

  const filteredAssets = useMemo(() => {
    const normalized = query.trim().toLowerCase()

    return marketAssets.filter((asset) => {
      const matchesCategory = category === 'All' || (category === 'Fav' ? favorites.includes(asset.symbol) : asset.category === category)
      const matchesQuery =
        normalized.length === 0 ||
        asset.symbol.toLowerCase().includes(normalized) ||
        asset.name.toLowerCase().includes(normalized)

      return matchesCategory && matchesQuery
    })
  }, [category, favorites, query])

  const toggleFavorite = (symbol: string) => {
    setFavorites((current) => (
      current.includes(symbol)
        ? current.filter((item) => item !== symbol)
        : [...current, symbol]
    ))
  }

  return (
    <section className="asset-panel panel">
      <div className="panel__header panel__header--stacked">
        <div>
          <div className="eyebrow">Markets</div>
          <h2>Watchlist</h2>
        </div>
        <button className="quiet-button" type="button" aria-label="Market filters" title="Market filters">
          <SlidersHorizontal size={15} />
        </button>
      </div>

      <label className="market-search">
        <Search size={15} />
        <input
          aria-label="Search assets"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Find asset"
          autoComplete="off"
          spellCheck={false}
        />
      </label>

      <div className="market-filter-row" aria-label="Market category">
        {['All', 'Crypto', 'FX', 'Fav'].map((value) => (
          <button
            className={category === value ? 'filter-pill filter-pill--active' : 'filter-pill'}
            key={value}
            onClick={() => setCategory(value)}
            type="button"
            aria-pressed={category === value}
          >
            {value === 'Fav' ? '★ Fav' : value}
          </button>
        ))}
      </div>

      <div className="asset-list">
        {filteredAssets.length === 0 ? (
          <div className="asset-list__empty">
            <strong>No matching assets</strong>
            <span>Try another symbol, name, or filter.</span>
          </div>
        ) : (
          filteredAssets.map((asset) => {
            const isSelected = asset.symbol === selected
            const positive = asset.change >= 0
            const isFavorite = favorites.includes(asset.symbol)

            return (
              <div key={asset.symbol} className={'asset-row' + (isSelected ? ' asset-row--active' : '')}>
                <button
                  className="asset-row__select"
                  onClick={() => onSelect(asset)}
                  type="button"
                  aria-label={'Select ' + asset.symbol}
                >
                  <span className={'asset-icon asset-icon--' + asset.accent}>{asset.symbol.slice(0, 1)}</span>
                  <span className="asset-row__identity">
                    <strong>{asset.symbol}</strong>
                    <small>{asset.name}</small>
                  </span>
                  <span className="asset-row__value">
                    <strong>{formatPrice(asset.price, asset.price < 10 ? 5 : 2)}</strong>
                    <small className={positive ? 'text-positive' : 'text-negative'}>{formatPercent(asset.change)}</small>
                  </span>
                </button>

                <button
                  className={'asset-favorite' + (isFavorite ? ' asset-favorite--active' : '')}
                  onClick={() => toggleFavorite(asset.symbol)}
                  type="button"
                  aria-label={isFavorite ? 'Remove ' + asset.symbol + ' from favorites' : 'Add ' + asset.symbol + ' to favorites'}
                  aria-pressed={isFavorite}
                  title={isFavorite ? 'Remove favorite' : 'Add favorite'}
                >
                  <Star size={13} fill={isFavorite ? 'currentColor' : 'none'} />
                </button>
              </div>
            )
          })
        )}
      </div>

      <div className="panel__footer-note">
        <span>{filteredAssets.length} assets · interface preview</span>
        <span className="muted-dot" />
      </div>
    </section>
  )
}
