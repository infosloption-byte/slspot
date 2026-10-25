import { ChevronDown, Minus, Plus, RefreshCcw, ShieldAlert, Timer, TrendingDown, TrendingUp } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { MarketAsset } from '../../data/mockMarket'
import type { TradeDirection } from '../../types/trading'
import type { WalletMode } from '../../hooks/useWalletMode'
import { ApiError } from '../../api/client'
import type { TradeCreateResult } from '../../api/trades'
import { Modal } from '../ui/Modal'
import { Select } from '../ui/Select'
import { calculateTradeEstimate, getStakePresets, validateTradeInput } from '../../lib/tradeSafety'

type TradePanelProps = {
  asset: MarketAsset
  balance: number
  walletMode: WalletMode
  canTrade: boolean
  tradeDisabledReason?: string | null
  onOpenTrade: (trade: { direction: TradeDirection; amount: number; durationSeconds: number; entryPrice: number; payoutRate: number; clientRequestId: string }) => Promise<TradeCreateResult>
}

type OrderStage = 'draft' | 'submitting' | 'pending' | 'accepted' | 'open' | 'rejected' | 'failed'
type OrderDraft = { direction: TradeDirection; clientRequestId: string; amount: number; durationSeconds: number }
type FailedTradeRequest = OrderDraft

const DURATION_STEP_SECONDS = 5

function formatDuration(value: number) {
  return value < 60 ? value + 's' : value / 60 + 'm'
}

