# SL Option Web

Original React trading-terminal frontend for SL Option.

## Product direction

The UI uses the **Midnight Signal** design language: graphite surfaces, cool cyan market data, amber attention states, strong hierarchy, compact data density, and a chart-first workspace.

This project is intentionally an original implementation. It is inspired by common trading-terminal interaction patterns, not a copy of another broker's branding, code, or visual assets.

## Stack

- React 19 + TypeScript
- Vite 8
- React Router 8
- Lucide React icons
- CSS design tokens and component-level styles

Node.js 24 LTS is the recommended local/runtime baseline for development. Production should use an actively supported LTS release.

## Frontend security rules

- No secrets or private credentials in Vite environment variables.
- Authentication will use secure, server-managed cookies rather than storing long-lived access tokens in `localStorage`.
- Sensitive API responses must be served with appropriate cache controls by the backend.
- The deployed frontend must receive security headers, including a strict Content Security Policy, `X-Content-Type-Options`, frame protections, and HSTS where appropriate.
- User-controlled rich text/HTML will never be injected with `dangerouslySetInnerHTML` without an explicit reviewed sanitizer boundary.
- Trading amounts and order state are UI inputs only; the server will validate and authorize every financial operation.

## Development

```bash
npm install
npm run dev
```

Checks:

```bash
npm run typecheck
npm run lint
npm run build
```

## Planned frontend areas

- Trading terminal
- Watchlist and asset search
- Chart workspace
- Order panel
- Positions / order history
- Wallet
- Portfolio
- Alerts
- Account & security
- Support
- Admin workspace (separate application boundary later)
