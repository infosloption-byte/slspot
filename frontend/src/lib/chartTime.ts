import { getDisplayTimeZone } from './dateTime'

/** Lightweight Charts time: UTC seconds, a business-day object, or a date string. */
export type ChartTime = number | string | { year: number; month: number; day: number }

export function chartTimeToDate(time: ChartTime): Date | null {
  if (typeof time === 'number') return new Date(time * 1000)
  if (typeof time === 'string') {
    const date = new Date(time)
    return Number.isNaN(date.getTime()) ? null : date
  }
  const date = new Date(Date.UTC(time.year, time.month - 1, time.day))
  return Number.isNaN(date.getTime()) ? null : date
}

/** Crosshair label: date and time in the user's timezone (24h, no seconds). */
export function formatChartCrosshairTime(time: ChartTime, timeZone: string | undefined = getDisplayTimeZone()): string {
  const date = chartTimeToDate(time)
  if (!date) return ''
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone,
  }).format(date)
}

export type TickKind = 'year' | 'month' | 'day' | 'time' | 'seconds'

/**
 * Lightweight Charts passes TickMarkType, a numeric enum (Year=0, Month=1, DayOfMonth=2, Time=3,
 * TimeWithSeconds=4). Accept the member names too so the label never silently degrades to a time.
 */
export function tickKind(tickMarkType: number | string): TickKind {
  switch (typeof tickMarkType === 'string' ? tickMarkType : Number(tickMarkType)) {
    case 0: case 'Year': return 'year'
    case 1: case 'Month': return 'month'
    case 2: case 'DayOfMonth': return 'day'
    case 4: case 'TimeWithSeconds': return 'seconds'
    default: return 'time'
  }
}

/** Axis tick label in the user's timezone. Date ticks mark day/month changes, others show the time. */
export function formatChartTick(
  time: ChartTime,
  tickMarkType: number | string,
  locale?: string,
  timeZone: string | undefined = getDisplayTimeZone(),
): string | null {
  const date = chartTimeToDate(time)
  if (!date) return null
  const kind = tickKind(tickMarkType)
  const options: Intl.DateTimeFormatOptions =
    kind === 'year' ? { year: 'numeric' }
      : kind === 'month' ? { month: 'short' }
        : kind === 'day' ? { month: 'short', day: 'numeric' }
          : kind === 'seconds' ? { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }
            : { hour: '2-digit', minute: '2-digit', hour12: false }
  return new Intl.DateTimeFormat(locale, { ...options, timeZone }).format(date)
}

/** Number of candles in `next` that come before the first candle of the previous data set. */
export function countPrepended(previousFirstTime: number | null, nextTimes: readonly number[]): number {
  if (previousFirstTime === null) return 0
  let count = 0
  for (const time of nextTimes) {
    if (time < previousFirstTime) count += 1
    else break
  }
  return count
}
