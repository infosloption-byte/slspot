/** Exact decimal arithmetic helpers: money is handled as integers in 1e-8 units so sums never drift. */
export const SCALE = 8
export const UNIT = 10n ** BigInt(SCALE)

/** Parse a plain decimal string such as "-12.5" into 1e-8 units. Extra digits beyond 8 places are truncated. */
export function toUnits(value: string | null | undefined): bigint {
  if (value === null || value === undefined || value === '') return 0n
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(value.trim())
  if (!match) throw new Error('Not a plain decimal: ' + value)
  const whole = BigInt(match[2] ?? '0')
  const fraction = BigInt((match[3] ?? '').padEnd(SCALE, '0').slice(0, SCALE) || '0')
  const units = whole * UNIT + fraction
  return match[1] === '-' ? -units : units
}

export function fromUnits(units: bigint): string {
  const negative = units < 0n
  const absolute = negative ? -units : units
  const whole = absolute / UNIT
  const fraction = (absolute % UNIT).toString().padStart(SCALE, '0')
  return (negative ? '-' : '') + whole.toString() + '.' + fraction
}
