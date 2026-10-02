import type { ReactNode } from 'react'

type ErrorStateProps = {
  title?: string
  message: string
  icon?: ReactNode
  action?: ReactNode
}

export function ErrorState({ title = 'Something went wrong', message, icon, action }: ErrorStateProps) {
  return (
    <div className="state-card state-card--error" role="alert">
      {icon ? <span className="state-card__icon">{icon}</span> : null}
      <strong>{title}</strong>
      <span>{message}</span>
      {action}
    </div>
  )
}
