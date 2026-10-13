import type { Prisma, PrismaClient } from '../generated/prisma/client.js'
import { env } from '../config/env.js'
import { fromUnits, toUnits } from '../lib/units.js'
import {
  DEFAULT_PAYOUT_RATES,
  looseningChanges,
  parseRiskLimitsInput,
  payoutRateFor,
  riskLimitsFromRecord,
  riskLimitsStore,
  summarizeOpenRisk,
  utilization,
  type OpenPosition,
  type RiskLimits,
} from '../trading/risk.js'
import { evaluateAlerts, type Alert } from './alerts.js'
import { AdminError, type AdminService } from './service.js'

const SETTLEMENT_ACCOUNT = 'SYSTEM:TRADE_SETTLEMENT'
const COOLDOWN_MS = { CRITICAL: 6 * 3_600_000, WARNING: 24 * 3_600_000 }

type LoggerLike = { warn: (obj: object, msg?: string) => void; error: (obj: object, msg?: string) => void; info: (obj: object, msg?: string) => void }
const quiet: LoggerLike = { warn: () => undefined, error: () => undefined, info: () => undefined }

/**
 * Platform risk settings (limits, payouts, restricted countries) and the operational alerts built on them.
 * The settings live in one database row; every process keeps a copy in memory that is refreshed regularly.
 */
