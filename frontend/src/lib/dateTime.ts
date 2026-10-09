/**
 * Display-time helpers.
 *
 * Every timestamp the API sends is an absolute instant (ISO/UTC). What changes per user is only
 * how it is shown: the timezone saved on the profile when there is one, otherwise the browser's.
 * Nothing here alters stored or transmitted data.
 */
type Listener = () => void

let displayTimeZone: string | undefined
const listeners = new Set<Listener>()

export function isValidTimeZone(value: string | null | undefined): value is string {
  if (!value || !value.trim()) return false
  try {
    new Intl.DateTimeFormat(undefined, { timeZone: value.trim() })
    return true
  } catch {
    return false
  }
}

export function browserTimeZone(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined
  } catch {
    return undefined
  }
}

/** Set the profile timezone. An empty or unknown value falls back to the browser's timezone. */
export function setDisplayTimeZone(value: string | null | undefined): void {
  const next = isValidTimeZone(value) ? value.trim() : undefined
  if (next === displayTimeZone) return
  displayTimeZone = next
  listeners.forEach((listener) => listener())
}

/** The timezone used for display; undefined means "the browser's own". */
export function getDisplayTimeZone(): string | undefined {
  return displayTimeZone
}

export function subscribeDisplayTimeZone(listener: Listener): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

export function toDate(value: string | number | Date): Date | null {
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

/** Date and time in the user's timezone, in their browser locale. Returns `fallback` for bad input. */
export function formatDateTime(
  value: string | number | Date | null | undefined,
  options: { timeZone?: string; fallback?: string; dateStyle?: 'short' | 'medium' } = {},
): string {
  const fallback = options.fallback ?? '—'
  if (value === null || value === undefined || value === '') return fallback
  const date = toDate(value)
  if (!date) return typeof value === 'string' ? value : fallback
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: options.dateStyle ?? 'medium',
    timeStyle: 'short',
    timeZone: options.timeZone ?? displayTimeZone,
  }).format(date)
}

export function formatTime(value: string | number | Date, options: { timeZone?: string } = {}): string {
  const date = toDate(value)
  if (!date) return ''
  return new Intl.DateTimeFormat(undefined, {
    timeStyle: 'medium',
    timeZone: options.timeZone ?? displayTimeZone,
  }).format(date)
}

/** "GMT+5:30" style label for the timezone in use, shown next to the chart. */
export function timeZoneLabel(at: Date = new Date(), timeZone: string | undefined = displayTimeZone): string {
  try {
    const part = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'shortOffset' })
      .formatToParts(at)
      .find((item) => item.type === 'timeZoneName')
    return part?.value ?? ''
  } catch {
    return ''
  }
}
