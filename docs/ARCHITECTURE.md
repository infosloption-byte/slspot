# SL Spot architecture

## Monorepo boundaries

The repository is intentionally separated into two application boundaries:

```text
slspot/
├── frontend/    React/Vite browser application
├── backend/     Fastify/TypeScript API and future realtime/business services
├── docs/        Shared architecture, design and security documentation
└── repository-level configuration
```

This is one repository, but the frontend and backend are independently installable, buildable and deployable applications.

## Frontend

Location: `frontend/`

The frontend owns presentation, browser interaction, UI state, form state and realtime display. It must not be authoritative for balances, order authorization, payout, settlement, wallet accounting, KYC decisions or other financial rules.

Main boundaries:

- `frontend/src/components/layout` — app shell and navigation.
- `frontend/src/components/market` — asset discovery and watchlist UX.
- `frontend/src/components/trading` — chart, order-entry and trading interaction.
- `frontend/src/components/ui` — reusable presentation primitives.
- `frontend/src/api` — typed HTTP client boundary for server-backed features.
- `frontend/src/data` — temporary UI fixtures only.
- `frontend/src/lib` — pure utilities.
- `frontend/src/styles` — Black Gold design tokens and global styling.

## Backend

Location: `backend/`

The backend owns API contracts, authentication/authorization, server-side validation, persistence, financial calculations, order lifecycle, wallet authority, ledger records, market-data integration and future realtime distribution.

Initial runtime boundary:

```text
HTTP API:    /api/v1/*
WebSocket:   /ws/*
Health:      /api/v1/health
```

The current backend is intentionally a foundation only. Database/Prisma, Redis, authentication, market providers, order execution and settlement are still pending.

## Development flow

```text
React UI
   ↓
frontend/src/api/client.ts
   ↓
/api/v1
   ↓
Fastify backend
   ↓
future services / database / market providers
```

For local development, Vite proxies `/api` and WebSocket traffic to the backend so the browser can use the same logical origin.

## Security decisions

1. Do not persist secrets in the frontend bundle.
2. Prefer HttpOnly, Secure, SameSite cookies for browser sessions.
3. Keep privileged API authorization on the server.
4. Treat displayed market values as server data, never client authority.
5. Do not inject server-provided HTML into the DOM.
6. Add CSP and related security headers at the edge/reverse-proxy layer.
7. Use appropriate cache-control semantics for sensitive responses.
8. Financial mutations must eventually be idempotent, auditable and backed by durable persistence.
