# Risk controls

Admin → **Risk limits** (super administrators can raise limits, any administrator can lower them). Every save is written to the audit log (`RISK_SETTINGS_CHANGED`, with before and after). Settings live in the `RiskSettings` table (one row, `GLOBAL`) and each server process refreshes its copy every 30 seconds and after a save.

## What can you lose?
When a customer opens a trade, their stake is already held in their wallet. What the platform could lose is the **profit it owes if the customer wins: stake × payout rate**. All caps use that number ("open profit") and count **real trades only**.

| Setting | Meaning | Launch default |
|---|---|---|
| Smallest / largest trade | Applies to demo and real | 1 / 100 |
| Most one customer can have open | Total stake of their open real trades | 500 |
| Most open trades per customer | Count | 10 |
| Platform open-profit cap | Open profit across all real trades | 2,000 |
| Per-asset cap | Open profit on one asset | 1,000 |
| Per-direction cap | Open profit on one asset and direction | 600 |

Caps are checked inside the trade transaction while the settings row is locked (`SELECT … FOR UPDATE`), so two simultaneous trades cannot both slip under a cap. A trade that would break a cap is rejected with a plain message (it does not reveal the limits) and the audit entry records which cap (`riskCap`).

Defaults are deliberately low for launch. Raise them gradually as you see real win rates and you are comfortable with your cash position.

## Payout percentages
Edit per asset. The page shows the **break-even win rate**: at 88% customers must win 53.2% of trades for you to make nothing; at 80% it is 55.6%. A lower payout means more house edge and less risk per trade; a higher payout looks better to customers but needs a stricter cap. Allowed range 5%–95%.

## Required reserve
Shown on Admin → Earnings under "Right now":

`required reserve = customer funds (available + held) + open profit at risk`

This is the cash you should be holding so every customer can withdraw and every open trade could pay out if it won. Keep your real bank/provider balance at or above it.

## Restricted countries
Customers whose profile country is on the list cannot **open real trades**, **start identity verification** or **make real deposits**. They can always **withdraw** their own money. Only the country on the profile is checked; there is no IP geo-blocking.

The starting list (US, CA, KP, CH, IL, NZ, AU, PR, SG, ID, RU, IR, YE, NL, DE, FR, ES, PT, GR, IT, SE, IS) copies what a comparable platform (ExpertOption) is reported to exclude, from a third-party summary dated October 2023. **It is not legal advice and may be out of date or incomplete.** Your own list depends on the licence and rules you operate under; have a lawyer confirm it. Payment-provider rules can add more countries (`PAYMENTS_BLOCKED_COUNTRIES` still works and is combined with this list for deposits).

## Alerts
Admin → Dashboard shows active alerts. A monitor (every 5 minutes, `ALERT_INTERVAL_MS`) creates an in-app notification for every active administrator and, if `ALERT_WEBHOOK_URL` is set, posts JSON to it.

- **Platform trading result negative** (critical): the ledger account `SYSTEM:TRADE_SETTLEMENT` (credits minus debits) is below `ALERT_SETTLEMENT_FLOOR` (default 0). Customers are ahead overall; confirm you hold enough cash.
- **Cap nearly full** (80%, warning) or **full** (critical): platform, per asset, per direction.
- **Identity checks waiting** (warning): a case in review longer than the configured hours (default 24).

The same problem is repeated at most every 6 hours (critical) or 24 hours (warning).

## KYC retention
Approved identity photos are kept while the account is active (`KYC_RETENTION_APPROVED_DAYS=0`). When an administrator sets an account to **DISABLED**, deletion is scheduled `KYC_RETENTION_AFTER_DEACTIVATION_DAYS` later (default 30); setting it back to ACTIVE cancels it. Rejected documents are deleted after 14 days and unfinished uploads after 7. There is no customer-facing "close my account" feature yet. Confirm periods with your adviser: many AML rules expect records for years after the relationship ends, and privacy law may require deletion on request.
