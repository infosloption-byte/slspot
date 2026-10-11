# Identity verification (KYC)

## Current state

Identity verification runs through one provider interface (`backend/src/kyc/types.ts`). Customers can be offered several methods at once and pick one:

| Provider | id | What it is |
| --- | --- | --- |
| Didit | `didit` | Automatic. Hosted capture on Didit's page, verdict by signed webhook. Enabled when its three credentials are set. |
| Manual review | `manual` | The customer uploads photos to SL Spot, an administrator checks them. Enabled by default (`KYC_MANUAL_ENABLED`). |
| Sandbox | `sandbox` | Development only. Never checks anything: the tester picks the verdict. Refused in production. |

The first available provider in that order is the default; when more than one exists the customer chooses in **Account → Verification**.

Shared rules, whichever provider is used:

- A customer can start once their email is verified and their profile (legal name, date of birth, country) is complete and shows age 18 or older.
- A case moves `PENDING` → `IN_REVIEW` → `APPROVED` / `REJECTED`. A decided case never changes. The decision is a conditional update, so a late webhook cannot overturn it.
- A rejected customer may retry up to `KYC_MAX_ATTEMPTS` times (default 3), then support must step in.
- An `APPROVED` case makes the customer **tier 2**, which the withdrawal rules require, and locks legal name, date of birth and country.
- An admin cannot decide their own case unless `KYC_RELAX_REVIEW_CHECKS=true` (never in production).

## Manual review