export function TradePanel({ asset, balance, walletMode, canTrade, tradeDisabledReason, onOpenTrade }: TradePanelProps) {
  // The stake is kept as text so an emptied field stays empty; a numeric state turned "" into 0,
  // and typing after that produced "05".
  const [amountText, setAmountText] = useState(String(Math.max(asset.minAmount, Math.min(50, asset.maxAmount))))
  const amount = amountText === '' ? 0 : Number(amountText)
  const setAmount = (value: number) => setAmountText(String(value))
  const handleAmountInput = (raw: string) => {
    setAmountText(raw.replace(/^0+(?=\d)/, ''))
    resetOrder()
  }
  const [duration, setDuration] = useState(asset.durationsSeconds[0] ?? 60)
  const [stage, setStage] = useState<OrderStage>('draft')
  const [error, setError] = useState('')
  const [mobileConfigOpen, setMobileConfigOpen] = useState(false)
  const [preview, setPreview] = useState<OrderDraft | null>(null)
  const [failedRequest, setFailedRequest] = useState<FailedTradeRequest | null>(null)
  const submittingRef = useRef(false)
  const statusTimerRef = useRef<number | null>(null)
  useEffect(() => () => { if (statusTimerRef.current !== null) window.clearTimeout(statusTimerRef.current) }, [])
  const payoutRate = Number(asset.payoutRate)
  const { netProfit, totalReturn, fee } = calculateTradeEstimate(amount, payoutRate, Number(asset.feeRate))
  const presets = getStakePresets(asset.minAmount, asset.maxAmount, balance)

  const validate = () => {
    const problem = validateTradeInput({
      amount, duration, minAmount: asset.minAmount, maxAmount: asset.maxAmount,
      durations: asset.durationsSeconds, balance, canTrade,
    })
    if (problem === 'stake') return 'Stake must be between ' + formatCurrency(asset.minAmount, asset.quoteCurrency) + ' and ' + formatCurrency(asset.maxAmount, asset.quoteCurrency) + '.'
    if (problem === 'duration') return 'That duration is not currently allowed for this market.'
    if (problem === 'balance') return 'Stake exceeds the available server balance.'
    if (problem === 'unavailable') return tradeDisabledReason ?? 'Trading is not currently enabled for this wallet.'
    return ''
  }

  const resetOrder = () => {
    if (submittingRef.current) return
    setPreview(null)
    setFailedRequest(null)
    setStage('draft')
    setError('')
    if (statusTimerRef.current !== null) window.clearTimeout(statusTimerRef.current)
  }

  // UP/DOWN only prepares the order; confirming it is the only path that sends a request.
  const requestPreview = (direction: TradeDirection) => {
    if (submittingRef.current) return
    const problem = validate()
    if (problem) { setError(problem); return }
    if (statusTimerRef.current !== null) window.clearTimeout(statusTimerRef.current)
    setFailedRequest(null)
    setPreview({ direction, amount, durationSeconds: duration, clientRequestId: crypto.randomUUID() })
  }

  const submitOrder = async (order: OrderDraft) => {
    if (submittingRef.current) return
    const problem = validate()
    if (problem || order.amount !== amount || order.durationSeconds !== duration) {
      setPreview(null)
      setError(problem || 'Order settings changed. Review the new order before submitting.')
      return
    }
    submittingRef.current = true
    if (statusTimerRef.current !== null) window.clearTimeout(statusTimerRef.current)
    setPreview(null)
    setError('')
    setStage('submitting')
    try {
      const result = await onOpenTrade({ ...order, entryPrice: asset.price, payoutRate })
      setFailedRequest(null)
      setStage(result.orderStatus === 'PENDING' ? 'pending' : result.orderStatus === 'ACCEPTED' ? 'accepted' : 'open')
      statusTimerRef.current = window.setTimeout(() => setStage('draft'), 3200)
    } catch (error) {
      const rejected = error instanceof ApiError && error.code === 'ORDER_REJECTED'
      setError(rejected ? 'Trade rejected: ' + error.message : error instanceof Error ? error.message : 'Trade submission failed')
      // Network retries reuse the same idempotency key to avoid duplicate orders.
      setFailedRequest(rejected ? null : order)
      setStage(rejected ? 'rejected' : 'failed')
    } finally {
      submittingRef.current = false
    }
  }

  const adjustAmount = (delta: number) => {
    if (submittingRef.current) return
    setAmount(Math.max(asset.minAmount, Math.min(asset.maxAmount, (Number.isFinite(amount) ? amount : asset.minAmount) + delta)))
    if (stage !== 'draft') resetOrder()
  }

  const chooseDuration = (value: number) => {
    if (submittingRef.current) return
    setDuration(value)
    if (stage !== 'draft') resetOrder()
  }

  const adjustDuration = (direction: -1 | 1) => {
    const durations = asset.durationsSeconds
    if (durations.length === 0) return
    const currentIndex = durations.indexOf(duration)
    const fallbackIndex = direction > 0 ? -1 : durations.length
    const nextIndex = Math.max(0, Math.min(
      durations.length - 1,
      (currentIndex >= 0 ? currentIndex : fallbackIndex) + direction,
    ))
    chooseDuration(durations[nextIndex] ?? duration)
  }

  const renderActions = (mobile = false) => (
    <div className={mobile ? 'trade-actions trade-actions--mobile' : 'trade-actions'} aria-label="Trade direction">
      <button className="trade-btn trade-btn--up" type="button" onClick={() => requestPreview('UP')} disabled={stage === 'submitting' || !canTrade || balance <= 0}>
        <TrendingUp size={18} />
        <span>UP</span>
        {!mobile ? <small>Higher</small> : null}
      </button>
      <button className="trade-btn trade-btn--down" type="button" onClick={() => requestPreview('DOWN')} disabled={stage === 'submitting' || !canTrade || balance <= 0}>
        <TrendingDown size={18} />
        <span>DOWN</span>
        {!mobile ? <small>Lower</small> : null}
      </button>
    </div>
  )

  return (
    <>
      <aside className="trade-panel" aria-label="Trade controls">
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
              <div className="stepper__value"><span>{asset.quoteCurrency}</span><input value={amountText} onChange={(event) => handleAmountInput(event.target.value)} type="number" inputMode="decimal" min={asset.minAmount} max={asset.maxAmount} aria-label="Stake amount" disabled={stage === 'submitting'} /></div>
              <button type="button" onClick={() => adjustAmount(10)} aria-label="Increase stake"><Plus size={17} /></button>
            </div>
            <div className="chips">
              {presets.map((value) => <button key={value} type="button" className={amount === value ? 'chip chip--active' : 'chip'} disabled={stage === 'submitting'} onClick={() => { setAmount(value); resetOrder() }}>{formatCurrency(value, asset.quoteCurrency)}</button>)}
            </div>
          </div>

          <div className="trade-field">
            <span className="trade-field__label">Duration</span>
            <div className="duration-stepper">
              <button type="button" onClick={() => adjustDuration(-1)} aria-label="Select previous duration" disabled={duration <= (asset.durationsSeconds[0] ?? DURATION_STEP_SECONDS)}><Minus size={16} /></button>
              <Select
                value={String(duration)}
                options={asset.durationsSeconds.map((value) => ({ value: String(value), label: formatDuration(value) }))}
                onChange={(value) => chooseDuration(Number(value))}
                className="trade-duration-select"
                leadingIcon={<Timer size={16} />}
                mobilePlacement="up"
              />
              <button type="button" onClick={() => adjustDuration(1)} aria-label="Select next duration" disabled={duration >= (asset.durationsSeconds[asset.durationsSeconds.length - 1] ?? 300)}><Plus size={16} /></button>
            </div>
          </div>

          <div className="payout-card">
            <div><span>Potential net profit</span><strong>{formatCurrency(netProfit, asset.quoteCurrency)}</strong></div>
            <div><span>Potential settlement</span><strong>{formatCurrency(totalReturn, asset.quoteCurrency)}</strong></div>
            <small>{asset.payout}% payout · {formatCurrency(fee, asset.quoteCurrency)} estimated fee · Loss can equal your stake</small>
          </div>

          {renderActions()}
          <div className="trade-order-status" role="status" aria-live="polite">
            {stage === 'submitting' ? 'Submitting order…' : stage === 'pending' ? 'Order processing — check positions before submitting again.' : stage === 'accepted' ? 'Order accepted.' : stage === 'open' ? 'Position opened.' : null}
          </div>
          <div className="trade-panel__footer-row">
            <span className="trade-panel__note"><i className="live-dot" /> {canTrade ? (walletMode === 'DEMO' ? 'Demo market · Practice balance' : 'Real wallet · Trading enabled') : (tradeDisabledReason ?? 'Trading unavailable')} · Balance {formatCurrency(balance, asset.quoteCurrency)}</span>
          </div>
        </div>

        <div className="trade-panel__mobile-content">
          <div className="trade-mobile-config-row">
            <button className="trade-mobile-config" type="button" onClick={() => setMobileConfigOpen((current) => !current)} aria-expanded={mobileConfigOpen}>
              <strong>{asset.symbol}</strong>
              <span>Stake <strong>{formatCurrency(amount, asset.quoteCurrency)}</strong></span>
              <span aria-hidden="true">|</span>
              <span>{formatDuration(duration).toUpperCase()}</span>
            </button>
            <div className="trade-mobile-payout-summary" aria-label="Trade payout summary">
              <span aria-hidden="true">|</span>
              <span>Net profit <strong>{formatCurrency(netProfit, asset.quoteCurrency)}</strong></span>
              <span aria-hidden="true">|</span>
              <span>Total <strong>{formatCurrency(totalReturn, asset.quoteCurrency)}</strong></span>
            </div>
            <button className="trade-mobile-rate" type="button" onClick={() => setMobileConfigOpen((current) => !current)} aria-label="Toggle trade details" aria-expanded={mobileConfigOpen}>
              <span>{asset.payout}%</span>
              <ChevronDown size={14} />
            </button>
          </div>
          {mobileConfigOpen ? (
            <div className="trade-mobile-config__panel">
              <div className="trade-mobile-config__grid">
                <label><span>Stake</span><div className="stepper"><button type="button" onClick={() => adjustAmount(-10)} aria-label="Decrease stake"><Minus size={15} /></button><div className="stepper__value"><span>{asset.quoteCurrency}</span><input value={amountText} onChange={(event) => handleAmountInput(event.target.value)} type="number" inputMode="decimal" min={asset.minAmount} max={asset.maxAmount} aria-label="Stake amount" disabled={stage === 'submitting'} /></div><button type="button" onClick={() => adjustAmount(10)} aria-label="Increase stake"><Plus size={15} /></button></div></label>
                <label>
                  <span>Duration</span>
                  <div className="duration-stepper duration-stepper--mobile">
                    <button type="button" onClick={() => adjustDuration(-1)} aria-label="Select previous duration" disabled={duration <= (asset.durationsSeconds[0] ?? DURATION_STEP_SECONDS)}><Minus size={14} /></button>
                    <Select
                      value={String(duration)}
                      options={asset.durationsSeconds.map((value) => ({ value: String(value), label: formatDuration(value) }))}
                      onChange={(value) => chooseDuration(Number(value))}
                      className="trade-duration-select trade-duration-select--mobile"
                      leadingIcon={<Timer size={14} />}
                      mobilePlacement="up"
                    />
                    <button type="button" onClick={() => adjustDuration(1)} aria-label="Select next duration" disabled={duration >= (asset.durationsSeconds[asset.durationsSeconds.length - 1] ?? 300)}><Plus size={14} /></button>
                  </div>
                </label>
              </div>
            </div>
          ) : null}
          {renderActions(true)}
          <div className="trade-order-status" role="status" aria-live="polite">
            {stage === 'submitting' ? 'Submitting order…' : stage === 'pending' ? 'Order processing — check positions before retrying.' : stage === 'accepted' ? 'Order accepted.' : stage === 'open' ? 'Position opened.' : null}
          </div>
        </div>
      </aside>

      <Modal
        open={preview !== null}
        onClose={() => setPreview(null)}
        title={walletMode === 'REAL' ? 'Confirm real-money order' : 'Review demo order'}
        size="sm"
        footer={(
          <>
            <button className="btn btn--ghost" type="button" disabled={stage === 'submitting'} onClick={() => setPreview(null)}>Back</button>
            <button className="btn btn--primary" type="button" disabled={stage === 'submitting' || !canTrade} onClick={() => { if (preview) void submitOrder(preview) }}>Confirm {preview?.direction} order</button>
          </>
        )}
      >
        <div className="trade-review">
          <p className="trade-review__warning">{walletMode === 'REAL' ? 'Real funds are at risk. Confirm the amount, direction and duration carefully.' : 'Practice order — no real funds are used.'}</p>
          <dl>
            <div><dt>Market</dt><dd>{asset.symbol}</dd></div>
            <div><dt>Direction</dt><dd>{preview?.direction}</dd></div>
            <div><dt>Stake at risk</dt><dd>{formatCurrency(preview?.amount ?? 0, asset.quoteCurrency)}</dd></div>
            <div><dt>Duration</dt><dd>{formatDuration(preview?.durationSeconds ?? duration)}</dd></div>
            <div><dt>Estimated net profit if successful</dt><dd>{formatCurrency(calculateTradeEstimate(preview?.amount ?? 0, payoutRate, Number(asset.feeRate)).netProfit, asset.quoteCurrency)}</dd></div>
          </dl>
          <p className="trade-review__note">The server determines the execution price and final settlement. Quotes and payout terms can change.</p>
        </div>
      </Modal>

      <Modal
        open={Boolean(error)}
        onClose={() => { setError(''); setStage('draft') }}
        title="Check your trade"
        description={error || undefined}
        footer={(
          <>
            <button className="btn btn--ghost" type="button" onClick={() => { setError(''); setStage('draft') }}>Close</button>
            {failedRequest ? (
              <button className="btn btn--primary" type="button" onClick={() => { setError(''); void submitOrder(failedRequest) }}>
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
