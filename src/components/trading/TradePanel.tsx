import { CheckCircle2, Minus, Plus, ShieldAlert, TrendingDown, TrendingUp, X } from 'lucide-react'
import { useEffect, useState } from 'react'
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
const quickAmounts = [10, 50, 100, 500]

function formatDuration(value: number) {
  return value < 60 ? value + 's' : value / 60 + 'm'
}

export function TradePanel({ asset }: TradePanelProps) {
  const [amount, setAmount] = useState(50)
  const [duration, setDuration] = useState(60)
  const [direction, setDirection] = useState<PreviewDirection | null>(null)
  const [stage, setStage] = useState<OrderStage>('draft')
  const [error, setError] = useState('')
  const estimatedPayout = amount * PAYOUT_RATE
  const totalReturn = amount + estimatedPayout

  const validate = () => {
    if (!Number.isFinite(amount) || amount < MIN_AMOUNT || amount > MAX_AMOUNT) return 'Investment must be between $1 and $100,000.'
    if (!Number.isInteger(duration) || duration < MIN_DURATION || duration > MAX_DURATION) return 'Time must be between 5 seconds and 60 minutes.'
    if (amount > BALANCE) return 'Investment exceeds the current demo balance.'
    return ''
  }

  useEffect(() => {
    if (stage !== 'confirming' && !error) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (stage === 'confirming') {
        setDirection(null)
        setStage('draft')
      }
      if (error) setError('')
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [stage, error])

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
  const chooseAmount = (value: number) => {
    setAmount(value)
    if (stage !== 'draft') resetOrder()
  }
  const chooseDuration = (value: number) => {
    setDuration(value)
    if (stage !== 'draft') resetOrder()
  }

  return (
    <>
      <aside className="trade-panel" aria-label="Trade controls">
        <div className="trade-panel__head">
          <div>
            <span className="trade-panel__label">Trading</span>
            <strong>{asset.symbol}</strong>
          </div>
          <div className="trade-panel__rate">
            <strong>{Math.round(PAYOUT_RATE * 100)}%</strong>
            <span>Payout</span>
          </div>
        </div>

        <div className="trade-field">
          <span className="trade-field__label">Time</span>
          <div className="segmented" role="group" aria-label="Trade time">
            {durations.map((value) => (
              <button
                key={value}
                type="button"
                className={duration === value ? 'segmented__item segmented__item--active' : 'segmented__item'}
                onClick={() => chooseDuration(value)}
                aria-pressed={duration === value}
              >
                {formatDuration(value)}
              </button>
            ))}
          </div>
        </div>

        <div className="trade-field">
          <label className="trade-field__label" htmlFor="trade-amount">Investment</label>
          <div className="stepper">
            <button type="button" onClick={() => adjustAmount(-10)} aria-label="Decrease investment"><Minus size={16} /></button>
            <div className="stepper__value">
              <span>$</span>
              <input
                id="trade-amount"
                value={amount}
                onChange={(event) => { setAmount(Number(event.target.value) || 0); resetOrder() }}
                type="number"
                inputMode="decimal"
                min={MIN_AMOUNT}
                max={MAX_AMOUNT}
                aria-label="Investment amount"
              />
            </div>
            <button type="button" onClick={() => adjustAmount(10)} aria-label="Increase investment"><Plus size={16} /></button>
          </div>
          <div className="chips">
            {quickAmounts.map((value) => (
              <button key={value} type="button" className={amount === value ? 'chip chip--active' : 'chip'} onClick={() => chooseAmount(value)}>
                ${value}
              </button>
            ))}
          </div>
        </div>

        <div className="payout-card">
          <div><span>Your payout</span><strong>${totalReturn.toFixed(2)}</strong></div>
          <div><span>Profit</span><strong className="text-positive">+${estimatedPayout.toFixed(2)}</strong></div>
        </div>

        <div className="trade-actions" aria-label="Trade direction">
          <button className="trade-btn trade-btn--up" type="button" onClick={() => requestPreview('UP')} disabled={stage === 'confirming'}>
            <TrendingUp size={20} strokeWidth={2.4} />
            <span>UP</span>
          </button>
          <button className="trade-btn trade-btn--down" type="button" onClick={() => requestPreview('DOWN')} disabled={stage === 'confirming'}>
            <TrendingDown size={20} strokeWidth={2.4} />
            <span>DOWN</span>
          </button>
        </div>

        <p className="trade-panel__note"><i className="live-dot" /> Demo pricing · no real orders are placed</p>
      </aside>

      {error && (
        <div className="trade-modal-backdrop">
          <div className="trade-modal trade-modal--error" role="alertdialog" aria-modal="true">
            <div className="trade-modal__icon"><ShieldAlert size={18} /></div>
            <div><span>Check your trade</span><strong>{error}</strong></div>
            <button className="icon-button" type="button" onClick={() => setError('')} aria-label="Close error"><X size={16} /></button>
          </div>
        </div>
      )}

      {stage === 'confirming' && direction && (
        <div className="trade-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) resetOrder() }}>
          <div className="trade-modal" role="dialog" aria-modal="true" aria-label="Confirm demo trade">
            <div className="trade-modal__header">
              <div><span>Review trade</span><strong>{direction} · {asset.symbol}</strong></div>
              <button className="icon-button" type="button" onClick={resetOrder} aria-label="Cancel"><X size={16} /></button>
            </div>
            <div className="trade-modal__summary">
              <div><span>Investment</span><strong>${amount.toFixed(2)}</strong></div>
              <div><span>Time</span><strong>{formatDuration(duration)}</strong></div>
              <div><span>Payout</span><strong>{Math.round(PAYOUT_RATE * 100)}%</strong></div>
              <div><span>Profit</span><strong className="text-positive">+${estimatedPayout.toFixed(2)}</strong></div>
            </div>
            <p>This is a demo preview. No real order will be submitted.</p>
            <div className="trade-modal__actions">
              <button type="button" className="btn btn--ghost" onClick={resetOrder}>Cancel</button>
              <button type="button" className="btn btn--primary" onClick={confirmPreview}><CheckCircle2 size={16} /> Confirm</button>
            </div>
          </div>
        </div>
      )}

      {stage === 'previewed' && direction && (
        <div className="trade-modal-backdrop">
          <div className="trade-modal trade-modal--success" role="status">
            <div className="trade-modal__icon"><CheckCircle2 size={18} /></div>
            <div>
              <span>Demo preview ready</span>
              <strong>{direction} · {asset.symbol}</strong>
              <p>No trade was submitted. Production orders will require server confirmation.</p>
            </div>
            <button className="btn btn--primary" type="button" onClick={resetOrder}>Done</button>
          </div>
        </div>
      )}
    </>
  )
}
