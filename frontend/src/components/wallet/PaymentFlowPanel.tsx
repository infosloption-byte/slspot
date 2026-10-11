import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { AlertCircle, ArrowDownCircle, ArrowUpCircle, CheckCircle2, CreditCard, ExternalLink, ShieldCheck } from 'lucide-react'
import { paymentApi, type PaymentDirection, type PaymentEligibility, type PaymentMethod, type PaymentDeposit, type PaymentWithdrawal } from '../../api/payments'

type Props = { onUpdated: () => void }

// Requirement codes the customer resolves on the Account page (Verification section).
const ACCOUNT_BLOCKERS = ['EMAIL_NOT_VERIFIED', 'PROFILE_INCOMPLETE', 'AGE_NOT_VERIFIED', 'AGE_RESTRICTED', 'KYC_REQUIRED', 'KYC_REQUIRED_FOR_LIMIT']

function formatAmount(value: string, currency = 'USD'): string {
  const amount = Number(value)
  if (!Number.isFinite(amount)) return value + ' ' + currency
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 8 }).format(amount)
}

function paymentStatus(status: string): string {
  return status.replaceAll('_', ' ').toLowerCase().replace(/(^|\s)\S/g, (letter) => letter.toUpperCase())
}

function statusClass(status: string): string {
  if (status === 'COMPLETED') return 'payment-status payment-status--success'
  if (status === 'FAILED' || status === 'REJECTED') return 'payment-status payment-status--error'
  return 'payment-status payment-status--pending'
}

function isWebUrl(value: string): boolean {
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'https:' || parsed.protocol === 'http:'
  } catch {
    return false
  }
}

