/** In-process cache of the newest tick per asset and provider. */
export type LivePrice = {
  price: string
  at: number
  receivedAt: number
  provider: string
  sequence: string | null
}

const prices = new Map<string, Map<string, LivePrice>>()

/**
 * Short per-asset tick history so a trade can be settled at the price in force at its expiry
 * instant rather than whatever tick happens to be current when the settlement worker runs.
 * Must cover the longest trade duration plus worker lag and a restart-recovery margin.
 */
export const TICK_HISTORY_MS = 6 * 60_000
const history = new Map<string, LivePrice[]>()
const HISTORY_PRUNE_EVERY = 256
const historyWrites = new Map<string, number>()

function recordHistory(assetId: string, entry: LivePrice): void {
  const list = history.get(assetId) ?? []
  // Keep the list ordered by exchange time; late/out-of-order ticks are inserted in place.
  let index = list.length
  while (index > 0 && (list[index - 1]?.at ?? 0) > entry.at) index -= 1
  list.splice(index, 0, entry)
  history.set(assetId, list)

  const writes = (historyWrites.get(assetId) ?? 0) + 1
  historyWrites.set(assetId, writes)
  if (writes % HISTORY_PRUNE_EVERY === 0) {
    const cutoff = Date.now() - TICK_HISTORY_MS
    let drop = 0
    while (drop < list.length - 1 && (list[drop]?.at ?? Infinity) < cutoff) drop += 1
    if (drop > 0) list.splice(0, drop)
  }
}

/**
 * Newest tick at or before `atMs` (the price in force at that instant) and no older than
 * `maxAgeMs` relative to it. Returns null when there is no tick covering that instant.
 */
export function getLivePriceAt(
  assetId: string,
  atMs: number,
  maxAgeMs: number,
  provider?: string,
): LivePrice | null {
  const list = history.get(assetId)
  if (!list || list.length === 0) return null
  let lo = 0
  let hi = list.length - 1
  let found = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if ((list[mid]?.at ?? Infinity) <= atMs) { found = mid; lo = mid + 1 } else hi = mid - 1
  }
  for (let i = found; i >= 0; i -= 1) {
    const entry = list[i]
    if (!entry) continue
    if (atMs - entry.at > maxAgeMs) return null
    if (!provider || entry.provider === provider) return entry
  }
  return null
}

export function setLivePrice(
  assetId: string,
  provider: string,
  price: string,
  at = Date.now(),
  sequence: string | null = null,
  receivedAt = Date.now(),
): void {
  const byProvider = prices.get(assetId) ?? new Map<string, LivePrice>()
  const current = byProvider.get(provider)
  if (current && sequence !== null && current.sequence !== null) {
    const previousNumeric = /^\d+$/.test(current.sequence)
    const nextNumeric = /^\d+$/.test(sequence)
    if (previousNumeric && nextNumeric) {
      try {
        if (BigInt(sequence) <= BigInt(current.sequence)) return
      } catch {
        // Fall through to timestamp ordering when a provider sends an unexpectedly large ID.
      }
    } else if (sequence <= current.sequence && at <= current.at) {
      return
    }
  }
  const entry = { price, at, receivedAt, provider, sequence }
  byProvider.set(provider, entry)
  prices.set(assetId, byProvider)
  recordHistory(assetId, entry)
}

export function getLivePrice(
  assetId: string,
  maxAgeMs: number,
  now = Date.now(),
  provider?: string,
): LivePrice | null {
  const byProvider = prices.get(assetId)
  if (!byProvider) return null

  if (provider) {
    const entry = byProvider.get(provider)
    return entry && now - entry.at <= maxAgeMs ? entry : null
  }

  let newest: LivePrice | null = null
  for (const entry of byProvider.values()) {
    if (now - entry.at > maxAgeMs) continue
    if (!newest || entry.at > newest.at) newest = entry
  }
  return newest
}

export function getPreferredLivePrice(
  assetId: string,
  maxAgeMs: number,
  preferredProviders: string[],
  now = Date.now(),
): LivePrice | null {
  for (const provider of preferredProviders) {
    const entry = getLivePrice(assetId, maxAgeMs, now, provider)
    if (entry) return entry
  }
  return null
}

export function clearLivePrices(): void {
  prices.clear()
  history.clear()
  historyWrites.clear()
}
