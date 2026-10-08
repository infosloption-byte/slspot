/** A real-money trade that expired without any reliable market price is voided once this grace period has passed. */
export function shouldVoidUnpricedTrade(input: { expiresAt: Date | null; now: number; voidAfterMs: number }): boolean {
  return input.expiresAt !== null && input.now - input.expiresAt.getTime() >= input.voidAfterMs
}

/** The message the user sees when a trade is voided: what happened, and that the full stake came back. */
export function voidNotification(input: { symbol: string; direction: string; amount: string; currency: string }) {
  return {
    type: 'SYSTEM' as const,
    title: 'Trade voided: price unavailable',
    body: input.symbol + ' · ' + input.direction + ' · We could not get a reliable market price when this trade expired, so it was voided and your stake of '
      + input.amount + ' ' + input.currency + ' was refunded in full.',
  }
}
