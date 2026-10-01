import { CheckCircle2, Minus, Plus, ShieldAlert, Timer, TrendingDown, TrendingUp, X } from 'lucide-react'
import { useState } from 'react'
import type { MarketAsset } from '../../data/mockMarket'
import { formatPrice } from '../../lib/format'

type TradePanelProps = { asset: MarketAsset }
type PreviewDirection = 'UP' | 'DOWN'
type OrderStage = 'draft' | 'confirming' | 'previewed'

const MIN_AMOUNT = 1
const MAX_AMOUNT = 100000
const MIN_DURATION = 5
const MAX_DURATION = 3600
const BALANCE = 12480.65
const PAYOUT_RATE = 0.82

export function TradePanel({ asset }: TradePanelProps) {
  const [amount, setAmount] = useState(50)
  const [duration, setDuration] = useState(60)
  const [direction, setDirection] = useState<PreviewDirection | null>(null)
  const [stage, setStage] = useState<OrderStage>('draft')
  const [error, setError] = useState('')
  const estimatedPayout = amount * PAYOUT_RATE
  const totalReturn = amount + estimatedPayout

  const validate = () => {
    if (!Number.isFinite(amount) || amount < MIN_AMOUNT || amount > MAX_AMOUNT) return 'Amount must be between $1 and $100,000.'
    if (!Number.isInteger(duration) || duration < MIN_DURATION || duration > MAX_DURATION) return 'Duration must be between 5 seconds and 60 minutes.'
    if (amount > BALANCE) return 'Amount exceeds the current demo balance.'
    return ''
  }

  const resetOrder = () => { setDirection(null); setStage('draft'); setError('') }
  const requestPreview = (nextDirection: PreviewDirection) => {
    const validationError = validate()
    if (validationError) { setError(validationError); setDirection(null); setStage('draft'); return }
    setError(''); setDirection(nextDirection); setStage('confirming')
  }
  const confirmPreview = () => { if (direction) setStage('previewed') }
  const adjustAmount = (delta: number) => { setAmount((current) => Math.max(MIN_AMOUNT, Math.min(MAX_AMOUNT, current + delta))); if (stage !== 'draft') resetOrder() }
  const adjustDuration = (delta: number) => { setDuration((current) => Math.max(MIN_DURATION, Math.min(MAX_DURATION, current + delta))); if (stage !== 'draft') resetOrder() }
  const chooseAmount = (value: number) => { setAmount(value); if (stage !== 'draft') resetOrder() }
  const chooseDuration = (value: number) => { setDuration(value); if (stage !== 'draft') resetOrder() }

  return (
    <aside className="trade-panel panel">
      <div className="panel__header trade-panel__header"><div><div className="eyebrow">Execute</div><h2>Order panel</h2></div><span className="demo-badge">Demo</span></div>
      <div className="trade-instrument">
        <span className={'trade-instrument__icon asset-icon--' + asset.accent}>{asset.symbol.slice(0, 1)}</span>
        <div><strong>{asset.symbol}</strong><span>{asset.name}</span></div>
        <small>{formatPrice(asset.price, asset.price < 10 ? 5 : 2)}</small>
      </div>
      <div className="trade-balance-card">
        <div><span>Trading balance</span><strong>$12,480.65</strong><small>Available demo funds</small></div>
        <button type="button" onClick={() => setError('Balance top-up will be connected after the wallet backend exists.')}>Top up</button>
      </div>
      <div className="trade-field">
        <div className="trade-field__label"><span>Stake amount</span><small>USD</small></div>
        <div className="stepper"><button type="button" onClick={() => adjustAmount(-10)} aria-label="Decrease amount"><Minus size={15} /></button><div className="stepper__value"><span>$</span><input value={amount} onChange={(event) => { setAmount(Number(event.target.value) || 0); resetOrder() }} inputMode="decimal" type="number" aria-label="Trade amount" min={MIN_AMOUNT} max={MAX_AMOUNT} /><small>stake</small></div><button type="button" onClick={() => adjustAmount(10)} aria-label="Increase amount"><Plus size={15} /></button></div>
        <div className="trade-presets" aria-label="Stake presets">{[10, 25, 50, 100].map((value) => <button key={value} className={amount === value ? 'preset preset--active' : 'preset'} onClick={() => chooseAmount(value)} type="button">${value}</button>)}</div>
      </div>
      <div className="trade-field trade-field--duration">
        <div className="trade-field__label"><span>Duration</span><small>Expiry</small></div>
        <div className="duration-control"><button type="button" onClick={() => adjustDuration(-5)} aria-label="Decrease duration"><Minus size={15} /></button><div><Timer size={15} /><strong>{duration < 60 ? duration + 's' : duration / 60 + 'm'}</strong></div><button type="button" onClick={() => adjustDuration(5)} aria-label="Increase duration"><Plus size={15} /></button></div>
      </div>
      <div className="duration-presets" aria-label="Duration presets">{[15, 30, 60, 300].map((value) => <button key={value} className={duration === value ? 'preset preset--active' : 'preset'} type="button" onClick={() => chooseDuration(value)}>{value < 60 ? value + 's' : value / 60 + 'm'}</button>)}</div>
      <div className="payout-box">
        <div className="payout-box__head"><span>Indicative payout</span><strong>82%</strong></div>
        <div className="payout-box__rows"><div><span>Stake</span><b>${amount.toFixed(2)}</b></div><div><span>Potential profit</span><b className="text-positive">+${estimatedPayout.toFixed(2)}</b></div><div><span>Total return</span><b>${totalReturn.toFixed(2)}</b></div></div>
        <small>Demo estimate. Production pricing and limits will come from the server.</small>
      </div>
      {error && <div className="trade-validation trade-validation--error" role="alert"><ShieldAlert size={14} /><span>{error}</span></div>}
      {stage === 'confirming' && direction && <div className="trade-confirmation"><div><span>Review before preview</span><strong>{direction} · {asset.symbol}</strong><small>${amount.toFixed(2)} stake · {duration < 60 ? duration + ' seconds' : duration / 60 + ' minutes'} · 82% payout</small></div><div className="trade-confirmation__actions"><button type="button" className="confirmation-button confirmation-button--ghost" onClick={resetOrder}><X size={14} /> Cancel</button><button type="button" className="confirmation-button confirmation-button--primary" onClick={confirmPreview}><CheckCircle2 size={14} /> Confirm preview</button></div></div>}
      {stage === 'previewed' && direction && <div className="trade-confirmation trade-confirmation--success" role="status"><CheckCircle2 size={17} /><div><strong>Demo preview ready</strong><span>No trade was submitted. Server confirmation will be required in production.</span></div><button type="button" className="confirmation-button confirmation-button--ghost" onClick={resetOrder}>Reset</button></div>}
      <div className="trade-actions" aria-label="Trade direction"><button className="trade-action trade-action--up" type="button" onClick={() => requestPreview('UP')} disabled={stage === 'confirming' || Boolean(validate())}><span><TrendingUp size={18} /> UP</span><small>Higher at expiry</small></button><button className="trade-action trade-action--down" type="button" onClick={() => requestPreview('DOWN')} disabled={stage === 'confirming' || Boolean(validate())}><span><TrendingDown size={18} /> DOWN</span><small>Lower at expiry</small></button></div>
      <div className="risk-note"><ShieldAlert size={15} /><span>Demo interface only. Real orders require authenticated server validation.</span></div>
    </aside>
  )
}
