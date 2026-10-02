# SL Spot Web

Original React trading-terminal frontend for SL Spot.

## Product direction

The UI uses the **Black Gold** design language: near-black surfaces, a single yellow accent for brand and primary actions, green/red reserved for market direction, and a simple chart-first layout (left rail, top account bar, chart, right trade panel). See `docs/DESIGN_SYSTEM.md`.

This project is intentionally an original implementation, inspired by common trading-terminal interaction patterns, not a copy of another broker's branding, code, or visual assets.

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


## Frontend V1 progress

The current frontend now has real application routes, functional watchlist search/category/favorites, a candlestick chart powered by Lightweight Charts, and a validated demo-order confirmation flow. Real authentication, market data, financial execution, wallet authority, and server-backed state remain intentionally pending.
