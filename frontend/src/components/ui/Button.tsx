import type { ButtonHTMLAttributes, ReactNode } from 'react'

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'md' | 'lg'
  busy?: boolean
  icon?: ReactNode
}

export function Button({
  children,
  variant = 'secondary',
  size = 'md',
  busy = false,
  icon,
  disabled,
  className = '',
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      className={'ui-button ui-button--' + variant + ' ui-button--' + size + (className ? ' ' + className : '')}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
    >
      {busy ? <span className="loading-spinner" aria-hidden="true" /> : icon}
      <span>{children}</span>
    </button>
  )
}
