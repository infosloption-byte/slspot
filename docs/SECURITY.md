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
