import { ArrowDownToLine, ChevronDown, ChevronUp, Clock3, History, ShieldCheck, TimerReset, WalletCards, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { OpenTrade } from '../../types/trading'
import { calculateTradePnl, tradeProgress, tradeRemainingSeconds } from '../../types/trading'
import { formatPrice } from '../../lib/format'
import { EmptyState } from '../ui/EmptyState'

type TabId = 'open' | 'history' | 'wallet'

type BottomPanelProps = {
  selectedSymbol: string
  currentPrice: number
  openTrades: OpenTrade[]
  settledTrades: OpenTrade[]
  now: number
  collapsed: boolean
  onToggle: () => void
  onCloseTrade: (tradeId: string) => void
}

const wallet = [
  { id: 'W-102', label: 'Demo balance credit', type: 'Deposit', amount: '+$500.00', status: 'Completed', time: 'Today, 09:42' },
  { id: 'W-101', label: 'Demo withdrawal', type: 'Withdrawal', amount: '-$120.00', status: 'Pending', time: 'Yesterday, 18:20' },
  { id: 'W-099', label: 'Trading fee', type: 'Fee', amount: '-$2.40', status: 'Completed', time: 'Yesterday, 16:05' },
]

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

export function BottomPanel({ selectedSymbol, currentPrice, openTrades, settledTrades, now, collapsed, onToggle, onCloseTrade }: BottomPanelProps) {
  const [active, setActive] = useState<TabId>('open')
  const visiblePositions = useMemo(() => openTrades.filter((trade) => trade.symbol === selectedSymbol), [openTrades, selectedSymbol])
  const visibleHistory = useMemo(() => settledTrades.filter((trade) => trade.symbol === selectedSymbol), [settledTrades, selectedSymbol])

  return (
    <section className={'bottom-panel' + (collapsed ? ' bottom-panel--collapsed' : '')}>
      <div className="bottom-panel__tabs">
        {tabs.map(({ id, label, icon: Icon }) => {
          const count = id === 'open' ? visiblePositions.length : id === 'history' ? visibleHistory.length : wallet.length
          return (
            <button key={id} className={active === id ? 'bottom-tab bottom-tab--active' : 'bottom-tab'} type="button" onClick={() => setActive(id)}>
              <Icon size={15} /><span>{label}</span><span className="tab-count">{count}</span>
            </button>
          )
        })}
        <div className="bottom-panel__spacer" />
        {!collapsed ? <button className="bottom-link" type="button" title="Export current tab"><ArrowDownToLine size={14} /><span>Export</span></button> : null}
        <button className="activity-toggle" type="button" onClick={onToggle} aria-expanded={!collapsed} title={collapsed ? 'Open activity' : 'Collapse activity'}>
          {collapsed ? <ChevronUp size={15} /> : <ChevronDown size={15} />}<span>{collapsed ? 'Activity' : 'Hide'}</span>
        </button>
      </div>

      {!collapsed && active === 'open' ? (
        <div className="positions-table">
          {visiblePositions.length === 0 ? (
            <EmptyState title={'No open position for ' + selectedSymbol} message="Place a demo trade to see the countdown and live P&L here." icon={<Clock3 size={18} />} />
          ) : (
            <>
              <div className="position-row position-row--header"><span>Instrument</span><span>Side</span><span>Entry</span><span>Current</span><span>Countdown</span><span>P&amp;L</span><span /></div>
              {visiblePositions.map((trade) => {
                const remaining = tradeRemainingSeconds(trade, now)
                const pnl = calculateTradePnl(trade, currentPrice)
                const progress = tradeProgress(trade, now)
                return (
                  <div className="position-row position-row--live" key={trade.id}>
                    <span><strong>{trade.symbol}</strong><small>#{trade.id}</small></span>
                    <span className={trade.direction === 'UP' ? 'side-pill side-pill--up' : 'side-pill side-pill--down'}>{trade.direction}</span>
                    <span>{formatPrice(trade.entryPrice, trade.entryPrice < 10 ? 5 : 2)}</span>
                    <span>{formatPrice(currentPrice, currentPrice < 10 ? 5 : 2)}</span>
                    <span className="countdown-cell"><strong>{formatCountdown(remaining)}</strong><span className="countdown-track"><i style={{ width: (100 - progress * 100) + '%' }} /></span></span>
                    <span className={pnl >= 0 ? 'text-positive' : 'text-negative'}>{pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}</span>
                    <button className="row-action row-action--icon" type="button" onClick={() => onCloseTrade(trade.id)} aria-label={'Close ' + trade.symbol + ' trade'} title="Close position"><X size={15} /></button>
                  </div>
                )
              })}
            </>
          )}
        </div>
      ) : null}

      {!collapsed && active === 'history' ? (
        <div className="activity-table">
          {visibleHistory.length === 0 ? (
            <EmptyState title="No settled trades yet" message="Closed and expired demo trades will appear here." icon={<TimerReset size={18} />} />
          ) : (
            <>
              <div className="activity-row activity-row--header"><span>Trade</span><span>Side</span><span>Amount</span><span>Result</span><span>P&amp;L</span></div>
              {visibleHistory.map((trade) => (
                <div className="activity-row" key={trade.id}>
                  <div><strong>{trade.symbol}</strong><small>#{trade.id}</small></div>
                  <span className={trade.direction === 'UP' ? 'side-label side-label--up' : 'side-label side-label--down'}>{trade.direction}</span>
                  <span>${trade.amount.toFixed(2)}</span>
                  <span className={trade.status === 'WON' ? 'status-pill status-pill--positive' : 'status-pill status-pill--negative'}>{trade.status}</span>
                  <strong className={trade.status === 'WON' ? 'text-positive' : 'text-negative'}>{trade.status === 'WON' ? '+' : '-'}${trade.status === 'WON' ? (trade.amount * trade.payoutRate).toFixed(2) : trade.amount.toFixed(2)}</strong>
                </div>
              ))}
            </>
          )}
        </div>
      ) : null}

      {!collapsed && active === 'wallet' ? (
        <div className="activity-table">
          <div className="activity-row activity-row--header"><span>Activity</span><span>Type</span><span>Amount</span><span>Status</span><span>Time</span></div>
          {wallet.map((item) => <div className="activity-row" key={item.id}><div><strong>{item.label}</strong><small>#{item.id}</small></div><span>{item.type}</span><strong className={item.amount.startsWith('+') ? 'text-positive' : 'text-negative'}>{item.amount}</strong><span className={item.status === 'Pending' ? 'status-pill status-pill--pending' : 'status-pill status-pill--positive'}>{item.status}</span><small>{item.time}</small></div>)}
        </div>
      ) : null}

      {!collapsed && visiblePositions.length > 0 && active === 'open' ? (
        <div className="position-detail position-detail--live">
          <span className="position-detail__icon"><ShieldCheck size={15} /></span>
          <div className="position-detail__copy"><strong>Live demo positions</strong><span>{visiblePositions.length} open · current price updates every second</span></div>
          <div className="position-detail__metrics">
            <span>Current <b>{formatPrice(currentPrice, currentPrice < 10 ? 5 : 2)}</b></span>
            <span>Market <b>{selectedSymbol}</b></span>
          </div>
        </div>
      ) : null}
    </section>
  )
}
