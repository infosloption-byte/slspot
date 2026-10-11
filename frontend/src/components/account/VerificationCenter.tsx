import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { AlertCircle, BadgeCheck, CheckCircle2, Circle, Lock, Mail, UserRound } from 'lucide-react'
import { authApi } from '../../api/auth'
import { paymentApi, type PaymentEligibility } from '../../api/payments'
import { useAuth } from '../../auth/useAuth'
import { COUNTRY_TIME_ZONES, defaultTimeZoneForCountry, timeZonesForCountry } from '../../data/countryTimeZones'
import { Select, type SelectOption } from '../ui/Select'
import { KycPanel } from '../wallet/KycPanel'

type Draft = { legalName: string; dateOfBirth: string; countryCode: string; timezone: string }

const COUNTRY_OPTIONS: SelectOption[] = [
  { value: '', label: 'Choose your country' },
  ...COUNTRY_TIME_ZONES.map((country) => ({ value: country.code, label: country.name + ' (' + country.code + ')' })),
]

/**
 * Everything a customer must complete before moving money, in one place: email, personal details, identity.
 * The wallet only links here; the server re-checks all of it on every deposit and withdrawal.
 */
export function VerificationCenter() {
  const { user, refresh } = useAuth()
  const [eligibility, setEligibility] = useState<PaymentEligibility | null>(null)
  const [loadError, setLoadError] = useState('')
  const [reloadKey, setReloadKey] = useState(0)
  const [draft, setDraft] = useState<Draft>({ legalName: '', dateOfBirth: '', countryCode: '', timezone: '' })
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
        const countryCode = next.profile.countryCode ?? ''
        setDraft({
          legalName: next.profile.legalName ?? '',
          dateOfBirth: next.profile.dateOfBirth ?? '',
          countryCode,
          timezone: countryCode ? defaultTimeZoneForCountry(countryCode, user?.timezone) : '',
        })
      })
      .catch((cause: unknown) => {
        if (active) setLoadError(cause instanceof Error ? cause.message : 'Could not load your verification status.')
      })
    return () => { active = false }
  }, [reloadKey, user?.timezone])

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
    if (!/^[A-Za-z]{2}$/.test(draft.countryCode.trim())) return setError('Choose your country.')
    if (!draft.timezone) return setError('Choose your country to set a time zone.')
    const countryZones = timeZonesForCountry(draft.countryCode)
    if (countryZones.length && !countryZones.includes(draft.timezone)) return setError('Choose a time zone available in your selected country.')
    setSaving(true)
    try {
      await authApi.updateProfile({
        legalName: draft.legalName.trim(),
        dateOfBirth: draft.dateOfBirth,
        countryCode: draft.countryCode.trim().toUpperCase(),
        timezone: draft.timezone,
        locale: 'en-US',
      })
      await refresh()
      setNotice(locked ? 'Time zone and language settings saved.' : 'Identity details saved.')
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
        <div><span className="eyebrow">Profile &amp; verification</span><h2>Account identity</h2></div>
        <span className={completed === 3 ? 'status-pill status-pill--positive' : 'status-pill status-pill--pending'}>{eligibility ? completed + ' OF 3 DONE' : 'LOADING'}</span>
      </div>
      <p className="verification-center__intro">Manage your account identity in one place. Your legal name, date of birth and country must match your identity document. Time zone options follow your country, and language is fixed to English (United States).</p>

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
              <small>{locked ? 'Your legal name, date of birth and country are locked after approval. Contact support if any verified detail is incorrect. Time zone can still be adjusted within your country.' : 'Enter your full legal name, date of birth and country accurately. These identity details are checked during KYC, and you must be 18 or older.'}</small>
              <form className="verification-details" onSubmit={(event) => void saveDetails(event)}>
                <label><span>Full legal name</span><input autoComplete="name" maxLength={160} value={draft.legalName} onChange={(event) => setDraft((current) => ({ ...current, legalName: event.target.value }))} disabled={locked || saving} required /></label>
                <label><span>Date of birth</span><input type="date" value={draft.dateOfBirth} onChange={(event) => setDraft((current) => ({ ...current, dateOfBirth: event.target.value }))} disabled={locked || saving} required /></label>
                <div className="verification-details__field">
                  {locked || saving ? <>
                    <span>Country</span>
                    <input value={COUNTRY_TIME_ZONES.find((country) => country.code === draft.countryCode)?.name ?? draft.countryCode} readOnly />
                  </> : <Select
                    value={draft.countryCode}
                    options={draft.countryCode && !COUNTRY_OPTIONS.some((option) => option.value === draft.countryCode)
                      ? [{ value: draft.countryCode, label: draft.countryCode + ' (existing code)' }, ...COUNTRY_OPTIONS]
                      : COUNTRY_OPTIONS}
                    onChange={(countryCode) => setDraft((current) => ({
                      ...current,
                      countryCode,
                      timezone: countryCode ? defaultTimeZoneForCountry(countryCode, current.timezone) : '',
                    }))}
                    className="verification-details__select"
                    label="Country"
                  />}
                </div>
                <div className="verification-details__field">
                  {saving ? <>
                    <span>Time zone</span>
                    <input value={draft.timezone} readOnly />
                  </> : timeZonesForCountry(draft.countryCode).length > 1
                    ? <Select
                        value={draft.timezone}
                        options={timeZonesForCountry(draft.countryCode).map((timezone) => ({ value: timezone, label: timezone }))}
                        onChange={(timezone) => setDraft((current) => ({ ...current, timezone }))}
                        className="verification-details__select"
                        label="Time zone"
                      />
                    : <>
                        <span>Time zone</span>
                        <input value={draft.timezone} readOnly placeholder="Choose a country first" />
                      </>}
                  <small>{draft.countryCode ? 'Time zone is restricted to a time zone used in your selected country.' : 'Choose a country to set the time zone.'}</small>
                </div>
                <label><span>Language / locale</span><input value="en-US" readOnly /><small>Fixed to English (United States).</small></label>
                {locked ? <span className="verification-details__lock"><Lock size={14} /> Verified identity fields are locked. Time zone remains adjustable.</span> : null}
                <button type="submit" className="setting-button setting-button--primary" disabled={saving || !draft.legalName.trim() || !draft.dateOfBirth || !draft.countryCode || !draft.timezone}>{saving ? 'Saving…' : locked ? 'Save regional settings' : detailsDone ? 'Update identity details' : 'Save identity details'}</button>
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
