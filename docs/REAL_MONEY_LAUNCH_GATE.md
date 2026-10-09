# SLSpot real-money launch gate

## Purpose

The launch gate prevents new REAL-mode trades unless deployment configuration and the persistent administrative control both allow them. The gate defaults to closed. Demo trading is unaffected.

## Conditions for a new REAL trade

All of the following must be true:

1. `REAL_MONEY_LAUNCH_APPROVED=true`
2. `REAL_TRADING_ENABLED=true`
3. The MySQL `RealMoneyGate` row with ID `GLOBAL` has `tradingEnabled=true`
4. The requesting account is eligible and the selected REAL wallet is active, along with the normal market, wallet, risk and trading checks.

The first two settings are backend environment variables. The database switch is available in the administrator console under **Launch Gate**. Only a `SUPER_ADMIN` may turn REAL trading on. Any administrator can turn it off. Successful changes are written to `AuditLog`.

Keep the environment flags false until the applicable trading, eligibility, payment, financial-control and operational work is complete. Changing environment variables requires restarting the backend process.

## Deposit and withdrawal status

REAL deposits and withdrawals remain unavailable. Their environment flags and database fields do not activate payment processing: the API endpoints remain blocked until provider-backed payment lifecycles, webhook verification, idempotency, refunds/returns, withdrawal controls and ledger reconciliation have been implemented and tested.

## Fail-closed behavior

- All gate environment flags default to `false`.
- A missing `RealMoneyGate` row means trading is disabled.
- If the database gate cannot be read, new REAL trade creation fails with a service-unavailable error.
- The capability response reports REAL trading disabled unless both environment configuration and the database switch permit it.
- Closing the gate blocks new REAL trade creation. Settlement/recovery of existing trades is intentionally not blocked so outstanding positions can complete or be recovered without stranding funds.
- Rejected REAL trade attempts are logged by the trading service. Administrative setting changes include before/after values in the audit log.

## Apply and validate

After pulling the code, apply the schema migration and regenerate Prisma Client through the standard typecheck/test/build scripts:

```powershell
cd C:\wamp\www\html\slspot
git pull origin main
cd backend
npm run prisma:migrate:status
npm run prisma:migrate:deploy
npm run prisma:migrate:status
npm run typecheck
npm test
npm run build
cd ..\admin
npm run typecheck
npm run build
```

Expected database result: `Database schema is up to date!`

The admin console should show **REAL TRADING BLOCKED** with default configuration. Test an attempted REAL trade directly through the backend and verify it returns `REAL_TRADING_DISABLED`. Also verify ordinary Admin users can disable the database switch but cannot enable it; enabling requires SUPER_ADMIN plus both deployment flags. Keep production flags closed during this validation.
