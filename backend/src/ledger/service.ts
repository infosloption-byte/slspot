import { Prisma, type PrismaClient } from '../generated/prisma/client.js'

export type LedgerDirection = 'DEBIT' | 'CREDIT'
export type LedgerLine = {
  accountCode: string
  accountName: string
  accountType: 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE'
  direction: LedgerDirection
  amount: Prisma.Decimal | string
}

export type LedgerPostInput = {
  walletTransactionId: string
  currency: string
  referenceType?: string
  referenceId?: string
  description?: string
  metadata?: Prisma.InputJsonValue
  lines: LedgerLine[]
}

export type LedgerReconciliation = {
  ok: boolean
  walletId: string
  currency: string
  wallet: {
    availableBalance: string
    heldBalance: string
    totalBalance: string
  }
  ledger: {
    availableBalance: string
    heldBalance: string
  }
  differences: {
    available: string
    held: string
  }
  transactionCount: number
  unbalancedTransactions: string[]
  missingWalletTransactions: string[]
}

const ZERO = new Prisma.Decimal(0)

export function signedLedgerAmount(direction: LedgerDirection, amount: Prisma.Decimal | string): Prisma.Decimal {
  const value = new Prisma.Decimal(amount)
  return direction === 'CREDIT' ? value : value.neg()
}

export function assertBalancedLedgerLines(lines: LedgerLine[], currency: string): void {
  if (lines.length < 2) throw new Error('A ledger transaction requires at least two entries')

  const normalizedCurrency = currency.toUpperCase()
  let debits = ZERO
  let credits = ZERO

  for (const line of lines) {
    const amount = new Prisma.Decimal(line.amount)
    if (!amount.isFinite() || amount.lte(0)) throw new Error('Ledger entry amount must be positive')
    if (line.direction === 'DEBIT') debits = debits.plus(amount)
    else credits = credits.plus(amount)
  }

  if (!debits.eq(credits)) {
    throw new Error('Ledger transaction is not balanced')
  }
}

export class LedgerService {
  constructor(private readonly prisma: PrismaClient) {}

  async ensureWalletLedgerAccounts(
    tx: Prisma.TransactionClient | PrismaClient,
    accountId: string,
    currency: string,
  ): Promise<{ availableCode: string; heldCode: string }> {
    const normalizedCurrency = currency.slice(0, 3).toUpperCase()
    const availableCode = 'USER:' + accountId + ':AVAILABLE'
    const heldCode = 'USER:' + accountId + ':HELD'

    await tx.ledgerAccount.upsert({
      where: { code: availableCode },
      create: {
        code: availableCode,
        name: 'User available balance',
        type: 'LIABILITY',
        currency: normalizedCurrency,
        accountId,
      },
      update: { active: true },
    })

    await tx.ledgerAccount.upsert({
      where: { code: heldCode },
      create: {
        code: heldCode,
        name: 'User held balance',
        type: 'LIABILITY',
        currency: normalizedCurrency,
        accountId,
      },
      update: { active: true },
    })

    return { availableCode, heldCode }
  }

  async ensureSystemLedgerAccount(
    tx: Prisma.TransactionClient | PrismaClient,
    code: string,
    name: string,
    type: LedgerLine['accountType'],
    currency: string,
  ): Promise<string> {
    const normalizedCurrency = currency.slice(0, 3).toUpperCase()
    const fullCode = code + ':' + normalizedCurrency
    await tx.ledgerAccount.upsert({
      where: { code: fullCode },
      create: {
        code: fullCode,
        name,
        type,
        currency: normalizedCurrency,
      },
      update: { active: true },
    })
    return fullCode
  }

