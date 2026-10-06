/** In-process cache of the newest tick per asset and provider. */
export type LivePrice = {
  price: string
  at: number
  receivedAt: number
  provider: string
  sequence: string | null
}

const prices = new Map<string, Map<string, LivePrice>>()

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
  byProvider.set(provider, { price, at, receivedAt, provider, sequence })
  prices.set(assetId, byProvider)
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
}
