import { CheckCircle2, Info, TriangleAlert, X } from 'lucide-react'

export type ToastTone = 'success' | 'error' | 'info'

type ToastProps = {
  title: string
  message: string
  tone?: ToastTone
  onClose?: () => void
}

const icons = {
  success: CheckCircle2,
  error: TriangleAlert,
  info: Info,
}

export function Toast({ title, message, tone = 'info', onClose }: ToastProps) {
  const Icon = icons[tone]
  return (
    <article className={'toast toast--' + tone} role={tone === 'error' ? 'alert' : 'status'}>
      <span className="toast__icon"><Icon size={16} /></span>
      <div className="toast__copy">
        <strong>{title}</strong>
        <span>{message}</span>
      </div>
      {onClose ? <button className="quiet-button" type="button" aria-label="Dismiss notification" onClick={onClose}><X size={15} /></button> : null}
    </article>
  )
}