export class RiskControlService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly admin: Pick<AdminService, 'requireAdmin'>,
    private readonly logger: LoggerLike = quiet,
    private readonly now: () => Date = () => new Date(),
  ) {}

  /** Read the row (creating it with the defaults if missing) and publish it to this process. */
  async load(): Promise<RiskLimits> {
    let record = await this.prisma.riskSettings.findUnique({ where: { id: 'GLOBAL' } })
    if (!record) {
      record = await this.prisma.riskSettings.upsert({
        where: { id: 'GLOBAL' },
        update: {},
        create: { id: 'GLOBAL', restrictedCountries: [...riskLimitsFromRecord(null).restrictedCountries] },
      })
    }
    const limits = riskLimitsFromRecord(record)
    riskLimitsStore.set(limits)
    return limits
  }

  async getSettings() {
    const record = await this.prisma.riskSettings.findUnique({ where: { id: 'GLOBAL' } })
    const limits = riskLimitsFromRecord(record)
    riskLimitsStore.set(limits)
    const assets = await this.prisma.asset.findMany({ where: { isActive: true }, select: { symbol: true }, orderBy: { symbol: 'asc' } })
    return {
      limits,
      updatedAt: record?.updatedAt.toISOString() ?? null,
      payouts: assets.map((asset) => ({
        symbol: asset.symbol,
        rate: payoutRateFor(asset.symbol, limits),
        defaultRate: DEFAULT_PAYOUT_RATES[asset.symbol] ?? '0.80',
        breakEvenWinRate: (100 / (1 + Number(payoutRateFor(asset.symbol, limits)))).toFixed(1),
      })),
      exposure: await this.exposure(limits),
    }
  }

  async updateSettings(actorUserId: string, input: unknown) {
    const actor = await this.admin.requireAdmin(actorUserId)
    const next = parseRiskLimitsInput(input)
    const saved = await this.prisma.$transaction(async (tx) => {
      // Lock the row so a concurrent trade (which also locks it) sees either the old or the new limits, never a mix.
      await tx.$queryRaw`SELECT id FROM RiskSettings WHERE id = 'GLOBAL' FOR UPDATE`
      const previousRecord = await tx.riskSettings.findUnique({ where: { id: 'GLOBAL' } })
      const previous = riskLimitsFromRecord(previousRecord)
      const loosened = looseningChanges(previous, next)
      if (loosened.length > 0 && actor.role !== 'SUPER_ADMIN') {
        throw new AdminError(403, 'SUPER_ADMIN_REQUIRED', 'Only a super administrator can raise limits, raise payouts or remove restricted countries (' + loosened.slice(0, 5).join(', ') + '). Any administrator can lower them.')
      }
      const data = {
        minTradeAmount: next.minTradeAmount,
        maxTradeAmount: next.maxTradeAmount,
        maxUserOpenExposure: next.maxUserOpenExposure,
        maxUserOpenPositions: next.maxUserOpenPositions,
        maxPlatformOpenProfit: next.maxPlatformOpenProfit,
        maxAssetOpenProfit: next.maxAssetOpenProfit,
        maxDirectionOpenProfit: next.maxDirectionOpenProfit,
        payoutRates: next.payoutRates as Prisma.InputJsonValue,
        restrictedCountries: next.restrictedCountries as Prisma.InputJsonValue,
        alertKycReviewHours: next.alertKycReviewHours,
      }
      const record = await tx.riskSettings.upsert({ where: { id: 'GLOBAL' }, update: data, create: { id: 'GLOBAL', ...data } })
      await tx.auditLog.create({
        data: {
          actorUserId,
          action: 'RISK_SETTINGS_CHANGED',
          entityType: 'RiskSettings',
          entityId: 'GLOBAL',
          metadata: { before: previous, after: next, loosened } as unknown as Prisma.InputJsonValue,
        },
      })
      return record
    })
    const limits = riskLimitsFromRecord(saved)
    riskLimitsStore.set(limits)
    return this.getSettings()
  }

  private async openPositions(): Promise<{ positions: OpenPosition[]; names: Map<string, string> }> {
    const rows = await this.prisma.position.findMany({
      where: { status: 'OPEN', account: { mode: 'REAL' } },
      select: { assetId: true, side: true, amount: true, order: { select: { payoutRate: true } }, asset: { select: { symbol: true } } },
    })
    const names = new Map<string, string>()
    const positions = rows.map((row) => {
      names.set(row.assetId, row.asset.symbol)
      return { assetId: row.assetId, side: row.side, amount: row.amount.toFixed(8), payoutRate: row.order.payoutRate.toFixed(6) }
    })
    return { positions, names }
  }

  /** How much of each cap is in use right now (REAL trades only). */
  async exposure(limits: RiskLimits = riskLimitsStore.get()) {
    const { positions, names } = await this.openPositions()
    const open = summarizeOpenRisk(positions)
    return {
      openPositions: positions.length,
      platform: utilization(open.platformProfit, limits.maxPlatformOpenProfit),
      byAsset: [...open.byAsset].map(([assetId, used]) => ({ symbol: names.get(assetId) ?? assetId, ...utilization(used, limits.maxAssetOpenProfit) })).sort((a, b) => b.percent - a.percent),
      byDirection: [...open.byDirection].map(([key, used]) => {
        const [assetId, side] = key.split(':')
        return { symbol: (names.get(assetId ?? '') ?? assetId) + (side === 'BUY' ? ' up' : ' down'), ...utilization(used, limits.maxDirectionOpenProfit) }
      }).sort((a, b) => b.percent - a.percent),
    }
  }

  // ------------------------------------------------------------ alerts

  /** Everything that needs attention right now. */
  async collectAlerts(): Promise<Alert[]> {
    const limits = riskLimitsStore.get()
    const [{ positions, names }, entries, kyc] = await Promise.all([
      this.openPositions(),
      this.prisma.ledgerEntry.groupBy({ by: ['direction'], where: { ledgerAccount: { code: SETTLEMENT_ACCOUNT } }, _sum: { amount: true } }),
      this.prisma.kycCase.aggregate({ where: { status: 'IN_REVIEW' }, _count: { _all: true }, _min: { submittedAt: true } }),
    ])
    let settlementBalance: string | null = null
    if (entries.length > 0) {
      const sum = (direction: string) => toUnits(entries.find((entry) => entry.direction === direction)?._sum.amount?.toFixed(8) ?? '0')
      settlementBalance = fromUnits(sum('CREDIT') - sum('DEBIT'))
    }
    return evaluateAlerts({
      settlementBalance,
      settlementFloor: env.alerts.settlementFloor,
      open: summarizeOpenRisk(positions),
      limits,
      assetNames: names,
      kycInReview: { count: kyc._count._all, oldestSubmittedAt: kyc._min.submittedAt },
      now: this.now(),
    })
  }

  /**
   * Check for problems and tell the administrators about the NEW ones: an in-app notification for every active
   * administrator and, if configured, a webhook. The same problem is repeated at most every 6 hours (critical) or 24 hours (warning).
   */
  async runAlertMonitor(): Promise<number> {
    const alerts = await this.collectAlerts()
    let sent = 0
    for (const alert of alerts) {
      const since = new Date(this.now().getTime() - COOLDOWN_MS[alert.severity])
      const recent = await this.prisma.auditLog.findFirst({ where: { action: 'ALERT_RAISED', entityType: 'Alert', entityId: alert.key, createdAt: { gte: since } }, select: { id: true } })
      if (recent) continue
      await this.prisma.auditLog.create({ data: { action: 'ALERT_RAISED', entityType: 'Alert', entityId: alert.key, metadata: { severity: alert.severity, title: alert.title, message: alert.message } } })
      await this.notifyAdmins(alert)
      await this.postWebhook(alert)
      sent += 1
    }
    return sent
  }

  private async notifyAdmins(alert: Alert): Promise<void> {
    try {
      const admins = await this.prisma.adminAccess.findMany({ where: { user: { status: 'ACTIVE' } }, select: { userId: true } })
      if (admins.length === 0) return
      await this.prisma.notification.createMany({
        data: admins.map((admin) => ({ userId: admin.userId, type: 'SYSTEM' as const, title: (alert.severity === 'CRITICAL' ? 'Critical: ' : 'Warning: ') + alert.title, body: alert.message })),
      })
    } catch (error) {
      this.logger.error({ err: error, alert: alert.key }, 'Could not notify administrators about an alert')
    }
  }

  private async postWebhook(alert: Alert): Promise<void> {
    const url = env.alerts.webhookUrl
    if (!url) return
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text: '[SLSpot ' + alert.severity + '] ' + alert.title + ': ' + alert.message, ...alert }),
        signal: AbortSignal.timeout(5_000),
      })
      if (!response.ok) this.logger.warn({ status: response.status, alert: alert.key }, 'Alert webhook returned an error')
    } catch (error) {
      this.logger.warn({ err: error, alert: alert.key }, 'Alert webhook failed')
    }
  }
}
