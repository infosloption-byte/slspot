import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  ageOn,
  isPaymentProviderOperationAllowed,
  computeKycTier,
  evaluateDeposit,
  evaluateWithdrawal,
  fromUnits,
  maskDestination,
  missingProfileFields,
  toUnits,
  validateDetails,
  withdrawalNeedsReview,
  type WithdrawalRuleInput,
} from './rules.js'

const NOW = new Date('2026-10-09T10:00:00Z')

const withdrawal = (overrides: Partial<WithdrawalRuleInput> = {}): WithdrawalRuleInput => ({
  tier: 2,
  twoFactorEnabled: true,
  countryCode: 'LK',
  blockedCountries: [],
  amount: '100',
  available: '500',
  providerUsedForDeposit: true,
  totalDeposited: '200',
  totalTraded: '250',
  turnoverMultiple: '1',
  lastSecurityChangeAt: null,
  coolingHours: 24,
  now: NOW,
  relaxed: false,
  ...overrides,
})

const codes = (input: WithdrawalRuleInput) => evaluateWithdrawal(input).map((blocker) => blocker.code)

describe('payment provider launch gate', () => {
  const base = {
    direction: 'deposit' as const,
    providerIsSandbox: false,
    sandboxModeEnabled: true,
    launchApproved: false,
    depositsEnabled: false,
    withdrawalsEnabled: false,
  }

  it('allows sandbox providers only when sandbox mode is enabled', () => {
    assert.equal(isPaymentProviderOperationAllowed({ ...base, providerIsSandbox: true }), true)
    assert.equal(isPaymentProviderOperationAllowed({ ...base, providerIsSandbox: true, sandboxModeEnabled: false }), false)
  })

  it('requires master approval and the operation-specific flag for real providers', () => {
    assert.equal(isPaymentProviderOperationAllowed({ ...base, launchApproved: true, depositsEnabled: true }), true)
    assert.equal(isPaymentProviderOperationAllowed({ ...base, launchApproved: false, depositsEnabled: true }), false)
    assert.equal(isPaymentProviderOperationAllowed({ ...base, launchApproved: true, depositsEnabled: false }), false)
  })

  it('checks deposits and withdrawals independently', () => {
    assert.equal(isPaymentProviderOperationAllowed({ ...base, direction: 'withdrawal', launchApproved: true, depositsEnabled: true, withdrawalsEnabled: false }), false)
    assert.equal(isPaymentProviderOperationAllowed({ ...base, direction: 'withdrawal', launchApproved: true, depositsEnabled: false, withdrawalsEnabled: true }), true)
  })
})

describe('decimal units', () => {
  it('round-trips amounts exactly', () => {
    assert.equal(fromUnits(toUnits('12.5')), '12.5')
    assert.equal(fromUnits(toUnits('0.00000001')), '0.00000001')
    assert.equal(fromUnits(toUnits('100')), '100')
    assert.equal(toUnits('0.1') + toUnits('0.2'), toUnits('0.3'))
  })
  it('rejects malformed amounts', () => {
    assert.throws(() => toUnits('1e3'))
    assert.throws(() => toUnits('abc'))
    assert.throws(() => toUnits('1.123456789'))
  })
})

describe('kyc tier', () => {
  const complete = { emailVerified: true, legalName: 'A B', dateOfBirth: new Date('1990-01-01'), countryCode: 'LK' }
  it('is 0 until the email is verified and the profile is complete', () => {
    assert.equal(computeKycTier({ ...complete, emailVerified: false, kycApproved: false }), 0)
    assert.equal(computeKycTier({ ...complete, legalName: ' ', kycApproved: false }), 0)
    assert.deepEqual(missingProfileFields({ ...complete, dateOfBirth: null, countryCode: null }), ['dateOfBirth', 'countryCode'])
  })
  it('is 1 with a complete profile and 2 once identity is approved', () => {
    assert.equal(computeKycTier({ ...complete, kycApproved: false }), 1)
    assert.equal(computeKycTier({ ...complete, kycApproved: true }), 2)
  })
  it('computes age from the date of birth', () => {
    assert.equal(ageOn(new Date('2008-10-10'), NOW), 17)
    assert.equal(ageOn(new Date('2008-10-09'), NOW), 18)
  })
})

describe('deposit rules', () => {
  const base = { tier: 1 as const, emailVerified: true, missingProfile: [], countryCode: 'LK', blockedCountries: [], amount: '50', completedDeposits: '0', tier1DepositLimit: '0' }
  it('allows a verified user with a complete profile', () => {
    assert.deepEqual(evaluateDeposit(base), [])
  })
  it('blocks payment deposits for users below the minimum age', () => {
    assert.deepEqual(evaluateDeposit({ ...base, age: 17 }).map((item) => item.code), ['AGE_RESTRICTED'])
    assert.deepEqual(evaluateDeposit({ ...base, age: 18 }), [])
  })
  it('blocks incomplete profiles and unverified email', () => {
    const codes = evaluateDeposit({ ...base, emailVerified: false, missingProfile: ['legalName'] }).map((item) => item.code)
    assert.deepEqual(codes, ['EMAIL_NOT_VERIFIED', 'PROFILE_INCOMPLETE'])
  })
  it('blocks configured countries only', () => {
    assert.equal(evaluateDeposit({ ...base, countryCode: 'XX', blockedCountries: ['XX'] })[0]?.code, 'COUNTRY_NOT_SUPPORTED')
    assert.deepEqual(evaluateDeposit({ ...base, countryCode: 'LK', blockedCountries: ['XX'] }), [])
  })
  it('applies the tier-1 limit to cumulative deposits, and not to verified users', () => {
    const limited = { ...base, tier1DepositLimit: '100', completedDeposits: '80', amount: '30' }
    assert.equal(evaluateDeposit(limited)[0]?.code, 'KYC_REQUIRED_FOR_LIMIT')
    assert.deepEqual(evaluateDeposit({ ...limited, amount: '20' }), [])
    assert.deepEqual(evaluateDeposit({ ...limited, tier: 2 }), [])
  })
})

