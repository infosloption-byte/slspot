import { ArrowDownAZ, BarChart3, Clock3, Search, Star, X } from 'lucide-react'
import { Select } from '../ui/Select'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { MarketAsset } from '../../data/mockMarket'
import { formatPercent, formatPrice } from '../../lib/format'

type AssetSort = 'recent' | 'symbol' | 'price' | 'change' | 'volume' | 'payout'

type AssetListProps = {
  open: boolean
  selected: string
  assets: MarketAsset[]
  onSelect: (asset: MarketAsset) => void
  onClose: () => void
  loading?: boolean
  errorMessage?: string | null
  onRetry?: () => void
}

const favoriteStorageKey = 'slspot.watchlist.favorites'
const categories = ['All', 'Crypto', 'FX', 'Stocks', 'Commodities', 'Indices', 'Fav'] as const

export function AssetList({ open, selected, assets, onSelect, onClose, loading = false, errorMessage = null, onRetry }: AssetListProps) {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<(typeof categories)[number]>('All')
  const [sortBy, setSortBy] = useState<AssetSort>('recent')
  const searchInputRef = useRef<HTMLInputElement>(null)
  const previousOpenRef = useRef(false)
  const [recentSymbols, setRecentSymbols] = useState<string[]>(() => {
    try {
      const stored = window.localStorage.getItem('slspot.watchlist.recent')
      const parsed = stored ? JSON.parse(stored) : []
      return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === 'string').slice(0, 8) : []
    } catch {
      return []
    }
  })
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

  useEffect(() => {
    window.localStorage.setItem('slspot.watchlist.recent', JSON.stringify(recentSymbols))
  }, [recentSymbols])

  useEffect(() => {
    if (!open) return

    if (!previousOpenRef.current) {
      setQuery('')
      setCategory('All')
      requestAnimationFrame(() => searchInputRef.current?.focus())
    }
    previousOpenRef.current = true

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [open, onClose])

  useEffect(() => {
    if (!open) previousOpenRef.current = false
  }, [open])

  const filteredAssets = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    const visible = assets.filter((asset) => {
      const matchesCategory =
        category === 'All' ||
        (category === 'Fav' ? favorites.includes(asset.symbol) : asset.category === category)
      const matchesQuery =
        normalized.length === 0 ||
        asset.symbol.toLowerCase().includes(normalized) ||
        asset.name.toLowerCase().includes(normalized)

      return matchesCategory && matchesQuery
    })

    const recentRank = new Map(recentSymbols.map((symbol, index) => [symbol, index]))
    return [...visible].sort((a, b) => {
      if (sortBy === 'recent') return (recentRank.get(a.symbol) ?? 99_999) - (recentRank.get(b.symbol) ?? 99_999)
      if (sortBy === 'symbol') return a.symbol.localeCompare(b.symbol)
      if (sortBy === 'price') return b.price - a.price
      if (sortBy === 'change') return b.change - a.change
      if (sortBy === 'volume') return (b.volumeValue ?? -1) - (a.volumeValue ?? -1)
      return b.payout - a.payout
    })
  }, [assets, category, favorites, query, recentSymbols, sortBy])

  const toggleFavorite = (symbol: string) => {
    setFavorites((current) => (
      current.includes(symbol)
        ? current.filter((item) => item !== symbol)
        : [...current, symbol]
    ))
  }

  if (!open) return null

  return (
    <div className="market-picker" role="dialog" aria-modal="true" aria-label="Choose a market" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose()
    }}>
      <section className="asset-panel panel market-picker__panel">
      <div className="panel__header panel__header--stacked asset-panel__header">
        <div>
          <div className="eyebrow">Markets</div>
          <div className="asset-panel__title-row">
            <h2>Choose a market</h2>
            <span className="asset-count">{assets.length}</span>
          </div>
        </div>
        <button className="quiet-button" type="button" aria-label="Close market picker" title="Close" onClick={onClose}><X size={16} /></button>
      </div>

      <div className="market-search">
        <Search size={15} aria-hidden="true" />
        <input
          ref={searchInputRef}
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
      </div>

      {errorMessage ? (
        <div className="market-picker__notice market-picker__notice--error" role="alert">
          <span><BarChart3 size={14} /> {errorMessage}</span>
          {onRetry ? <button type="button" className="quiet-button" onClick={onRetry}>Retry</button> : null}
        </div>
      ) : loading ? (
        <div className="market-picker__notice"><span><span className="loading-spinner" aria-hidden="true" /> Updating markets…</span></div>
      ) : null}

      <div className="market-filter-row" aria-label="Market category">
        {categories.map((value) => {
          const count = value === 'All'
            ? assets.length
            : value === 'Fav'
              ? favorites.length
              : assets.filter((asset) => asset.category === value).length

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

      <div className="market-sort-row">
        <span><Clock3 size={12} /> Recent</span>
        <div className="market-sort-row__select">
          <ArrowDownAZ size={12} aria-hidden="true" />
          <Select
            value={sortBy}
            options={[
              { value: 'recent', label: 'Recent' },
              { value: 'symbol', label: 'Symbol' },
              { value: 'price', label: 'Price' },
              { value: 'change', label: '24h change' },
              { value: 'volume', label: 'Volume' },
              { value: 'payout', label: 'Payout' },
            ]}
            onChange={(value) => setSortBy(value as AssetSort)}
            className="market-sort-select"
          />
        </div>
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
                  onClick={() => {
                    setRecentSymbols((current) => [asset.symbol, ...current.filter((item) => item !== asset.symbol)].slice(0, 8))
                    onSelect(asset)
                  }}
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
                    <small className="asset-row__payout">{asset.payout.toFixed(0)}% server payout · {asset.marketStatus ?? 'UNKNOWN'}</small>
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
        <span>Click a market to switch the chart</span>
        <span className="asset-footer-status"><span className="muted-dot" /> Server feed</span>
      </div>
    </section>
    </div>
  )
}
