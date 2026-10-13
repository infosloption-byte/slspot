import { fromUnits, toUnits } from '../lib/units.js'
import { directionKey, utilization, type OpenRisk, type RiskLimits } from '../trading/risk.js'

/**
 * Operational alerts for the administrators. Pure: give it the numbers, get back what needs attention.
 * `key` identifies one specific problem so the monitor can avoid sending the same alert over and over.
 */

export type AlertSeverity = 'WARNING' | 'CRITICAL'
export type AlertCode = 'SETTLEMENT_NEGATIVE' | 'CAP_NEAR' | 'CAP_REACHED' | 'KYC_STUCK'

export type Alert = {
  code: AlertCode
  severity: AlertSeverity
  key: string
  title: string
  message: string
}

/** A cap is reported once it is this full (percent). */
export const CAP_WARNING_PERCENT = 80

export type AlertInput = {
  /** Credits minus debits on SYSTEM:TRADE_SETTLEMENT: the platform's cumulative result from settled trades. Null if the account does not exist yet. */
  settlementBalance: string | null
  /** The balance below which the settlement alert fires. Default 0. */
  settlementFloor?: string
  open: OpenRisk
  limits: RiskLimits
  assetNames: ReadonlyMap<string, string>
  kycInReview: { count: number; oldestSubmittedAt: Date | null }
  now: Date
}

function capAlert(label: string, subject: string, used: bigint, limit: string): Alert | null {
  const u = utilization(used, limit)
  if (u.percent < CAP_WARNING_PERCENT) return null
  const reached = u.percent >= 100
  return {
    code: reached ? 'CAP_REACHED' : 'CAP_NEAR',
    severity: reached ? 'CRITICAL' : 'WARNING',
    key: (reached ? 'CAP_REACHED:' : 'CAP_NEAR:') + subject,
    title: label + (reached ? ' is full' : ' is almost full'),
    message: label + ' has ' + u.used + ' of ' + u.limit + ' open profit in use (' + Math.round(u.percent) + '%).' +
      (reached ? ' New real trades that add to it are being rejected.' : ' New real trades will be rejected once it is full.'),
  }
}

export function evaluateAlerts(input: AlertInput): Alert[] {
  const alerts: Alert[] = []
  const { limits, open } = input

  if (input.settlementBalance !== null) {
    const balance = toUnits(input.settlementBalance)
    const floor = toUnits(input.settlementFloor ?? '0')
    if (balance < floor) {
      alerts.push({
        code: 'SETTLEMENT_NEGATIVE',
        severity: 'CRITICAL',
        key: 'SETTLEMENT_NEGATIVE',
        title: 'Platform trading result is negative',
        message: 'The trade settlement ledger account (SYSTEM:TRADE_SETTLEMENT) stands at ' + fromUnits(balance) + ': customers have won more than they lost. Check that the platform holds enough cash to pay withdrawals.',
      })
    }
  }

  const platform = capAlert('The platform open-profit cap', 'PLATFORM', open.platformProfit, limits.maxPlatformOpenProfit)
  if (platform) alerts.push(platform)
  for (const [assetId, used] of open.byAsset) {
    const name = input.assetNames.get(assetId) ?? assetId
    const alert = capAlert('The ' + name + ' cap', 'ASSET:' + assetId, used, limits.maxAssetOpenProfit)
    if (alert) alerts.push(alert)
  }
  for (const [key, used] of open.byDirection) {
    const [assetId, side] = key.split(':') as [string, 'BUY' | 'SELL']
    if (directionKey(assetId, side) !== key) continue
    const name = (input.assetNames.get(assetId) ?? assetId) + (side === 'BUY' ? ' up' : ' down')
    const alert = capAlert('The ' + name + ' cap', 'DIRECTION:' + key, used, limits.maxDirectionOpenProfit)
    if (alert) alerts.push(alert)
  }

  if (input.kycInReview.oldestSubmittedAt) {
    const ageHours = (input.now.getTime() - input.kycInReview.oldestSubmittedAt.getTime()) / 3_600_000
    if (ageHours >= limits.alertKycReviewHours) {
      const n = input.kycInReview.count
      alerts.push({
        code: 'KYC_STUCK',
        severity: 'WARNING',
        key: 'KYC_STUCK',
        title: 'Identity checks are waiting for review',
        message: n + (n === 1 ? ' identity check has' : ' identity checks have') + ' been waiting for review; the oldest for ' + Math.floor(ageHours) + ' hours (alert after ' + limits.alertKycReviewHours + ').',
      })
    }
  }

  return alerts.sort((a, b) => Number(b.severity === 'CRITICAL') - Number(a.severity === 'CRITICAL'))
}
