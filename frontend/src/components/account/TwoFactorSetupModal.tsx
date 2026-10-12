import { Check, Copy, Download, ShieldCheck, Smartphone } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ClipboardEvent, KeyboardEvent } from 'react'
import { encodeQr, qrToSvgPath } from '../../lib/qr'
import { Modal } from '../ui/Modal'

const CODE_LENGTH = 6

/** "JBSWY3DPEHPK3PXP" becomes "JBSW Y3DP EHPK 3PXP" so it is easy to read and type. */
function groupSecret(secret: string): string {
  return secret.replace(/\s+/g, '').replace(/(.{4})/g, '$1 ').trim()
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    try {
      const area = document.createElement('textarea')
      area.value = text
      area.setAttribute('readonly', '')
      area.style.position = 'fixed'
      area.style.opacity = '0'
      document.body.appendChild(area)
      area.select()
      const ok = document.execCommand('copy')
      document.body.removeChild(area)
      return ok
    } catch {
      return false
    }
  }
}

function useCopy() {
  const [copied, setCopied] = useState<string | null>(null)
  const timer = useRef<number | undefined>(undefined)
  const copy = async (id: string, text: string) => {
    if (await copyText(text)) {
      setCopied(id)
      window.clearTimeout(timer.current)
      timer.current = window.setTimeout(() => setCopied(null), 2000)
    }
  }
  return { copied, copy }
}

function QrImage({ value }: { value: string }) {
  const qr = useMemo(() => {
    try {
      return qrToSvgPath(encodeQr(value))
    } catch {
      return null
    }
  }, [value])
  if (!qr) return <div className="tf-qr tf-qr--error">The QR code could not be drawn. Use the setup key instead.</div>
  return (
    <div className="tf-qr">
      <svg viewBox={'0 0 ' + qr.size + ' ' + qr.size} role="img" aria-label="QR code for your authenticator app" shapeRendering="crispEdges">
        <rect width={qr.size} height={qr.size} fill="#fff" />
        <path d={qr.path} fill="#000" />
      </svg>
    </div>
  )
}

function OtpInput({ value, onChange, disabled }: { value: string; onChange: (next: string) => void; disabled?: boolean }) {
  const refs = useRef<Array<HTMLInputElement | null>>([])
  const focus = (index: number) => refs.current[Math.max(0, Math.min(CODE_LENGTH - 1, index))]?.focus()

  const onType = (index: number, raw: string) => {
    const digits = raw.replace(/\D/g, '')
    if (!digits) return
    const next = (value.slice(0, index) + digits + value.slice(index + 1)).slice(0, CODE_LENGTH)
    onChange(next)
    focus(Math.min(index + digits.length, CODE_LENGTH - 1))
  }

  const onKey = (index: number, event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Backspace') {
      event.preventDefault()
      const target = value[index] ? index : index - 1
      if (target >= 0) onChange(value.slice(0, target) + value.slice(target + 1))
      focus(target)
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault()
      focus(index - 1)
    } else if (event.key === 'ArrowRight') {
      event.preventDefault()
      focus(index + 1)
    }
  }

  const onPaste = (event: ClipboardEvent<HTMLInputElement>) => {
    const digits = event.clipboardData.getData('text').replace(/\D/g, '').slice(0, CODE_LENGTH)
    if (!digits) return
    event.preventDefault()
    onChange(digits)
    focus(digits.length)
  }

  return (
    <div className="tf-otp" role="group" aria-label="Six-digit verification code">
      {Array.from({ length: CODE_LENGTH }, (_, index) => (
        <input
          key={index}
          ref={(node) => { refs.current[index] = node }}
          className={value[index] ? 'tf-otp__box tf-otp__box--filled' : 'tf-otp__box'}
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete={index === 0 ? 'one-time-code' : 'off'}
          aria-label={'Digit ' + (index + 1)}
          maxLength={CODE_LENGTH}
          value={value[index] ?? ''}
          disabled={disabled}
          onChange={(event) => onType(index, event.target.value)}
          onKeyDown={(event) => onKey(index, event)}
          onPaste={onPaste}
          onFocus={(event) => event.target.select()}
        />
      ))}
    </div>
  )
}

type Props = {
  open: boolean
  secret: string
  otpauthUri: string
  /** Set once two-factor is on: the modal then shows the one-time recovery codes. */
  recoveryCodes: string[] | null
  busy: boolean
  error: string | null
  onVerify: (code: string) => void
  onCancel: () => void
  onDone: () => void
}

