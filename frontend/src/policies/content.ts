export type PolicySection = {
  heading: string
  paragraphs?: string[]
  bullets?: string[]
}

export type PolicyContent = {
  title: string
  summary: string
  sections: PolicySection[]
}

export const POLICY_CONTENT: Record<string, PolicyContent> = {
  terms: {
    title: 'Terms & Conditions',
    summary: 'Draft customer terms for use of SLSpot accounts, demo trading and any future enabled platform services.',
    sections: [
      { heading: '1. Agreement and policy versions', paragraphs: [
        'These terms are an implementation draft for SLSpot. The production version must identify the contracting legal entity, contact details, applicable law and dispute process before it is published as binding terms.',
        'When you create an account, the registration flow displays the current Terms and Privacy Policy versions. SLSpot records the version and time accepted or acknowledged. Material policy changes may require renewed acceptance before affected services are used.',
      ] },
      { heading: '2. Account responsibilities', bullets: [
        'Provide accurate registration information, protect your password and authentication factors, and notify support if you believe your account has been compromised.',
        'Do not share account credentials or attempt to access another customer’s account or information.',
        'Account access may be restricted when required for security, fraud prevention, maintenance or compliance with applicable obligations.',
      ] },
      { heading: '3. Demo and real-money functionality', paragraphs: [
        'Demo balances are simulated, have no cash value, and cannot be represented as funds held for you or withdrawn as money.',
        'Real-money services are separate capabilities. Their availability is determined by the server-side launch controls and current account eligibility; a visible interface control does not guarantee that a transaction is available.',
      ] },
      { heading: '4. Trades and platform information', paragraphs: [
        'A trade is accepted only when the server confirms it. The server records the applicable asset, direction, stake, expiry, price reference, payout parameters and final status.',
        'Market prices and connectivity can be delayed or interrupted. The Trading Rules & Risk Disclosure describes the settlement source and handling of stale, missing or unavailable prices. Do not rely on a screenshot or client display as the authoritative trade record.',
      ] },
      { heading: '5. Prohibited use and platform availability', bullets: [
        'Do not interfere with platform security, reverse engineer protected services where prohibited, manipulate market-data requests, exploit bugs or use the service to conduct unlawful activity.',
        'The service may be interrupted for maintenance, provider outages, security measures or events outside its reasonable control.',
      ] },
      { heading: '6. Complaints and changes', paragraphs: [
        'Use the in-platform support channel to report account, trading or transaction issues. Keep your trade or transaction reference when contacting support.',
        'Before production, SLSpot must publish confirmed complaint-handling steps, response commitments, limitation-of-liability language and the process for resolving disputes. This draft does not establish final deadlines or legal remedies.',
      ] },
    ],
  },
  privacy: {
    title: 'Privacy Policy',
    summary: 'Draft overview of personal information used to operate accounts, secure the service and provide requested platform functions.',
    sections: [
      { heading: '1. Information we handle', bullets: [
        'Account details such as email address, country selection, profile settings and account status.',
        'Security and device data such as session identifiers, login history, IP address and user-agent information.',
        'Trading and wallet records such as orders, positions, balances, ledger references, transaction status and support communications.',
        'Verification information only when a verification workflow is enabled and the information is needed for that workflow.',
      ] },
      { heading: '2. Purposes', paragraphs: [
        'Information is used to authenticate users, operate and secure accounts, display trading and financial records, investigate support requests, prevent abuse, reconcile transactions and meet applicable obligations.',
        'Before production, SLSpot must map each data category to a documented purpose and lawful basis, and confirm which information is strictly necessary for each feature.',
      ] },
      { heading: '3. Service providers and disclosures', paragraphs: [
        'Limited information may be processed by infrastructure, market-data, email, payment, identity-verification or security providers when those services are enabled.',
        'The final policy must identify relevant provider categories, cross-border transfer arrangements and circumstances in which information may be disclosed to authorities or other parties under applicable law.',
      ] },
      { heading: '4. Security and retention', paragraphs: [
        'SLSpot applies access controls and security measures intended to protect account and transaction information. No online system can promise absolute security.',
        'Retention periods, backup expiry, deletion exceptions and the handling of legally required financial or audit records must be confirmed before launch. Information should not be retained indefinitely without a defined purpose.',
      ] },
      { heading: '5. Your choices and requests', paragraphs: [
        'The production service should provide a verified way to request access to, correction of or deletion of personal information where applicable, and explain how requests are reviewed.',
        'A privacy contact and applicable response process must be published before this document is treated as final.',
      ] },
    ],
  },
  'trading-rules': {
    title: 'Trading Rules & Risk Disclosure',
    summary: 'Draft functional specification for short-duration UP/DOWN trades. Confirm the product rules and payout presentation before production use.',
    sections: [
      { heading: '1. Order acceptance', paragraphs: [
        'A submitted trade includes an asset, UP or DOWN direction, stake, duration and idempotency reference. It becomes active only after the server accepts the order and reserves the required balance.',
        'The server validates account and wallet status, market availability, fresh price data, configured stake and duration limits, position limits and available funds. A rejected order must not create an open position or hold funds.',
      ] },
      { heading: '2. Entry price and expiry', paragraphs: [
        'The backend records an entry price from its configured live market-data feed. The browser is not the authority for trade acceptance, expiry or settlement.',
        'Settlement uses the recorded trade expiry and the configured source of market prices. The current implementation aims to use the price in force at expiry; a permitted fresh-price fallback, if used when expiry history is unavailable, must be clearly identified in the trade record and customer-facing final rules.',
      ] },
      { heading: '3. Outcomes and payout calculation', bullets: [
        'UP: a win when the settlement price is above the entry price.',
        'DOWN: a win when the settlement price is below the entry price.',
        'Draw: when entry and settlement prices are equal. Current calculation returns the stake with no profit before applicable fees.',
        'A losing trade receives no gross payout under the current rules. The accepted trade record and transaction ledger are the authoritative records of the result.',
      ] },
      { heading: '4. Payouts, fees and stake limits', paragraphs: [
        'Payout rates, fees, minimum and maximum stakes and available durations are configuration-driven and may vary by asset. The final product must display the effective terms before an order is accepted and must preserve the values recorded for that order.',
        'The product owner must approve exact wording and examples for whether a displayed payout percentage represents profit, gross return or another figure. Avoid ambiguous return/total values.',
      ] },
      { heading: '5. Missing or unreliable market prices', paragraphs: [
        'The system must not invent or simulate a settlement price. If no reliable price is available, settlement is retried according to server policy. After the configured grace period, the current engine can void and refund an unpriced trade.',
        'Market halt, stale feeds, timestamp gaps, provider outages and disputed prices require explicit, testable handling. The final policy must disclose the rule that applies to each case.',
      ] },
      { heading: '6. Risk warning', paragraphs: [
        'Short-duration directional trading is high risk. Customers may lose the full stake on a trade, and repeated losses can accumulate quickly. Past price behavior does not guarantee future results.',
        'This document is an implementation draft. Payout displays, fees, settlement-source details, limits and any final cancellation or dispute rules must be approved and kept consistent with the server implementation.',
      ] },
    ],
  },
  payments: {
    title: 'Payment Policy',
    summary: 'Draft rules for future provider-backed deposits and supported payment methods.',
    sections: [
      { heading: '1. Current availability', paragraphs: [
        'Demo funding is simulated and affects only the demo wallet. Real-money deposits remain unavailable until the provider-backed workflow is implemented and the server launch controls allow it.',
        'A deposit method must not be described as available unless the current server capability and provider configuration support it.',
      ] },
      { heading: '2. Deposit lifecycle', bullets: [
        'A deposit request begins in a pending or processing state and is credited only after a verified provider event or other approved provider confirmation.',
        'Duplicate callbacks, retries, browser refreshes and uncertain provider responses must not create duplicate credits.',
        'The transaction history should show the request reference, amount, currency, status and any confirmed completion or failure information.',
      ] },
      { heading: '3. Methods, currencies and fees', paragraphs: [
        'Supported payment methods, currencies, limits, fees, exchange rates and processing estimates must be displayed before the customer confirms a real payment. They must match the provider agreement and current configuration.',
        'SLSpot must not promise a fixed processing time until the actual provider workflows and operational commitments have been verified.',
      ] },
      { heading: '4. Errors, reversals and refunds', paragraphs: [
        'Failed, duplicate, reversed, charged-back or disputed payments must move through explicit states and be reconciled to provider records and the financial ledger.',
        'The Return, Refunds & Withdrawals Policy describes the intended customer-facing process. This draft does not create a promise of a particular refund timeline.',
      ] },
    ],
  },
  'returns-refunds': {
    title: 'Returns, Refunds & Withdrawals',
    summary: 'Draft customer-facing outline for withdrawal requests, payment failures, reversals and trade voids.',
    sections: [
      { heading: '1. Current availability', paragraphs: [
        'Demo withdrawals are simulated and do not transfer real funds. Real withdrawals and real-money refunds remain disabled until provider-backed transfer, approval and recovery workflows are implemented.',
      ] },
      { heading: '2. Withdrawal requests', bullets: [
        'A real withdrawal workflow should verify account eligibility, destination ownership, available funds, applicable limits and any required review before initiating a provider transfer.',
        'Funds must not be paid twice when a provider request times out or returns an uncertain result.',
        'The customer should be able to see a reference and a meaningful status such as requested, processing, completed, failed or rejected.',
      ] },
      { heading: '3. Refunds and payment reversals', paragraphs: [
        'The final policy must define which payment failures, duplicate charges, provider reversals and approved cases qualify for refund, and whether the original payment method is required.',
        'Fees, minimums, review requirements and processing estimates must be configured and disclosed before the customer initiates the transaction.',
      ] },
      { heading: '4. Trades voided for unavailable price', paragraphs: [
        'The current trade engine can void an expired trade when a reliable settlement price cannot be obtained within its configured grace period and return the held stake to the relevant wallet.',
        'The final customer policy must explain the notice, ledger record and dispute route for these cases, and remain aligned with the deployed settlement engine.',
      ] },
      { heading: '5. Support and disputes', paragraphs: [
        'Customers should provide the relevant transaction, withdrawal or trade reference when raising an issue through support. Final complaint timelines and escalation details must be confirmed before publication.',
      ] },
    ],
  },
  'aml-kyc': {
    title: 'AML & KYC Policy',
    summary: 'Draft outline for customer verification, risk review and financial-crime prevention workflows.',
    sections: [
      { heading: '1. Verification workflow', paragraphs: [
        'The current codebase contains a KYC case foundation; a complete customer verification process and production provider integration remain to be implemented.',
        'When enabled, the service may request proportionate identity or other evidence through a configured verification process. Sensitive documents must use restricted storage and access, not ordinary public uploads.',
      ] },
      { heading: '2. Risk review and restrictions', bullets: [
        'Verification cases should have explicit submitted, pending, approved, rejected and review-required transitions appropriate to the selected provider and workflow.',
        'Eligibility and restriction decisions must be enforced in backend services for the relevant operation, not solely in the frontend.',
        'High-risk cases or unusual transaction patterns should be escalated to an authorized reviewer under a documented process.',
      ] },
      { heading: '3. Monitoring, records and reporting', paragraphs: [
        'The final operating policy must define the applicable monitoring, recordkeeping, escalation and reporting duties for SLSpot’s actual service and jurisdictions.',
        'Access to cases and evidence should be restricted and audited. Retention and deletion schedules must be documented, including required legal holds.',
      ] },
      { heading: '4. No premature activation', paragraphs: [
        'Real-money operations must remain behind the launch gate while the relevant verification checks, review workflow and operational controls are incomplete.',
        'This draft is not a claim that the platform currently performs full identity verification, sanctions screening or suspicious-activity reporting.',
      ] },
    ],
  },
  cookies: {
    title: 'Cookie Policy',
    summary: 'Draft description of essential browser storage used for secure sessions and platform functionality.',
    sections: [
      { heading: '1. Essential session and security cookies', paragraphs: [
        'The application uses a server session cookie to authenticate account requests and a CSRF-related cookie/token flow to protect state-changing requests. Cookie settings vary between local development and production; production must use secure, host-only settings.',
      ] },
      { heading: '2. Browser storage', paragraphs: [
        'The interface may use limited session storage for short-lived sign-in challenges and local preferences for presentation. These items should be documented separately from server authentication cookies and must not contain passwords or long-lived session secrets.',
      ] },
      { heading: '3. Analytics and optional cookies', paragraphs: [
        'This draft does not assert that advertising or analytics cookies are in use. Any analytics, experimentation or marketing technology introduced later must be inventoried and assessed for applicable consent and notice requirements before activation.',
      ] },
      { heading: '4. Controls and contact', paragraphs: [
        'Browser controls can restrict cookies, but doing so may prevent sign-in and other essential functions. The final policy must identify the controller and provide a contact for privacy requests.',
      ] },
    ],
  },
  cardholder: {
    title: 'Cardholder Agreement',
    summary: 'Conditional draft for a future saved-card feature. SLSpot does not currently offer saved-card or card-on-file payments.',
    sections: [
      { heading: '1. Current availability', paragraphs: [
        'Saved-card and merchant-initiated card-on-file functionality are not currently enabled. This page is a design placeholder and should not be treated as an authorization to charge a saved card.',
      ] },
      { heading: '2. Future provider-controlled card storage', paragraphs: [
        'If saved cards are introduced, SLSpot should prefer provider-hosted fields or tokenization and retain only the payment provider’s permitted reference and display metadata. SLSpot must not store card security codes and must not collect raw card details unless a reviewed and appropriate payment architecture expressly permits it.',
      ] },
      { heading: '3. Consent and transaction records', paragraphs: [
        'Any future saved-card flow must explain which transactions may be initiated, how the customer authorizes them, how the authorization can be revoked and where receipts or disputes are handled.',
        'This document requires completion against the selected provider contract and card-industry requirements before the feature can be enabled.',
      ] },
    ],
  },
}

export const POLICY_LINKS = [
  { slug: 'terms', title: 'Terms & Conditions' },
  { slug: 'privacy', title: 'Privacy Policy' },
  { slug: 'trading-rules', title: 'Trading Rules & Risk Disclosure' },
  { slug: 'payments', title: 'Payment Policy' },
  { slug: 'returns-refunds', title: 'Returns, Refunds & Withdrawals' },
  { slug: 'aml-kyc', title: 'AML & KYC Policy' },
  { slug: 'cookies', title: 'Cookie Policy' },
  { slug: 'cardholder', title: 'Cardholder Agreement' },
] as const
