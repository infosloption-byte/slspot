# SL Spot Web

SL Spot is an original trading-terminal product with a React/Vite frontend and a dedicated Fastify/TypeScript backend in the same repository.

## Repository structure

```text
slspot/
├── frontend/    # React 19 + Vite trading terminal
├── backend/     # Fastify + TypeScript API/realtime foundation
├── docs/        # Architecture, design system and security documentation
└── repository-level documentation and configuration
```

The frontend uses the **Black Gold** design language: near-black surfaces, a single yellow accent for brand and primary actions, green/red reserved for market direction, and a chart-first trading layout.

## Stack

### Frontend

- React 19 + TypeScript
- Vite 8
- React Router 8
- Lightweight Charts
- Lucide React
- CSS design tokens and component-level styles

### Backend

- Node.js 24
- TypeScript
- Fastify 5
- Versioned REST API under `/api/v1`
- WebSocket boundary planned under `/ws`

The browser is never authoritative for balances, order validity, payouts, settlement, wallet debits/credits, or other financial decisions.

## Development

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Default dev URL: `http://localhost:5173`

### Backend

```bash
cd backend
npm install
npm run dev
```

Default API URL: `http://localhost:8080`

Health check:

```text
GET http://localhost:8080/api/v1/health
```

### Frontend checks

```bash
cd frontend
npm run typecheck
npm run lint
npm run build
```

### Backend checks

```bash
cd backend
npm run typecheck
npm run build
```

## Security baseline

- No secrets or private credentials belong in Vite environment variables.
- Browser sessions will use secure, server-managed cookies.
- Sensitive API responses must use appropriate cache controls.
- Deployed frontend/backend services require security headers, TLS, origin controls and rate limiting.
- Trading and wallet operations are UI inputs only; the server must validate and authorize every financial operation.
