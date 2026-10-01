import { Search, Star, SlidersHorizontal } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { marketAssets, type MarketAsset } from '../../data/mockMarket'
import { formatPercent, formatPrice } from '../../lib/format'

type AssetListProps = {
  selected: string
  onSelect: (asset: MarketAsset) => void
}

const favoriteStorageKey = 'slspot.watchlist.favorites'
const categories = ['All', 'Crypto', 'FX', 'Fav'] as const

export function AssetList({ selected, onSelect }: AssetListProps) {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<(typeof categories)[number]>('All')
  const [favorites, setFavorites] = useState<string[]>(() => {
    try {
      const stored = window.localStorage.getItem(favoriteStorageKey)
      const parsed = stored ? JSON.parse(stored) : []
      return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === 'string') : []
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
      const matchesCategory =
        category === 'All' ||
        (category === 'Fav' ? favorites.includes(asset.symbol) : asset.category === category)
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
      <div className="panel__header panel__header--stacked asset-panel__header">
        <div>
          <div className="eyebrow">Markets</div>
          <div className="asset-panel__title-row">
            <h2>Watchlist</h2>
            <span className="asset-count">{marketAssets.length}</span>
          </div>
        </div>
        <button className="quiet-button" type="button" aria-label="Market filters" title="Market filters">
          <SlidersHorizontal size={15} />
        </button>
      </div>

      <label className="market-search">
        <Search size={15} aria-hidden="true" />
        <input
          aria-label="Search assets"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search markets"
          autoComplete="off"
          spellCheck={false}
        />
        {query.length > 0 ? (
          <button
            className="market-search__clear"
            type="button"
            aria-label="Clear market search"
            title="Clear search"
            onClick={() => setQuery('')}
          >
            ×
          </button>
        ) : null}
      </label>

      <div className="market-filter-row" aria-label="Market category">
        {categories.map((value) => {
          const count = value === 'All'
            ? marketAssets.length
            : value === 'Fav'
              ? favorites.length
              : marketAssets.filter((asset) => asset.category === value).length

          return (
            <button
              className={category === value ? 'filter-pill filter-pill--active' : 'filter-pill'}
              key={value}
              onClick={() => setCategory(value)}
              type="button"
              aria-pressed={category === value}
            >
              <span>{value === 'Fav' ? '★' : value}</span>
              <small>{count}</small>
            </button>
          )
        })}
      </div>

      <div className="asset-list" aria-label="Available markets">
        {filteredAssets.length === 0 ? (
          <div className="asset-list__empty">
            <span className="asset-list__empty-icon">⌕</span>
            <strong>{category === 'Fav' && favorites.length === 0 ? 'No favorites yet' : 'No matching markets'}</strong>
            <span>{category === 'Fav' && favorites.length === 0 ? 'Use the star on a market to add it here.' : 'Try another symbol, name, or category.'}</span>
          </div>
        ) : (
          filteredAssets.map((asset) => {
            const isSelected = asset.symbol === selected
            const positive = asset.change >= 0
            const isFavorite = favorites.includes(asset.symbol)

            return (
              <div
                key={asset.symbol}
                className={'asset-row' + (isSelected ? ' asset-row--active' : '')}
              >
                <button
                  className="asset-row__select"
                  onClick={() => onSelect(asset)}
                  type="button"
                  aria-label={'Select ' + asset.symbol}
                  aria-current={isSelected ? 'true' : undefined}
                >
                  <span className={'asset-icon asset-icon--' + asset.accent} aria-hidden="true">{asset.symbol.slice(0, 1)}</span>
                  <span className="asset-row__identity">
                    <strong>{asset.symbol}</strong>
                    <small>{asset.name} · Vol {asset.volume}</small>
                  </span>
                  <span className="asset-row__value">
                    <strong>{formatPrice(asset.price, asset.price < 10 ? 5 : 2)}</strong>
                    <small className={positive ? 'text-positive' : 'text-negative'}>{formatPercent(asset.change)} <span>24h</span></small>
                  </span>
                </button>

                <button
                  className={'asset-favorite' + (isFavorite ? ' asset-favorite--active' : '')}
                  onClick={() => toggleFavorite(asset.symbol)}
                  type="button"
                  aria-label={isFavorite ? 'Remove ' + asset.symbol + ' from favorites' : 'Add ' + asset.symbol + ' to favorites'}
                  aria-pressed={isFavorite}
                  title={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
                >
                  <Star size={13} fill={isFavorite ? 'currentColor' : 'none'} />
                </button>
              </div>
            )
          })
        )}
      </div>

      <div className="panel__footer-note">
        <span>{filteredAssets.length} shown · demo market data</span>
        <span className="asset-footer-status"><span className="muted-dot" /> Simulated</span>
      </div>
    </section>
  )
}
