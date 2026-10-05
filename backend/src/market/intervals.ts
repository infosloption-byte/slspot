import type { CandleInterval } from './types.js'

export function intervalMs(interval: CandleInterval): number {
  switch (interval) {
    case '1min': return 60_000
    case '5min': return 300_000
    case '15min': return 900_000
    case '30min': return 1_800_000
    case '45min': return 2_700_000
    case '1h': return 3_600_000
    case '2h': return 7_200_000
    case '4h': return 14_400_000
    case '8h': return 28_800_000
    case '1day': return 86_400_000
    case '1week': return 604_800_000
    case '1month': return 2_592_000_000
  }
}
