/**
 * Eligibility and withdrawal rules. Pure functions (amounts as decimal strings, compared exactly in integer
 * units) so every rule is testable without a database and the same rules drive both the API checks and the
 * checklist shown to the user.
 */
export type KycTier = 0 | 1 | 2

export type PaymentGateDirection = 'deposit' | 'withdrawal'
export type PaymentProviderGateInput = {
  direction: PaymentGateDirection
  providerIsSandbox: boolean
  sandboxModeEnabled: boolean
  launchApproved: boolean
  depositsEnabled: boolean
  withdrawalsEnabled: boolean
}

/**
 * Sandbox adapters are allowed only when sandbox mode is enabled (and the environment validator
 * prevents that mode in production). Every non-sandbox provider additionally requires both master
 * launch approval and the relevant operation-specific flag.
 */
export function isPaymentProviderOperationAllowed(input: PaymentProviderGateInput): boolean {
  if (input.providerIsSandbox) return input.sandboxModeEnabled
  if (!input.launchApproved) return false
  return input.direction === 'deposit' ? input.depositsEnabled : input.withdrawalsEnabled
}

export type RuleBlocker = { code: string; message: string }

const SCALE = 8
const UNITS = 10n ** BigInt(SCALE)

export function toUnits(value: string): bigint {
  const match = /^(-?)(\d+)(?:\.(\d{1,8}))?$/.exec(value.trim())
  if (!match) throw new Error('Invalid decimal amount: ' + value)
  const whole = BigInt(match[2] ?? '0') * UNITS
  const fraction = BigInt((match[3] ?? '').padEnd(SCALE, '0') || '0')
  const total = whole + fraction
  return match[1] === '-' ? -total : total
}

export function fromUnits(value: bigint): string {
  const negative = value < 0n
  const abs = negative ? -value : value
  const whole = abs / UNITS
  const fraction = (abs % UNITS).toString().padStart(SCALE, '0').replace(/0+$/, '')
  return (negative ? '-' : '') + whole.toString() + (fraction ? '.' + fraction : '')
}

export type ProfileInput = {
  emailVerified: boolean
  legalName: string | null
  dateOfBirth: Date | null
  countryCode: string | null
}

export const MINIMUM_AGE_YEARS = 18

export function ageOn(dateOfBirth: Date, now: Date): number {
  let age = now.getUTCFullYear() - dateOfBirth.getUTCFullYear()
  const monthDiff = now.getUTCMonth() - dateOfBirth.getUTCMonth()
  if (monthDiff < 0 || (monthDiff === 0 && now.getUTCDate() < dateOfBirth.getUTCDate())) age -= 1
  return age
}

/** Which basic-profile details are still missing. */
export function missingProfileFields(profile: ProfileInput): Array<'legalName' | 'dateOfBirth' | 'countryCode'> {
  const missing: Array<'legalName' | 'dateOfBirth' | 'countryCode'> = []
  if (!profile.legalName?.trim()) missing.push('legalName')
  if (!profile.dateOfBirth) missing.push('dateOfBirth')
  if (!profile.countryCode) missing.push('countryCode')
  return missing
}

/** 0 = email only (demo wallet), 1 = basic profile complete, 2 = ID verified. */
export function computeKycTier(profile: ProfileInput & { kycApproved: boolean }): KycTier {
  if (!profile.emailVerified || missingProfileFields(profile).length > 0) return 0
  return profile.kycApproved ? 2 : 1
}

export type DepositRuleInput = {
  tier: KycTier
  emailVerified: boolean
  missingProfile: string[]
  countryCode: string | null
  blockedCountries: readonly string[]
  amount: string
  completedDeposits: string
  tier1DepositLimit: string
}

export function evaluateDeposit(input: DepositRuleInput): RuleBlocker[] {
  const blockers: RuleBlocker[] = []
  if (!input.emailVerified) blockers.push({ code: 'EMAIL_NOT_VERIFIED', message: 'Verify your email address before depositing.' })
  if (input.missingProfile.length > 0) blockers.push({ code: 'PROFILE_INCOMPLETE', message: 'Complete your profile (legal name, date of birth and country) before depositing.' })
  if (input.countryCode && input.blockedCountries.includes(input.countryCode.toUpperCase())) {
    blockers.push({ code: 'COUNTRY_NOT_SUPPORTED', message: 'Payments are not available in your country.' })
  }
  const limit = toUnits(input.tier1DepositLimit)
  if (input.tier < 2 && limit > 0n && toUnits(input.completedDeposits) + toUnits(input.amount) > limit) {
    blockers.push({ code: 'KYC_REQUIRED_FOR_LIMIT', message: 'Verify your identity to deposit more than ' + input.tier1DepositLimit + '.' })
  }
  return blockers
}

