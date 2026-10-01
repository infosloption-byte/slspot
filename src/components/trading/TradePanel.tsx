import { CheckCircle2, Minus, Plus, ShieldAlert, Timer, TrendingDown, TrendingUp, X } from 'lucide-react'
import { useState } from 'react'
import type { MarketAsset } from '../../data/mockMarket'
import { formatPrice } from '../../lib/format'

type TradePanelProps = {
  asset: MarketAsset
}

type PreviewDirection = 'UP' | 'DOWN'
type OrderStage = 'draft' | 'confirming' | 'previewed'

const MIN_AMOUNT = 1
const MAX_AMOUNT = 100000
const MIN_DURATION = 5
const MAX_DURATION = 3600

export function TradePanel({ asset }: TradePanelProps) {
  const [amount, setAmount] = useState(50)
  const [duration, setDuration] = useState(60)
  const [direction, setDirection] = useState<PreviewDirection | null>(null)
  const [stage, setStage] = useState<OrderStage>('draft')
  const [error, setError] = useState('')

  const validate = () => {
    if (!Number.isFinite(amount) || amount < MIN_AMOUNT || amount > MAX_AMOUNT) {
      return 'Amount must be between $1 and $100,000.'
    }

    if (!Number.isInteger(duration) || duration < MIN_DURATION || duration > MAX_DURATION) {
      return 'Duration must be between 5 seconds and 60 minutes.'
    }

    return ''
  }

  const requestPreview = (nextDirection: PreviewDirection) => {
    const validationError = validate()
    if (validationError) {
      setError(validationError)
      setDirection(null)
      setStage('draft')
      return
    }

    setError('')
    setDirection(nextDirection)
    setStage('confirming')
  }

  const confirmPreview = () => {
    if (!direction) {
      return
    }

    setStage('previewed')
  }

  const resetOrder = () => {
    setDirection(null)
    setStage('draft')
    setError('')
  }

  const adjustAmount = (delta: number) => {
    setAmount((current) => Math.max(MIN_AMOUNT, Math.min(MAX_AMOUNT, current + delta)))
    setError('')
    if (stage !== 'draft') {
      resetOrder()
    }
  }

  const adjustDuration = (delta: number) => {
    setDuration((current) => Math.max(MIN_DURATION, Math.min(MAX_DURATION, current + delta)))
    if (stage !== 'draft') {
      resetOrder()
    }
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

      <div className="trade-instrument">
        <span className="trade-instrument__icon">{asset.symbol.slice(0, 1)}</span>
        <div>
          <strong>{asset.symbol}</strong>
          <span>{asset.name}</span>
        </div>
        <small>{formatPrice(asset.price, asset.price < 10 ? 5 : 2)}</small>
      </div>

      <div className="trade-balance-card">
        <div>
          <span>Trading balance</span>
          <strong>$12,480.65</strong>
        </div>
        <button type="button" onClick={() => setError('Balance top-up will be connected after the wallet backend exists.')}>Top up</button>
      </div>

      <div className="trade-field">
        <div className="trade-field__label"><span>Amount</span><small>USD</small></div>
        <div className="stepper">
          <button type="button" onClick={() => adjustAmount(-10)} aria-label="Decrease amount"><Minus size={15} /></button>
          <input
            value={amount}
            onChange={(event) => {
              const next = Number(event.target.value)
              setAmount(Number.isFinite(next) ? next : 0)
              setError('')
              resetOrder()
            }}
            inputMode="decimal"
            aria-label="Trade amount"
            min={MIN_AMOUNT}
            max={MAX_AMOUNT}
          />
          <button type="button" onClick={() => adjustAmount(10)} aria-label="Increase amount"><Plus size={15} /></button>
        </div>
        <div className="trade-presets">
          {[10, 25, 50, 100].map((value) => (
            <button
              key={value}
              className={amount === value ? 'preset preset--active' : 'preset'}
              onClick={() => { setAmount(value); resetOrder() }}
              type="button"
            >
              ${value}
            </button>
          ))}
        </div>
      </div>

      <div className="trade-field">
        <div className="trade-field__label"><span>Duration</span><small>Expiry</small></div>
        <div className="duration-control">
          <button type="button" onClick={() => adjustDuration(-5)} aria-label="Decrease duration"><Minus size={15} /></button>
          <div><Timer size={16} /><strong>{duration}s</strong></div>
          <button type="button" onClick={() => adjustDuration(5)} aria-label="Increase duration"><Plus size={15} /></button>
        </div>
      </div>

      <div className="payout-box">
        <span>Indicative payout</span>
        <strong>+82%</strong>
        <small>Preview only. Server will provide authoritative pricing and limits.</small>
      </div>

      {error && (
        <div className="trade-validation trade-validation--error" role="alert">
          <ShieldAlert size={14} />
          <span>{error}</span>
        </div>
      )}

      {stage === 'confirming' && direction && (
        <div className="trade-confirmation">
          <div>
            <span>Review demo order</span>
            <strong>{direction} {asset.symbol}</strong>
            <small>${amount.toLocaleString()} · {duration}s</small>
          </div>
          <div className="trade-confirmation__actions">
            <button type="button" className="confirmation-button confirmation-button--ghost" onClick={resetOrder}>
              <X size={14} /> Cancel
            </button>
            <button type="button" className="confirmation-button confirmation-button--primary" onClick={confirmPreview}>
              <CheckCircle2 size={14} /> Confirm preview
            </button>
          </div>
        </div>
      )}

      {stage === 'previewed' && direction && (
        <div className="trade-confirmation trade-confirmation--success" role="status">
          <CheckCircle2 size={17} />
          <div>
            <strong>Demo preview ready</strong>
            <span>No trade was submitted. The production flow will require server confirmation and idempotency.</span>
          </div>
          <button type="button" className="confirmation-button confirmation-button--ghost" onClick={resetOrder}>Reset</button>
        </div>
      )}

      <div className="trade-actions">
        <button
          className="trade-action trade-action--up"
          type="button"
          onClick={() => requestPreview('UP')}
          disabled={stage === 'confirming'}
        >
          <span><TrendingUp size={19} /> UP</span>
          <small>Higher</small>
        </button>
        <button
          className="trade-action trade-action--down"
          type="button"
          onClick={() => requestPreview('DOWN')}
          disabled={stage === 'confirming'}
        >
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
