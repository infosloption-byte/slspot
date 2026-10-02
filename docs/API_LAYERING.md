# SL Spot API Layering

Status: implemented on main — 2026-10-02.

The platform now has explicit HTTP and realtime application boundaries on both sides of the monorepo.

## Frontend HTTP layer

```text
frontend/src/api/
├── client.ts
├── contracts.ts
├── auth.ts
├── market.ts
├── portfolio.ts
├── trades.ts
├── wallet.ts
├── notifications.ts
└── index.ts
```

Rules:

- Components do not build raw API URLs.
- Authentication/session transport uses the HttpOnly cookie through `credentials: include`.
- Responses use the versioned success/error envelope.
- Every request receives an `x-request-id`.
- Mutating calls may send `Idempotency-Key`.
- Bodyless requests do not send an empty JSON body.
- Domain modules own endpoint paths and response types.
- Financial values remain decimal strings at the API boundary.

## Frontend realtime layer

```text
frontend/src/realtime/
├── connection.ts
├── subscriptions.ts
├── events.ts
├── reconnect.ts
├── contracts.ts
├── requestId.ts
├── RealtimeProvider.tsx
└── index.ts
```

The provider connects only while a server-authenticated session exists. The client handles reconnects, subscription recovery, heartbeat messages, state transitions, and versioned event parsing.

The WebSocket URL is same-origin by default, allowing the browser to send the HttpOnly session cookie during the handshake.

## Backend HTTP layer

```text
backend/src/
├── api/
│   ├── routes.ts
│   ├── service.ts
│   └── routes.test.ts
├── auth/
│   ├── routes.ts
│   └── service.ts
└── contracts/
```

The route layer owns HTTP concerns:

- authentication context
- query parsing
- request/response envelopes
- HTTP status behavior

The service layer owns persistence reads and DTO mapping. User-scoped endpoints receive the authenticated user ID from the session rather than accepting a client-supplied user ID.

## Versioned endpoints

Public:

- `GET /api/v1/health`
- `GET /api/v1/ready`
- `GET /api/v1/market/assets`

Authenticated:

- `GET /api/v1/portfolio/summary`
- `GET /api/v1/portfolio/positions`
- `GET /api/v1/trades`
- `GET /api/v1/wallet`
- `GET /api/v1/wallet/transactions`
- `GET /api/v1/notifications`
- `POST /api/v1/notifications/:notificationId/read`

Authentication remains under `/api/v1/auth`.

## Deliberately deferred

The layering is ready for domain write APIs, but the following remain separate implementation milestones:

- order submission and the trading engine
- authoritative market-provider integration
- settlement
- wallet mutations
- payment webhooks
- financial ledger posting

The frontend therefore keeps its existing demo trading behavior until those server-authoritative services exist; the new API clients do not silently replace demo authority with fake persistence.
