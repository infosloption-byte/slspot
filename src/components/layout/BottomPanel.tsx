import { ArrowDownToLine, ArrowUpRight, Clock3, History, WalletCards, X } from 'lucide-react'
import { useState } from 'react'

type TabId = 'open' | 'history' | 'wallet'

type Position = {
  id: string
  symbol: string
  side: 'UP' | 'DOWN'
  entry: string
  mark: string
  duration: string
  pnl: string
  positive: boolean
}

type HistoryItem = {
  id: string
  symbol: string
  side: 'UP' | 'DOWN'
  amount: string
  result: 'Won' | 'Lost'
  pnl: string
  time: string
}

type WalletItem = {
  id: string
  label: string
  type: 'Deposit' | 'Withdrawal' | 'Fee'
  amount: string
  status: 'Completed' | 'Pending'
  time: string
}

const positions: Position[] = [
  { id: 'SL-4821', symbol: 'BTC/USD', side: 'UP', entry: '113,841.60', mark: '113,842.12', duration: '00:42', pnl: '+$18.40', positive: true },
  { id: 'SL-4818', symbol: 'ETH/USD', side: 'DOWN', entry: '4,216.84', mark: '4,216.44', duration: '01:08', pnl: '-$4.60', positive: false },
]

const history: HistoryItem[] = [
  { id: 'SL-4809', symbol: 'SOL/USD', side: 'UP', amount: '$50.00', result: 'Won', pnl: '+$41.00', time: '2 min ago' },
  { id: 'SL-4802', symbol: 'BTC/USD', side: 'DOWN', amount: '$25.00', result: 'Lost', pnl: '-$25.00', time: '8 min ago' },
  { id: 'SL-4796', symbol: 'EUR/USD', side: 'UP', amount: '$100.00', result: 'Won', pnl: '+$82.00', time: '14 min ago' },
]

const wallet: WalletItem[] = [
  { id: 'W-102', label: 'Demo balance credit', type: 'Deposit', amount: '+$500.00', status: 'Completed', time: 'Today, 09:42' },
  { id: 'W-101', label: 'Demo withdrawal', type: 'Withdrawal', amount: '-$120.00', status: 'Pending', time: 'Yesterday, 18:20' },
  { id: 'W-099', label: 'Trading fee', type: 'Fee', amount: '-$2.40', status: 'Completed', time: 'Yesterday, 16:05' },
]

const tabs: { id: TabId; label: string; icon: typeof Clock3 }[] = [
  { id: 'open', label: 'Open positions', icon: Clock3 },
  { id: 'history', label: 'Trade history', icon: History },
  { id: 'wallet', label: 'Wallet activity', icon: WalletCards },
]

export function BottomPanel() {
  const [active, setActive] = useState<TabId>('open')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const closeDetails = () => setSelectedId(null)

  return (
    <section className="bottom-panel panel">
      <div className="bottom-panel__tabs">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button className={active === id ? 'bottom-tab bottom-tab--active' : 'bottom-tab'} key={id} onClick={() => { setActive(id); closeDetails() }} type="button">
            <Icon size={15} />
            {label}
            {id === 'open' && <span className="tab-count">{positions.length}</span>}
          </button>
        ))}
        <div className="bottom-panel__spacer" />
        <button className="bottom-link" type="button" title="Export current tab">
          <ArrowDownToLine size={14} /> Export
        </button>
      </div>

      {active === 'open' && (
        <div className="positions-table">
          <div className="position-row position-row--header">
            <span>Instrument</span><span>Side</span><span>Entry</span><span>Mark</span><span>Duration</span><span>P&amp;L</span><span />
          </div>
          {positions.map((position) => (
            <div className="position-row" key={position.id}>
              <span><strong>{position.symbol}</strong><small>Position #{position.id}</small></span>
              <span className={position.side === 'UP' ? 'side-pill side-pill--up' : 'side-pill side-pill--down'}>{position.side}</span>
              <span>{position.entry}</span><span>{position.mark}</span><span>{position.duration}</span>
              <span className={position.positive ? 'text-positive' : 'text-negative'}>{position.pnl}</span>
              <button className="row-action" type="button" title={'View position ' + position.id} onClick={() => setSelectedId(position.id)}>
                <ArrowUpRight size={14} /> Details
              </button>
            </div>
          ))}
        </div>
      )}

      {active === 'history' && (
        <div className="activity-table">
          <div className="activity-row activity-row--header"><span>Trade</span><span>Amount</span><span>Result</span><span>P&amp;L</span><span>Time</span></div>
          {history.map((item) => (
            <div className="activity-row" key={item.id}>
              <span><strong>{item.symbol}</strong><small>{item.side} · #{item.id}</small></span>
              <span>{item.amount}</span>
              <span className={item.result === 'Won' ? 'status-pill status-pill--positive' : 'status-pill status-pill--negative'}>{item.result}</span>
              <span className={item.result === 'Won' ? 'text-positive' : 'text-negative'}>{item.pnl}</span>
              <span>{item.time}</span>
            </div>
          ))}
        </div>
      )}

      {active === 'wallet' && (
        <div className="activity-table">
          <div className="activity-row activity-row--header"><span>Activity</span><span>Type</span><span>Amount</span><span>Status</span><span>Time</span></div>
          {wallet.map((item) => (
            <div className="activity-row" key={item.id}>
              <span><strong>{item.label}</strong><small>#{item.id}</small></span>
              <span>{item.type}</span>
              <span className={item.amount.startsWith('+') ? 'text-positive' : item.type === 'Fee' ? 'text-negative' : 'text-negative'}>{item.amount}</span>
              <span className={item.status === 'Completed' ? 'status-pill status-pill--positive' : 'status-pill status-pill--pending'}>{item.status}</span>
              <span>{item.time}</span>
            </div>
          ))}
        </div>
      )}

      {selectedId && (
        <div className="position-detail">
          <div><span>Selected position</span><strong>#{selectedId}</strong></div>
          <span className="position-detail__copy">Live position details are demo-only until server market data is connected.</span>
          <button className="icon-button" type="button" title="Close details" aria-label="Close details" onClick={closeDetails}><X size={15} /></button>
        </div>
      )}
    </section>
  )
}
