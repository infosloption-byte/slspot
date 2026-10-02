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

Initialize the database:

```bash
npm run prisma:generate
npm run prisma:migrate:deploy
```

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
- Automated backend foundation tests

Authentication, market-data providers, realtime event distribution, order lifecycle, wallet authority and financial ledger business logic remain subsequent milestones.