describe('withdrawal rules', () => {
  it('allows a verified, 2FA-protected user who has traded', () => {
    assert.deepEqual(codes(withdrawal()), [])
  })
  it('blocks payment withdrawals for users below the minimum age, even in relaxed test mode', () => {
    assert.deepEqual(codes(withdrawal({ age: 17, relaxed: true })), ['AGE_RESTRICTED'])
    assert.deepEqual(codes(withdrawal({ age: 18 })), [])
  })
  it('requires identity verification and 2FA', () => {
    assert.deepEqual(codes(withdrawal({ tier: 1, twoFactorEnabled: false })), ['KYC_REQUIRED', 'TWO_FACTOR_REQUIRED'])
  })
  it('requires the profile first', () => {
    assert.ok(codes(withdrawal({ tier: 0 })).includes('PROFILE_INCOMPLETE'))
  })
  it('blocks amounts above the available balance', () => {
    assert.deepEqual(codes(withdrawal({ amount: '600' })), ['INSUFFICIENT_FUNDS'])
  })
  it('sends money back only through a method used to deposit', () => {
    assert.deepEqual(codes(withdrawal({ providerUsedForDeposit: false })), ['METHOD_NOT_USED_FOR_DEPOSIT'])
  })
  it('enforces turnover as a multiple of deposits', () => {
    const blocked = evaluateWithdrawal(withdrawal({ totalTraded: '150' }))
    assert.equal(blocked[0]?.code, 'TURNOVER_NOT_MET')
    assert.match(blocked[0]?.message ?? '', /50 to go/)
    assert.deepEqual(codes(withdrawal({ totalTraded: '200' })), [])
    assert.deepEqual(codes(withdrawal({ totalTraded: '0', turnoverMultiple: '0' })), [])
  })
  it('pauses withdrawals after a password or 2FA change, then releases them', () => {
    const recent = new Date(NOW.getTime() - 3_600_000)
    assert.deepEqual(codes(withdrawal({ lastSecurityChangeAt: recent })), ['COOLING_OFF'])
    const old = new Date(NOW.getTime() - 25 * 3_600_000)
    assert.deepEqual(codes(withdrawal({ lastSecurityChangeAt: old })), [])
    assert.deepEqual(codes(withdrawal({ lastSecurityChangeAt: recent, coolingHours: 0 })), [])
  })
  it('relaxed mode skips KYC, 2FA, turnover and cooling-off but never balance or method checks', () => {
    const relaxed = withdrawal({ tier: 1, twoFactorEnabled: false, totalTraded: '0', lastSecurityChangeAt: NOW, relaxed: true })
    assert.deepEqual(codes(relaxed), [])
    assert.deepEqual(codes({ ...relaxed, amount: '900', providerUsedForDeposit: false }), ['INSUFFICIENT_FUNDS', 'METHOD_NOT_USED_FOR_DEPOSIT'])
  })
  it('routes large withdrawals to manual review', () => {
    assert.equal(withdrawalNeedsReview('999.99', '1000'), false)
    assert.equal(withdrawalNeedsReview('1000', '1000'), true)
    assert.equal(withdrawalNeedsReview('1', '0'), true)
  })
})

describe('payout details', () => {
  const fields = [
    { name: 'email', label: 'Skrill account email', type: 'email' as const, required: true, maxLength: 191 },
    { name: 'id', label: 'ID', type: 'text' as const, required: false, pattern: '^\\d{4}$', patternMessage: 'Four digits' },
  ]
  it('trims and returns valid details, ignoring unknown fields', () => {
    const result = validateDetails(fields, { email: ' a@b.co ', other: 'x' })
    assert.deepEqual(result, { ok: true, value: { email: 'a@b.co' } })
  })
  it('reports each problem by field', () => {
    const result = validateDetails(fields, { email: 'nope', id: '12' })
    assert.deepEqual(result, { ok: false, errors: { email: 'Enter a valid email address', id: 'Four digits' } })
    assert.equal(validateDetails(fields, {}).ok, false)
  })
  it('masks the destination for history', () => {
    assert.equal(maskDestination('Skrill', { email: 'sam@example.com' }), 'Skrill · sa***@example.com')
    assert.equal(maskDestination('Card', { cardLast4: '4242' }), 'Card · •••• 4242')
    assert.equal(maskDestination('Binance Pay', { binancePayId: '123456789' }), 'Binance Pay · ID ***6789')
  })
})
