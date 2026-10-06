const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/

export function normalizeDateFilter(value: string | undefined, endOfDay = false): string | undefined {
  if (!value) return undefined
  const normalized = value.trim()
  if (!DATE_ONLY_PATTERN.test(normalized)) return value

  const date = new Date(normalized + (endOfDay ? 'T23:59:59.999' : 'T00:00:00.000'))
  if (Number.isNaN(date.getTime())) return value
  return date.toISOString()
}
