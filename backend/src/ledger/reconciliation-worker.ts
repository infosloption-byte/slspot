import type { PrismaClient } from '../generated/prisma/client.js'
import type { LedgerReconciliation } from './service.js'

type ReconcileLogger = {
  info: (value: unknown, message?: string) => void
  error: (value: unknown, message?: string) => void
}

export type ReconciliationRunResult = {
  checked: number
  failed: Array<{ walletId: string; accountId: string; differences: LedgerReconciliation['differences']; unbalancedTransactions: string[]; missingWalletTransactions: string[] }>
}

type WalletRow = { id: string; accountId: string; account: { userId: string } }

export type ReconciliationWorkerDeps = {
  listWallets: (afterId: string | null, take: number) => Promise<WalletRow[]>
  reconcile: (userId: string, accountId: string) => Promise<LedgerReconciliation>
  logger: ReconcileLogger
  /** A wallet read concurrently with a trade can be momentarily off; a mismatch is confirmed after this delay. */
  recheckDelayMs?: number
  batchSize?: number
}

/** Scans every wallet against the ledger and reports mismatches at error level (the alert hook). */
export async function reconcileAllWallets(deps: ReconciliationWorkerDeps): Promise<ReconciliationRunResult> {
  const batchSize = deps.batchSize ?? 100
  const recheckDelayMs = deps.recheckDelayMs ?? 2_000
  const result: ReconciliationRunResult = { checked: 0, failed: [] }

  let cursor: string | null = null
  for (;;) {
    const wallets = await deps.listWallets(cursor, batchSize)
    if (wallets.length === 0) break

    for (const wallet of wallets) {
      let outcome = await deps.reconcile(wallet.account.userId, wallet.accountId)
      if (!outcome.ok) {
        await new Promise((resolve) => setTimeout(resolve, recheckDelayMs))
        outcome = await deps.reconcile(wallet.account.userId, wallet.accountId)
      }
      result.checked += 1
      if (!outcome.ok) {
        result.failed.push({
          walletId: wallet.id,
          accountId: wallet.accountId,
          differences: outcome.differences,
          unbalancedTransactions: outcome.unbalancedTransactions,
          missingWalletTransactions: outcome.missingWalletTransactions,
        })
      }
    }

    cursor = wallets[wallets.length - 1]!.id
    if (wallets.length < batchSize) break
  }

  if (result.failed.length > 0) {
    deps.logger.error({ checked: result.checked, failed: result.failed }, 'Wallet/ledger reconciliation FAILED')
  } else {
    deps.logger.info({ checked: result.checked }, 'Wallet/ledger reconciliation passed')
  }
  return result
}

export class LedgerReconciliationWorker {
  private timer: ReturnType<typeof setInterval> | null = null
  private running = false

  constructor(
    private readonly prisma: PrismaClient,
    private readonly reconcile: ReconciliationWorkerDeps['reconcile'],
    private readonly logger: ReconcileLogger,
    private readonly intervalMs: number,
  ) {}

  start(): void {
    if (this.timer || this.intervalMs <= 0) return
    this.timer = setInterval(() => void this.runOnce(), this.intervalMs)
    this.timer.unref?.()
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }

  async runOnce(): Promise<ReconciliationRunResult | null> {
    if (this.running) return null
    this.running = true
    try {
      return await reconcileAllWallets({
        listWallets: (afterId, take) => this.prisma.wallet.findMany({
          ...(afterId ? { where: { id: { gt: afterId } } } : {}),
          orderBy: { id: 'asc' },
          take,
          select: { id: true, accountId: true, account: { select: { userId: true } } },
        }),
        reconcile: this.reconcile,
        logger: this.logger,
      })
    } catch (error) {
      this.logger.error({ err: error }, 'Wallet/ledger reconciliation run failed to execute')
      return null
    } finally {
      this.running = false
    }
  }
}
