import type { ReactNode } from 'react'

type TooltipProps = {
  content: string
  children: ReactNode
  side?: 'top' | 'bottom'
}

export function Tooltip({ content, children, side = 'top' }: TooltipProps) {
  return (
    <span className={'tooltip tooltip--' + side}>
      {children}
      <span className="tooltip__content" role="tooltip">{content}</span>
    </span>
  )
}
