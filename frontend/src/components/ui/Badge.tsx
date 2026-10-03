import type { ReactNode } from 'react'

type BadgeProps = {
  children: ReactNode
  tone?: 'neutral' | 'accent' | 'success' | 'danger' | 'warning'
  className?: string
}

export function Badge({ children, tone = 'neutral', className = '' }: BadgeProps) {
  return <span className={'ui-badge ui-badge--' + tone + (className ? ' ' + className : '')}>{children}</span>
}
