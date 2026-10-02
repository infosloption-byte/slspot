import type { ReactNode } from 'react'

type EmptyStateProps = {
  title: string
  message: string
  icon?: ReactNode
  action?: ReactNode
}

export function EmptyState({ title, message, icon, action }: EmptyStateProps) {
  return (
    <div className="state-card state-card--empty">
      {icon ? <span className="state-card__icon">{icon}</span> : null}
      <strong>{title}</strong>
      <span>{message}</span>
      {action}
    </div>
  )
}
