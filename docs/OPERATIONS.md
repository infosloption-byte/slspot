# Operations guide

## 1. Backups and monitoring

**Database (MySQL).** Daily full dump plus binary logs if you can (point-in-time recovery). Minimum: `mysqldump --single-transaction --routines slspot | gzip > slspot-$(date +%F).sql.gz`, copied off the server to storage in another place (cloud bucket or another provider). Keep 14 daily and 12 monthly copies. Managed MySQL (for example a cloud database) does this for you; turn on automated backups and test a restore. **A backup you have never restored is not a backup:** restore into a scratch database every month and check that a recent trade and wallet balance are present.

**KYC files and key.** Back up the KYC document directory (`KYC_DOCUMENT_DIR`) with the database, and store `KYC_DOCUMENT_ENCRYPTION_KEY` separately in a password manager or secrets service, with at least two people able to reach it. Losing the key makes every stored document unreadable; keeping the key next to the files defeats the encryption. Also back up `AUTH_2FA_ENCRYPTION_KEY` the same way (losing it locks every 2FA user out).

**Secrets.** Keep a copy of the production `.env` values in the same secrets store.

**Monitoring.** Start simple:
- An uptime check on `/api/v1/health` (UptimeRobot, Better Stack, or your host's checks) that emails or texts you.
- Error reporting (for example Sentry) on the API and the web apps.
- Disk space alerts on the database and the KYC directory.
- A **stale price feed** check: the API refuses trades when prices are older than `TRADING_MARKET_MAX_AGE_MS`, so a dead feed shows up as rejected trades ("The market price is stale"). Watch the Risk page's rejected-orders count, and add an external alert on it once you have a metrics tool.
- Administrator alerts already cover: negative trading result, caps nearly full, identity checks stuck in review. Set `ALERT_WEBHOOK_URL` to be told outside the admin console.

## 2. Check two-factor authentication with a real authenticator
1. Start the app, sign in, open **Account → Security** and press Enable.
2. On your phone open Google Authenticator or Microsoft Authenticator → add account → **scan a QR code** and scan the popup (use a laptop screen at normal brightness).
3. A six-digit code appears for "SL Spot". Type it into the boxes and press **Verify and enable**; save the recovery codes.
4. Sign out and in again: you should be asked for a code. Then press Disable and confirm the dialog asks for a code.
5. If the scan fails, enter the setup key by hand (choose "time-based"). If codes are rejected, check the phone's clock is set automatically.

## 3. Verify the Earnings page against MySQL
The page adds up in code; these queries add up in the database. Compare the all-time numbers (Earnings → totals for the whole period, or choose a range) with the results. Run on a copy if you prefer.

```sql
-- House result (negative of customers' profit and loss), real accounts, all time
SELECT -SUM(t.grossPnl) AS houseResult, SUM(t.fee) AS fees, COUNT(*) AS trades
FROM Trade t JOIN Position p ON p.id = t.positionId JOIN Account a ON a.id = p.accountId
WHERE a.mode = 'REAL' AND t.status IN ('WON','LOST','DRAW','CANCELLED');

-- Same, for one day (use your own time zone offset)
SELECT DATE(CONVERT_TZ(t.closedAt,'+00:00','+05:30')) AS day, -SUM(t.grossPnl) AS houseResult, COUNT(*) AS trades
FROM Trade t JOIN Position p ON p.id = t.positionId JOIN Account a ON a.id = p.accountId
WHERE a.mode = 'REAL' AND t.status IN ('WON','LOST','DRAW','CANCELLED') GROUP BY day ORDER BY day DESC LIMIT 14;

-- Customer money held (available + held), real wallets
SELECT SUM(w.availableBalance) AS available, SUM(w.heldBalance) AS held
FROM Wallet w JOIN Account a ON a.id = w.accountId WHERE a.mode = 'REAL';

-- Open real trades: stake and the most they could pay out
SELECT COUNT(*) AS openTrades, SUM(p.amount) AS stake, SUM(p.amount * (1 + o.payoutRate)) AS maxPayout
FROM Position p JOIN Account a ON a.id = p.accountId JOIN `Order` o ON o.id = p.orderId
WHERE p.status = 'OPEN' AND a.mode = 'REAL';

-- Completed deposits and withdrawals, real wallets
SELECT 'deposits' AS kind, SUM(d.amount) AS total FROM Deposit d JOIN Wallet w ON w.id = d.walletId JOIN Account a ON a.id = w.accountId WHERE a.mode='REAL' AND d.status='COMPLETED'
UNION ALL
SELECT 'withdrawals', SUM(x.amount) FROM Withdrawal x JOIN Wallet w ON w.id = x.walletId JOIN Account a ON a.id = w.accountId WHERE a.mode='REAL' AND x.status='COMPLETED';

-- Platform trading result according to the ledger (should equal the house result, sign aside)
SELECT SUM(CASE e.direction WHEN 'CREDIT' THEN e.amount ELSE -e.amount END) AS settlementBalance
FROM LedgerEntry e JOIN LedgerAccount la ON la.id = e.ledgerAccountId WHERE la.code = 'SYSTEM:TRADE_SETTLEMENT';
```
House result, wallet totals and open-trade figures should match the page to the cent (the page rounds to 2 decimals). If the ledger balance and house result disagree, open Finance → Reconciliation first. Table names are the Prisma defaults; adjust if your database differs.

## 4. KYC reviewer role and key rotation (plan)
**Today** any administrator can open identity photos. Every opening is written to the audit log with the administrator's id, and refuses to show the image if that log cannot be written. Until a role split exists: give administrator access only to people who must review identity, and review the audit log (`KYC_DOCUMENT_VIEWED`) regularly.

**Role split (to build).** Add a `KYC_REVIEWER` value to the administrator role. Document viewing and approve/reject require `KYC_REVIEWER` or `SUPER_ADMIN`; ordinary administrators see case status only. It is a small change (role enum, one check in the KYC routes, one selector in the admin Users page) and should come with tests for each role.

**Key rotation (to build).** Files are encrypted with one key. To rotate: (1) generate a new key; (2) keep the old key available as `KYC_DOCUMENT_ENCRYPTION_KEY_PREVIOUS`; (3) a one-off script decrypts each file with the old key and re-encrypts it with the new one, writing to a temporary file then replacing it; (4) once every file has been re-encrypted and verified, retire the old key. Do this after any suspected key exposure and when a person who knew the key leaves. Take a full backup first.

## 5. Do other platforms charge a trade fee?
Fixed-payout ("binary-style") platforms mostly **do not charge an explicit trade fee**. They earn from the payout spread: paying 80–90% on a win while taking 100% of the stake on a loss, which is a built-in house edge (break-even win rate 52.6%–55.6%). Some also earn from withdrawal or inactivity fees, or, on forex-style products, from commissions. For example, Pocket Option publishes no deposit, withdrawal or inactivity fee and charges only about $2.5 per lot on its ECN forex accounts. SLSpot's `TRADING_FEE_RATE` defaults to 0, so the house edge from the payout percentages (Risk limits page) is the only revenue. Add a fee only if you want a visible charge; check consumer-protection rules on disclosing it before each trade. Check each platform's current published fee page before relying on these figures.
