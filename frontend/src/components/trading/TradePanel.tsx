import { ChevronDown, Minus, Plus, ShieldAlert, Timer, TrendingDown, TrendingUp, Volume2, VolumeX, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { MarketAsset } from '../../data/mockMarket'
import type { TradeDirection } from '../../types/trading'
import type { WalletMode } from '../../hooks/useWalletMode'

type TradePanelProps = {
  asset: MarketAsset
  soundEnabled: boolean
  balance: number
  walletMode: WalletMode
  onToggleSound: () => void
  onOpenTrade: (trade: { direction: TradeDirection; amount: number; durationSeconds: number; entryPrice: number; payoutRate: number }) => Promise<void>
}

type OrderStage = 'draft' | 'submitting'

function formatDuration(value: number) {
  return value < 60 ? value + 's' : value / 60 + 'm'
}

export function TradePanel({ asset, balance, walletMode, soundEnabled, onToggleSound, onOpenTrade }: TradePanelProps) {
  const [amount, setAmount] = useState(Math.min(50, asset.maxAmount))
  const [duration, setDuration] = useState(asset.durationsSeconds[0] ?? 60)
  const [durationOpen, setDurationOpen] = useState(false)
  const [direction, setDirection] = useState<TradeDirection | null>(null)
  const [stage, setStage] = useState<OrderStage>('draft')
  const [error, setError] = useState('')
  const [mobileConfigOpen, setMobileConfigOpen] = useState(false)
  const [mobileDurationOpen, setMobileDurationOpen] = useState(false)
  const durationRef = useRef<HTMLDivElement>(null)
  const payoutRate = Number(asset.payoutRate)
  const estimatedPayout = amount * payoutRate
  const totalReturn = amount + estimatedPayout

  const validate = () => {
    if (!Number.isFinite(amount) || amount < asset.minAmount || amount > asset.maxAmount) {
      return 'Stake must be between $' + asset.minAmount.toFixed(2) + ' and $' + asset.maxAmount.toFixed(2) + '.'
    }
    if (!asset.durationsSeconds.includes(duration)) {
      return 'That duration is not currently allowed for this market.'
    }
    if (!Number.isFinite(balance) || amount > balance) {
      return 'Stake exceeds the available server balance.'
    }
    if (walletMode === 'REAL') {
      return 'Real-money trading is not available yet. Switch to Demo Wallet to practise trading.'
    }
    if (!asset.tradingEnabled) {
      return ''
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
    setDirection(null)
    setStage('draft')
    setError('')
  }

  const requestPreview = async (nextDirection: TradeDirection) => {
    const validationError = validate()
    if (validationError) {
      setError(validationError)
      setStage('draft')
      return
    }

    setError('')
    setDirection(nextDirection)
    setStage('submitting')

    try {
      await onOpenTrade({
        direction: nextDirection,
        amount,
        durationSeconds: duration,
        entryPrice: asset.price,
        payoutRate,
      })
      setStage('draft')
      setDirection(null)
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Trade submission failed')
      setStage('draft')
      setDirection(null)
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
      <button className="trade-btn trade-btn--up" type="button" onClick={() => void requestPreview('UP')} disabled={stage === 'confirming' || stage === 'submitting' || walletMode === 'REAL' || balance <= 0}>
        <TrendingUp size={18} />
        <span>UP</span>
        {!mobile ? <small>Higher</small> : null}
      </button>
      <button className="trade-btn trade-btn--down" type="button" onClick={() => void requestPreview('DOWN')} disabled={stage === 'confirming' || stage === 'submitting' || walletMode === 'REAL' || balance <= 0}>
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
            <span className="trade-field__label">Stake</span>
            <div className="stepper">
              <button type="button" onClick={() => adjustAmount(-10)} aria-label="Decrease stake"><Minus size={17} /></button>
              <div className="stepper__value"><span>$</span><input value={amount} onChange={(event) => { setAmount(Number(event.target.value) || 0); resetOrder() }} type="number" inputMode="decimal" min={asset.minAmount} max={asset.maxAmount} aria-label="Stake amount" /></div>
              <button type="button" onClick={() => adjustAmount(10)} aria-label="Increase stake"><Plus size={17} /></button>
            </div>
            <div className="chips">
              {[25, 50, 100, 250].map((value) => <button key={value} type="button" className={amount === value ? 'chip chip--active' : 'chip'} onClick={() => { setAmount(value); resetOrder() }}>${value}</button>)}
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
            <div><span>Potential return</span><strong>+${estimatedPayout.toFixed(2)}</strong></div>
            <div><span>Total at expiry</span><strong>${totalReturn.toFixed(2)}</strong></div>
            <small>{asset.payout}% server payout on {asset.symbol}</small>
          </div>

          {renderActions()}

          <div className="trade-panel__footer-row">
            <span className="trade-panel__note"><i className="live-dot" /> {walletMode === 'DEMO' ? 'Demo market · Practice balance' : 'Real wallet · Trading unavailable'} · Balance ${balance.toFixed(2)}</span>
            <button type="button" className="icon-button" onClick={onToggleSound} aria-label={soundEnabled ? 'Disable trade sounds' : 'Enable trade sounds'} title={soundEnabled ? 'Disable trade sounds' : 'Enable trade sounds'}>
              {soundEnabled ? <Volume2 size={15} /> : <VolumeX size={15} />}
            </button>
          </div>
        </div>

        <div className="trade-panel__mobile-content">
          <button className="trade-mobile-config" type="button" onClick={() => setMobileConfigOpen((current) => !current)} aria-expanded={mobileConfigOpen}>
            <span>Stake <strong>${amount}</strong> · {formatDuration(duration)}</span>
            <span>{asset.payout}% <ChevronDown size={14} /></span>
          </button>
          {mobileConfigOpen ? (
            <div className="trade-mobile-config__panel">
              <div className="trade-mobile-config__grid">
                <label><span>Stake</span><div className="stepper"><button type="button" onClick={() => adjustAmount(-10)} aria-label="Decrease stake"><Minus size={15} /></button><div className="stepper__value"><span>$</span><input value={amount} onChange={(event) => { setAmount(Number(event.target.value) || 0); resetOrder() }} type="number" inputMode="decimal" /></div><button type="button" onClick={() => adjustAmount(10)} aria-label="Increase stake"><Plus size={15} /></button></div></label>
                <label>
                  <span>Duration</span>
                  <button className="mobile-duration-button" type="button" onClick={() => setMobileDurationOpen((open) => !open)} aria-expanded={mobileDurationOpen}>{formatDuration(duration)} <ChevronDown size={13} /></button>
                  {mobileDurationOpen ? <div className="mobile-duration-options">{asset.durationsSeconds.map((value) => <button key={value} type="button" className={duration === value ? 'duration-option duration-option--active' : 'duration-option'} onClick={() => { chooseDuration(value); setMobileDurationOpen(false) }}>{formatDuration(value)}</button>)}</div> : null}
                </label>
              </div>
              <div className="payout-card"><div><span>Potential return</span><strong>+${estimatedPayout.toFixed(2)}</strong></div><small>{asset.payout}% payout · ${totalReturn.toFixed(2)} total</small></div>
              <button type="button" className="trade-panel__sound-button" onClick={onToggleSound}>{soundEnabled ? <Volume2 size={14} /> : <VolumeX size={14} />} {soundEnabled ? 'Sounds on' : 'Sounds off'}</button>
            </div>
          ) : null}
          {renderActions(true)}
        </div>
      </aside>

      {error ? <div className="trade-modal-backdrop"><div className="trade-modal trade-modal--error" role="alertdialog" aria-modal="true"><div className="trade-modal__icon"><ShieldAlert size={18} /></div><div><span>Check your trade</span><strong>{error}</strong></div><button className="icon-button" type="button" onClick={() => setError('')} aria-label="Close error"><X size={15} /></button></div></div> : null}

    </>
  )
}
