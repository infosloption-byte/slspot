import { CheckCircle2, ChevronDown, Minus, Plus, ShieldAlert, Timer, TrendingDown, TrendingUp, X } from 'lucide-react'
import { useState } from 'react'
import type { MarketAsset } from '../../data/mockMarket'

type TradePanelProps = { asset: MarketAsset }
type PreviewDirection = 'UP' | 'DOWN'
type OrderStage = 'draft' | 'confirming' | 'previewed'

const MIN_AMOUNT = 1
const MAX_AMOUNT = 100000
const MIN_DURATION = 5
const MAX_DURATION = 3600
const BALANCE = 12480.65
const PAYOUT_RATE = 0.82
const durations = [15, 30, 60, 300]

function formatDuration(value: number) {
  return value < 60 ? value + 's' : value / 60 + 'm'
}

export function TradePanel({ asset }: TradePanelProps) {
  const [amount, setAmount] = useState(50)
  const [duration, setDuration] = useState(60)
  const [durationOpen, setDurationOpen] = useState(false)
  const [direction, setDirection] = useState<PreviewDirection | null>(null)
  const [stage, setStage] = useState<OrderStage>('draft')
  const [error, setError] = useState('')
  const estimatedPayout = amount * PAYOUT_RATE
  const totalReturn = amount + estimatedPayout

  const validate = () => {
    if (!Number.isFinite(amount) || amount < MIN_AMOUNT || amount > MAX_AMOUNT) return 'Stake must be between $1 and $100,000.'
    if (!Number.isInteger(duration) || duration < MIN_DURATION || duration > MAX_DURATION) return 'Duration must be between 5 seconds and 60 minutes.'
    if (amount > BALANCE) return 'Stake exceeds the current demo balance.'
    return ''
  }

  const resetOrder = () => { setDirection(null); setStage('draft'); setError('') }
  const requestPreview = (nextDirection: PreviewDirection) => {
    const validationError = validate()
    if (validationError) { setError(validationError); setDirection(null); setStage('draft'); return }
    setError(''); setDirection(nextDirection); setStage('confirming')
  }
  const confirmPreview = () => { if (direction) setStage('previewed') }
  const adjustAmount = (delta: number) => {
    setAmount((current) => Math.max(MIN_AMOUNT, Math.min(MAX_AMOUNT, current + delta)))
    if (stage !== 'draft') resetOrder()
  }
  const chooseDuration = (value: number) => {
    setDuration(value); setDurationOpen(false)
    if (stage !== 'draft') resetOrder()
  }

  return (
    <>
      <section className="trade-dock panel" aria-label="Trade controls">
        <div className="trade-dock__balance"><span>Demo balance</span><strong>$12,480.65</strong></div>
        <div className="trade-dock__field">
          <label>Stake</label>
          <div className="trade-dock__stepper"><button type="button" onClick={() => adjustAmount(-10)} aria-label="Decrease stake"><Minus size={14} /></button><div><span>$</span><input value={amount} onChange={(event) => { setAmount(Number(event.target.value) || 0); resetOrder() }} type="number" inputMode="decimal" min={MIN_AMOUNT} max={MAX_AMOUNT} aria-label="Stake amount" /></div><button type="button" onClick={() => adjustAmount(10)} aria-label="Increase stake"><Plus size={14} /></button></div>
        </div>
        <div className="trade-dock__field trade-dock__field--duration">
          <label>Duration</label>
          <button className="trade-dock__select" type="button" onClick={() => setDurationOpen((open) => !open)} aria-expanded={durationOpen}><Timer size={14} /><strong>{formatDuration(duration)}</strong><ChevronDown size={13} /></button>
          {durationOpen && <div className="duration-popover" role="dialog" aria-label="Choose duration"><div className="duration-popover__header"><span>Expiry</span><button type="button" onClick={() => setDurationOpen(false)} aria-label="Close duration selector"><X size={13} /></button></div><div className="duration-popover__grid">{durations.map((value) => <button key={value} className={duration === value ? 'duration-option duration-option--active' : 'duration-option'} type="button" onClick={() => chooseDuration(value)}>{formatDuration(value)}</button>)}</div></div>}
        </div>
        <div className="trade-dock__payout"><span>Potential return</span><strong>+${estimatedPayout.toFixed(2)}</strong><small>82% demo rate · ${totalReturn.toFixed(2)} total</small></div>
        <div className="trade-dock__actions" aria-label="Trade direction">
          <button className="trade-dock__action trade-dock__action--up" type="button" onClick={() => requestPreview('UP')} disabled={stage === 'confirming' || Boolean(validate())}><TrendingUp size={18} /><span>UP</span><small>Higher</small></button>
          <button className="trade-dock__action trade-dock__action--down" type="button" onClick={() => requestPreview('DOWN')} disabled={stage === 'confirming' || Boolean(validate())}><TrendingDown size={18} /><span>DOWN</span><small>Lower</small></button>
        </div>
        <div className="trade-dock__caption"><span>{asset.symbol}</span><span><i className="live-dot" /> Demo pricing</span></div>
      </section>

      {error && <div className="trade-modal-backdrop"><div className="trade-modal trade-modal--error" role="alertdialog" aria-modal="true"><div className="trade-modal__icon"><ShieldAlert size={18} /></div><div><span>Check your trade</span><strong>{error}</strong></div><button className="icon-button" type="button" onClick={() => setError('')} aria-label="Close error"><X size={15} /></button></div></div>}

      {stage === 'confirming' && direction && <div className="trade-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) resetOrder() }}><div className="trade-modal" role="dialog" aria-modal="true" aria-label="Confirm demo trade"><div className="trade-modal__header"><div><span>Review trade</span><strong>{direction} · {asset.symbol}</strong></div><button className="icon-button" type="button" onClick={resetOrder} aria-label="Cancel"><X size={15} /></button></div><div className="trade-modal__summary"><div><span>Stake</span><strong>${amount.toFixed(2)}</strong></div><div><span>Duration</span><strong>{formatDuration(duration)}</strong></div><div><span>Payout</span><strong>82%</strong></div><div><span>Potential return</span><strong>+${estimatedPayout.toFixed(2)}</strong></div></div><p>This is a demo preview. No real order will be submitted.</p><div className="trade-modal__actions"><button type="button" className="confirmation-button confirmation-button--ghost" onClick={resetOrder}>Cancel</button><button type="button" className="confirmation-button confirmation-button--primary" onClick={confirmPreview}><CheckCircle2 size={14} /> Confirm preview</button></div></div></div>}

      {stage === 'previewed' && direction && <div className="trade-modal-backdrop"><div className="trade-modal trade-modal--success" role="status"><div className="trade-modal__icon"><CheckCircle2 size={18} /></div><div><span>Demo preview ready</span><strong>{direction} · {asset.symbol}</strong><p>No trade was submitted. Production orders will require server confirmation.</p></div><button className="confirmation-button confirmation-button--primary" type="button" onClick={resetOrder}>Done</button></div></div>}
    </>
  )
}
