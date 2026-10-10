# Identity verification (KYC)

## Current state

Identity verification runs through one provider interface (`backend/src/kyc/types.ts`). A **development-only sandbox provider** is wired in. It never checks a document: the tester chooses the verdict. A real vendor needs one adapter and credentials; everything else is shared.

- A customer can start verification from the Wallet page (Real mode) once their email is verified and their profile (legal name, date of birth, country) is complete and shows age 18 or older.
- The customer picks the document type they will provide. The **vendor** hosts document and selfie capture. SL Spot stores only the case, its status, the document type and the vendor reference, never images or document numbers.
- Outcomes arrive as signed webhooks (`POST /api/v1/kyc/webhooks/:provider`, verified over the raw body, replay-guarded by `KycEvent`). A case moves `PENDING` → `IN_REVIEW` → `APPROVED` / `REJECTED`; a decided case never changes.
- A rejected customer may retry up to `KYC_MAX_ATTEMPTS` times (default 3), then support must step in.
- Admins decide open cases from **Admin → KYC** (approve, or reject with a reason). An admin cannot decide their own case unless `KYC_RELAX_REVIEW_CHECKS=true` (never in production).
- An `APPROVED` case makes the customer **tier 2**, which the existing withdrawal rules require.

## Endpoints

Customer: `GET /api/v1/kyc/status`, `POST /api/v1/kyc/start` `{ documentType }`.
Sandbox only: `POST /api/v1/kyc/sandbox/outcome` `{ outcome: approved | review | rejected }`.
Admin: `GET /api/v1/admin/kyc/cases?status=`, `POST /api/v1/admin/kyc/cases/:id/approve`, `POST /api/v1/admin/kyc/cases/:id/reject` `{ reason }`.

## Configuration

`KYC_SANDBOX` (defaults on outside production, **refused in production**), `KYC_SANDBOX_WEBHOOK_SECRET`, `KYC_MAX_ATTEMPTS`, `KYC_RELAX_REVIEW_CHECKS`. With no sandbox and no real adapter, KYC reports itself unavailable and withdrawals stay locked.

## Adding a real vendor

1. Implement `KycProviderAdapter`: `createSession` (return the vendor case id and a redirect URL), `verifyWebhook` (check the signature over the raw body, return a normalized event).
2. Construct it in `server.ts` in place of the sandbox, with credentials from the environment.
3. Check: webhook replay, unknown case ids, signature failures, and the vendor's own retry behaviour. A redirect URL that cannot be stored must be re-requested from the vendor when the customer returns.
4. Complete the legal items below before enabling real withdrawals.

## Not done yet

- A real vendor adapter and credentials.
- Sanctions, PEP and adverse-media screening, and ongoing monitoring (usually the same vendor).
- Re-verification when a document expires or customer details change.
- Proof of address and source-of-funds checks for high-value customers.
- Retention and deletion rules for verification records, and the final legal wording of the AML & KYC policy.
- Alerts for stuck `PENDING`/`IN_REVIEW` cases.
