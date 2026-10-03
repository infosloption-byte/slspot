import { ArrowDownToLine, ArrowUpDown, CalendarDays, ChevronDown, ChevronUp, Clock3, History, RotateCcw, Search, ShieldCheck, TimerReset, WalletCards } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { WalletTransaction } from '../../api/wallet'
import type { TradeHistoryFilters } from '../../api/trades'
import type { OpenTrade } from '../../types/trading'
import { tradeProgress, tradeRemainingSeconds } from '../../types/trading'
import { formatPrice } from '../../lib/format'
import { EmptyState } from '../ui/EmptyState'
import { Pagination } from '../ui/Pagination'

type TabId = 'open' | 'history' | 'wallet'

type BottomPanelProps = {
  selectedSymbol: string
  currentPrice: number
  openTrades: OpenTrade[]
  settledTrades: OpenTrade[]
  walletTransactions: WalletTransaction[]
  now: number
  collapsed: boolean
  onToggle: () => void
  historyPage: number
  historyTotalPages: number
  historyTotal: number
  historyLoading: boolean
  historyError: string | null
  historyFilters: TradeHistoryFilters
  historyAssets: Array<{ id: string; symbol: string; name: string }>
  historyExporting: boolean
  onHistoryPageChange: (page: number) => void
  onHistoryFiltersChange: (patch: Partial<TradeHistoryFilters>) => void
  onHistoryReset: () => void
  onHistoryRetry: () => void
  onHistoryExport: () => void
}

const tabs = [
  { id: 'open' as const, label: 'Open positions', icon: Clock3 },
  { id: 'history' as const, label: 'Trade history', icon: History },
  { id: 'wallet' as const, label: 'Wallet activity', icon: WalletCards },
]

function formatCountdown(seconds: number) {
  if (seconds < 60) return seconds + 's'
  const minutes = Math.floor(seconds / 60)
  const remainder = seconds % 60
  return minutes + ':' + remainder.toString().padStart(2, '0')
}

function formatWalletAmount(transaction: WalletTransaction) {
  const amount = Number(transaction.amount)
  const prefix = amount > 0 ? '+' : ''
  return prefix + '$' + Math.abs(amount).toFixed(2)
}

function formatWalletTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

