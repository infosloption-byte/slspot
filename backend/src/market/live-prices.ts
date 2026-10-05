/** In-process cache of the newest tick per asset, written by the tick stream and read by trading. */
export type LivePrice = { price: string; at: number }

const prices = new Map<string, LivePrice>()

export function setLivePrice(assetId: string, price: string, at = Date.now()): void {
  prices.set(assetId, { price, at })
}

export function getLivePrice(assetId: string, maxAgeMs: number, now = Date.now()): LivePrice | null {
  const entry = prices.get(assetId)
  return entry && now - entry.at <= maxAgeMs ? entry : null
}

export function clearLivePrices(): void {
  prices.clear()
}
