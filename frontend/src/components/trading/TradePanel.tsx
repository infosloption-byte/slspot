import { ChevronDown, Minus, Plus, RefreshCcw, ShieldAlert, Timer, TrendingDown, TrendingUp, Volume2, VolumeX, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { MarketAsset } from '../../data/mockMarket'
import type { TradeDirection } from '../../types/trading'
import type { WalletMode } from '../../hooks/useWalletMode'
import { ApiError } from '../../api/client'
import type { TradeCreateResult } from '../../api/trades'
import { Modal } from '../ui/Modal'

type TradePanelProps = {
  asset: MarketAsset
  soundEnabled: boolean
  balance: number
  walletMode: WalletMode
  canTrade: boolean
  tradeDisabledReason?: string | null
  onToggleSound: () => void
  onOpenTrade: (trade: { direction: TradeDirection; amount: number; durationSeconds: number; entryPrice: number; payoutRate: number; clientRequestId: string }) => Promise<TradeCreateResult>
}

type OrderStage = 'draft' | 'submitting' | 'pending' | 'accepted' | 'open' | 'rejected' | 'failed'
type FailedTradeRequest = { direction: TradeDirection; clientRequestId: string }

function formatDuration(value: number) {
  return value < 60 ? value + 's' : value / 60 + 'm'
}

export function TradePanel({ asset, balance, walletMode, canTrade, tradeDisabledReason, soundEnabled, onToggleSound, onOpenTrade }: TradePanelProps) {
  const [amount, setAmount] = useState(Math.min(50, asset.maxAmount))
  const [duration, setDuration] = useState(asset.durationsSeconds[0] ?? 60)
  const [durationOpen, setDurationOpen] = useState(false)
  const [stage, setStage] = useState<OrderStage>('draft')
  const [error, setError] = useState('')
  const [lastOrder, setLastOrder] = useState<TradeCreateResult | null>(null)
  const [mobileConfigOpen, setMobileConfigOpen] = useState(false)
  const [mobileDurationOpen, setMobileDurationOpen] = useState(false)
  const [failedRequest, setFailedRequest] = useState<FailedTradeRequest | null>(null)
  const [now, setNow] = useState<number | null>(null)
  const durationRef = useRef<HTMLDivElement>(null)
  const payoutRate = Number(asset.payoutRate)
  const estimatedPayout = amount * payoutRate
  const feeRate = Number(asset.feeRate)
  const estimatedFee = Number.isFinite(feeRate) && feeRate > 0 ? amount * feeRate : 0
  const totalReturn = amount + estimatedPayout - estimatedFee
  const expiryPreview = now === null ? null : new Date(now + duration * 1000)

  useEffect(() => {
    const updateClock = () => setNow(Date.now())
    const timer = window.setInterval(updateClock, 1000)
    return () => window.clearInterval(timer)
  }, [])

  const validate = () => {
    if (!Number.isFinite(amount) || amount < asset.minAmount || amount > asset.maxAmount) {
      return 'Stake must be between ' + formatCurrency(asset.minAmount, asset.quoteCurrency) + ' and ' + formatCurrency(asset.maxAmount, asset.quoteCurrency) + '.'
    }
    if (!asset.durationsSeconds.includes(duration)) {
      return 'That duration is not currently allowed for this market.'
    }
    if (!Number.isFinite(balance) || amount > balance) {
      return 'Stake exceeds the available server balance.'
    }
    if (!canTrade) {
      return tradeDisabledReason ?? 'Trading is not currently enabled for this wallet.'
    }
    if (walletMode === 'REAL' && !asset.tradingEnabled) {
      return 'This market is currently unavailable for real-money trading.'
    }
    return ''
  }
  useEffect(() => {
    if (!durationOpen && stage !== 'submitting' && !error) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (durationOpen) setDurationOpen(false)
      if (stage === 'submitting') return
      if (error) setError('')
    }
    const handlePointerDown = (event: PointerEvent) => {
      if (durationOpen && durationRef.current && !durationRef.current.contains(event.target as Node)) setDurationOpen(false)
    }
    document.addEventListener('keydown', handleKeyDown)
    document.addEventListener('pointerdown', handlePointerDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('pointerdown', handlePointerDown)
    }
  }, [durationOpen, stage, error])

  const resetOrder = () => {
    setStage('draft')
    setError('')
  }

  const requestPreview = async (nextDirection: TradeDirection, clientRequestId?: string) => {
    const requestId = clientRequestId ?? crypto.randomUUID()
    const validationError = validate()
    if (validationError) {
      setError(validationError)
      setStage('draft')
      return
    }

    setError('')
    setStage('submitting')

    try {
      const result = await onOpenTrade({ direction: nextDirection,
        amount,
        durationSeconds: duration,
        entryPrice: asset.price,
        payoutRate,
        clientRequestId: requestId,
      })
      setLastOrder(result)
      setFailedRequest(null)
      setStage(result.orderStatus === 'PENDING' ? 'pending' : result.orderStatus === 'ACCEPTED' ? 'accepted' : 'open')
      window.setTimeout(() => setStage('draft'), 1600)
    } catch (error) {
      const rejected = error instanceof ApiError && error.code === 'ORDER_REJECTED'
      const message = rejected
        ? 'Trade rejected: ' + error.message
        : error instanceof Error ? error.message : 'Trade submission failed'
      setError(message)
      setFailedRequest(rejected ? null : { direction: nextDirection, clientRequestId: requestId })
      setStage(rejected ? 'rejected' : 'failed')
      window.setTimeout(() => setStage('draft'), 2200)
    }
  }

  const adjustAmount = (delta: number) => {
    setAmount((current) => Math.max(asset.minAmount, Math.min(asset.maxAmount, current + delta)))
    if (stage !== 'draft') resetOrder()
  }

  const chooseDuration = (value: number) => {
    setDuration(value)
    setDurationOpen(false)
    if (stage !== 'draft') resetOrder()
  }

  const renderActions = (mobile = false) => (
    <div className={mobile ? 'trade-actions trade-actions--mobile' : 'trade-actions'} aria-label="Trade direction">
      <button className="trade-btn trade-btn--up" type="button" onClick={() => void requestPreview('UP')} disabled={stage === 'submitting' || !canTrade || balance <= 0}>
        <TrendingUp size={18} />
        <span>UP</span>
        {!mobile ? <small>Higher</small> : null}
      </button>
      <button className="trade-btn trade-btn--down" type="button" onClick={() => void requestPreview('DOWN')} disabled={stage === 'submitting' || !canTrade || balance <= 0}>
        <TrendingDown size={18} />
        <span>DOWN</span>
        {!mobile ? <small>Lower</small> : null}
      </button>
    </div>
  )

  return (
    <>
      <aside className="trade-panel" aria-label="Trade controls">
        {stage !== 'draft' || lastOrder ? (
          <div className={'trade-state-banner trade-state-banner--' + stage} role="status">
            <span>{stage === 'submitting' ? 'Submitting order…' : stage === 'accepted' ? 'Order accepted' : stage === 'open' ? 'Trade open' : stage === 'rejected' ? 'Order rejected' : stage === 'failed' ? 'Order failed' : lastOrder?.status ?? 'Ready'}</span>
            {lastOrder ? <small>{lastOrder.tradeId} · {lastOrder.orderStatus}</small> : null}
          </div>
        ) : null}

        <div className="trade-panel__head">
          <div>
            <span className="trade-panel__label">Server account</span>
            <strong>{asset.symbol}</strong>
          </div>
          <div className="trade-panel__rate">
            <strong>{asset.payout}%</strong>
            <span>payout</span>
          </div>
        </div>

        <div className="trade-panel__desktop-content">
          <div className="trade-field">
            <span className="trade-field__label">Stake · {asset.quoteCurrency}</span>
            <div className="stepper">
              <button type="button" onClick={() => adjustAmount(-10)} aria-label="Decrease stake"><Minus size={17} /></button>
              <div className="stepper__value"><span>{asset.quoteCurrency}</span><input value={amount} onChange={(event) => { setAmount(Number(event.target.value) || 0); resetOrder() }} type="number" inputMode="decimal" min={asset.minAmount} max={asset.maxAmount} aria-label="Stake amount" /></div>
              <button type="button" onClick={() => adjustAmount(10)} aria-label="Increase stake"><Plus size={17} /></button>
            </div>
            <div className="chips">
              {[25, 50, 100, 250].map((value) => <button key={value} type="button" className={amount === value ? 'chip chip--active' : 'chip'} onClick={() => { setAmount(value); resetOrder() }}>{formatCurrency(value, asset.quoteCurrency)}</button>)}
            </div>
          </div>

          <div className="trade-field">
            <span className="trade-field__label">Duration</span>
            <div className="duration-control" ref={durationRef}>
              <button className="duration-control__button" type="button" onClick={() => setDurationOpen((open) => !open)} aria-expanded={durationOpen} aria-haspopup="dialog">
                <Timer size={16} />
                <strong>{formatDuration(duration)}</strong>
                <ChevronDown size={14} />
              </button>
              {durationOpen ? (
                <div className="duration-popover duration-popover--panel" role="dialog" aria-label="Choose duration">
                  <div className="duration-popover__header"><span>Expiry</span><button type="button" onClick={() => setDurationOpen(false)} aria-label="Close duration selector"><X size={14} /></button></div>
                  <div className="duration-popover__grid">{asset.durationsSeconds.map((value) => <button key={value} type="button" className={duration === value ? 'duration-option duration-option--active' : 'duration-option'} onClick={() => chooseDuration(value)}>{formatDuration(value)}</button>)}</div>
                </div>
              ) : null}
            </div>
          </div>

          <div className="payout-card">
            <div><span>Potential return</span><strong>{formatCurrency(estimatedPayout, asset.quoteCurrency)}</strong></div>
            <div><span>Estimated fee</span><strong>-{formatCurrency(estimatedFee, asset.quoteCurrency)}</strong></div>
            <div><span>Total at expiry</span><strong>{formatCurrency(totalReturn, asset.quoteCurrency)}</strong></div>
            <small>{asset.payout}% server payout · {((Number(asset.feeRate) || 0) * 100).toFixed(2)}% fee · {asset.quoteCurrency}</small>
          </div>
          <div className="expiry-preview"><Timer size={13} /><span>Expiry</span><strong>{expiryPreview ? expiryPreview.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : 'Calculating…'}</strong><small>in {formatDuration(duration)}</small></div>

          {renderActions()}

          <div className="trade-panel__footer-row">
            <span className="trade-panel__note"><i className="live-dot" /> {canTrade ? (walletMode === 'DEMO' ? 'Demo market · Practice balance' : 'Real wallet · Trading enabled') : (tradeDisabledReason ?? 'Trading unavailable')} · Balance {formatCurrency(balance, asset.quoteCurrency)}</span>
            <button type="button" className="icon-button" onClick={onToggleSound} aria-label={soundEnabled ? 'Disable trade sounds' : 'Enable trade sounds'} title={soundEnabled ? 'Disable trade sounds' : 'Enable trade sounds'}>
              {soundEnabled ? <Volume2 size={15} /> : <VolumeX size={15} />}
            </button>
          </div>
        </div>

        <div className="trade-panel__mobile-content">
          <button className="trade-mobile-config" type="button" onClick={() => setMobileConfigOpen((current) => !current)} aria-expanded={mobileConfigOpen}>
            <span>Stake <strong>{formatCurrency(amount, asset.quoteCurrency)}</strong> · {formatDuration(duration)}</span>
            <span>{asset.payout}% <ChevronDown size={14} /></span>
          </button>
          {mobileConfigOpen ? (
            <div className="trade-mobile-config__panel">
              <div className="trade-mobile-config__grid">
                <label><span>Stake</span><div className="stepper"><button type="button" onClick={() => adjustAmount(-10)} aria-label="Decrease stake"><Minus size={15} /></button><div className="stepper__value"><span>{asset.quoteCurrency}</span><input value={amount} onChange={(event) => { setAmount(Number(event.target.value) || 0); resetOrder() }} type="number" inputMode="decimal" /></div><button type="button" onClick={() => adjustAmount(10)} aria-label="Increase stake"><Plus size={15} /></button></div></label>
                <label>
                  <span>Duration</span>
                  <button className="mobile-duration-button" type="button" onClick={() => setMobileDurationOpen((open) => !open)} aria-expanded={mobileDurationOpen}>{formatDuration(duration)} <ChevronDown size={13} /></button>
                  {mobileDurationOpen ? <div className="mobile-duration-options">{asset.durationsSeconds.map((value) => <button key={value} type="button" className={duration === value ? 'duration-option duration-option--active' : 'duration-option'} onClick={() => { chooseDuration(value); setMobileDurationOpen(false) }}>{formatDuration(value)}</button>)}</div> : null}
                </label>
              </div>
              <div className="payout-card"><div><span>Potential return</span><strong>{formatCurrency(estimatedPayout, asset.quoteCurrency)}</strong></div><div><span>Estimated fee</span><strong>-{formatCurrency(estimatedFee, asset.quoteCurrency)}</strong></div><small>{formatCurrency(totalReturn, asset.quoteCurrency)} total · expiry {expiryPreview ? expiryPreview.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Calculating…'}</small></div>
              <button type="button" className="trade-panel__sound-button" onClick={onToggleSound}>{soundEnabled ? <Volume2 size={14} /> : <VolumeX size={14} />} {soundEnabled ? 'Sounds on' : 'Sounds off'}</button>
            </div>
          ) : null}
          {renderActions(true)}
        </div>
      </aside>

      <Modal
        open={Boolean(error)}
        onClose={() => { setError(''); setStage('draft') }}
        title="Check your trade"
        description={error || undefined}
        footer={(
          <>
            <button className="btn btn--ghost" type="button" onClick={() => { setError(''); setStage('draft') }}>Close</button>
            {failedRequest ? (
              <button className="btn btn--primary" type="button" onClick={() => { setError(''); void requestPreview(failedRequest.direction, failedRequest.clientRequestId) }}>
                <RefreshCcw size={14} /> Retry
              </button>
            ) : null}
          </>
        )}
      >
        <div className="trade-modal__icon" aria-hidden="true"><ShieldAlert size={18} /></div>
      </Modal>

    </>
  )
}

function formatCurrency(value: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)
  } catch {
    return currency + ' ' + value.toFixed(2)
  }
}
