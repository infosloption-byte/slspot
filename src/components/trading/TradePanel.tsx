import { Minus, Plus, ShieldAlert, Timer, TrendingDown, TrendingUp } from 'lucide-react'
import { useState } from 'react'

export function TradePanel() {
  const [amount, setAmount] = useState(50)
  const [duration, setDuration] = useState(60)

  const adjustAmount = (delta: number) => {
    setAmount((current) => Math.max(1, Math.min(100000, current + delta)))
  }

  return (
    <aside className="trade-panel panel">
      <div className="panel__header">
        <div>
          <div className="eyebrow">Execute</div>
          <h2>Order panel</h2>
        </div>
        <span className="demo-badge">Demo</span>
      </div>

      <div className="trade-balance-card">
        <div>
          <span>Trading balance</span>
          <strong>$12,480.65</strong>
        </div>
        <button type="button">Top up</button>
      </div>

      <div className="trade-field">
        <div className="trade-field__label"><span>Amount</span><small>USD</small></div>
        <div className="stepper">
          <button type="button" onClick={() => adjustAmount(-10)} aria-label="Decrease amount"><Minus size={15} /></button>
          <input value={amount} onChange={(event) => setAmount(Math.max(1, Number(event.target.value) || 1))} inputMode="decimal" aria-label="Trade amount" />
          <button type="button" onClick={() => adjustAmount(10)} aria-label="Increase amount"><Plus size={15} /></button>
        </div>
        <div className="trade-presets">
          {[10, 25, 50, 100].map((value) => (
            <button key={value} className={amount === value ? 'preset preset--active' : 'preset'} onClick={() => setAmount(value)} type="button">${value}</button>
          ))}
        </div>
      </div>

      <div className="trade-field">
        <div className="trade-field__label"><span>Duration</span><small>Expiry</small></div>
        <div className="duration-control">
          <button type="button" onClick={() => setDuration(Math.max(5, duration - 5))} aria-label="Decrease duration"><Minus size={15} /></button>
          <div><Timer size={16} /><strong>{duration}s</strong></div>
          <button type="button" onClick={() => setDuration(Math.min(3600, duration + 5))} aria-label="Increase duration"><Plus size={15} /></button>
        </div>
      </div>

      <div className="payout-box">
        <span>Indicative payout</span>
        <strong>+82%</strong>
        <small>This preview is non-executable.</small>
      </div>

      <div className="trade-actions">
        <button className="trade-action trade-action--up" type="button">
          <span><TrendingUp size={19} /> UP</span>
          <small>Higher</small>
        </button>
        <button className="trade-action trade-action--down" type="button">
          <span><TrendingDown size={19} /> DOWN</span>
          <small>Lower</small>
        </button>
      </div>

      <div className="risk-note">
        <ShieldAlert size={15} />
        <span>Live orders will be validated by the server. UI controls never authorize financial actions.</span>
      </div>
    </aside>
  )
}
