# Platform earnings (admin)

**Admin → Earnings** shows what the platform earned and how money moved, per day, for any range up to 92 days.
API: `GET /api/v1/admin/finance/earnings?from=YYYY-MM-DD&to=YYYY-MM-DD&offsetMinutes=<browser offset>`.

## Definitions
- Real-money accounts only (demo accounts are excluded). USD only.
- **House result** = minus the customers' gross profit and loss on settled trades (a loss forfeits the stake, a win pays stake × payout rate, a draw refunds).
- **Fee revenue** = trade fees kept (also on trades voided for lack of a price, where the stake is refunded and the fee kept). Fees are currently not charged in most flows, so this is usually 0.
- **Platform earnings** = house result + fee revenue.
- **Deposits / withdrawals** = completed payments by the day they completed. "Requested" withdrawals are by request day. Net cash flow = deposits − withdrawals.
- **Right now**: pending withdrawals (count, amount, awaiting review, oldest request), pending deposits, open trades (stake and maximum payout if all win) and customer balances.
- Days follow the administrator's browser time zone.

## Limits
- Figures are summed in application code from at most 100,000 rows per query. If a range exceeds that the page shows an "incomplete" warning; use a shorter range.
- In development, sandbox deposits count as real-wallet activity.
- Earnings are not an accounting statement; reconcile with the ledger (Finance → Reconciliation).

# Landing page and sign-in

`/` is the public marketing page (signed-in users are redirected to `/app/trading`). Its buttons go to `/register` and `/login`, which use a split-screen layout (`AccessAside`). Copy contains no return promises. **Have the wording and the risk warning reviewed by a lawyer before launch.**
