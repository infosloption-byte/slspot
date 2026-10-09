import { useEffect, useMemo, useState } from 'react'
import { AlertCircle, ArrowDownCircle, ArrowUpCircle, CheckCircle2, CreditCard, ExternalLink, MailCheck, ShieldCheck } from 'lucide-react'
import { authApi } from '../../api/auth'
import { paymentApi, type PaymentDirection, type PaymentEligibility, type PaymentMethod, type PaymentDeposit, type PaymentWithdrawal } from '../../api/payments'
import { useAuth } from '../../auth/useAuth'

type Props = { onUpdated: () => void }

type ProfileDraft = { legalName: string; dateOfBirth: string; countryCode: string }

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
  const { user } = useAuth()
  const [direction, setDirection] = useState<PaymentDirection>('deposit')
  const [eligibility, setEligibility] = useState<PaymentEligibility | null>(null)
  const [methods, setMethods] = useState<PaymentMethod[]>([])
  const [selectedProvider, setSelectedProvider] = useState('')
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [formError, setFormError] = useState('')
  const [notice, setNotice] = useState('')
  const [profileDraft, setProfileDraft] = useState<ProfileDraft>({ legalName: '', dateOfBirth: '', countryCode: '' })
  const [profileSaving, setProfileSaving] = useState(false)
  const [verificationSending, setVerificationSending] = useState(false)
  const [amount, setAmount] = useState('')
  const [details, setDetails] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [sandboxBusy, setSandboxBusy] = useState(false)
  const [deposit, setDeposit] = useState<PaymentDeposit | null>(null)
  const [withdrawal, setWithdrawal] = useState<PaymentWithdrawal | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    let active = true
    setLoading(true)
    setLoadError('')
    Promise.all([paymentApi.eligibility(), paymentApi.methods(direction)])
      .then(([nextEligibility, nextMethods]) => {
        if (!active) return
        setEligibility(nextEligibility)
        setMethods(nextMethods)
        setProfileDraft({
          legalName: nextEligibility.profile.legalName ?? '',
          dateOfBirth: nextEligibility.profile.dateOfBirth ?? '',
          countryCode: nextEligibility.profile.countryCode ?? '',
        })
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
    setDirection(next)
    setAmount('')
    setDetails({})
    setDeposit(null)
    setWithdrawal(null)
    setFormError('')
    setNotice('')
  }

  async function saveProfile() {
    setFormError('')
    setNotice('')
    if (profileDraft.legalName.trim().length < 2) {
      setFormError('Enter your full legal name.')
      return
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(profileDraft.dateOfBirth)) {
      setFormError('Enter your date of birth.')
      return
    }
    if (!/^[A-Za-z]{2}$/.test(profileDraft.countryCode.trim())) {
      setFormError('Enter a two-letter country code, such as LK.')
      return
    }
    setProfileSaving(true)
    try {
      await authApi.updateProfile({
        legalName: profileDraft.legalName.trim(),
        dateOfBirth: profileDraft.dateOfBirth,
        countryCode: profileDraft.countryCode.trim().toUpperCase(),
      })
      setNotice('Profile saved. Payment eligibility has been refreshed.')
      setRefreshKey((value) => value + 1)
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Could not save your profile.')
    } finally {
      setProfileSaving(false)
    }
  }

  async function resendVerification() {
    if (!user?.email) {
      setFormError('Your account email could not be read. Open Account settings to review it.')
      return
    }
    setFormError('')
    setNotice('')
    setVerificationSending(true)
    try {
      await authApi.requestEmailVerification(user.email)
      setNotice('If your account needs verification, a verification email has been requested.')
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Could not request a verification email.')
    } finally {
      setVerificationSending(false)
    }
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
        setRefreshKey((value) => value + 1)
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
      setRefreshKey((value) => value + 1)
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
      setRefreshKey((value) => value + 1)
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
      setRefreshKey((value) => value + 1)
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
      setRefreshKey((value) => value + 1)
      onUpdated()
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Could not submit this withdrawal.')
    } finally {
      setSubmitting(false)
    }
  }

  const missingProfile = (eligibility?.missingProfile.length ?? 0) > 0
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

      {loadError ? <div className="form-message form-message--error" role="alert"><AlertCircle size={15} /> {loadError} <button type="button" className="setting-button" onClick={() => setRefreshKey((value) => value + 1)}>Retry</button></div> : null}

      {eligibility ? (
        <div className="payment-checklist">
          <div className={eligibility.emailVerified ? 'payment-checklist__row payment-checklist__row--done' : 'payment-checklist__row'}>
            {eligibility.emailVerified ? <CheckCircle2 size={15} /> : <MailCheck size={15} />}
            <span><strong>Email verification</strong><small>{eligibility.emailVerified ? 'Verified' : 'Verify your email before depositing.'}</small></span>
            {!eligibility.emailVerified ? <button type="button" className="setting-button" disabled={verificationSending} onClick={() => void resendVerification()}>{verificationSending ? 'Sending…' : 'Resend email'}</button> : null}
          </div>
          <div className={missingProfile ? 'payment-checklist__row' : 'payment-checklist__row payment-checklist__row--done'}>
            {missingProfile ? <AlertCircle size={15} /> : <CheckCircle2 size={15} />}
            <span><strong>Basic profile</strong><small>{missingProfile ? 'Legal name, date of birth and country are required.' : 'Complete'}</small></span>
          </div>
          <div className={eligibility.tier === 2 ? 'payment-checklist__row payment-checklist__row--done' : 'payment-checklist__row'}>
            {eligibility.tier === 2 ? <CheckCircle2 size={15} /> : <ShieldCheck size={15} />}
            <span><strong>Identity verification</strong><small>{eligibility.tier === 2 ? 'Approved' : 'Not connected yet · verification provider is not configured.'}</small></span>
          </div>
          {direction === 'withdrawal' ? (
            <div className={eligibility.twoFactorEnabled ? 'payment-checklist__row payment-checklist__row--done' : 'payment-checklist__row'}>
              {eligibility.twoFactorEnabled ? <CheckCircle2 size={15} /> : <ShieldCheck size={15} />}
              <span><strong>Two-factor authentication</strong><small>{eligibility.twoFactorEnabled ? 'Enabled' : 'Enable 2FA before withdrawals.'}</small></span>
              {!eligibility.twoFactorEnabled ? <a className="setting-button" href="/app/security">Open security</a> : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {missingProfile ? (
        <div className="payment-profile-step">
          <div className="payment-step-heading"><span className="eyebrow">Step 1</span><h3>Complete your profile</h3><p>These details are required by the payment eligibility rules.</p></div>
          <form className="payment-profile-form" onSubmit={(event) => { event.preventDefault(); void saveProfile() }}>
            <label><span>Full legal name</span><input autoComplete="name" maxLength={160} value={profileDraft.legalName} onChange={(event) => setProfileDraft((current) => ({ ...current, legalName: event.target.value }))} required /></label>
            <label><span>Date of birth</span><input type="date" value={profileDraft.dateOfBirth} onChange={(event) => setProfileDraft((current) => ({ ...current, dateOfBirth: event.target.value }))} required /></label>
            <label><span>Country code</span><input autoCapitalize="characters" maxLength={2} placeholder="LK" value={profileDraft.countryCode} onChange={(event) => setProfileDraft((current) => ({ ...current, countryCode: event.target.value.toUpperCase() }))} required /><small>Use the two-letter ISO country code.</small></label>
            <button type="submit" className="btn btn--primary" disabled={profileSaving}>{profileSaving ? 'Saving…' : 'Save profile details'}</button>
          </form>
        </div>
      ) : null}

      <div className="wallet-funding-tabs payment-direction-tabs">
        <button type="button" className={direction === 'deposit' ? 'wallet-funding-tab wallet-funding-tab--active' : 'wallet-funding-tab'} onClick={() => changeDirection('deposit')}><ArrowDownCircle size={14} /> Deposit</button>
        <button type="button" className={direction === 'withdrawal' ? 'wallet-funding-tab wallet-funding-tab--active' : 'wallet-funding-tab'} onClick={() => changeDirection('withdrawal')}><ArrowUpCircle size={14} /> Withdraw</button>
      </div>

      <div className="payment-step-heading"><span className="eyebrow">Step {missingProfile ? '2' : '1'}</span><h3>{direction === 'deposit' ? 'Choose a deposit method' : 'Choose a withdrawal method'}</h3><p>{direction === 'deposit' ? 'Select an enabled provider and enter the amount.' : 'Withdrawals are restricted to a method previously used for a completed deposit.'}</p></div>

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
            <form className="payment-action-form" onSubmit={(event) => { event.preventDefault(); direction === 'deposit' ? void submitDeposit() : void submitWithdrawal() }}>
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

      {eligibility && eligibility.kycStatus !== 'APPROVED' && direction === 'withdrawal' ? (
        <p className="payment-footnote">KYC provider integration is not yet connected. The interface will not mark an identity as verified locally or bypass the server's withdrawal rules.</p>
      ) : null}
    </section>
  )
}
