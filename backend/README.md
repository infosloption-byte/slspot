# SL Spot Backend

Fastify/TypeScript backend foundation for SL Spot.

## Development

npm install
npm run dev

The API listens on http://localhost:8080 by default.

Health endpoint:

GET /api/v1/health

## Current scope

- Fastify application bootstrap
- Versioned API prefix
- CORS configuration
- Structured Fastify logging
- Centralized error/not-found responses
- Health endpoint

Database, authentication, market-data providers, realtime event distribution, order lifecycle, wallet authority and financial ledger work are intentionally subsequent milestones.
