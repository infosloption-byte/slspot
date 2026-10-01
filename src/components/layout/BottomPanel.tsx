import { ArrowDownToLine, ArrowUpRight, Clock3, History, WalletCards } from 'lucide-react'
import { useState } from 'react'

const tabs = [
  { id: 'open', label: 'Open positions', icon: Clock3 },
  { id: 'history', label: 'Trade history', icon: History },
  { id: 'wallet', label: 'Wallet activity', icon: WalletCards },
]

export function BottomPanel() {
  const [active, setActive] = useState('open')

  return (
    <section className="bottom-panel panel">
      <div className="bottom-panel__tabs">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button className={active === id ? 'bottom-tab bottom-tab--active' : 'bottom-tab'} key={id} onClick={() => setActive(id)} type="button">
            <Icon size={15} />
            {label}
            {id === 'open' && <span className="tab-count">2</span>}
          </button>
        ))}
        <div className="bottom-panel__spacer" />
        <button className="bottom-link" type="button"><ArrowDownToLine size={14} /> Export</button>
      </div>

      <div className="positions-table">
        <div className="position-row position-row--header">
          <span>Instrument</span>
          <span>Side</span>
          <span>Entry</span>
          <span>Mark</span>
          <span>Duration</span>
          <span>P&amp;L</span>
          <span />
        </div>
        <div className="position-row">
          <span><strong>BTC/USD</strong><small>Position #SL-4821</small></span>
          <span className="side-pill side-pill--up">UP</span>
          <span>113,841.60</span>
          <span>113,842.12</span>
          <span>00:42</span>
          <span className="text-positive">+$18.40</span>
          <button className="row-action" type="button"><ArrowUpRight size={14} /> Details</button>
        </div>
        <div className="position-row">
          <span><strong>ETH/USD</strong><small>Position #SL-4818</small></span>
          <span className="side-pill side-pill--down">DOWN</span>
          <span>4,216.84</span>
          <span>4,216.44</span>
          <span>01:08</span>
          <span className="text-negative">-$4.60</span>
          <button className="row-action" type="button"><ArrowUpRight size={14} /> Details</button>
        </div>
      </div>
    </section>
  )
}
