import {
  ArrowDownToLine,
  CalendarDays,
  Check,
  ChevronDown,
  Clock3,
  History,
  RotateCcw,
  Search,
  TimerReset,
  WalletCards,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { TradeHistoryFilters } from '../../api/trades'
import type { WalletTransaction } from '../../api/wallet'
import type { OpenTrade } from '../../types/trading'
import { tradeProgress, tradeRemainingSeconds } from '../../types/trading'
import { formatPrice } from '../../lib/format'
import { EmptyState } from '../ui/EmptyState'
import { Modal } from '../ui/Modal'
import { Pagination } from '../ui/Pagination'
import { ConfirmDialog } from '../ui/ConfirmDialog'

export type ActivityTab = 'open' | 'history' | 'wallet'

type BottomPanelProps = {
  /** Latest price per symbol, so every open position shows its own market's price. */
  priceBySymbol: Record<string, number>
  openTrades: OpenTrade[]
  openLoading?: boolean
  openError?: string | null
  onOpenRetry?: () => void
  onCancelTrade: (tradeId: string) => Promise<void>
  onSettleTrade: (tradeId: string) => Promise<void>
  walletLoading?: boolean
  walletError?: string | null
  onWalletRetry?: () => void
  settledTrades: OpenTrade[]
  walletTransactions: WalletTransaction[]
  now: number
  open: boolean
  onClose: () => void
  tab: ActivityTab
  onTabChange: (tab: ActivityTab) => void
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

type BottomThemedSelectProps = {
  label: string
  value: string
  options: Array<{ value: string; label: string }>
  onChange: (value: string) => void
}

function BottomThemedSelect({ label, value, options, onChange }: BottomThemedSelectProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const selected = options.find((option) => option.value === value) ?? options[0]

  useEffect(() => {
    if (!open) return undefined

    const handlePointerDown = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false)
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  return (
    <div className="trade-history-control" ref={rootRef}>
      <span>{label}</span>
      <div className="trade-history-select">
        <button
          type="button"
          className={open ? 'trade-history-select__trigger trade-history-select__trigger--open' : 'trade-history-select__trigger'}
          aria-haspopup="listbox"
          aria-expanded={open}
          onClick={() => setOpen((current) => !current)}
        >
          <span>{selected?.label ?? 'Select'}</span>
          <ChevronDown size={14} aria-hidden="true" />
        </button>
        {open ? (
          <div className="trade-history-select__menu" role="listbox" aria-label={label}>
            {options.map((option) => (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={option.value === value}
                className={option.value === value ? 'trade-history-select__option trade-history-select__option--active' : 'trade-history-select__option'}
                onClick={() => {
                  onChange(option.value)
                  setOpen(false)
                }}
              >
                <span>{option.label}</span>
                {option.value === value ? <Check size={13} aria-hidden="true" /> : null}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  )
}

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
  priceBySymbol,
  openTrades,
  openLoading = false,
  openError = null,
  onOpenRetry,
  onCancelTrade,
  onSettleTrade,
  walletLoading = false,
  walletError = null,
  onWalletRetry,
  settledTrades,
  walletTransactions,
  now,
  open,
  onClose,
  tab: active,
  onTabChange: setActive,
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
  const [confirmAction, setConfirmAction] = useState<{ type: 'cancel' | 'settle'; tradeId: string } | null>(null)
  const [actionBusy, setActionBusy] = useState(false)

  const confirmLabel = confirmAction?.type === 'cancel' ? 'Cancel trade' : 'Settle trade'
  const confirmMessage = confirmAction?.type === 'cancel'
    ? 'Cancel this trade before expiry? The held stake will be returned to your available balance. The opening fee remains charged.'
    : 'Settle this expired trade now using the current server market price?'

  const handleConfirm = async () => {
    if (!confirmAction || actionBusy) return
    setActionBusy(true)
    try {
      if (confirmAction.type === 'cancel') await onCancelTrade(confirmAction.tradeId)
      else await onSettleTrade(confirmAction.tradeId)
      setConfirmAction(null)
    } finally {
      setActionBusy(false)
    }
  }

  useEffect(() => {
    if (!open) {
      setConfirmAction(null)
      setActionBusy(false)
    }
  }, [open])

  // Every open position is shown whichever market is selected on the chart.
  const visiblePositions = openTrades

  const visibleHistory = useMemo(
    () => settledTrades,
    [settledTrades],
  )

  const visibleWallet = useMemo(
    () => walletTransactions.slice(0, 25),
    [walletTransactions],
  )

  return (
    <Modal open={open} onClose={onClose} title="Trading activity" size="xl" flush closeLabel="Close trading activity">
    <section className="bottom-panel">
      <div className="bottom-panel__tabs" role="tablist">
        {tabs.map(({ id, label, icon: Icon }) => {
          const count = id === 'open'
            ? visiblePositions.length
            : id === 'history'
              ? historyTotal
              : visibleWallet.length

          return (
            <button
              key={id}
              className={active === id ? 'bottom-tab bottom-tab--active' : 'bottom-tab'}
              role="tab"
              aria-selected={active === id}
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

        <button
          className="bottom-link"
          type="button"
          title={active === 'history' ? 'Export trade history CSV' : 'Export is available for trade history'}
          onClick={active === 'history' ? onHistoryExport : undefined}
          disabled={active !== 'history' || historyExporting || historyLoading}
        >
          <ArrowDownToLine size={14} />
          <span>{active === 'history' && historyExporting ? 'Exporting…' : 'Export'}</span>
        </button>
      </div>

      {active === 'open' ? (
        <div className="positions-table">
          {openError && visiblePositions.length > 0 ? (
            <div className="trade-history-error" role="alert">
              <strong>Positions refresh failed.</strong>
              <span>{openError}</span>
              {onOpenRetry ? <button type="button" className="quiet-button" onClick={onOpenRetry}>Retry</button> : null}
            </div>
          ) : null}
          {visiblePositions.length === 0 && openLoading ? (
            <div className="trade-history-state" role="status">
              <span className="loading-spinner" aria-hidden="true" />
              <strong>Loading open positions…</strong>
            </div>
          ) : visiblePositions.length === 0 && openError ? (
            <div className="trade-history-state trade-history-state--error" role="alert">
              <strong>Unable to load open positions</strong>
              <span>{openError}</span>
              {onOpenRetry ? <button type="button" className="quiet-button" onClick={onOpenRetry}>Retry</button> : null}
            </div>
          ) : visiblePositions.length === 0 ? (
            <EmptyState
              title="No open positions"
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
                const currentPrice = priceBySymbol[trade.symbol]
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
                    <span>{currentPrice !== undefined && currentPrice > 0 ? formatPrice(currentPrice, currentPrice < 10 ? 5 : 2) : '—'}</span>
                    <span className="countdown-cell">
                      <strong>{formatCountdown(remaining)}</strong>
                      <span className="countdown-track">
                        <i style={{ width: (100 - progress * 100) + '%' }} />
                      </span>
                    </span>
                    <span className="status-pill status-pill--pending">Unsettled</span>
                    <span className="position-row__action">
                      {remaining > 0 ? (
                        <button type="button" className="quiet-button position-cancel-button" onClick={() => setConfirmAction({ type: "cancel", tradeId: trade.id })} disabled={actionBusy}>Cancel</button>
                      ) : (
                        <button type="button" className="quiet-button position-settle-button" onClick={() => setConfirmAction({ type: "settle", tradeId: trade.id })} disabled={actionBusy}>Settle</button>
                      )}
                    </span>
                  </div>
                )
              })}
            </>
          )}
        </div>
      ) : null}

      {active === 'history' ? (
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

            <BottomThemedSelect
              label="Status"
              value={historyFilters.status}
              options={[
                { value: '', label: 'All settled' },
                { value: 'WON', label: 'Won' },
                { value: 'LOST', label: 'Lost' },
                { value: 'DRAW', label: 'Draw' },
                { value: 'CANCELLED', label: 'Cancelled' },
                { value: 'EXPIRED', label: 'Expired' },
              ]}
              onChange={(value) => onHistoryFiltersChange({ status: value as TradeHistoryFilters['status'] })}
            />

            <BottomThemedSelect
              label="Pair"
              value={historyFilters.assetId}
              options={[
                { value: '', label: 'All pairs' },
                ...historyAssets.map((asset) => ({ value: asset.id, label: asset.symbol })),
              ]}
              onChange={(value) => onHistoryFiltersChange({ assetId: value })}
            />

            <BottomThemedSelect
              label="Direction"
              value={historyFilters.direction}
              options={[
                { value: '', label: 'Both' },
                { value: 'UP', label: 'UP' },
                { value: 'DOWN', label: 'DOWN' },
              ]}
              onChange={(value) => onHistoryFiltersChange({ direction: value as TradeHistoryFilters['direction'] })}
            />

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

            <BottomThemedSelect
              label="Sort"
              value={historyFilters.sortBy + '_' + historyFilters.sortOrder}
              options={[
                { value: 'openedAt_desc', label: 'Newest' },
                { value: 'openedAt_asc', label: 'Oldest' },
                { value: 'amount_desc', label: 'Amount: high to low' },
                { value: 'amount_asc', label: 'Amount: low to high' },
                { value: 'netPnl_desc', label: 'P&L: high to low' },
                { value: 'netPnl_asc', label: 'P&L: low to high' },
                { value: 'closedAt_desc', label: 'Closed: newest first' },
                { value: 'closedAt_asc', label: 'Closed: oldest first' },
              ]}
              onChange={(value) => {
                const [sortBy, sortOrder] = value.split('_') as [
                  TradeHistoryFilters['sortBy'],
                  TradeHistoryFilters['sortOrder'],
                ]
                onHistoryFiltersChange({ sortBy, sortOrder })
              }}
            />

            <button className="quiet-button trade-history-reset" type="button" onClick={onHistoryReset}>
              <RotateCcw size={14} />
              <span>Reset</span>
            </button>

            <button
              className="quiet-button trade-history-export"
              type="button"
              onClick={onHistoryExport}
              disabled={historyExporting || historyLoading}
            >
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
                  <span>{'$'}{trade.amount.toFixed(2)}</span>
                  <span>{formatPrice(trade.entryPrice, trade.entryPrice < 10 ? 5 : 2)}</span>
                  <span>{trade.exitPrice === undefined ? '—' : formatPrice(trade.exitPrice, trade.exitPrice < 10 ? 5 : 2)}</span>
                  <span className={
                    trade.status === 'WON'
                      ? 'status-pill status-pill--positive'
                      : trade.status === 'LOST'
                        ? 'status-pill status-pill--negative'
                        : trade.status === 'DRAW'
                          ? 'status-pill status-pill--draw'
                          : 'status-pill status-pill--pending'
                  }>
                    {trade.status}
                  </span>
                  <strong className={trade.netPnl !== undefined && trade.netPnl < 0 ? 'text-negative' : 'text-positive'}>
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

      {active === 'wallet' ? (
        <div className="activity-table">
          {visibleWallet.length === 0 && walletLoading ? (
            <div className="trade-history-state" role="status">
              <span className="loading-spinner" aria-hidden="true" />
              <strong>Loading wallet activity…</strong>
            </div>
          ) : visibleWallet.length === 0 && walletError ? (
            <div className="trade-history-state trade-history-state--error" role="alert">
              <strong>Unable to load wallet activity</strong>
              <span>{walletError}</span>
              {onWalletRetry ? <button type="button" className="quiet-button" onClick={onWalletRetry}>Retry</button> : null}
            </div>
          ) : visibleWallet.length === 0 ? (
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
    </section>

    <ConfirmDialog
      open={Boolean(confirmAction)}
      title={confirmLabel}
      message={confirmMessage}
      confirmLabel={confirmLabel}
      cancelLabel="Keep trade"
      busy={actionBusy}
      onConfirm={() => void handleConfirm()}
      onClose={() => { if (!actionBusy) setConfirmAction(null) }}
    />
    </Modal>
  )
}
