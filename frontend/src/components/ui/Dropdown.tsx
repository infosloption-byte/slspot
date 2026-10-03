import { ChevronDown } from 'lucide-react'
import type { ReactNode } from 'react'
import { useEffect, useRef, useState } from 'react'

type DropdownProps = {
  trigger: ReactNode
  children: ReactNode
  label?: string
  align?: 'start' | 'end'
  className?: string
}

export function Dropdown({ trigger, children, label, align = 'end', className = '' }: DropdownProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return undefined
    const onPointerDown = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        setOpen(false)
        triggerRef.current?.focus()
        return
      }
      if ((event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') && document.activeElement === triggerRef.current) {
        event.preventDefault()
        const firstItem = ref.current?.querySelector<HTMLElement>('[role="menuitem"],[role="menuitemradio"],button,a')
        firstItem?.focus()
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <div className={'ui-dropdown ui-dropdown--' + align + (className ? ' ' + className : '')} ref={ref}>
      <button
        ref={triggerRef}
        type="button"
        className="ui-dropdown__trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        onClick={() => setOpen((current) => !current)}
      >
        <span>{trigger}</span>
        <ChevronDown size={14} className={open ? 'ui-dropdown__chevron ui-dropdown__chevron--open' : 'ui-dropdown__chevron'} aria-hidden="true" />
      </button>
      {open ? <div className="ui-dropdown__menu" role="menu" aria-label={label}>{children}</div> : null}
    </div>
  )
}
