import { Check, ChevronDown } from 'lucide-react'
import { useState } from 'react'

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

export function Select({ value, options, onChange, label, className = '' }: SelectProps) {
  const [open, setOpen] = useState(false)
  const selected = options.find((option) => option.value === value) ?? options[0]

  return (
    <div className={'select-field ' + className}>
      {label ? <span className="select-field__label">{label}</span> : null}
      <div className="select-field__control">
        <button
          type="button"
          className="select-field__trigger"
          aria-haspopup="listbox"
          aria-expanded={open}
          onClick={() => setOpen((current) => !current)}
        >
          <span>{selected?.label ?? 'Select'}</span>
          <ChevronDown size={15} />
        </button>
        {open ? (
          <div className="select-field__menu" role="listbox">
            {options.map((option) => (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={option.value === value}
                className={option.value === value ? 'select-field__option select-field__option--active' : 'select-field__option'}
                onClick={() => { onChange(option.value); setOpen(false) }}
              >
                <span>{option.label}</span>
                {option.value === value ? <Check size={14} /> : null}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  )
}
