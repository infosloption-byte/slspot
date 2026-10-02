# SL Spot Backend

Fastify/TypeScript backend foundation for SL Spot.

## Development

\`bash
npm install
npm run dev
\`

The API listens on http://localhost:8080 by default.

Health endpoints:

- \`GET /api/v1/health\` — liveness.
- \`GET /api/v1/ready\` — current process readiness. Database readiness will be added with Prisma.

Both endpoints return a versioned JSON envelope with a correlation/request ID.

## Environment

Copy \`backend/.env.example\` to your local backend environment and adjust as needed.

Important backend settings:

- \`CORS_ORIGIN\` is an explicit comma-separated allowlist; wildcard origins are not accepted.
- \`NODE_ENV=production\` requires an explicit \`CORS_ORIGIN\`.
- \`TRUST_PROXY\` must only be enabled when the deployment is actually behind a trusted reverse proxy.
- Request timeout, graceful-shutdown timeout and request body size are bounded by validated environment settings.

## Validation

From \`backend/\`:

\`bash
npm run typecheck
npm run build
npm test
\`

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
- Automated backend foundation tests

Database, authentication, market-data providers, realtime event distribution, order lifecycle, wallet authority and financial ledger work are intentionally subsequent milestones.
