import type { ReactNode } from 'react'

export type TabItem<T extends string> = {
  id: T
  label: string
  icon?: ReactNode
  count?: number
  disabled?: boolean
}

type TabsProps<T extends string> = {
  items: TabItem<T>[]
  value: T
  onChange: (value: T) => void
  className?: string
}

export function Tabs<T extends string>({ items, value, onChange, className = '' }: TabsProps<T>) {
  return (
    <div className={'ui-tabs ' + className} role="tablist">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          role="tab"
          aria-selected={item.id === value}
          aria-disabled={item.disabled || undefined}
          disabled={item.disabled}
          className={item.id === value ? 'ui-tabs__tab ui-tabs__tab--active' : 'ui-tabs__tab'}
          onClick={() => onChange(item.id)}
        >
          {item.icon ? <span className="ui-tabs__icon">{item.icon}</span> : null}
          <span>{item.label}</span>
          {item.count !== undefined ? <span className="ui-tabs__count">{item.count}</span> : null}
        </button>
      ))}
    </div>
  )
}