export function PaymentFlowPanel({ onUpdated }: Props) {
  const [direction, setDirection] = useState<PaymentDirection>('deposit')
  const [eligibility, setEligibility] = useState<PaymentEligibility | null>(null)
  const [methods, setMethods] = useState<PaymentMethod[]>([])
  const [selectedProvider, setSelectedProvider] = useState('')
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [formError, setFormError] = useState('')
  const [notice, setNotice] = useState('')
  const [amount, setAmount] = useState('')
  const [details, setDetails] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [sandboxBusy, setSandboxBusy] = useState(false)
  const [deposit, setDeposit] = useState<PaymentDeposit | null>(null)
  const [withdrawal, setWithdrawal] = useState<PaymentWithdrawal | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  function refreshPaymentData() {
    setLoading(true)
    setLoadError('')
    setRefreshKey((value) => value + 1)
  }

  useEffect(() => {
    let active = true
    Promise.all([paymentApi.eligibility(), paymentApi.methods(direction)])
      .then(([nextEligibility, nextMethods]) => {
        if (!active) return
        setEligibility(nextEligibility)
        setMethods(nextMethods)
        setSelectedProvider((current) => nextMethods.some((method) => method.id === current && (direction === 'deposit' || method.eligible)) ? current : (nextMethods.find((method) => direction === 'deposit' || method.eligible)?.id ?? nextMethods[0]?.id ?? ''))
      })
      .catch((error: unknown) => {
        if (!active) return
        setLoadError(error instanceof Error ? error.message : 'Could not load payment methods.')
      })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [direction, refreshKey])

  const selectedMethod = useMemo(
    () => methods.find((method) => method.id === selectedProvider) ?? null,
    [methods, selectedProvider],
  )
  const blockers = direction === 'deposit'
    ? (eligibility?.depositBlockers ?? [])
    : (eligibility?.withdrawalBlockers ?? [])
  const availableMethods = methods.length > 0
  const amountNumber = Number(amount)
  // Keep the client-side shape identical to the server's decimal parser; Number() alone
  // accepts exponent notation and excess precision that the API intentionally rejects.
  const amountSyntaxValid = /^\d{1,20}(?:\.\d{1,8})?$/.test(amount.trim())
  const amountLooksValid = amountSyntaxValid && Number.isFinite(amountNumber) && amountNumber > 0
  const amountAboveMinimum = selectedMethod ? amountNumber >= Number(selectedMethod.minAmount) : false
  const amountBelowMaximum = !selectedMethod?.maxAmount || amountNumber <= Number(selectedMethod.maxAmount)
  const amountValid = amountLooksValid && amountAboveMinimum && amountBelowMaximum
  const withdrawalDetailsValid = selectedMethod?.fields.every((field) => !field.required || Boolean(details[field.name]?.trim())) ?? true
  const canSubmit = !loading && !submitting && !blockers.length && Boolean(selectedMethod) &&
    (direction === 'deposit' ? amountValid : amountValid && selectedMethod?.eligible === true && withdrawalDetailsValid)

  function changeDirection(next: PaymentDirection) {
    setLoading(true)
    setLoadError('')
    setDirection(next)
    setAmount('')
    setDetails({})
    setDeposit(null)
    setWithdrawal(null)
    setFormError('')
    setNotice('')
  }

  async function submitDeposit() {
    if (!selectedMethod || !canSubmit) return
    setFormError('')
    setNotice('')
    setSubmitting(true)
    try {
      const result = await paymentApi.createDeposit({
        provider: selectedMethod.id,
        amount: amount.trim(),
        clientRequestId: crypto.randomUUID(),
      })
      setDeposit(result)
      setWithdrawal(null)
      setNotice(result.status === 'COMPLETED' ? 'Deposit completed.' : 'Deposit request created. Follow the checkout instructions below.')
      if (result.status === 'COMPLETED') {
        refreshPaymentData()
        onUpdated()
      }
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Could not start this deposit.')
    } finally {
      setSubmitting(false)
    }
  }

  async function chooseSandboxOutcome(outcome: 'succeed' | 'fail' | 'pending') {
    if (!deposit || deposit.checkout?.kind !== 'sandbox' || sandboxBusy) return
    setFormError('')
    setNotice('')
    setSandboxBusy(true)
    try {
      const result = await paymentApi.sandboxDepositOutcome(deposit.id, outcome)
      setDeposit(result)
      setNotice(outcome === 'succeed'
        ? 'Sandbox success event processed. No real money moved.'
        : outcome === 'fail'
          ? 'Sandbox failure event processed. No real money moved.'
          : 'Sandbox pending event processed. You can send another test outcome later.')
      refreshPaymentData()
      if (result.status === 'COMPLETED') onUpdated()
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Could not update the sandbox deposit.')
    } finally {
      setSandboxBusy(false)
    }
  }

  async function cancelCurrentDeposit() {
    if (!deposit || sandboxBusy) return
    setFormError('')
    setSandboxBusy(true)
    try {
      const result = await paymentApi.cancelDeposit(deposit.id)
      setDeposit(result)
      setNotice('Deposit cancelled.')
      refreshPaymentData()
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Could not cancel this deposit.')
    } finally {
      setSandboxBusy(false)
    }
  }

  async function cancelCurrentWithdrawal() {
    if (!withdrawal || withdrawal.status !== 'PENDING' || sandboxBusy) return
    setFormError('')
    setNotice('')
    setSandboxBusy(true)
    try {
      const result = await paymentApi.cancelWithdrawal(withdrawal.id)
      setWithdrawal(result)
      setNotice('Withdrawal cancelled. The reserved amount has been returned to your wallet.')
      refreshPaymentData()
      onUpdated()
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Could not cancel this withdrawal.')
    } finally {
      setSandboxBusy(false)
    }
  }

  async function submitWithdrawal() {
    if (!selectedMethod || !canSubmit) return
    setFormError('')
    setNotice('')
    setSubmitting(true)
    try {
      const result = await paymentApi.createWithdrawal({
        provider: selectedMethod.id,
        amount: amount.trim(),
        details,
        clientRequestId: crypto.randomUUID(),
      })
      setWithdrawal(result)
      setDeposit(null)
      setNotice(result.status === 'COMPLETED'
        ? 'Withdrawal completed by the configured provider.'
        : result.needsReview
          ? 'Withdrawal submitted and awaiting review.'
          : 'Withdrawal request submitted.')
      refreshPaymentData()
      onUpdated()
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Could not submit this withdrawal.')
    } finally {
      setSubmitting(false)
    }
  }

  // These blockers are resolved on the Account page; others (limits, cooling-off, 2FA) are explained inline.
  const needsAccountSteps = blockers.some((blocker) => ACCOUNT_BLOCKERS.includes(blocker.code))
  const canCancelDeposit = deposit?.status === 'PENDING'

  return (
    <section className="dashboard-card panel wallet-funding-card payment-flow-card">
      <div className="dashboard-card__header">
        <div><span className="eyebrow">Payment providers</span><h2>Deposit &amp; withdraw</h2></div>
        <span className="status-pill status-pill--pending">{availableMethods ? (methods.some((method) => method.sandbox) ? 'SANDBOX' : 'PROVIDERS') : 'UNAVAILABLE'}</span>
      </div>

      {methods.some((method) => method.sandbox) ? (
        <div className="payment-sandbox-warning" role="note">
          <ShieldCheck size={16} />
          <span><strong>Sandbox testing only.</strong> Methods labelled TEST simulate payment events and do not move real money. Do not treat sandbox credits as withdrawable real funds.</span>
        </div>
      ) : null}

      {loadError ? <div className="form-message form-message--error" role="alert"><AlertCircle size={15} /> {loadError} <button type="button" className="setting-button" onClick={refreshPaymentData}>Retry</button></div> : null}

      {eligibility && blockers.length > 0 ? (
        <div className="payment-verify-notice" role="status">
          <ShieldCheck size={16} />
          <div>
            <strong>{needsAccountSteps ? 'Verification needed' : 'Requirements not met'}</strong>
            <small>{needsAccountSteps
              ? 'Email, personal details and identity verification are managed in your account settings. They are checked before every ' + (direction === 'deposit' ? 'deposit.' : 'withdrawal.')
              : 'Review the requirements below before continuing.'}</small>
          </div>
          {needsAccountSteps ? <Link className="btn btn--primary" to="/app/account#verification">Open verification</Link> : null}
        </div>
      ) : null}

      <div className="wallet-funding-tabs payment-direction-tabs">
        <button type="button" className={direction === 'deposit' ? 'wallet-funding-tab wallet-funding-tab--active' : 'wallet-funding-tab'} onClick={() => changeDirection('deposit')}><ArrowDownCircle size={14} /> Deposit</button>
        <button type="button" className={direction === 'withdrawal' ? 'wallet-funding-tab wallet-funding-tab--active' : 'wallet-funding-tab'} onClick={() => changeDirection('withdrawal')}><ArrowUpCircle size={14} /> Withdraw</button>
      </div>

      <div className="payment-step-heading"><span className="eyebrow">Step 1</span><h3>{direction === 'deposit' ? 'Choose a deposit method' : 'Choose a withdrawal method'}</h3><p>{direction === 'deposit' ? 'Select an enabled provider and enter the amount.' : 'Withdrawals are restricted to a method previously used for a completed deposit.'}</p></div>

      {loading ? <div className="dashboard-note">Loading provider methods and eligibility…</div> : null}
      {!loading && !methods.length ? <div className="dashboard-note">No payment methods are enabled for this operation in your current environment. Live payments require a configured provider plus both environment and administrator approval.</div> : null}

      {methods.length > 0 ? (
        <>
          <div className="payment-provider-grid">
            {methods.map((method) => (
              <button
                type="button"
                key={method.id}
                className={(selectedProvider === method.id ? 'payment-provider-option payment-provider-option--active' : 'payment-provider-option') + (!method.eligible ? ' payment-provider-option--disabled' : '')}
                aria-pressed={selectedProvider === method.id}
                disabled={direction === 'withdrawal' && !method.eligible}
                title={!method.eligible ? method.reason : method.description}
                onClick={() => { setSelectedProvider(method.id); setDetails({}); setFormError(''); setDeposit(null); setWithdrawal(null) }}
              >
                <span className="payment-provider-option__icon"><CreditCard size={18} /></span>
                <span className="payment-provider-option__copy"><strong>{method.displayName}</strong><small>{method.description}</small>{method.reason ? <small className="payment-method-reason">{method.reason}</small> : null}<em>{method.minAmount}–{method.maxAmount ?? 'no maximum'} {method.currencies[0] ?? 'USD'}</em></span>
                <span className={method.sandbox ? 'payment-method-tag payment-method-tag--sandbox' : 'payment-method-tag'}>{method.sandbox ? 'TEST' : 'LIVE'}</span>
              </button>
            ))}
          </div>

          {selectedMethod ? (
            <form className="payment-action-form" onSubmit={(event) => { event.preventDefault(); if (direction === 'deposit') { void submitDeposit() } else { void submitWithdrawal() } }}>
              <label className="wallet-funding-field"><span>Amount (USD)</span><input inputMode="decimal" autoComplete="off" maxLength={32} value={amount} onChange={(event) => setAmount(event.target.value)} placeholder={direction === 'deposit' ? '100.00' : '50.00'} disabled={submitting || !selectedMethod.eligible && direction === 'withdrawal'} required /><small>Minimum {selectedMethod.minAmount} USD{selectedMethod.maxAmount ? ' · Maximum ' + selectedMethod.maxAmount + ' USD' : ''}</small></label>

              {direction === 'withdrawal' ? selectedMethod.fields.map((field) => (
                <label className="wallet-funding-field" key={field.name}>
                  <span>{field.label}{field.required ? ' *' : ''}</span>
                  <input
                    type={field.type === 'email' ? 'email' : 'text'}
                    autoComplete="off"
                    maxLength={field.maxLength ?? 255}
                    pattern={field.pattern}
                    title={field.patternMessage}
                    placeholder={field.placeholder ?? ''}
                    value={details[field.name] ?? ''}
                    onChange={(event) => setDetails((current) => ({ ...current, [field.name]: event.target.value }))}
                    required={field.required}
                    disabled={submitting || !selectedMethod.eligible}
                  />
                </label>
              )) : null}

              {blockers.length > 0 ? <div className="payment-blockers"><strong>{direction === 'deposit' ? 'Deposit requirements' : 'Withdrawal requirements'}</strong>{blockers.map((blocker) => <div key={blocker.code}><AlertCircle size={14} /><span>{blocker.message}</span></div>)}</div> : null}
              {direction === 'withdrawal' && !selectedMethod.eligible ? <div className="form-message form-message--error">{selectedMethod.reason ?? 'This method is not eligible for withdrawal yet.'}</div> : null}
              {formError ? <div className="form-message form-message--error" role="alert"><AlertCircle size={15} /> {formError}</div> : null}
              {notice ? <div className="form-message form-message--success" role="status"><CheckCircle2 size={15} /> {notice}</div> : null}

              <button type="submit" className="btn btn--primary" disabled={!canSubmit}>
                {submitting ? 'Processing…' : direction === 'deposit' ? 'Continue to deposit' : 'Submit withdrawal'}
              </button>
            </form>
          ) : null}
        </>
      ) : null}

      {deposit ? (
        <div className="payment-result">
          <div className="payment-result__header"><div><span className="eyebrow">Deposit reference</span><strong>{deposit.id}</strong></div><span className={statusClass(deposit.status)}>{paymentStatus(deposit.status)}</span></div>
          <div className="payment-result__amount">{formatAmount(deposit.amount, deposit.currency)}</div>
          {deposit.failureReason ? <p className="payment-result__failure">{deposit.failureReason}</p> : null}
          {deposit.checkout?.kind === 'sandbox' && ['PENDING', 'PROCESSING'].includes(deposit.status) ? (
            <div className="payment-sandbox-controls">
              <p>Choose a simulated provider result. No real payment is attempted.</p>
              <div>
                <button type="button" className="btn btn--primary" disabled={sandboxBusy} onClick={() => void chooseSandboxOutcome('succeed')}>{sandboxBusy ? 'Processing…' : 'Simulate success'}</button>
                <button type="button" className="btn btn--ghost" disabled={sandboxBusy} onClick={() => void chooseSandboxOutcome('fail')}>Simulate failure</button>
                <button type="button" className="btn btn--ghost" disabled={sandboxBusy} onClick={() => void chooseSandboxOutcome('pending')}>Keep pending</button>
              </div>
            </div>
          ) : null}
          {deposit.checkout?.kind === 'redirect' && isWebUrl(deposit.checkout.url) ? <a className="btn btn--primary payment-checkout-link" href={deposit.checkout.url} target="_blank" rel="noopener noreferrer">Open provider checkout <ExternalLink size={14} /></a> : null}
          {deposit.checkout?.kind === 'instructions' ? <p className="payment-result__instructions">{deposit.checkout.text}</p> : null}
          {canCancelDeposit ? <button type="button" className="setting-button" disabled={sandboxBusy} onClick={() => void cancelCurrentDeposit()}>Cancel pending deposit</button> : null}
          <p className="payment-footnote">Only a verified provider event can credit the wallet. Refreshing this page does not confirm a deposit.</p>
        </div>
      ) : null}

      {withdrawal ? (
        <div className="payment-result">
          <div className="payment-result__header"><div><span className="eyebrow">Withdrawal reference</span><strong>{withdrawal.id}</strong></div><span className={statusClass(withdrawal.status)}>{paymentStatus(withdrawal.status)}</span></div>
          <div className="payment-result__amount">{formatAmount(withdrawal.amount, withdrawal.currency)}</div>
          {withdrawal.destination ? <p>Destination: {withdrawal.destination}</p> : null}
          {withdrawal.needsReview ? <p className="payment-footnote">This request is waiting for an administrator to review it.</p> : null}
          {withdrawal.failureReason ? <p className="payment-result__failure">{withdrawal.failureReason}</p> : null}
          {withdrawal.status === 'PENDING' ? <button type="button" className="setting-button" disabled={sandboxBusy} onClick={() => void cancelCurrentWithdrawal()}>{sandboxBusy ? 'Processing…' : 'Cancel pending withdrawal'}</button> : null}
        </div>
      ) : null}

    </section>
  )
}
