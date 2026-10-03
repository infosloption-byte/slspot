import { useId } from 'react'
import type { InputHTMLAttributes, ReactNode } from 'react'

type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  label?: string
  hint?: string
  error?: string
  leading?: ReactNode
}

export function Input({ label, hint, error, leading, id, className = '', ...props }: InputProps) {
  const generatedId = useId()
  const inputId = id ?? 'ui-input-' + generatedId.replace(/:/g, '')
  const describedBy = [
    hint ? inputId + '-hint' : '',
    error ? inputId + '-error' : '',
  ].filter(Boolean).join(' ') || undefined

  return (
    <label className={'ui-input ' + className}>
      {label ? <span className="ui-input__label">{label}</span> : null}
      <span className={error ? 'ui-input__control ui-input__control--error' : 'ui-input__control'}>
        {leading ? <span className="ui-input__leading" aria-hidden="true">{leading}</span> : null}
        <input {...props} id={inputId} aria-invalid={Boolean(error)} aria-describedby={describedBy} />
      </span>
      {hint ? <small id={inputId + '-hint'} className="ui-input__hint">{hint}</small> : null}
      {error ? <small id={inputId + '-error'} className="ui-input__error">{error}</small> : null}
    </label>
  )
}