1. The customer starts a manual case, then uploads **ID front** (the photo page for a passport), **ID back** (not for a passport) and a **selfie holding the ID**. Photos are resized and re-encoded in the browser, which also removes EXIF data such as GPS position.
2. The server accepts only real JPG, PNG or WebP content (checked by file signature, not by the client's MIME type), up to `KYC_MAX_FILE_BYTES` (8 MB). Re-uploading a kind replaces the earlier file.
3. **Submit for review** moves the case to `IN_REVIEW` and locks the set. A case can only be submitted with every required photo.
4. In **Admin → KYC → Review documents** the reviewer sees the customer's legal name and date of birth, opens each photo, and must tick every checklist item (name, date of birth, not expired, selfie matches, no tampering, sanctions list checked) before **Approve** is accepted. The server enforces this and records the checklist in the audit log. Rejection needs a reason, which is shown to the customer.
5. Manual cases cannot be decided before they are submitted, and cannot be approved if a required photo is missing.

### How the files are protected

- Stored in `KYC_DOCUMENT_DIR`, encrypted with AES-256-GCM (random IV per file, the storage key bound in as authenticated data, so a file cannot be swapped between records). The database holds only metadata and a random storage key. Plain bytes are never written to disk.
- Production **requires** `KYC_DOCUMENT_ENCRYPTION_KEY` and `KYC_DOCUMENT_DIR` (the server refuses to start without them). Outside production a fixed development key is used so local files survive restarts.
- **Back up the key separately from the files. Losing it makes every stored document unreadable.** Keep the directory outside the repository and web root, readable only by the app user, and include it in encrypted backups.
- Admins see a list of photos first (metadata only). Opening a photo is a separate request that is written to the audit log (`KYC_DOCUMENT_VIEWED`, with the admin and customer) **before** the image is returned. If the audit entry cannot be written, the image is not shown.
- Responses carry `Cache-Control: no-store`.

### Retention

Photos are deleted automatically by an hourly job:

| Situation | Deleted after | Setting |
| --- | --- | --- |
| Approved | 30 days | `KYC_RETENTION_APPROVED_DAYS` |
| Rejected | 14 days | `KYC_RETENTION_REJECTED_DAYS` |
| Started but never submitted | 7 days (the empty case is removed and does not count as an attempt) | `KYC_DRAFT_RETENTION_DAYS` |
| Under review | never, until a decision starts the clock | |

The case, its status and the audit trail stay; only the photos go (`KYC_DOCUMENTS_PURGED`). A file that cannot be removed is kept and retried on the next run.

**Check before launch:** many AML regimes require identity records to be kept for years after the relationship ends. The defaults above are short on purpose for early testing. Agree the real retention period with your compliance adviser and set it here.

## Didit

Didit hosts capture (API v3). `createSession` sends only our case id and the customer's email, never the name or date of birth, and stores the returned hosted link on the case (cleared at the decision) so a page refresh or restart does not lose it.

Webhooks go to `POST /api/v1/kyc/webhooks/didit`. They are accepted only with a valid `X-Signature-V2` (canonical JSON) or `X-Signature` (raw body) HMAC-SHA256 using `KYC_DIDIT_WEBHOOK_SECRET`, and an `X-Timestamp` within 5 minutes. The deprecated `X-Signature-Simple` header is not accepted. Status mapping: `Approved` → approved, `Declined` → rejected, `In Review` → review, `Abandoned`/`Expired` → rejected (so the case does not stay open forever), everything else is ignored and can never approve. Only `status.updated` events can decide a case.

Setup: create a workflow in the Didit console, register `https://<api-host>/api/v1/kyc/webhooks/didit` as the webhook destination, and set `KYC_DIDIT_API_KEY`, `KYC_DIDIT_WORKFLOW_ID`, `KYC_DIDIT_WEBHOOK_SECRET` (all three together) and optionally `KYC_DIDIT_CALLBACK_URL`. Test in Didit's sandbox application first; this integration was written from Didit's public docs and has not been run against their live service.

## Endpoints

Customer: `GET /api/v1/kyc/status`, `POST /api/v1/kyc/start` `{ documentType, provider? }`, `POST /api/v1/kyc/documents` `{ kind, data (base64) }`, `POST /api/v1/kyc/submit`.
Webhooks: `POST /api/v1/kyc/webhooks/:provider`.
Sandbox only: `POST /api/v1/kyc/sandbox/outcome` `{ outcome: approved | review | rejected }`.
Admin: `GET /api/v1/admin/kyc/cases?status=`, `GET /api/v1/admin/kyc/cases/:id/documents`, `GET /api/v1/admin/kyc/documents/:id`, `POST /api/v1/admin/kyc/cases/:id/approve` `{ checklist }`, `POST /api/v1/admin/kyc/cases/:id/reject` `{ reason }`.

The upload endpoint raises its body limit to 12 MB. If a reverse proxy sits in front, allow at least that (nginx `client_max_body_size 12m`).

## Configuration

See `backend/.env.example`. Summary: `KYC_MANUAL_ENABLED`, `KYC_DOCUMENT_ENCRYPTION_KEY`, `KYC_DOCUMENT_DIR`, `KYC_MAX_FILE_BYTES`, `KYC_RETENTION_APPROVED_DAYS`, `KYC_RETENTION_REJECTED_DAYS`, `KYC_DRAFT_RETENTION_DAYS`, `KYC_DIDIT_*`, `KYC_SANDBOX` (defaults on outside production, refused in production), `KYC_SANDBOX_WEBHOOK_SECRET`, `KYC_MAX_ATTEMPTS`, `KYC_RELAX_REVIEW_CHECKS`. With no provider enabled, KYC reports itself unavailable and withdrawals stay locked.

## Adding another vendor

1. Implement `KycProviderAdapter`: `createSession` (return the vendor case id and a redirect URL), `verifyWebhook` (check the signature over the raw body, return a normalized event).
2. Add it to the `kycProviders` list in `server.ts` with credentials from the environment.
3. Check webhook replay, unknown case ids, signature failures and the vendor's retry behaviour.

## Not done yet

- Sanctions, PEP and adverse-media screening and ongoing monitoring. Manual reviewers must check sanctions lists by hand (it is a checklist item); Didit can provide screening if the workflow includes it.
- Automated forgery and liveness detection for manual review. Reviewers look at photos only.
- Re-verification when a document expires or customer details change.
- Proof of address and source-of-funds checks for high-value customers.
- A role split so only some administrators can open identity photos (today any admin can, and every view is audited).
- Final legal wording of the AML & KYC policy and the agreed retention period.
- Alerts for cases stuck in `IN_REVIEW`.
