import { X } from 'lucide-react'
import type { ReactNode } from 'react'
import { useEffect, useId, useRef } from 'react'
import { createPortal } from 'react-dom'

// Keep only the topmost dialog keyboard-active when confirmation dialogs are nested.
const activeModalStack: HTMLElement[] = []

type ModalProps = {
  open: boolean
  onClose: () => void
  title: string
  description?: string
  children: ReactNode
  footer?: ReactNode
  size?: 'sm' | 'md' | 'lg' | 'xl'
  /** Removes the body padding so tables and tab bars can run edge to edge. */
  flush?: boolean
  closeLabel?: string
}

export function Modal({ open, onClose, title, description, children, footer, size = 'md', flush = false, closeLabel = 'Close dialog' }: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const onCloseRef = useRef(onClose)
  useEffect(() => { onCloseRef.current = onClose }, [onClose])
  const titleId = useId()
  const previousFocusRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!open) return undefined
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const panel = panelRef.current
    if (panel) activeModalStack.push(panel)
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const focusable = () => panelRef.current?.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ) ?? []

    const focusFrame = requestAnimationFrame(() => focusable()[0]?.focus())

    const onKeyDown = (event: KeyboardEvent) => {
      if (activeModalStack.at(-1) !== panelRef.current) return
      // The themed Select menu is portaled outside this panel and owns its Escape/Tab keys.
      if (event.target instanceof Element && event.target.closest('.select-field__menu')) return
      if (event.key === 'Escape') {
        onCloseRef.current()
        return
      }
      if (event.key !== 'Tab') return
      const nodes = Array.from(focusable())
      if (nodes.length === 0) return
      const first = nodes[0]
      const last = nodes[nodes.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last?.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first?.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => {
      window.cancelAnimationFrame(focusFrame)
      document.body.style.overflow = previousOverflow
      const index = panel ? activeModalStack.lastIndexOf(panel) : -1
      if (index >= 0) activeModalStack.splice(index, 1)
      document.removeEventListener('keydown', onKeyDown)
      previousFocusRef.current?.focus()
    }
  }, [open])

  if (!open) return null

  return createPortal(
    <div className="ui-modal" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <section ref={panelRef} className={'ui-modal__panel ui-modal__panel--' + size} role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <header className="ui-modal__header">
          <div>
            <h2 id={titleId}>{title}</h2>
            {description ? <p>{description}</p> : null}
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label={closeLabel}><X size={16} /></button>
        </header>
        <div className={flush ? 'ui-modal__body ui-modal__body--flush' : 'ui-modal__body'}>{children}</div>
        {footer ? <footer className="ui-modal__footer">{footer}</footer> : null}
      </section>
    </div>,
    document.body,
  )
}
