# SL Spot Backend

Fastify/TypeScript backend foundation for SL Spot.

## Development

```bash
npm install
npm run db:up
npm run prisma:generate
npm run prisma:migrate:deploy
npm run dev
```

The API listens on http://localhost:8080 by default.

Local Redis is included in `docker-compose.yml` on port 6379. Redis is optional in development by default; set `REDIS_REQUIRED=true` when you want readiness/startup to require it.

Realtime WebSocket endpoint:

- `ws://localhost:8080/ws`

The WebSocket gateway now requires an authenticated session when the production server supplies the auth service. It provides connection-ready events, heartbeat pings, bounded payload size, protocol-versioned event envelopes and Redis-backed broadcast fan-out.

Health endpoints:

- `GET /api/v1/health` — liveness.
- `GET /api/v1/ready` — readiness including a database connectivity check when the server is running.

Both endpoints return a versioned JSON envelope with a correlation/request ID.

## MySQL + Prisma

The backend uses Prisma ORM 7 with MySQL and the `@prisma/adapter-mariadb` driver adapter. Prisma ORM 8 does not currently include MySQL support, so this backend deliberately stays on the supported Prisma 7 MySQL path.

The included `docker-compose.yml` starts a local MySQL 8.4 instance on host port 3307:

```bash
npm run db:up
```

The default local connection is:

```text
mysql://slspot:slspot@127.0.0.1:3307/slspot
```

The initial schema explicitly uses InnoDB for every table and keeps indexed string fields within the conservative MySQL 5.7-compatible key-prefix range. This prevents a server configured with MyISAM defaults from producing the 1000-byte key error and keeps the migration compatible with WAMP MySQL 5.7.40 as well as newer MySQL versions.

Initialize the database:

```bash
npm run prisma:generate
npm run prisma:migrate:deploy
```

If a previous attempt left `0001_init` in a failed state on a brand-new local database, reset that local database before retrying. The simplest clean-dev option is:

```bash
npx prisma --config prisma7.config.ts migrate reset --force
```

This destroys and recreates the local `slspot` database, so do not use it against a database containing data you need to keep.

For normal schema development, create and apply migrations with:

```bash
npm run prisma:migrate -- --name your_change_name
```

The initial persistence model covers the planned User, Session, Device, Account, Asset, Market, Order, Position, Trade, Settlement, Wallet, WalletTransaction, LedgerEntry, Deposit, Withdrawal, KycCase, Notification and AuditLog entities.

The financial product definition remains separate from this storage foundation. Order, position, settlement and fee rules must still follow the product-definition gate before real-money execution.

## Environment

Copy `backend/.env.example` to your local backend environment and adjust as needed.

Important backend settings:

- `CORS_ORIGIN` is an explicit comma-separated allowlist; wildcard origins are not accepted.
- `NODE_ENV=production` requires an explicit `CORS_ORIGIN` and `DATABASE_URL`.
- `TRUST_PROXY` must only be enabled when the deployment is actually behind a trusted reverse proxy.
- Request timeout, graceful-shutdown timeout and request body size are bounded by validated environment settings.
- `DATABASE_CONNECTION_LIMIT` controls the MySQL driver-adapter connection pool.
- `REDIS_URL` configures the Redis connection; `rediss://` may be used for TLS deployments.
- `REDIS_REQUIRED=false` keeps local API startup available when Redis is not installed; production deployments should explicitly decide whether Redis is required.
- `REDIS_CHANNEL` is the versioned pub/sub channel used for realtime fan-out.
- `REDIS_KEY_PREFIX` namespaces application cache/session keys.
- `WEBSOCKET_MAX_PAYLOAD_BYTES` limits inbound WebSocket payloads.
- `AUTH_SESSION_TTL_SECONDS` controls session lifetime.
- `AUTH_VERIFICATION_TTL_SECONDS` controls email-verification token lifetime.
- `AUTH_PASSWORD_RESET_TTL_SECONDS` controls password-reset token lifetime.
- `AUTH_PASSWORD_MIN_LENGTH` enforces the backend password minimum.
- `AUTH_COOKIE_*` controls the HttpOnly session cookie.
- `AUTH_EXPOSE_DEV_TOKENS=true` exposes verification/reset tokens only for explicitly enabled local development; keep it false in production.

## Validation

From `backend/`:

```bash
npm run typecheck
npm run build
npm test
```

Database migration status:

```bash
npm run prisma:migrate:status
```

## Current scope

- Fastify application bootstrap
- Versioned API prefix
- Validated environment configuration
- Explicit CORS allowlist
- Structured Fastify logging with request IDs
- Baseline API security headers
- Centralized error/not-found responses
- Liveness and readiness endpoints
- Graceful SIGINT/SIGTERM shutdown
- Prisma/MySQL persistence foundation
- Connection-pool configuration
- Versioned database migrations
- Local MySQL development container
- Redis connection, pub/sub, TTL and invalidation primitives
- Local Redis development container
- WebSocket gateway at `/ws` with authenticated session handshake
- Authentication routes for registration, login, logout, current-user, sessions, verification and password reset
- HttpOnly session-cookie authentication backed by durable hashed session tokens
- scrypt password hashing and SHA-256 token hashing
- Versioned realtime event envelope and heartbeat handling
- Automated backend foundation tests

Market-data providers, realtime event distribution beyond the authenticated gateway, order lifecycle, wallet authority and financial ledger business logic remain subsequent milestones.
