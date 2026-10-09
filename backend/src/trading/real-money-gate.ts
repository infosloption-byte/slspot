import { env } from '../config/env.js'

export type RealMoneyOperation = 'TRADING' | 'DEPOSIT' | 'WITHDRAWAL'

export type RealMoneyGateConfig = Readonly<{
  launchApproved: boolean
  tradingEnabled: boolean
  depositsEnabled: boolean
  withdrawalsEnabled: boolean
}>

const OPERATION_FLAG: Record<RealMoneyOperation, keyof RealMoneyGateConfig> = {
  TRADING: 'tradingEnabled',
  DEPOSIT: 'depositsEnabled',
  WITHDRAWAL: 'withdrawalsEnabled',
}

const OPERATION_LABEL: Record<RealMoneyOperation, string> = {
  TRADING: 'trading',
  DEPOSIT: 'deposits',
  WITHDRAWAL: 'withdrawals',
}

/**
 * Return a user-safe reason why a REAL-mode operation is unavailable.
 *
 * Every operation requires both the master launch approval and its own
 * feature flag. Flags default to false in env.ts, so a new environment
 * cannot enable real-money activity by omission.
 */
export function realMoneyOperationBlockReason(
  operation: RealMoneyOperation,
  gate: RealMoneyGateConfig = env.realMoney,
): string | null {
  if (!gate.launchApproved) {
    return 'Real-money operations are disabled by the platform launch gate.'
  }

  if (!gate[OPERATION_FLAG[operation]]) {
    return 'Real-money ' + OPERATION_LABEL[operation] + ' are not enabled.'
  }

  return null
}

export function isRealMoneyOperationEnabled(
  operation: RealMoneyOperation,
  gate: RealMoneyGateConfig = env.realMoney,
): boolean {
  return realMoneyOperationBlockReason(operation, gate) === null
}
