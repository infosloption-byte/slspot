import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { AlertCircle, BadgeCheck, CheckCircle2, Circle, Lock, Mail, UserRound } from 'lucide-react'
import { authApi } from '../../api/auth'
import { paymentApi, type PaymentEligibility } from '../../api/payments'
import { useAuth } from '../../auth/useAuth'
import { KycPanel } from '../wallet/KycPanel'

type Draft = { legalName: string; dateOfBirth: string; countryCode: string }

/**
 * Everything a customer must complete before moving money, in one place: email, personal details, identity.
 * The wallet only links here; the server re-checks all of it on every deposit and withdrawal.
 */
export function VerificationCenter() {
  const { user, refresh } = useAuth()
  const [eligibility, setEligibility] = useState<PaymentEligibility | null>(null)
  const [loadError, setLoadError] = useState('')
  const [reloadKey, setReloadKey] = useState(0)
  const [draft, setDraft] = useState<Draft>({ legalName: '', dateOfBirth: '', countryCode: '' })
  const [saving, setSaving] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  useEffect(() => {
    let active = true
    paymentApi.eligibility()
      .then((next) => {
        if (!active) return
        setEligibility(next)
        setLoadError('')
        setDraft({
          legalName: next.profile.legalName ?? '',
          dateOfBirth: next.profile.dateOfBirth ?? '',
          countryCode: next.profile.countryCode ?? '',
        })
      })
      .catch((cause: unknown) => {
        if (active) setLoadError(cause instanceof Error ? cause.message : 'Could not load your verification status.')
      })
    return () => { active = false }
  }, [reloadKey])

  // Arriving from the wallet's "Open verification" link should land on this section.
  const loaded = eligibility !== null
  useEffect(() => {
    if (loaded && window.location.hash === '#verification') document.getElementById('verification')?.scrollIntoView({ block: 'start' })
  }, [loaded])

  const reload = () => setReloadKey((value) => value + 1)

  async function resendEmail() {
    if (!user?.email || sending) return
    setSending(true)
    setError('')
    setNotice('')
    try {
      await authApi.requestEmailVerification(user.email)
      setNotice('If your account needs verification, a verification email has been sent.')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not send the verification email.')
    } finally {
      setSending(false)
    }
  }

  async function saveDetails(event: FormEvent) {
    event.preventDefault()
    setError('')
    setNotice('')
    if (draft.legalName.trim().length < 2) return setError('Enter your full legal name as it appears on your ID.')
    if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.dateOfBirth)) return setError('Enter your date of birth.')
    if (!/^[A-Za-z]{2}$/.test(draft.countryCode.trim())) return setError('Enter a two-letter country code, such as LK.')
    setSaving(true)
    try {
      await authApi.updateProfile({
        legalName: draft.legalName.trim(),
        dateOfBirth: draft.dateOfBirth,
        countryCode: draft.countryCode.trim().toUpperCase(),
      })
      await refresh()
      setNotice('Identity details saved.')
      reload()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save your details.')
    } finally {
      setSaving(false)
    }
  }

  const emailDone = eligibility?.emailVerified === true
  const detailsDone = eligibility !== null && eligibility.missingProfile.length === 0
  const identityDone = eligibility?.tier === 2
  const completed = [emailDone, detailsDone, identityDone].filter(Boolean).length
  const locked = identityDone === true

  return (
    <section className="dashboard-card panel verification-center" id="verification">
      <div className="dashboard-card__header">
        <div><span className="eyebrow">Verification</span><h2>Verify your account</h2></div>
        <span className={completed === 3 ? 'status-pill status-pill--positive' : 'status-pill status-pill--pending'}>{eligibility ? completed + ' OF 3 DONE' : 'LOADING'}</span>
      </div>
      <p className="verification-center__intro">Deposits need a verified email and your personal details. Withdrawals also need identity verification. We check these every time you deposit or withdraw.</p>

      {loadError ? <div className="form-message form-message--error" role="alert"><AlertCircle size={15} /> {loadError} <button type="button" className="setting-button" onClick={reload}>Retry</button></div> : null}
      {error ? <div className="form-message form-message--error" role="alert"><AlertCircle size={15} /> {error}</div> : null}
      {notice ? <div className="form-message form-message--success" role="status"><CheckCircle2 size={15} /> {notice}</div> : null}

      {eligibility ? (
        <ol className="verification-steps">
          <li className={emailDone ? 'verification-step verification-step--done' : 'verification-step'}>
            <span className="verification-step__marker">{emailDone ? <CheckCircle2 size={18} /> : <Circle size={18} />}</span>
            <div className="verification-step__body">
              <div className="verification-step__head"><Mail size={14} /><strong>1. Email address</strong></div>
              <small>{emailDone ? (user?.email ?? '') + ' is verified.' : 'Confirm ' + (user?.email ?? 'your email') + ' using the link we email you.'}</small>
              {!emailDone ? <button type="button" className="setting-button" disabled={sending} onClick={() => void resendEmail()}>{sending ? 'Sending…' : 'Send verification email'}</button> : null}
            </div>
          </li>

          <li className={detailsDone ? 'verification-step verification-step--done' : 'verification-step'}>
            <span className="verification-step__marker">{detailsDone ? <CheckCircle2 size={18} /> : <Circle size={18} />}</span>
            <div className="verification-step__body">
              <div className="verification-step__head"><UserRound size={14} /><strong>2. Identity details</strong></div>
              <small>{locked ? 'Locked after identity verification. Contact support if something is wrong.' : 'Your legal name, date of birth and country. Enter them exactly as they appear on your ID. You must be 18 or older.'}</small>
              <form className="verification-details" onSubmit={(event) => void saveDetails(event)}>
                <label><span>Full legal name</span><input autoComplete="name" maxLength={160} value={draft.legalName} onChange={(event) => setDraft((current) => ({ ...current, legalName: event.target.value }))} disabled={locked || saving} required /></label>
                <label><span>Date of birth</span><input type="date" value={draft.dateOfBirth} onChange={(event) => setDraft((current) => ({ ...current, dateOfBirth: event.target.value }))} disabled={locked || saving} required /></label>
                <label><span>Country code</span><input autoCapitalize="characters" maxLength={2} placeholder="LK" value={draft.countryCode} onChange={(event) => setDraft((current) => ({ ...current, countryCode: event.target.value.toUpperCase() }))} disabled={locked || saving} required /></label>
                {locked ? <span className="verification-details__lock"><Lock size={14} /> Locked</span> : <button type="submit" className="setting-button setting-button--primary" disabled={saving}>{saving ? 'Saving…' : detailsDone ? 'Update details' : 'Save details'}</button>}
              </form>
            </div>
          </li>

          <li className={identityDone ? 'verification-step verification-step--done' : 'verification-step'}>
            <span className="verification-step__marker">{identityDone ? <BadgeCheck size={18} /> : <Circle size={18} />}</span>
            <div className="verification-step__body">
              <div className="verification-step__head"><strong>3. Identity verification</strong></div>
              {emailDone && detailsDone ? <KycPanel onChanged={reload} /> : <small>Complete steps 1 and 2 first.</small>}
            </div>
          </li>
        </ol>
      ) : !loadError ? <div className="dashboard-note">Loading your verification status…</div> : null}
    </section>
  )
}