export function TwoFactorSetupModal({ open, secret, otpauthUri, recoveryCodes, busy, error, onVerify, onCancel, onDone }: Props) {
  const [code, setCode] = useState('')
  const [saved, setSaved] = useState(false)
  const { copied, copy } = useCopy()

  // Modal re-runs its focus handling whenever onClose changes, which would pull focus out of the code boxes on
  // every keystroke. A stable callback that reads the latest values from a ref avoids that.
  const latest = useRef({ busy, saved, hasRecoveryCodes: Boolean(recoveryCodes), onCancel, onDone })
  useEffect(() => {
    latest.current = { busy, saved, hasRecoveryCodes: Boolean(recoveryCodes), onCancel, onDone }
  })
  const requestClose = useCallback(() => {
    const current = latest.current
    if (current.hasRecoveryCodes) {
      if (current.saved) current.onDone()
    } else if (!current.busy) {
      current.onCancel()
    }
  }, [])

  if (recoveryCodes) {
    const text = recoveryCodes.join('\n')
    const download = () => {
      const url = URL.createObjectURL(new Blob(['SL Spot recovery codes\nEach code works once.\n\n' + text + '\n'], { type: 'text/plain' }))
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = 'slspot-recovery-codes.txt'
      anchor.click()
      URL.revokeObjectURL(url)
    }
    return (
      <Modal
        open={open}
        onClose={requestClose}
        title="Two-factor authentication is on"
        description="Save your recovery codes now. They are shown only once."
        size="sm"
        footer={<button type="button" className="btn btn--primary tf-wide" disabled={!saved} onClick={onDone}>Done</button>}
      >
        <div className="tf-success"><ShieldCheck size={22} /> <span>Your account now needs a code from your authenticator app at sign-in.</span></div>
        <div className="tf-recovery" aria-label="Recovery codes">{recoveryCodes.map((item) => <code key={item}>{item}</code>)}</div>
        <div className="tf-actions">
          <button type="button" className="btn btn--ghost" onClick={() => void copy('codes', text)}>{copied === 'codes' ? <Check size={15} /> : <Copy size={15} />} {copied === 'codes' ? 'Copied' : 'Copy all'}</button>
          <button type="button" className="btn btn--ghost" onClick={download}><Download size={15} /> Download</button>
        </div>
        <p className="tf-note">Each code can be used once if you lose access to your authenticator. Store them somewhere safe, such as a password manager.</p>
        <label className="tf-check"><input type="checkbox" checked={saved} onChange={(event) => setSaved(event.target.checked)} /> <span>I have saved my recovery codes</span></label>
      </Modal>
    )
  }

  const submit = () => { if (code.length === CODE_LENGTH && !busy) onVerify(code) }

  return (
    <Modal
      open={open}
      onClose={requestClose}
      title="Set up two-factor authentication"
      description="Use an authenticator app such as Google Authenticator, Microsoft Authenticator, 1Password or Authy."
      size="sm"
      footer={
        <>
          <button type="button" className="btn btn--ghost" onClick={onCancel} disabled={busy}>Cancel</button>
          <button type="button" className="btn btn--primary" onClick={submit} disabled={code.length !== CODE_LENGTH || busy}>{busy ? 'Verifying…' : 'Verify and enable'}</button>
        </>
      }
    >
      <form onSubmit={(event) => { event.preventDefault(); submit() }}>
        <section className="tf-step">
          <h3><span>1</span> Scan the QR code</h3>
          <p>Open your authenticator app and scan this code. <Smartphone size={13} aria-hidden="true" /></p>
          <QrImage value={otpauthUri} />
        </section>

        <section className="tf-step">
          <h3><span>2</span> Or enter the setup key</h3>
          <div className="tf-key">
            <code aria-label="Setup key">{groupSecret(secret)}</code>
            <button type="button" className="btn btn--ghost tf-key__copy" onClick={() => void copy('secret', secret)}>{copied === 'secret' ? <Check size={15} /> : <Copy size={15} />} {copied === 'secret' ? 'Copied' : 'Copy'}</button>
          </div>
          <p className="tf-note">Choose “time-based” if your app asks. Keep this key private: anyone with it can generate your codes.</p>
        </section>

        <section className="tf-step">
          <h3><span>3</span> Enter the 6-digit code</h3>
          <OtpInput value={code} onChange={setCode} disabled={busy} />
          {error ? <div className="tf-error" role="alert">{error}</div> : null}
          <button type="submit" hidden aria-hidden="true" tabIndex={-1} />
        </section>
      </form>
    </Modal>
  )
}