export function BottomPanel({
  selectedSymbol,
  currentPrice,
  openTrades,
  settledTrades,
  walletTransactions,
  now,
  collapsed,
  onToggle,
  historyPage,
  historyTotalPages,
  historyTotal,
  historyLoading,
  historyError,
  historyFilters,
  historyAssets,
  historyExporting,
  onHistoryPageChange,
  onHistoryFiltersChange,
  onHistoryReset,
  onHistoryRetry,
  onHistoryExport,
}: BottomPanelProps) {
  const [active, setActive] = useState<TabId>('open')

  const visiblePositions = useMemo(
    () => openTrades.filter((trade) => trade.symbol === selectedSymbol),
    [openTrades, selectedSymbol],
  )

  const visibleHistory = useMemo(
    () => settledTrades,
    [settledTrades],
  )

  const visibleWallet = useMemo(
    () => walletTransactions.slice(0, 25),
    [walletTransactions],
  )

  return (
    <section className={'bottom-panel' + (collapsed ? ' bottom-panel--collapsed' : '')}>
      <div className="bottom-panel__tabs">
        {tabs.map(({ id, label, icon: Icon }) => {
          const count = id === 'open'
            ? visiblePositions.length
            : id === 'history'
              ? visibleHistory.length
              : visibleWallet.length

          return (
            <button
              key={id}
              className={active === id ? 'bottom-tab bottom-tab--active' : 'bottom-tab'}
              type="button"
              onClick={() => setActive(id)}
            >
              <Icon size={15} />
              <span>{label}</span>
              <span className="tab-count">{count}</span>
            </button>
          )
        })}

        <div className="bottom-panel__spacer" />

        {!collapsed ? (
          <button className="bottom-link" type="button" title="Export current tab">
            <ArrowDownToLine size={14} />
            <span>Export</span>
          </button>
        ) : null}

        <button
          className="activity-toggle"
          type="button"
          onClick={onToggle}
          aria-expanded={!collapsed}
          title={collapsed ? 'Open activity' : 'Collapse activity'}
        >
          {collapsed ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
          <span>{collapsed ? 'Activity' : 'Hide'}</span>
        </button>
      </div>

      {!collapsed && active === 'open' ? (
        <div className="positions-table">
          {visiblePositions.length === 0 ? (
            <EmptyState
              title={'No open position for ' + selectedSymbol}
              message="Place a trade to see the server position and expiry countdown here."
              icon={<Clock3 size={18} />}
            />
          ) : (
            <>
              <div className="position-row position-row--header">
                <span>Instrument</span>
                <span>Side</span>
                <span>Entry</span>
                <span>Current</span>
                <span>Countdown</span>
                <span>Status</span>
                <span />
              </div>

              {visiblePositions.map((trade) => {
                const remaining = tradeRemainingSeconds(trade, now)
                const progress = tradeProgress(trade, now)
                return (
                  <div className="position-row position-row--live" key={trade.id}>
                    <span>
                      <strong>{trade.symbol}</strong>
                      <small>#{trade.id}</small>
                    </span>
                    <span className={trade.direction === 'UP' ? 'side-pill side-pill--up' : 'side-pill side-pill--down'}>
                      {trade.direction}
                    </span>
                    <span>{formatPrice(trade.entryPrice, trade.entryPrice < 10 ? 5 : 2)}</span>
                    <span>{formatPrice(currentPrice, currentPrice < 10 ? 5 : 2)}</span>
                    <span className="countdown-cell">
                      <strong>{formatCountdown(remaining)}</strong>
                      <span className="countdown-track">
                        <i style={{ width: (100 - progress * 100) + '%' }} />
                      </span>
                    </span>
                    <span className="status-pill status-pill--pending">Unsettled</span>
                    <span className="status-pill status-pill--pending">Auto settlement</span>
                  </div>
                )
              })}
            </>
          )}
        </div>
      ) : null}

      {!collapsed && active === 'history' ? (
        <div className="activity-table trade-history-panel">
          <div className="trade-history-toolbar">
            <label className="trade-history-control trade-history-search">
              <Search size={14} aria-hidden="true" />
              <input
                type="search"
                value={historyFilters.search}
                placeholder="Search pair or trade ID"
                aria-label="Search trade history"
                onChange={(event) => onHistoryFiltersChange({ search: event.target.value })}
              />
            </label>

            <label className="trade-history-control">
              <span>Status</span>
              <select
                value={historyFilters.status}
                onChange={(event) => onHistoryFiltersChange({ status: event.target.value as TradeHistoryFilters['status'] })}
              >
                <option value="">All settled</option>
                <option value="WON">Won</option>
                <option value="LOST">Lost</option>
                <option value="CANCELLED">Cancelled</option>
                <option value="EXPIRED">Expired</option>
              </select>
            </label>

            <label className="trade-history-control">
              <span>Pair</span>
              <select
                value={historyFilters.assetId}
                onChange={(event) => onHistoryFiltersChange({ assetId: event.target.value })}
              >
                <option value="">All pairs</option>
                {historyAssets.map((asset) => (
                  <option key={asset.id} value={asset.id}>{asset.symbol}</option>
                ))}
              </select>
            </label>

            <label className="trade-history-control">
              <span>Direction</span>
              <select
                value={historyFilters.direction}
                onChange={(event) => onHistoryFiltersChange({ direction: event.target.value as TradeHistoryFilters['direction'] })}
              >
                <option value="">Both</option>
                <option value="UP">UP</option>
                <option value="DOWN">DOWN</option>
              </select>
            </label>

            <label className="trade-history-control trade-history-date">
              <span><CalendarDays size={12} /> From</span>
              <input
                type="date"
                value={historyFilters.from}
                max={historyFilters.to || undefined}
                onChange={(event) => onHistoryFiltersChange({ from: event.target.value })}
              />
            </label>

            <label className="trade-history-control trade-history-date">
              <span><CalendarDays size={12} /> To</span>
              <input
                type="date"
                value={historyFilters.to}
                min={historyFilters.from || undefined}
                onChange={(event) => onHistoryFiltersChange({ to: event.target.value })}
              />
            </label>

            <label className="trade-history-control trade-history-sort">
              <span><ArrowUpDown size={12} /> Sort</span>
              <select
                value={historyFilters.sortBy + '_' + historyFilters.sortOrder}
                onChange={(event) => {
                  const [sortBy, sortOrder] = event.target.value.split('_') as [TradeHistoryFilters['sortBy'], TradeHistoryFilters['sortOrder']]
                  onHistoryFiltersChange({ sortBy, sortOrder })
                }}
              >
                <option value="openedAt_desc">Newest</option>
                <option value="openedAt_asc">Oldest</option>
                <option value="amount_desc">Amount: high to low</option>
                <option value="amount_asc">Amount: low to high</option>
                <option value="netPnl_desc">P&amp;L: high to low</option>
                <option value="netPnl_asc">P&amp;L: low to high</option>
                <option value="closedAt_desc">Closed: newest first</option>
                <option value="closedAt_asc">Closed: oldest first</option>
              </select>
            </label>

            <button className="quiet-button trade-history-reset" type="button" onClick={onHistoryReset} title="Reset history filters">
              <RotateCcw size={14} />
              <span>Reset</span>
            </button>

            <button className="quiet-button trade-history-export" type="button" onClick={onHistoryExport} disabled={historyExporting || historyLoading}>
              <ArrowDownToLine size={14} />
              <span>{historyExporting ? 'Exporting…' : 'Export CSV'}</span>
            </button>
          </div>

          {historyLoading && visibleHistory.length > 0 ? (
            <div className="trade-history-progress" role="status">
              <span className="loading-spinner" aria-hidden="true" /> Updating history…
            </div>
          ) : null}

          {historyError && visibleHistory.length > 0 ? (
            <div className="trade-history-error" role="alert">
              <strong>History refresh failed.</strong>
              <span>{historyError}</span>
              <button type="button" className="quiet-button" onClick={onHistoryRetry}>Retry</button>
            </div>
          ) : null}

          {historyLoading && visibleHistory.length === 0 ? (
            <div className="trade-history-state" role="status">
              <span className="loading-spinner" aria-hidden="true" />
              <strong>Loading trade history…</strong>
            </div>
          ) : historyError && visibleHistory.length === 0 ? (
            <div className="trade-history-state trade-history-state--error" role="alert">
              <strong>Unable to load trade history</strong>
              <span>{historyError}</span>
              <button type="button" className="quiet-button" onClick={onHistoryRetry}>Retry</button>
            </div>
          ) : visibleHistory.length === 0 ? (
            <EmptyState
              title="No trades match the current filters"
              message="Try another pair, status, direction or date range."
              icon={<TimerReset size={18} />}
            />
          ) : (
            <>
              <div className="activity-row activity-row--header activity-row--trade-history">
                <span>Trade</span>
                <span>Side</span>
                <span>Amount</span>
                <span>Open price</span>
                <span>Closed price</span>
                <span>Result</span>
                <span>Net P&amp;L</span>
              </div>

              {visibleHistory.map((trade) => (
                <div className="activity-row activity-row--trade-history" key={trade.id}>
                  <div>
                    <strong>{trade.symbol}</strong>
                    <small>#{trade.id}</small>
                  </div>
                  <span className={trade.direction === 'UP' ? 'side-label side-label--up' : 'side-label side-label--down'}>
                    {trade.direction}
                  </span>
                  <span>{'

      {!collapsed && active === 'wallet' ? (
        <div className="activity-table">
          {visibleWallet.length === 0 ? (
            <EmptyState
              title="No wallet activity yet"
              message="Server wallet holds, settlements, fees, deposits, and withdrawals will appear here."
              icon={<WalletCards size={18} />}
            />
          ) : (
            <>
              <div className="activity-row activity-row--header">
                <span>Activity</span>
                <span>Type</span>
                <span>Amount</span>
                <span>Status</span>
                <span>Time</span>
              </div>

              {visibleWallet.map((item) => {
                const amount = Number(item.amount)
                return (
                  <div className="activity-row" key={item.id}>
                    <div>
                      <strong>{item.description ?? item.type}</strong>
                      <small>#{item.id}</small>
                    </div>
                    <span>{item.type}</span>
                    <strong className={amount >= 0 ? 'text-positive' : 'text-negative'}>
                      {formatWalletAmount(item)}
                    </strong>
                    <span className={item.status === 'COMPLETED'
                      ? 'status-pill status-pill--positive'
                      : 'status-pill status-pill--pending'}>
                      {item.status}
                    </span>
                    <small>{formatWalletTime(item.createdAt)}</small>
                  </div>
                )
              })}
            </>
          )}
        </div>
      ) : null}

      {!collapsed && visiblePositions.length > 0 && active === 'open' ? (
        <div className="position-detail position-detail--live">
          <span className="position-detail__icon"><ShieldCheck size={15} /></span>
          <div className="position-detail__copy">
            <strong>Server positions</strong>
            <span>{visiblePositions.length} open · settlement is controlled by the trading engine</span>
          </div>
          <div className="position-detail__metrics">
            <span>Current <b>{formatPrice(currentPrice, currentPrice < 10 ? 5 : 2)}</b></span>
            <span>Market <b>{selectedSymbol}</b></span>
          </div>
        </div>
      ) : null}
    </section>
  )
}
}{trade.amount.toFixed(2)}</span>
                  <span>{formatPrice(trade.entryPrice, trade.entryPrice < 10 ? 5 : 2)}</span>
                  <span>
                    {trade.exitPrice === undefined
                      ? '—'
                      : formatPrice(trade.exitPrice, trade.exitPrice < 10 ? 5 : 2)}
                  </span>
                  <span className={trade.status === 'WON' ? 'status-pill status-pill--positive' : trade.status === 'LOST' ? 'status-pill status-pill--negative' : 'status-pill status-pill--pending'}>
                    {trade.status}
                  </span>
                  <strong className={trade.status === 'WON' ? 'text-positive' : trade.status === 'LOST' ? 'text-negative' : 'text-positive'}>
                    {trade.netPnl === undefined ? '—' : (trade.netPnl >= 0 ? '+' : '') + trade.netPnl.toFixed(2)}
                  </strong>
                </div>
              ))}

              <div className="trade-history-footer">
                <span>{historyTotal} matching trades · Page {historyPage} of {historyTotalPages}</span>
                <Pagination page={historyPage} totalPages={historyTotalPages} onChange={onHistoryPageChange} />
              </div>
            </>
          )}
        </div>
      ) : null}

      {!collapsed && active === 'wallet' ? (
        <div className="activity-table">
          {visibleWallet.length === 0 ? (
            <EmptyState
              title="No wallet activity yet"
              message="Server wallet holds, settlements, fees, deposits, and withdrawals will appear here."
              icon={<WalletCards size={18} />}
            />
          ) : (
            <>
              <div className="activity-row activity-row--header">
                <span>Activity</span>
                <span>Type</span>
                <span>Amount</span>
                <span>Status</span>
                <span>Time</span>
              </div>

              {visibleWallet.map((item) => {
                const amount = Number(item.amount)
                return (
                  <div className="activity-row" key={item.id}>
                    <div>
                      <strong>{item.description ?? item.type}</strong>
                      <small>#{item.id}</small>
                    </div>
                    <span>{item.type}</span>
                    <strong className={amount >= 0 ? 'text-positive' : 'text-negative'}>
                      {formatWalletAmount(item)}
                    </strong>
                    <span className={item.status === 'COMPLETED'
                      ? 'status-pill status-pill--positive'
                      : 'status-pill status-pill--pending'}>
                      {item.status}
                    </span>
                    <small>{formatWalletTime(item.createdAt)}</small>
                  </div>
                )
              })}
            </>
          )}
        </div>
      ) : null}

      {!collapsed && visiblePositions.length > 0 && active === 'open' ? (
        <div className="position-detail position-detail--live">
          <span className="position-detail__icon"><ShieldCheck size={15} /></span>
          <div className="position-detail__copy">
            <strong>Server positions</strong>
            <span>{visiblePositions.length} open · settlement is controlled by the trading engine</span>
          </div>
          <div className="position-detail__metrics">
            <span>Current <b>{formatPrice(currentPrice, currentPrice < 10 ? 5 : 2)}</b></span>
            <span>Market <b>{selectedSymbol}</b></span>
          </div>
        </div>
      ) : null}
    </section>
  )
}
