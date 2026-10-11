import { useCallback, useEffect, useState } from 'react'
import { AlertCircle, BadgeCheck, CheckCircle2, Clock3, ExternalLink, ShieldCheck } from 'lucide-react'
import { kycApi, type KycDocumentType, type KycProvider, type KycSandboxOutcome, type KycStatus, type KycUploadKind } from '../../api/kyc'
import { prepareKycImage } from '../../api/kycImage'

type Props = { onChanged: () => void }

const DOCUMENT_LABELS: Record<KycDocumentType, string> = {
  passport: 'Passport',
  national_id: 'National ID card',
  driving_licence: 'Driving licence',
}

const PROVIDER_BLURBS: Record<string, string> = {
  didit: 'Automatic check on a secure page run by our verification partner. Usually done in a few minutes.',
  manual: 'Upload photos of your ID and a selfie. Our team reviews them, which can take longer.',
  sandbox: 'Test mode: you pick the result. No documents are checked.',
}

function uploadLabel(kind: KycUploadKind, documentType: string | null): { title: string; hint: string } {
  if (kind === 'ID_FRONT') return { title: documentType === 'passport' ? 'Passport photo page' : 'Front of your ID', hint: 'All four corners visible, text sharp and free of glare.' }
  if (kind === 'ID_BACK') return { title: 'Back of your ID', hint: 'All four corners visible, text sharp and free of glare.' }
  return { title: 'Selfie holding your ID', hint: 'Hold the ID next to your face. Your face and the ID must both be clear.' }
}

function providerLabel(provider: KycProvider): string {
  return provider.id === 'didit' ? 'Automatic verification' : provider.id === 'manual' ? 'Manual review' : provider.displayName
}

function isWebUrl(value: string): boolean {
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'https:' || parsed.protocol === 'http:'
  } catch {
    return false
  }
}

