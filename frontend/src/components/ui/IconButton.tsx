import type { ButtonHTMLAttributes, ReactNode } from 'react'

type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string
  children: ReactNode
  active?: boolean
}

export function IconButton({ label, children, active = false, className = '', ...props }: IconButtonProps) {
  const classes = ['icon-button', active ? 'icon-button--active' : '', className].filter(Boolean).join(' ')

  return (
    <button className={classes} type="button" aria-label={label} title={label} {...props}>
      {children}
    </button>
  )
}
