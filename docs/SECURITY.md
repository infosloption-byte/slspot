# Frontend security baseline

This is a financial UI. Security controls must be implemented across frontend, backend, infrastructure and operational processes.

## Frontend baseline

- Keep authentication/session secrets out of `localStorage` and `sessionStorage` where possible.
- Do not embed API keys, exchange secrets, payment credentials, private keys, database credentials or signing material in client-side environment variables.
- Validate expected URL/origin configuration before production builds.
- Avoid `dangerouslySetInnerHTML`; introduce a reviewed sanitization boundary only when a business requirement exists.
- Use dependency lockfiles and review dependency changes.
- Run lint, typecheck and build in CI.
- Keep third-party scripts to the minimum necessary set.
- Establish a restrictive CSP and frame-ancestors policy at the edge.
- Set `X-Content-Type-Options: nosniff` and appropriate HSTS/Referrer-Policy/Permissions-Policy headers in production.

## Financial controls

The browser is never trusted for:

- balance values
- wallet debits/credits
- order amounts
- order direction
- payout values
- settlement timestamps
- KYC decisions
- withdrawal eligibility

Every financial action must be validated and authorized on the server, written to a durable ledger, and protected against replay/double submission.

## Real-time transport

The WebSocket layer should authenticate connections, authorize subscriptions, apply message-size/rate limits, handle reconnects safely, and never accept client messages as authoritative trading instructions without server-side validation.

## Implemented application security controls — 2026-10-04

### Browser/session security

- Authentication uses an `HttpOnly` session cookie and the raw session token is not returned in login/2FA JSON responses.
- Production authentication and CSRF cookies are host-only `__Host-` cookies with `Secure`; production does not accept an authentication cookie domain.
- Session authentication rejects revoked/disabled devices as well as revoked/expired sessions.
- The frontend does not persist authentication tokens in `localStorage` or `sessionStorage`. The 2FA challenge stored in `sessionStorage` is temporary challenge state, not an authenticated session credential.
- The frontend API client obtains a signed CSRF token, sends it in the `X-CSRF-Token` header for state-changing same-origin API calls, and refreshes the token once after a CSRF rejection.

### Request protection

- State-changing API requests require a trusted `Origin`/`Referer` when supplied and reject `Sec-Fetch-Site: cross-site`. WebSocket handshakes require an explicit trusted `Origin` because WebSocket upgrades are not protected by CORS.
- CORS credentials are restricted to an explicit origin allowlist; production requires `CORS_ORIGIN` to be configured.
- API request URLs are capped and state-changing API content types are restricted to JSON.
- Multipart file uploads are rejected until a dedicated upload endpoint has explicit content-type, size, storage and malware-scanning controls.
- Redis-backed rate limiting is applied by request class, client IP, and WebSocket connection. Development has a bounded in-memory fallback; production fails closed when Redis is unavailable.
- Authenticated mutation requests use a signed session-bound CSRF token, while idempotent trade/deposit/withdrawal mutations require validated idempotency keys.

### Authorization and RBAC

- User-scoped trading, portfolio, wallet, notification and ledger operations query records through the authenticated user/account/wallet owner.
- Admin access is separated from normal user access through `AdminAccess` and supports `ADMIN` and `SUPER_ADMIN`.
- Super-admin-only role changes are enforced server-side. Non-super-admins cannot modify or revoke sessions for a super administrator.
- Admin mutation inputs have strict JSON schemas and UUID/enum validation.

### SSRF, webhooks and XSS

- The market-data base URL is environment-controlled, disallows credentials/query fragments, requires HTTPS in production and pins production Twelve Data configuration to `api.twelvedata.com`.
- No user-controlled outbound URL fetch or file-upload endpoint exists in the current application surface.
- Webhook verification uses HMAC-SHA256, constant-time comparison and a five-minute timestamp tolerance. Provider-specific webhook consumers must still add durable event-ID idempotency when payment webhooks are implemented.
- The current React frontend contains no reviewed use of `dangerouslySetInnerHTML` or direct HTML injection APIs in the application code scanned during this hardening pass; React's default escaping remains the rendering boundary.
- Frontend and admin applications ship a restrictive CSP meta policy, while the backend adds a restrictive API CSP plus frame, referrer, content-type and cross-origin isolation headers.

### Audit trail

Security-sensitive authentication, admin, trade and demo funding mutations create durable `AuditLog` records. The application also emits structured request/security errors for origin, CSRF, content-type and rate-limit failures.