# Payments integration

## Current state

The repository contains the server-owned payment lifecycle and a **development-only sandbox**. The sandbox models card, Skrill, Neteller and Binance Pay flows; it does not connect to those providers and never moves real money.

- The customer Wallet page uses the payment API to load eligibility and provider methods, create/cancel requests, and display statuses.
- Sandbox deposit results are delivered back through the same signed webhook verifier and replay guard used by provider webhooks.
- Wallet updates and double-entry ledger entries are applied on the server, not by the browser.
- Withdrawals can be queued for manual review, approved, or rejected with a required reason. Rejection refunds the reserved amount through the ledger.
- The admin Finance page has a Withdrawal review queue.
- Live provider adapters, a KYC verification provider, production credentials, operational monitoring and end-to-end payment tests are **not yet implemented**.

Do not accept customer funds or enable real deposit/withdrawal flags based on the sandbox flow.

## Local setup

Use the normal backend environment setup described in `backend/README.md`. Relevant local values in `.env.example` include:

- `PAYMENTS_SANDBOX=true`
- `PAYMENTS_SANDBOX_WEBHOOK_SECRET` (recommended to set a fixed local-only value)
- `PAYMENTS_RELAX_WITHDRAWAL_CHECKS=false`
- `PAYMENTS_TIER1_DEPOSIT_LIMIT=0`
- `PAYMENTS_WITHDRAWAL_REVIEW_THRESHOLD=1000`
- `PAYMENTS_WITHDRAWAL_TURNOVER_MULTIPLE=1`
- `PAYMENTS_WITHDRAWAL_COOLING_HOURS=24`
- `PAYMENTS_DEPOSIT_EXPIRY_MINUTES=60`
- `PAYMENTS_BLOCKED_COUNTRIES`

`PAYMENTS_SANDBOX` and `PAYMENTS_RELAX_WITHDRAWAL_CHECKS` are forbidden in production by environment validation. The sandbox signs events with HMAC and the UI offers simulated success, failure and pending outcomes only. No actual card, Skrill, Neteller or Binance Pay request is sent.

## API surface

Authenticated user routes:

- `GET /api/v1/payments/eligibility`
- `GET /api/v1/payments/methods?direction=deposit|withdrawal`
- `POST /api/v1/payments/deposits`
- `GET /api/v1/payments/deposits/:id`
- `POST /api/v1/payments/deposits/:id/cancel`
- `POST /api/v1/payments/withdrawals`
- `GET /api/v1/payments/withdrawals/:id`
- `POST /api/v1/payments/withdrawals/:id/cancel`

Only enabled sandbox deployments expose `POST /api/v1/payments/sandbox/deposits/:id/outcome`. Provider webhooks use `POST /api/v1/payments/webhooks/:provider` and are authenticated using the provider adapter's signature validation over the raw request body.

Administrator routes:

- `GET /api/v1/admin/payments/withdrawals?status=PENDING`
- `POST /api/v1/admin/payments/withdrawals/:id/approve`
- `POST /api/v1/admin/payments/withdrawals/:id/reject` with a rejection reason.

## Launch gates

A live payment adapter must pass all of the following before it can be listed or used:

1. The deployment-level master approval is enabled.
2. The deployment-level operation flag (`REAL_DEPOSITS_ENABLED` or `REAL_WITHDRAWALS_ENABLED`) is enabled.
3. The database administrator switch for that operation is enabled.
4. The provider configuration and country allowlist permit the operation.

Sandbox adapters bypass live-money switches only when sandbox mode is explicitly enabled; the environment validator prevents that in production. The current admin service still refuses to enable real-money funding while production provider integration is unavailable. Keep this restriction until a real adapter is implemented and reviewed.

## Provider launch checklist

Before a real provider is registered, implement and test its adapter against the existing interface, including checkout/payout creation, status lookup, signature verification and normalized event parsing. Also complete:

- Production credential and webhook-secret management outside browser bundles.
- Provider-specific idempotency and duplicate/replay tests.
- Amount, currency, reference and state-transition validation against real provider fixtures.
- Database integration tests for concurrent requests, duplicate trades/requests, cancellation races, refunds and ledger reconciliation.
- KYC provider integration and country/product legal approval.
- Alerts and runbooks for stuck `PROCESSING` requests, provider/webhook failures, reconciliation differences and stale operations.
- Tested database backups, migration procedure, staging rollout and rollback plan.

Do not assume a provider is live because it appears in the sandbox list; the UI tags sandbox adapters as `TEST`.
