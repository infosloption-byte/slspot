import { useCallback, useEffect, useState } from 'react'
import { AlertCircle, BadgeCheck, CheckCircle2, Clock3, ExternalLink, ShieldCheck } from 'lucide-react'
import { kycApi, type KycDocumentType, type KycSandboxOutcome, type KycStatus } from '../../api/kyc'

type Props = { onChanged: () => void }

const DOCUMENT_LABELS: Record<KycDocumentType, string> = {
  passport: 'Passport',
  national_id: 'National ID card',
  driving_licence: 'Driving licence',
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
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try {
      const next = await kycApi.status()
      setState(next)
      setError('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load verification status.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  // While a verification is open, check back so a vendor decision shows up without a manual refresh.
  const open = state?.status === 'PENDING' || state?.status === 'IN_REVIEW'
  useEffect(() => {
    if (!open) return
    const timer = window.setInterval(() => { void load() }, 15_000)
    return () => window.clearInterval(timer)
  }, [open, load])

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

  if (loading) return <div className="kyc-panel"><div className="dashboard-note">Loading verification status…</div></div>
  if (!state) return error ? <div className="kyc-panel"><div className="form-message form-message--error" role="alert"><AlertCircle size={15} /> {error}</div></div> : null

  const current = state.case
  const approved = state.status === 'APPROVED'

  return (
    <div className={approved ? 'kyc-panel kyc-panel--approved' : 'kyc-panel'}>
      <div className="kyc-panel__header">
        <span className="kyc-panel__icon">{approved ? <BadgeCheck size={18} /> : <ShieldCheck size={18} />}</span>
        <div>
          <strong>Identity verification</strong>
          <small>{approved ? 'Your identity is verified.' : 'Required before you can withdraw. Documents are checked by a verification provider; SL Spot never stores your document images or numbers.'}</small>
        </div>
        {state.provider?.sandbox ? <span className="payment-method-tag payment-method-tag--sandbox">TEST</span> : null}
      </div>

      {state.status === 'PENDING' || state.status === 'IN_REVIEW' ? (
        <div className="kyc-panel__body">
          <p className="kyc-panel__status"><Clock3 size={14} /> {state.status === 'IN_REVIEW' ? 'Your documents are being reviewed. This usually takes a short while.' : 'Waiting for you to finish the verification steps.'}</p>
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

      {approved ? <p className="kyc-panel__status kyc-panel__status--good"><CheckCircle2 size={14} /> Verified{current?.resolvedAt ? ' on ' + new Date(current.resolvedAt).toLocaleDateString() : ''}.</p> : null}

      {state.status === 'REJECTED' && current?.decisionReason ? (
        <p className="kyc-panel__status kyc-panel__status--bad"><AlertCircle size={14} /> Last attempt unsuccessful: {current.decisionReason}</p>
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
          <button type="button" className="btn btn--primary" disabled={busy || !state.canStart} onClick={() => void run(() => kycApi.start(documentType))}>
            {busy ? 'Starting…' : state.status === 'REJECTED' ? 'Try verification again' : 'Start verification'}
          </button>
        </div>
      ) : null}

      {error ? <div className="form-message form-message--error" role="alert"><AlertCircle size={15} /> {error}</div> : null}
    </div>
  )
}
