# SL Spot API & WebSocket Contracts

**Version:** v1  
**Base path:** \`/api/v1\`  
**Realtime endpoint:** \`/ws\`

This document defines the transport contract between the browser, API, and realtime gateway.

## REST envelope

Successful responses use:

\`\`\`json
{
  "success": true,
  "data": {},
  "requestId": "request-id"
}
\`\`\`

Error responses use:

\`\`\`json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable message"
  },
  "requestId": "request-id"
}
\`\`\`

The \`requestId\` is returned in the JSON body and the \`x-request-id\` response header.

## HTTP headers

Requests:
- \`Accept: application/json\`
- \`Content-Type: application/json\` for JSON bodies
- \`x-request-id\`: optional caller-supplied correlation ID
- \`Idempotency-Key\`: optional on mutation requests that support idempotency

Responses:
- \`x-request-id\`: canonical correlation ID.

Authentication uses the HttpOnly session cookie documented in \`AUTHENTICATION.md\`.

## Status conventions

| Status | Meaning |
|---|---|
| 200 | Successful read or mutation |
| 201 | Resource created |
| 202 | Accepted for asynchronous processing |
| 204 | Successful operation with no body |
| 400 | Invalid request syntax/validation |
| 401 | Missing or invalid authentication |
| 403 | Authenticated but not authorized |
| 404 | Resource not found or intentionally hidden |
| 409 | Conflict / duplicate state |
| 422 | Domain validation failure |
| 429 | Rate limited |
| 500 | Unexpected server failure |
| 503 | Dependency/service unavailable |

## Pagination, filtering, and sorting

List endpoints use:

\`\`\`text
page=1
pageSize=25
sortBy=createdAt
sortOrder=asc|desc
filter=<server-defined filter expression>
\`\`\`

Rules:
- \`page\` is 1-based.
- \`pageSize\` is bounded by the endpoint contract; the backend owns the maximum.
- Sorting fields are endpoint allowlists.
- Filters are endpoint-defined and validated server-side.

Paginated responses use:

\`\`\`json
{
  "success": true,
  "data": {
    "items": [],
    "pagination": {
      "page": 1,
      "pageSize": 25,
      "total": 0,
      "totalPages": 0
    }
  },
  "requestId": "..."
}
\`\`\`

## Authentication contract

Current endpoints:

\`\`\`text
POST   /auth/register
POST   /auth/login
POST   /auth/logout
POST   /auth/logout-all
GET    /auth/me
GET    /auth/sessions
DELETE /auth/sessions/:sessionId
POST   /auth/verify-email
POST   /auth/verify-email/request
POST   /auth/forgot-password
POST   /auth/reset-password
\`\`\`

Authentication state is represented by the server session cookie. Frontend code must not persist or manufacture an authoritative session token.

## Idempotency and correlation

\`Idempotency-Key\` is an opaque unique key, maximum 128 characters. For future financial mutations it will be scoped to the authenticated principal and endpoint and persisted together with the authoritative result.

The same \`x-request-id\` travels through API logs and downstream work where practical. Realtime events use an immutable event ID.

## Realtime protocol

WebSocket:

\`\`\`text
/ws
\`\`\`

Authentication is performed during the handshake using the session cookie. Unauthenticated sockets are rejected.

Server events are versioned:

\`\`\`json
{
  "version": 1,
  "id": "event-uuid",
  "type": "market.price",
  "timestamp": "2026-10-02T00:00:00.000Z",
  "channel": "market:BTCUSD",
  "data": {}
}
\`\`\`

### Client control messages

Subscribe:

\`\`\`json
{
  "type": "subscription.subscribe",
  "requestId": "request-uuid",
  "channel": "market:BTCUSD"
}
\`\`\`

Unsubscribe:

\`\`\`json
{
  "type": "subscription.unsubscribe",
  "requestId": "request-uuid",
  "channel": "market:BTCUSD"
}
\`\`\`

Heartbeat:

\`\`\`json
{ "type": "connection.ping", "requestId": "request-uuid" }
\`\`\`

A legacy text \`ping\` is accepted for compatibility.

### Channels and authorization

| Channel | Scope | Authorization |
|---|---|---|
| \`market:<assetId>\` | public market data | any authenticated session |
| \`user:<userId>\` | private user events | exact authenticated user only |

A client may never subscribe to another user's \`user:<userId>\` channel.

### Subscription acknowledgements

The gateway emits:
- \`subscription.updated\`
- \`subscription.rejected\`
- \`connection.pong\`

Business events are delivered only to sockets subscribed to their channel.

### Current event families

\`\`\`text
connection.ready
connection.pong
subscription.updated
subscription.rejected
market.price
market.candle
market.status
trade.status
position.update
wallet.update
notification.created
\`\`\`

No business event is authoritative until its server-side producer and persistence semantics are implemented.

## Market-data shape

Prices and monetary quantities are decimal strings:

\`\`\`json
{
  "assetId": "asset-id",
  "symbol": "BTCUSD",
  "bid": "65000.12",
  "ask": "65000.44",
  "last": "65000.30",
  "changePct": "-0.42",
  "volume": "2100000000",
  "timestamp": "2026-10-02T00:00:00.000Z"
}
\`\`\`

Candles use the same decimal-string convention for OHLCV values.

## Ownership rules

- Backend owns validation, authorization, domain state, and financial truth.
- Frontend owns presentation and local UI state.
- Realtime delivery does not replace durable API reads for initial state.
- Reconnects recover state through API reads and then resubscribe.

## Out of scope

Trading execution, settlement, wallet mutations, payment webhooks, financial ledger behavior, and full RBAC remain separate milestones. Market provider integration is implemented behind the backend market-data adapter.


## Platform server-state endpoints

The first server-backed read boundary is now available under `/api/v1`.

Public:

- `GET /market/assets?page=&pageSize=&type=`

Authenticated:

- `GET /portfolio/summary`
- `GET /portfolio/positions?page=&pageSize=`
- `GET /trades?page=&pageSize=&status=`
- `GET /wallet`
- `GET /wallet/transactions?page=&pageSize=`
- `GET /notifications?page=&pageSize=&unreadOnly=`
- `POST /notifications/:notificationId/read`

Public market chart data:

- `GET /market/assets/:assetId/candles?interval=5min&limit=200`

The candle endpoint returns normalized OHLCV decimal strings. The Trading Room uses the candle snapshot for chart initialization and the realtime market channel for current price/status updates.

All private resources derive the user ID from the authenticated HttpOnly session cookie. Client-supplied user IDs are not accepted.

Financial quantities are transported as decimal strings. Date/time fields are ISO-8601 strings.
