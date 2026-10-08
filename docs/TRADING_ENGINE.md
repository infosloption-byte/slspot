# SL Spot Trading Engine

## Scope

The trading engine is the authoritative server path for the current fixed-duration trading ruleset. The browser submits trade intent; the backend validates, persists and settles the financial state.

Real-money execution remains blocked by the Phase 1 product/legal gate and the later payments, KYC/AML, reconciliation and production-security milestones.

## Data flow

```text
Browser
  │
  ├── POST /api/v1/trades
  │      └── Idempotency-Key
  │
  ▼
TradingService
  ├── User eligibility
  ├── Account/wallet availability
  ├── Asset + market availability
  ├── Fresh server market price
  ├── Amount / duration / exposure limits
  ├── Atomic balance reservation
  ├── Order
  ├── Position
  └── Trade
          │
          ├── POST /api/v1/trades/:tradeId/close
          │
          └── expiry worker
                  │
                  ▼
             Settlement
                  │
                  ├── authoritative settlement price
                  ├── payout + fee calculation
                  ├── wallet balance update
                  ├── wallet transaction(s)
                  ├── ledger entries
                  └── realtime trade/position/wallet events
```

## Server authority

The frontend does not own:

- available/held balance
- payout rate
- trade acceptance
- entry price
- settlement price
- settlement result
- settlement timestamp
- ledger movements

The frontend reads these values from authenticated API/realtime state.

## Current rules

Server-side defaults are defined in `backend/src/trading/config.ts`:

- Allowed durations: 15, 30, 60 and 300 seconds.
- Minimum amount: 1.00.
- Maximum amount: 100000.00.
- Default symbol payout rates are server-side configuration.
- Fee rate is controlled by `TRADING_FEE_RATE`.
- Market price freshness is controlled by `TRADING_MARKET_MAX_AGE_MS`.
- Exposure limits are controlled by `TRADING_MAX_OPEN_POSITIONS` and `TRADING_MAX_OPEN_EXPOSURE`.

These rules are development/product rules, not a declaration of a final real-money financial product.

## Accounting model

When a trade is accepted:

1. The stake is moved from wallet available balance to held balance.
2. The fee is separately debited from available balance.
3. A `TRADE_HOLD` wallet transaction and ledger debit are written for the stake.
4. A `FEE` wallet transaction and ledger debit are written for the fee.
5. Order, position and trade records are created in the same database transaction.

When a trade settles:

1. The open trade is conditionally claimed so concurrent settlement cannot process it twice.
2. The position is closed at the server settlement price.
3. The held stake is released.
4. Winning trades credit stake plus payout profit; losing trades credit zero.
5. A settlement wallet transaction and settlement ledger entry are written.
6. The settlement record is upserted by unique `tradeId`.

The balance update and related financial records are committed inside one Prisma transaction.

## Idempotency

Trade creation requires a safe client request ID. The frontend sends it as `Idempotency-Key`.

The database has a unique constraint on `Order.clientRequestId`. A repeated request for the same authenticated user returns the existing trade instead of creating another order.

A request that reuses an existing key belonging to another user is rejected.

## API

### Create trade

`POST /api/v1/trades`

Request:

```json
{
  "assetId": "asset-id",
  "direction": "UP",
  "amount": "50.00000000",
  "durationSeconds": 60
}
```

Headers:

```text
Idempotency-Key: unique-request-id
```

### Close/settle trade

`POST /api/v1/trades/:tradeId/close`

This uses the freshest available server market price and performs the same authoritative settlement path as expiry settlement.

### Read server state

- `GET /api/v1/market/assets`
- `GET /api/v1/portfolio/positions`
- `GET /api/v1/trades`
- `GET /api/v1/wallet`
- `GET /api/v1/wallet/transactions`

Realtime user events:

- `trade.status`
- `position.update`
- `wallet.update`

## Migration

The Order model now stores the server payout rate.

Run from `backend/`:

```bash
npm run prisma:migrate:deploy
npm run prisma:generate
npm run typecheck
npm test
```

For local development using migrations created from schema changes:

```bash
npm run prisma:migrate -- --name your_change_name
```

## Testing

Core calculation coverage lives in `backend/src/trading/service.test.ts` and covers:

- UP/DOWN settlement direction
- win payout
- loss payout
- fee impact
- stake reservation amount

The next test hardening step is database-backed integration coverage for concurrent trade creation and settlement.

## Void and refund when no price is available

A trade (demo or real) that has expired but cannot be priced (no fresh Binance tick for the expiry instant and no fresh current price) is retried every settlement pass. Once `TRADING_VOID_AFTER_MS` (default 60s) has passed since expiry it is voided: the trade becomes `CANCELLED`, the full stake is released back to the available balance through a `TRADE_VOID` ledger transaction, and the settlement record carries the reference `void:<tradeId>`. The audit log records `TRADE_VOIDED_NO_PRICE`.

The user receives a `SYSTEM` notification ("Trade voided: price unavailable") stating that no reliable price was available and that the stake was refunded in full, plus the normal realtime trade/wallet updates. The trading fee is not refunded by this path (it is 0 by default).
