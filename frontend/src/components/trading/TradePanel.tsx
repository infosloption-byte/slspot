import { ChevronDown, Minus, Plus, RefreshCcw, ShieldAlert, Timer, TrendingDown, TrendingUp } from 'lucide-react'
import { useState } from 'react'
import type { MarketAsset } from '../../data/mockMarket'
import type { TradeDirection } from '../../types/trading'
import type { WalletMode } from '../../hooks/useWalletMode'
import { ApiError } from '../../api/client'
import type { TradeCreateResult } from '../../api/trades'
import { Modal } from '../ui/Modal'
import { Select } from '../ui/Select'

type TradePanelProps = {
  asset: MarketAsset
  balance: number
  walletMode: WalletMode
  canTrade: boolean
  tradeDisabledReason?: string | null
  onOpenTrade: (trade: { direction: TradeDirection; amount: number; durationSeconds: number; entryPrice: number; payoutRate: number; clientRequestId: string }) => Promise<TradeCreateResult>
}

type OrderStage = 'draft' | 'submitting' | 'pending' | 'accepted' | 'open' | 'rejected' | 'failed'
type FailedTradeRequest = { direction: TradeDirection; clientRequestId: string }

function formatDuration(value: number) {
  return value < 60 ? value + 's' : value / 60 + 'm'
}

export function TradePanel({ asset, balance, walletMode, canTrade, tradeDisabledReason, onOpenTrade }: TradePanelProps) {
  // The stake is kept as text so an emptied field stays empty; a numeric state turned "" into 0,
  // and typing after that produced "05".
  const [amountText, setAmountText] = useState(String(Math.min(50, asset.maxAmount)))
  const amount = amountText === '' ? 0 : Number(amountText)
  const setAmount = (value: number) => setAmountText(String(value))
  const handleAmountInput = (raw: string) => {
    setAmountText(raw.replace(/^0+(?=\d)/, ''))
    resetOrder()
  }
  const [duration, setDuration] = useState(asset.durationsSeconds[0] ?? 60)
  const [stage, setStage] = useState<OrderStage>('draft')
  const [error, setError] = useState('')
  const [mobileConfigOpen, setMobileConfigOpen] = useState(true)
  const [failedRequest, setFailedRequest] = useState<FailedTradeRequest | null>(null)
  const payoutRate = Number(asset.payoutRate)
  const estimatedPayout = amount * payoutRate
  const feeRate = Number(asset.feeRate)
  const estimatedFee = Number.isFinite(feeRate) && feeRate > 0 ? amount * feeRate : 0
  const totalReturn = amount + estimatedPayout - estimatedFee

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
    setAmount(Math.max(asset.minAmount, Math.min(asset.maxAmount, amount + delta)))
    if (stage !== 'draft') resetOrder()
  }

  const chooseDuration = (value: number) => {
    setDuration(value)
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
              <div className="stepper__value"><span>{asset.quoteCurrency}</span><input value={amountText} onChange={(event) => handleAmountInput(event.target.value)} type="number" inputMode="decimal" min={asset.minAmount} max={asset.maxAmount} aria-label="Stake amount" /></div>
              <button type="button" onClick={() => adjustAmount(10)} aria-label="Increase stake"><Plus size={17} /></button>
            </div>
            <div className="chips">
              {[25, 50, 100, 250].map((value) => <button key={value} type="button" className={amount === value ? 'chip chip--active' : 'chip'} onClick={() => { setAmount(value); resetOrder() }}>{formatCurrency(value, asset.quoteCurrency)}</button>)}
            </div>
          </div>

          <div className="trade-field">
            <span className="trade-field__label">Duration</span>
            <Select
              value={String(duration)}
              options={asset.durationsSeconds.map((value) => ({ value: String(value), label: formatDuration(value) }))}
              onChange={(value) => chooseDuration(Number(value))}
              className="trade-duration-select"
              leadingIcon={<Timer size={16} />}
              mobilePlacement="up"
            />
          </div>

          <div className="payout-card">
            <div><span>Potential return</span><strong>{formatCurrency(estimatedPayout, asset.quoteCurrency)}</strong></div>
            <div><span>Total at expiry</span><strong>{formatCurrency(totalReturn, asset.quoteCurrency)}</strong></div>
            <small>{asset.payout}% server payout · {((Number(asset.feeRate) || 0) * 100).toFixed(2)}% fee · {asset.quoteCurrency}</small>
          </div>

          {renderActions()}

          <div className="trade-panel__footer-row">
            <span className="trade-panel__note"><i className="live-dot" /> {canTrade ? (walletMode === 'DEMO' ? 'Demo market · Practice balance' : 'Real wallet · Trading enabled') : (tradeDisabledReason ?? 'Trading unavailable')} · Balance {formatCurrency(balance, asset.quoteCurrency)}</span>
          </div>
        </div>

        <div className="trade-panel__mobile-content">
          <div className="trade-mobile-config-row">
            <button className="trade-mobile-config" type="button" onClick={() => setMobileConfigOpen((current) => !current)} aria-expanded={mobileConfigOpen}>
              <span>Stake <strong>{formatCurrency(amount, asset.quoteCurrency)}</strong> · {formatDuration(duration)}</span>
            </button>
            <div className="trade-mobile-payout-summary" aria-label="Trade payout summary">
              <span><small>Return</small><strong>{formatCurrency(estimatedPayout, asset.quoteCurrency)}</strong></span>
              <span><small>Total</small><strong>{formatCurrency(totalReturn, asset.quoteCurrency)}</strong></span>
            </div>
            <button className="trade-mobile-rate" type="button" onClick={() => setMobileConfigOpen((current) => !current)} aria-label="Toggle trade details" aria-expanded={mobileConfigOpen}>
              <span>{asset.payout}%</span>
              <ChevronDown size={14} />
            </button>
          </div>
          {mobileConfigOpen ? (
            <div className="trade-mobile-config__panel">
              <div className="trade-mobile-config__grid">
                <label><span>Stake</span><div className="stepper"><button type="button" onClick={() => adjustAmount(-10)} aria-label="Decrease stake"><Minus size={15} /></button><div className="stepper__value"><span>{asset.quoteCurrency}</span><input value={amountText} onChange={(event) => handleAmountInput(event.target.value)} type="number" inputMode="decimal" /></div><button type="button" onClick={() => adjustAmount(10)} aria-label="Increase stake"><Plus size={15} /></button></div></label>
                <label>
                  <span>Duration</span>
                  <Select
                    value={String(duration)}
                    options={asset.durationsSeconds.map((value) => ({ value: String(value), label: formatDuration(value) }))}
                    onChange={(value) => chooseDuration(Number(value))}
                    className="trade-duration-select trade-duration-select--mobile"
                    leadingIcon={<Timer size={14} />}
                    mobilePlacement="up"
                    aria-label="Trade duration"
                  />
                </label>
              </div>
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
