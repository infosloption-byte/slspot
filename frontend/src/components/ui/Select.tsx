import { Check, ChevronDown } from 'lucide-react'
import { createPortal } from 'react-dom'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'

export type SelectOption = {
  value: string
  label: string
}

type SelectProps = {
  value: string
  options: SelectOption[]
  onChange: (value: string) => void
  label?: string
  className?: string
}

type MenuPosition = {
  left: number
  top: number
  width: number
}

export function Select({ value, options, onChange, label, className = '' }: SelectProps) {
  const [open, setOpen] = useState(false)
  const [menuPosition, setMenuPosition] = useState<MenuPosition | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const selected = options.find((option) => option.value === value) ?? options[0]

  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current
    const menu = menuRef.current
    if (!trigger) return

    const rect = trigger.getBoundingClientRect()
    const gap = 6
    const menuHeight = menu?.getBoundingClientRect().height ?? 280
    const shouldFlip = rect.bottom + gap + menuHeight > window.innerHeight - 8 && rect.top - gap - menuHeight >= 8
    const top = shouldFlip ? rect.top - gap - menuHeight : rect.bottom + gap
    const maxLeft = Math.max(8, window.innerWidth - rect.width - 8)

    setMenuPosition({
      left: Math.min(Math.max(8, rect.left), maxLeft),
      top,
      width: rect.width,
    })
  }, [])

  useLayoutEffect(() => {
    if (!open) {
      setMenuPosition(null)
      return undefined
    }

    updatePosition()
    const frame = window.requestAnimationFrame(updatePosition)
    const handleReposition = () => updatePosition()

    window.addEventListener('resize', handleReposition)
    window.addEventListener('scroll', handleReposition, true)

    return () => {
      window.cancelAnimationFrame(frame)
      window.removeEventListener('resize', handleReposition)
      window.removeEventListener('scroll', handleReposition, true)
    }
  }, [open, updatePosition])

  useEffect(() => {
    if (!open) return undefined

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node
      if (rootRef.current?.contains(target) || menuRef.current?.contains(target)) return
      setOpen(false)
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  const menu = open && menuPosition
    ? (
      <div
        ref={menuRef}
        className="select-field__menu"
        role="listbox"
        aria-label={label}
        style={{
          left: menuPosition.left,
          top: menuPosition.top,
          width: menuPosition.width,
        }}
      >
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            role="option"
            aria-selected={option.value === value}
            className={option.value === value ? 'select-field__option select-field__option--active' : 'select-field__option'}
            onClick={() => {
              onChange(option.value)
              setOpen(false)
            }}
          >
            <span>{option.label}</span>
            {option.value === value ? <Check size={13} aria-hidden="true" /> : null}
          </button>
        ))}
      </div>
    )
    : null

  return (
    <div className={'select-field ' + className} ref={rootRef}>
      {label ? <span className="select-field__label">{label}</span> : null}
      <div className="select-field__control">
        <button
          ref={triggerRef}
          type="button"
          className={open ? 'select-field__trigger select-field__trigger--open' : 'select-field__trigger'}
          aria-haspopup="listbox"
          aria-expanded={open}
          onClick={() => setOpen((current) => !current)}
        >
          <span>{selected?.label ?? 'Select'}</span>
          <ChevronDown size={14} aria-hidden="true" />
        </button>
      </div>
      {menu ? createPortal(menu, document.body) : null}
    </div>
  )
}