export function KycPanel({ onChanged }: Props) {
  const [state, setState] = useState<KycStatus | null>(null)
  const [documentType, setDocumentType] = useState<KycDocumentType>('passport')
  const [providerChoice, setProviderChoice] = useState('')
  const [busyKind, setBusyKind] = useState<KycUploadKind | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  // Keep the request itself free of React state updates. Effects can start this request
  // safely, then apply its result from the asynchronous promise callbacks below.
  const load = useCallback(() => kycApi.status(), [])

  const applyLoadedStatus = useCallback((next: KycStatus) => {
    setState(next)
    setError('')
  }, [])

  const reportLoadError = useCallback((cause: unknown) => {
    setError(cause instanceof Error ? cause.message : 'Could not load verification status.')
  }, [])

  useEffect(() => {
    let active = true
    void load()
      .then((next) => {
        if (active) applyLoadedStatus(next)
      })
      .catch((cause: unknown) => {
        if (active) reportLoadError(cause)
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => { active = false }
  }, [load, applyLoadedStatus, reportLoadError])


  // While a verification is open, check back so a vendor decision shows up without a manual refresh.
  const open = state?.status === 'PENDING' || state?.status === 'IN_REVIEW'
  useEffect(() => {
    if (!open) return
    const timer = window.setInterval(() => {
      void load()
        .then(applyLoadedStatus)
        .catch(reportLoadError)
    }, 15_000)
    return () => window.clearInterval(timer)
  }, [open, load, applyLoadedStatus, reportLoadError])

  async function run(action: () => Promise<KycStatus>) {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      const next = await action()
      setState(next)
      onChanged()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Verification request failed.')
    } finally {
      setBusy(false)
    }
  }

  async function upload(kind: KycUploadKind, file: File) {
    setBusyKind(kind)
    try {
      await run(async () => kycApi.uploadDocument(kind, await prepareKycImage(file)))
    } finally {
      setBusyKind(null)
    }
  }

  if (loading) return <div className="kyc-panel"><div className="dashboard-note">Loading verification status…</div></div>
  if (!state) return error ? <div className="kyc-panel"><div className="form-message form-message--error" role="alert"><AlertCircle size={15} /> {error}</div></div> : null

  const current = state.case
  const approved = state.status === 'APPROVED'
  const providerId = state.providers.some((item) => item.id === providerChoice) ? providerChoice : (state.provider?.id ?? '')
  // The case itself says how it is being verified once it exists; before that the customer's choice decides the wording.
  const activeProviderId = current && (state.status === 'PENDING' || state.status === 'IN_REVIEW') ? current.provider : providerId
  const manualFlow = activeProviderId === 'manual'
  const requiredKinds = current?.requiredDocuments ?? []
  const uploadedKinds = new Set((current?.documents ?? []).map((doc) => doc.kind))
  const allUploaded = requiredKinds.length > 0 && requiredKinds.every((kind) => uploadedKinds.has(kind))

  return (
    <div className={approved ? 'kyc-panel kyc-panel--approved' : 'kyc-panel'}>
      <div className="kyc-panel__header">
        <span className="kyc-panel__icon">{approved ? <BadgeCheck size={18} /> : <ShieldCheck size={18} />}</span>
        <div>
          <strong>Identity verification</strong>
          <small>{approved ? 'Your identity is verified.' : manualFlow
            ? 'Required before you can withdraw. Your photos are stored encrypted, only our verification team can open them, and they are deleted automatically a limited time after the decision.'
            : 'Required before you can withdraw. Documents are checked by our verification partner; SL Spot does not keep your document images or numbers.'}</small>
        </div>
        {state.provider?.sandbox ? <span className="payment-method-tag payment-method-tag--sandbox">TEST</span> : null}
      </div>

      {state.status === 'PENDING' || state.status === 'IN_REVIEW' ? (
        <div className="kyc-panel__body">
          <p className={state.status === 'IN_REVIEW' ? 'kyc-panel__status kyc-panel__status--pending' : 'kyc-panel__status'} role="status"><Clock3 size={14} /> <span>{state.status === 'IN_REVIEW'
            ? (manualFlow ? <><strong>Approval pending.</strong> Your documents have been submitted. Our team will review them and notify you of the result.</> : 'Your verification is being reviewed. This usually takes a short while.')
            : (manualFlow ? 'Upload each photo below, then submit them for review.' : 'Waiting for you to finish the verification steps.')}</span></p>
          {current?.flow?.kind === 'upload' && state.status === 'PENDING' ? (
            <>
              <ul className="kyc-upload">
                {requiredKinds.map((kind) => {
                  const done = uploadedKinds.has(kind)
                  const label = uploadLabel(kind, current.documentType)
                  return (
                    <li key={kind} className="kyc-upload__item">
                      <div><strong>{label.title}</strong><small>{label.hint}</small></div>
                      <span className={done ? 'kyc-upload__state kyc-upload__state--done' : 'kyc-upload__state'}>{done ? 'Uploaded' : 'Required'}</span>
                      <label className="btn btn--ghost kyc-upload__button">
                        {busyKind === kind ? 'Uploading…' : done ? 'Replace' : 'Choose photo'}
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          disabled={busy}
                          onChange={(event) => {
                            const file = event.target.files?.[0]
                            event.target.value = ''
                            if (file) void upload(kind, file)
                          }}
                        />
                      </label>
                    </li>
                  )
                })}
              </ul>
              <button type="button" className="btn btn--primary" disabled={busy || !allUploaded} onClick={() => void run(() => kycApi.submit())}>
                Submit for review
              </button>
              <small className="kyc-upload__note">After you submit, the photos can no longer be changed. Photos are resized in your browser and location data is removed before upload.</small>
            </>
          ) : null}
          {current?.flow?.kind === 'redirect' && isWebUrl(current.flow.url) ? (
            <a className="btn btn--primary payment-checkout-link" href={current.flow.url} target="_blank" rel="noopener noreferrer">Continue verification <ExternalLink size={14} /></a>
          ) : null}
          {current?.flow?.kind === 'sandbox' ? (
            <div className="payment-sandbox-controls">
              <p>Choose a simulated verification result. No documents are checked.</p>
              <div>
                {(['approved', 'review', 'rejected'] as KycSandboxOutcome[]).map((outcome) => (
                  <button key={outcome} type="button" className={outcome === 'approved' ? 'btn btn--primary' : 'btn btn--ghost'} disabled={busy} onClick={() => void run(() => kycApi.sandboxOutcome(outcome))}>
                    {outcome === 'approved' ? 'Simulate approval' : outcome === 'review' ? 'Send to manual review' : 'Simulate rejection'}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {approved ? <p className="kyc-panel__status kyc-panel__status--good" role="status"><CheckCircle2 size={14} /> <strong>KYC approved.</strong> Your identity is verified{current?.resolvedAt ? ' as of ' + new Date(current.resolvedAt).toLocaleDateString() : ''}.</p> : null}

      {state.status === 'REJECTED' ? (
        <div className="kyc-panel__status kyc-panel__status--bad kyc-panel__status--rejected" role="status">
          <AlertCircle size={14} />
          <span><strong>Attempt failed{state.attemptsUsed > 0 ? ' (' + state.attemptsUsed + (state.attemptsUsed === 1 ? ' attempt)' : ' attempts)') : ''}.</strong> {current?.decisionReason ?? 'Your documents could not be verified.'} Please correct the issue and upload new documents to try again.</span>
        </div>
      ) : null}

      {!approved && state.status !== 'PENDING' && state.status !== 'IN_REVIEW' ? (
        <div className="kyc-panel__body">
          <label className="wallet-funding-field">
            <span>Document you will provide</span>
            <select value={documentType} onChange={(event) => setDocumentType(event.target.value as KycDocumentType)} disabled={busy || !state.canStart}>
              {state.documentTypes.map((type) => <option key={type} value={type}>{DOCUMENT_LABELS[type]}</option>)}
            </select>
            <small>Attempt {Math.min(state.attemptsUsed + 1, state.maxAttempts)} of {state.maxAttempts}. Your legal name, date of birth and country come from your profile.</small>
          </label>
          {state.blockedReason ? <p className="kyc-panel__status"><AlertCircle size={14} /> {state.blockedReason}</p> : null}
          {state.providers.length > 1 ? (
            <fieldset className="kyc-providers">
              <legend>How would you like to verify?</legend>
              {state.providers.map((item) => (
                <label key={item.id} className={item.id === providerId ? 'kyc-providers__option kyc-providers__option--selected' : 'kyc-providers__option'}>
                  <input type="radio" name="kyc-provider" value={item.id} checked={item.id === providerId} disabled={busy} onChange={() => setProviderChoice(item.id)} />
                  <span><strong>{providerLabel(item)}</strong><small>{PROVIDER_BLURBS[item.id] ?? item.displayName}</small></span>
                </label>
              ))}
            </fieldset>
          ) : null}
          <button type="button" className="btn btn--primary" disabled={busy || !state.canStart} onClick={() => void run(() => kycApi.start(documentType, providerId || undefined))}>
            {busy ? 'Starting…' : state.status === 'REJECTED' ? 'Upload new documents' : 'Start verification'}
          </button>
        </div>
      ) : null}

      {error ? <div className="form-message form-message--error" role="alert"><AlertCircle size={15} /> {error}</div> : null}
    </div>
  )
}
