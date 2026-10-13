import { ShieldOff } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Modal } from '../ui/Modal'
import { OtpInput } from './TwoFactorSetupModal'

type Props = {
  open: boolean
  busy: boolean
  error: string | null
  onConfirm: (code: string) => void
  onCancel: () => void
}

/** Asks for a current authenticator code before two-factor authentication is switched off. */
export function TwoFactorDisableModal({ open, busy, error, onConfirm, onCancel }: Props) {
  const [code, setCode] = useState('')

  // A stable close handler keeps the Modal from re-running its focus handling on every keystroke.
  const latest = useRef({ busy, onCancel })
  useEffect(() => {
    latest.current = { busy, onCancel }
  })
  const requestClose = useCallback(() => {
    if (!latest.current.busy) latest.current.onCancel()
  }, [])

  const ready = code.length === 6 && !busy
  const submit = () => { if (ready) onConfirm(code) }

  return (
    <Modal
      open={open}
      onClose={requestClose}
      title="Turn off two-factor authentication?"
      description="Your account will be protected by your password alone."
      size="sm"
      footer={
        <>
          <button type="button" className="btn btn--ghost" onClick={onCancel} disabled={busy}>Keep it on</button>
          <button type="button" className="btn btn--danger" onClick={submit} disabled={!ready}>{busy ? 'Turning off…' : 'Turn off'}</button>
        </>
      }
    >
      <form onSubmit={(event) => { event.preventDefault(); submit() }}>
        <div className="tf-warning"><ShieldOff size={18} aria-hidden="true" /> <span>Withdrawals and sign-in become easier to attack without a second step. Your recovery codes will stop working.</span></div>
        <section className="tf-step">
          <h3><span>1</span> Enter your current 6-digit code</h3>
          <OtpInput value={code} onChange={setCode} disabled={busy} />
          {error ? <div className="tf-error" role="alert">{error}</div> : null}
          <button type="submit" hidden aria-hidden="true" tabIndex={-1} />
        </section>
      </form>
    </Modal>
  )
}
