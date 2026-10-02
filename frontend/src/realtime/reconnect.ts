export function getReconnectDelay(
  attempt: number,
  minimumMs = 500,
  maximumMs = 15_000,
): number {
  const boundedAttempt = Math.max(0, Math.min(attempt, 10))
  const exponential = minimumMs * 2 ** boundedAttempt
  const jitter = Math.floor(Math.random() * Math.max(1, Math.floor(exponential * 0.25)))
  return Math.min(maximumMs, exponential + jitter)
}
