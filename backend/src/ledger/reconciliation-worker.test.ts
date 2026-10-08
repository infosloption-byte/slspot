import assert from 'node:assert/strict'
import test from 'node:test'
import { reconcileAllWallets } from './reconciliation-worker.js'
import type { LedgerReconciliation } from './service.js'

const zero = { available: '0', held: '0' }
const report = (ok: boolean, walletId: string): LedgerReconciliation => ({
  ok,
  walletId,
  currency: 'USD',
  wallet: { availableBalance: '0', heldBalance: '0', totalBalance: '0' },
  ledger: { availableBalance: '0', heldBalance: '0' },
  differences: ok ? zero : { available: '5', held: '0' },
  transactionCount: 0,
  unbalancedTransactions: [],
  missingWalletTransactions: [],
})

function makeDeps(wallets: string[], reconcile: (accountId: string, call: number) => boolean) {
  const logs: Array<[string, unknown]> = []
  const calls = new Map<string, number>()
  return {
    logs,
    deps: {
      listWallets: async (afterId: string | null, take: number) =>
        wallets.filter((id) => !afterId || id > afterId).slice(0, take).map((id) => ({ id: 'w' + id, accountId: id, account: { userId: 'u' + id } })),
      reconcile: async (_userId: string, accountId: string) => {
        const call = (calls.get(accountId) ?? 0) + 1
        calls.set(accountId, call)
        return report(reconcile(accountId, call), 'w' + accountId)
      },
      logger: { info: (v: unknown) => logs.push(['info', v]), error: (v: unknown) => logs.push(['error', v]) },
      recheckDelayMs: 1,
      batchSize: 2,
    },
  }
}

test('checks every wallet across batches and logs a pass', async () => {
  const { deps, logs } = makeDeps(['1', '2', '3', '4', '5'], () => true)
  // wallet ids are prefixed with "w", so the cursor compares prefixed ids consistently
  deps.listWallets = async (afterId, take) =>
    ['1', '2', '3', '4', '5'].filter((id) => !afterId || 'w' + id > afterId).slice(0, take).map((id) => ({ id: 'w' + id, accountId: id, account: { userId: 'u' + id } }))
  const result = await reconcileAllWallets(deps)
  assert.equal(result.checked, 5)
  assert.equal(result.failed.length, 0)
  assert.equal(logs.at(-1)?.[0], 'info')
})

test('a transient mismatch that clears on recheck is not reported', async () => {
  const { deps, logs } = makeDeps(['1'], (_id, call) => call > 1)
  const result = await reconcileAllWallets(deps)
  assert.equal(result.failed.length, 0)
  assert.equal(logs.at(-1)?.[0], 'info')
})

test('a persistent mismatch is reported at error level with its differences', async () => {
  const { deps, logs } = makeDeps(['1', '2'], (id) => id !== '2')
  const result = await reconcileAllWallets(deps)
  assert.equal(result.checked, 2)
  assert.equal(result.failed.length, 1)
  assert.equal(result.failed[0]?.accountId, '2')
  assert.equal(result.failed[0]?.differences.available, '5')
  assert.equal(logs.at(-1)?.[0], 'error')
})
