# Frontend architecture

## Boundaries

The frontend is responsible for presentation, user interaction, client-side state and real-time display. It is **not** the authority for account balances, order validity, payout, position settlement, KYC status, or any other financial decision.

## Proposed module boundaries

- `components/layout`: app shell and responsive workspace structure.
- `components/market`: watchlists, asset discovery and market summaries.
- `components/trading`: chart, order entry, positions and trading-specific interaction.
- `components/ui`: reusable presentation primitives.
- `data`: temporary interface fixtures only.
- `lib`: pure formatting/utilities.
- `styles`: design tokens and global styling.

## Future boundaries

As backend integration is added, use dedicated API modules such as:

```text
src/api/
src/auth/
src/features/wallet/
src/features/orders/
src/features/market-data/
src/features/notifications/
```

Keep server data fetching separate from visual components. Avoid putting authentication, balance calculations or order authorization inside chart/UI components.

## Security decisions

1. Do not persist secrets in the frontend bundle.
2. Prefer HttpOnly, Secure, SameSite cookies for browser sessions.
3. Keep access to privileged APIs server-authorized and scoped.
4. Treat all displayed market values as untrusted server data.
5. Do not inject server-provided HTML into the DOM.
6. Add CSP and related security headers at the edge/reverse-proxy layer.
7. Sensitive pages and API responses should use appropriate `Cache-Control` semantics.