export type WithdrawalRuleInput = {
  tier: KycTier
  twoFactorEnabled: boolean
  countryCode: string | null
  blockedCountries: readonly string[]
  amount: string
  available: string
  /** The user has a completed deposit through the provider they want to be paid out to. */
  providerUsedForDeposit: boolean
  totalDeposited: string
  totalTraded: string
  turnoverMultiple: string
  lastSecurityChangeAt: Date | null
  coolingHours: number
  now: Date
  /** Local testing only: skip KYC, 2FA, turnover and cooling-off. */
  relaxed: boolean
}

export function evaluateWithdrawal(input: WithdrawalRuleInput): RuleBlocker[] {
  const blockers: RuleBlocker[] = []
  const amount = toUnits(input.amount)

  if (input.tier < 1) blockers.push({ code: 'PROFILE_INCOMPLETE', message: 'Complete your profile before withdrawing.' })
  if (input.countryCode && input.blockedCountries.includes(input.countryCode.toUpperCase())) {
    blockers.push({ code: 'COUNTRY_NOT_SUPPORTED', message: 'Payments are not available in your country.' })
  }
  if (amount > toUnits(input.available)) blockers.push({ code: 'INSUFFICIENT_FUNDS', message: 'Your available balance is lower than the amount requested.' })
  if (!input.providerUsedForDeposit) {
    blockers.push({ code: 'METHOD_NOT_USED_FOR_DEPOSIT', message: 'Withdrawals go back to a method you have deposited with. Choose one of those.' })
  }

  if (!input.relaxed) {
    if (input.tier < 2) blockers.push({ code: 'KYC_REQUIRED', message: 'Verify your identity (ID and selfie) before your first withdrawal.' })
    if (!input.twoFactorEnabled) blockers.push({ code: 'TWO_FACTOR_REQUIRED', message: 'Turn on two-factor authentication before withdrawing.' })

    const multiple = toUnits(input.turnoverMultiple)
    if (multiple > 0n) {
      // required = deposited × multiple, in the same integer units.
      const required = (toUnits(input.totalDeposited) * multiple) / UNITS
      const traded = toUnits(input.totalTraded)
      if (traded < required) {
        blockers.push({
          code: 'TURNOVER_NOT_MET',
          message: 'Trade at least ' + fromUnits(required) + ' in total before withdrawing (' + fromUnits(required - traded) + ' to go).',
        })
      }
    }

    if (input.lastSecurityChangeAt && input.coolingHours > 0) {
      const releaseAt = input.lastSecurityChangeAt.getTime() + input.coolingHours * 3_600_000
      if (input.now.getTime() < releaseAt) {
        blockers.push({ code: 'COOLING_OFF', message: 'Withdrawals are paused for ' + input.coolingHours + ' hours after a password or two-factor change. Available again at ' + new Date(releaseAt).toISOString() + '.' })
      }
    }
  }
  return blockers
}

/** Large payouts wait for a person to approve them. A threshold of 0 sends every withdrawal to review. */
export function withdrawalNeedsReview(amount: string, threshold: string): boolean {
  return toUnits(amount) >= toUnits(threshold)
}

export type FieldDefinition = { name: string; label: string; required: boolean; maxLength?: number; pattern?: string; patternMessage?: string; type: 'text' | 'email' }

/** Validate and normalize the payout details a user entered against the provider's field list. */
export function validateDetails(
  fields: readonly FieldDefinition[],
  details: Record<string, unknown>,
): { ok: true; value: Record<string, string> } | { ok: false; errors: Record<string, string> } {
  const value: Record<string, string> = {}
  const errors: Record<string, string> = {}
  for (const field of fields) {
    const raw = details[field.name]
    const text = typeof raw === 'string' ? raw.trim() : ''
    if (!text) {
      if (field.required) errors[field.name] = field.label + ' is required'
      continue
    }
    if (field.maxLength && text.length > field.maxLength) {
      errors[field.name] = field.label + ' is too long'
      continue
    }
    if (field.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) {
      errors[field.name] = 'Enter a valid email address'
      continue
    }
    if (field.pattern && !new RegExp(field.pattern).test(text)) {
      errors[field.name] = field.patternMessage ?? field.label + ' is not valid'
      continue
    }
    value[field.name] = text
  }
  return Object.keys(errors).length > 0 ? { ok: false, errors } : { ok: true, value }
}

/** A short label shown in history, never the full account identifier. */
export function maskDestination(providerName: string, details: Record<string, string>): string {
  const email = details.email
  if (email) {
    const [name = '', domain = ''] = email.split('@')
    return providerName + ' · ' + name.slice(0, 2) + '***@' + domain
  }
  if (details.cardLast4) return providerName + ' · •••• ' + details.cardLast4
  if (details.binancePayId) return providerName + ' · ID ***' + details.binancePayId.slice(-4)
  return providerName
}
