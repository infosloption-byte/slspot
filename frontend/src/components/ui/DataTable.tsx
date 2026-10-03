import type { ReactNode } from 'react'

export type DataTableColumn<T> = {
  key: string
  header: string
  render: (row: T) => ReactNode
  className?: string
}

type DataTableProps<T> = {
  columns: DataTableColumn<T>[]
  rows: T[]
  getRowKey: (row: T) => string
  empty?: ReactNode
  className?: string
}

export function DataTable<T>({ columns, rows, getRowKey, empty, className = '' }: DataTableProps<T>) {
  return (
    <div className={'ui-table-wrap ' + className}>
      <table className="ui-table">
        <thead>
          <tr>
            {columns.map((column) => <th key={column.key} className={column.className}>{column.header}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={getRowKey(row)}>
              {columns.map((column) => <td key={column.key} className={column.className}>{column.render(row)}</td>)}
            </tr>
          ))}
          {rows.length === 0 ? (
            <tr><td colSpan={columns.length}>{empty ?? 'No records found.'}</td></tr>
          ) : null}
        </tbody>
      </table>
    </div>
  )
}
