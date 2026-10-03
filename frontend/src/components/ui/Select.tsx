import { Check, ChevronDown } from 'lucide-react'
import { createPortal } from 'react-dom'
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'

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
  const [highlightedIndex, setHighlightedIndex] = useState(() => Math.max(0, options.findIndex((option) => option.value === value)))
  const menuId = useId().replace(/:/g, '')
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([])
  const selected = options.find((option) => option.value === value) ?? options[0]

  useEffect(() => {
    const index = options.findIndex((option) => option.value === value)
    setHighlightedIndex(index >= 0 ? index : 0)
  }, [options, value])

  useEffect(() => {
    if (!open) return
    optionRefs.current[highlightedIndex]?.focus()
  }, [highlightedIndex, menuPosition, open])

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
        id={menuId}
        role="listbox"
        aria-label={label}
        style={{
          left: menuPosition.left,
          top: menuPosition.top,
          width: menuPosition.width,
        }}
      >
        {options.map((option, index) => (
          <button
            key={option.value}
            ref={(element) => { optionRefs.current[index] = element }}
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
          aria-controls={open ? menuId : undefined}
          onClick={() => setOpen((current) => !current)}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') {
              event.preventDefault()
              setOpen(true)
              setHighlightedIndex((current) => Math.min(options.length - 1, Math.max(0, current + 1)))
            } else if (event.key === 'ArrowUp') {
              event.preventDefault()
              setOpen(true)
              setHighlightedIndex((current) => Math.max(0, current - 1))
            } else if (event.key === 'Home') {
              event.preventDefault()
              setOpen(true)
              setHighlightedIndex(0)
            } else if (event.key === 'End') {
              event.preventDefault()
              setOpen(true)
              setHighlightedIndex(Math.max(0, options.length - 1))
            } else if ((event.key === 'Enter' || event.key === ' ') && open) {
              event.preventDefault()
              const option = options[highlightedIndex]
              if (option) {
                onChange(option.value)
                setOpen(false)
                triggerRef.current?.focus()
              }
            }
          }}
        >
          <span>{selected?.label ?? 'Select'}</span>
          <ChevronDown size={14} aria-hidden="true" />
        </button>
      </div>
      {menu ? createPortal(menu, document.body) : null}
    </div>
  )
}