  async postTransaction(tx: Prisma.TransactionClient, input: LedgerPostInput): Promise<void> {
    assertBalancedLedgerLines(input.lines, input.currency)

    const normalizedCurrency = input.currency.slice(0, 3).toUpperCase()
    const transaction = await tx.ledgerTransaction.create({
      data: {
        walletTransactionId: input.walletTransactionId,
        currency: normalizedCurrency,
        referenceType: input.referenceType ?? null,
        referenceId: input.referenceId ?? null,
        description: input.description ?? null,
        metadata: input.metadata,
      },
    })

    const accountCodes = [...new Set(input.lines.map((line) => line.accountCode))]
    const accounts = await tx.ledgerAccount.findMany({
      where: { code: { in: accountCodes }, active: true },
    })
    const accountByCode = new Map(accounts.map((account) => [account.code, account]))

    for (const line of input.lines) {
      const account = accountByCode.get(line.accountCode)
      if (!account) throw new Error('Ledger account not found: ' + line.accountCode)
      if (account.currency !== normalizedCurrency) throw new Error('Ledger account currency mismatch: ' + line.accountCode)

      await tx.ledgerEntry.create({
        data: {
          ledgerTransactionId: transaction.id,
          ledgerAccountId: account.id,
          direction: line.direction,
          amount: new Prisma.Decimal(line.amount),
          currency: normalizedCurrency,
          referenceType: input.referenceType ?? null,
          referenceId: input.referenceId ?? null,
        },
      })
    }

    for (const accountId of [...new Set(accounts.map((account) => account.id))]) {
      const [credits, debits] = await Promise.all([
        tx.ledgerEntry.aggregate({
          where: { ledgerAccountId: accountId, direction: 'CREDIT' },
          _sum: { amount: true },
        }),
        tx.ledgerEntry.aggregate({
          where: { ledgerAccountId: accountId, direction: 'DEBIT' },
          _sum: { amount: true },
        }),
      ])
      const balance = (credits._sum.amount ?? ZERO).minus(debits._sum.amount ?? ZERO)
      await tx.ledgerBalanceSnapshot.create({
        data: {
          ledgerAccountId: accountId,
          ledgerTransactionId: transaction.id,
          currency: normalizedCurrency,
          balance,
        },
      })
    }
  }

  async reconcileWallet(userId: string, accountId: string): Promise<LedgerReconciliation> {
    const wallet = await this.prisma.wallet.findUnique({
      where: { accountId },
      include: { account: true },
    })
    if (!wallet || wallet.account.userId !== userId) throw new Error('Wallet not found')

    const availableCode = 'USER:' + accountId + ':AVAILABLE'
    const heldCode = 'USER:' + accountId + ':HELD'

    const ledgerAccounts = await this.prisma.ledgerAccount.findMany({
      where: { code: { in: [availableCode, heldCode] } },
      select: { id: true, code: true, currency: true },
    })
    const balances = new Map<string, Prisma.Decimal>()
    for (const account of ledgerAccounts) {
      const [credits, debits] = await Promise.all([
        this.prisma.ledgerEntry.aggregate({ where: { ledgerAccountId: account.id, direction: 'CREDIT' }, _sum: { amount: true } }),
        this.prisma.ledgerEntry.aggregate({ where: { ledgerAccountId: account.id, direction: 'DEBIT' }, _sum: { amount: true } }),
      ])
      balances.set(account.code, (credits._sum.amount ?? ZERO).minus(debits._sum.amount ?? ZERO))
    }

    const ledgerTransactions = await this.prisma.ledgerTransaction.findMany({
      where: { entries: { some: { ledgerAccountId: { in: ledgerAccounts.map((item) => item.id) } } } },
      include: { entries: true },
      orderBy: { createdAt: 'asc' },
      take: 10000,
    })
    const unbalancedTransactions: string[] = []
    for (const transaction of ledgerTransactions) {
      const total = transaction.entries.reduce(
        (sum, entry) => sum.plus(signedLedgerAmount(entry.direction, entry.amount)),
        ZERO,
      )
      if (!total.eq(ZERO)) unbalancedTransactions.push(transaction.id)
    }

    const walletTransactions = await this.prisma.walletTransaction.findMany({
      where: { walletId: wallet.id },
      select: { id: true, ledgerTransaction: { select: { id: true } } },
      orderBy: { createdAt: 'asc' },
      take: 10000,
    })
    const missingWalletTransactions = walletTransactions
      .filter((transaction) => !transaction.ledgerTransaction)
      .map((transaction) => transaction.id)

    const available = balances.get(availableCode) ?? ZERO
    const held = balances.get(heldCode) ?? ZERO
    const availableDifference = available.minus(wallet.availableBalance)
    const heldDifference = held.minus(wallet.heldBalance)

    return {
      ok: availableDifference.eq(ZERO) && heldDifference.eq(ZERO) &&
        unbalancedTransactions.length === 0 && missingWalletTransactions.length === 0,
      walletId: wallet.id,
      currency: wallet.currency,
      wallet: {
        availableBalance: wallet.availableBalance.toString(),
        heldBalance: wallet.heldBalance.toString(),
        totalBalance: wallet.availableBalance.plus(wallet.heldBalance).toString(),
      },
      ledger: {
        availableBalance: available.toString(),
        heldBalance: held.toString(),
      },
      differences: {
        available: availableDifference.toString(),
        held: heldDifference.toString(),
      },
      transactionCount: ledgerTransactions.length,
      unbalancedTransactions,
      missingWalletTransactions,
    }
  }
}
