## Current Architecture Milestone — 2026-10-02

The repository is now structured as a monorepo with explicit frontend and backend application boundaries.

- [x] Move the React/Vite application into `frontend/`.
- [x] Keep shared documentation and repository governance at the root.
- [x] Create a dedicated TypeScript + Fastify backend in `backend/`.
- [x] Add backend configuration and a versioned `/api/v1/health` endpoint.
- [x] Add the frontend API client foundation at `frontend/src/api/client.ts`.
- [x] Configure the frontend development proxy for `/api` and WebSocket traffic.
- [x] Harden backend runtime configuration, request IDs, security headers, readiness, and graceful shutdown.
- [x] Add automated backend foundation tests.
- [x] Add backend persistence with Prisma/MySQL.
- [x] Add Redis/realtime infrastructure foundation.
- [x] Connect authentication/session management to the backend.
- [x] Replace demo market/trade/wallet authority with server-backed state.
- [x] Establish typed frontend/backend API service layers and authenticated realtime client.

### Current repository shape

```text
slspot/
├── frontend/    # React + Vite trading UI
├── backend/     # Fastify API + future realtime/business services
├── docs/        # Architecture, design and security documentation
└── repository-level docs/config
```

## Current Frontend Task Audit — 2026-10-02

The latest frontend theme is **Black Gold / SL Spot** and is now the active design direction. The requested frontend work below is implemented on `main`:

### Trading screen polish
- [x] Open positions: live countdown, current P&L, close action.
- [x] Chart trade markers: entry marker, countdown/progress line.
- [x] Chart type switch: candles, line, area.
- [x] Basic indicators: MA and RSI.
- [x] Drawing tools: horizontal level and trend line, plus clear/reset.
- [x] Live demo price ticks.
- [x] Win/lose/open trade toast feedback.
- [x] Optional trade sounds with persisted preference.
- [x] Asset payout percentages.
- [x] Crypto, FX, Stocks, Commodities and Indices categories.
- [x] Favorites tab and persistence.
- [x] Mobile sticky UP/DOWN trading bar with expandable stake/duration configuration.

### Missing screens and shared UI
- [x] Login/register/forgot/reset/email verification/2FA forms.
- [x] Wallet deposit/withdraw demo forms and transaction table.
- [x] 404 page.
- [x] Protected-route boundary.
- [x] Toast.
- [x] Tooltip.
- [x] Skeleton.
- [x] EmptyState.
- [x] ErrorState.
- [x] Select.
- [x] Pagination.
- [x] Custom SL Spot brand mark and favicon.

These items are implemented as demo/frontend behavior. Server-authoritative authentication, market data, balances, orders, settlement and wallet operations remain backend integration work and must not be moved into frontend authority.
# Current Frontend Implementation Update — 2026-10-02

The frontend theme was audited before the latest implementation work. The current visual system is **Black Gold**: true-black surfaces, yellow brand accent, green/red reserved for market direction, compact rail/topbar, and denser controls. New UI work in this milestone follows those tokens rather than the earlier cyan/graphite styling.

Completed in this milestone:

- [x] Live server market-price updates in the Trading Room.
- [x] Server-backed open-position countdowns.
- [x] Server settlement P&L for closed trades; open positions intentionally do not fabricate mark-to-market P&L.
- [x] Server close-position action and automatic expiry settlement.
- [x] Trade entry markers and countdown/progress lines on the chart.
- [x] Candles / line / area chart type switching.
- [x] MA (14) overlay.
- [x] RSI (14) indicator panel.
- [x] Horizontal and trend-line drawing tools.
- [x] Win/lose result toasts.
- [x] Optional trade sounds with persisted preference.
- [x] Asset payout percentages.
- [x] Crypto / FX / Stocks / Commodities / Indices / Favorites market filtering.
- [x] Mobile sticky UP/DOWN execution bar with expandable stake/duration controls.
- [x] Login / register / recovery / reset / verification / 2FA forms.
- [x] Demo protected-route boundary.
- [x] Dedicated 404 page.
- [x] Wallet deposit / withdrawal forms retained as UI-only flows; authoritative wallet mutations remain a later payments milestone.
- [x] Wallet transaction table and pagination.
- [x] Shared Toast / Tooltip / Skeleton / EmptyState / ErrorState / Select / Pagination components.
- [x] Black Gold branded mark and favicon.

Frontend platform layer status after the 2026-10-02 API layering milestone:

Trading Room history hardening completed in the current implementation:
- [x] Global settled trade history across all selected pairs.
- [x] Server-side search, status, asset/pair, direction, and date-range filters.
- [x] Server-side sorting.
- [x] Server-side pagination.
- [x] CSV export of all trades matching the active history filters.
- [x] History-specific loading and error states.
- [x] Open and closed prices in Trading Room history.

- [x] Server-backed authentication.
- [x] API client abstraction.
- [x] Typed domain API clients for market, portfolio, trades, wallet, and notifications.
- [x] Authenticated WebSocket/realtime client with reconnect and subscription recovery.
- [x] Authoritative market data and wallet state for trading flows.
- [ ] Loading/offline/reconnecting states across all features.
- [ ] Full accessibility audit and focus trapping.
- [ ] Unit/component/E2E test suite.
- [ ] CI quality gates.


# SL Spot / SL Option — Full Implementation Task File

**Repository:** `infosloption-byte/slspot`  
**Branch:** `main`  
**Current status:** Frontend + backend foundation + persistence + realtime + authentication + server-authoritative trading engine  
**Target:** Production-ready original trading platform, subject to product/legal decisions

---

# How to Use This Task File

This is the master implementation checklist.

Rules:

- Work in dependency order.
- Do not implement real-money execution before the financial product model is finalized.
- Do not treat frontend values as authoritative.
- Keep financial truth in the backend/database/ledger.
- Update documentation whenever architecture changes.
- Every completed task should include tests where applicable.
- Keep the frontend original; do not copy another platform's branding, assets, source code, or exact UI.

Status legend:

```text
[ ] Not started
[~] In progress
[x] Complete
[!] Blocked / requires decision
```

---

# PHASE 0 — Project Governance & Baseline

## 0.1 Repository baseline

- [x] Confirm repository is `infosloption-byte/slspot`.
- [x] Confirm default branch is `main`.
- [x] Confirm current foundation commit.
- [x] Document repository structure.
- [x] Establish separate `frontend/` and `backend/` application boundaries.
- [ ] Add project versioning policy.
- [ ] Add `CHANGELOG.md`.
- [ ] Add contribution/development workflow.
- [ ] Decide whether GitHub issues or another tracker is the canonical task tracker.

## 0.2 Dependency management

- [ ] Generate and commit `package-lock.json`.
- [ ] Confirm Node 24 LTS development baseline.
- [ ] Confirm supported npm version.
- [ ] Add dependency update policy.
- [ ] Add dependency vulnerability scanning.

## 0.3 Quality gates

- [ ] Define required checks:
  - [ ] lint
  - [ ] typecheck
  - [ ] unit tests
  - [ ] build
  - [ ] E2E
- [ ] Define branch/merge policy.
- [ ] Define release tagging policy.

---

# PHASE 1 — Product Definition

## 1.1 Financial product decision — BLOCKING

- [ ] Decide exact financial instrument.
- [ ] Document whether the product is:
  - [ ] spot
  - [ ] CFD
  - [ ] perpetual
  - [ ] fixed-duration contract
  - [ ] other
- [ ] Define pricing model.
- [ ] Define execution model.
- [ ] Define margin model if applicable.
- [ ] Define settlement model.
- [ ] Define fee model.
- [ ] Define payout model if applicable.
- [ ] Define market-hours model.
- [ ] Define risk rules.
- [ ] Define cancellation rules.
- [ ] Define expiry rules.
- [ ] Define user eligibility rules.

## 1.2 Jurisdiction/compliance gate

Before real-money features:

- [ ] Identify target jurisdictions.
- [ ] Determine legal classification.
- [ ] Determine licensing requirements.
- [ ] Define KYC requirements.
- [ ] Define AML requirements.
- [ ] Define customer eligibility.
- [ ] Define restricted jurisdictions.
- [ ] Define product availability by jurisdiction.
- [ ] Define transaction monitoring requirements.
- [ ] Define record retention requirements.
- [ ] Define audit requirements.

---

# PHASE 2 — Design System

## 2.1 Black Gold / SL Spot

- [x] Establish true-black base surfaces.
- [x] Establish yellow/gold brand accent.
- [x] Establish green positive state.
- [x] Establish red negative state.
- [x] Establish surface/border tokens.
- [x] Establish radius tokens.
- [ ] Document typography scale.
- [ ] Document spacing scale.
- [ ] Document component states.
- [ ] Document accessibility contrast requirements.

## 2.2 Components

Create reusable primitives:

- [ ] Button
- [x] IconButton
- [ ] Input
- [x] Select
- [ ] Dropdown
- [ ] Tabs
- [ ] Badge
- [x] Tooltip
- [ ] Modal
- [ ] Drawer
- [x] Toast
- [x] Skeleton
- [x] EmptyState
- [x] ErrorState
- [ ] DataTable
- [x] Pagination
- [ ] ConfirmDialog

---

# PHASE 3 — Application Routing

## 3.1 Public routes

- [x] `/`
- [x] `/login`
- [x] `/register`
- [x] `/forgot-password`
- [x] `/reset-password`
- [x] `/verify-email`
- [x] `/2fa`

## 3.2 Authenticated routes

- [x] `/app`
- [x] `/app/trading`
- [x] `/app/dashboard`
- [x] `/app/portfolio`
- [x] `/app/wallet`
- [x] `/app/history`
- [x] `/app/alerts`
- [x] `/app/account`
- [x] `/app/security`
- [x] `/app/support`

## 3.3 Route behavior

- [x] Active navigation state.
- [x] Not-found page.
- [x] Unauthorized state.
- [ ] Forbidden state.
- [ ] Loading route state.
- [x] Protected route boundary.
- [x] Redirect rules.

---

# PHASE 4 — Trading Terminal V1

## 4.1 Terminal shell

- [x] Sidebar.
- [x] Topbar.
- [x] Asset panel.
- [x] Chart panel.
- [x] Order panel.
- [x] Bottom panel.
- [x] Responsive base.
- [x] Convert navigation buttons to real routes.
- [x] Add mobile navigation behavior.
- [ ] Add keyboard shortcuts.
- [ ] Add global loading state.
- [ ] Add global connection status.

## 4.2 Asset watchlist

- [x] Server-backed asset registry/list.
- [x] Asset selection.
- [x] Search.
- [x] Favorites.
- [x] Favorite persistence.
- [x] Categories.
- [x] Crypto filter.
- [x] FX filter.
- [x] Stocks filter.
- [x] Commodities filter.
- [x] Indices filter.
- [ ] Recent assets.
- [ ] Sorting.
- [x] Live price.
- [x] Percentage change.
- [ ] Volume.
- [x] Market status.
- [x] Mobile asset picker.
- [ ] Loading state.
- [x] Empty state.
- [ ] Error state.

## 4.3 Chart

- [x] Add Lightweight Charts.
- [x] Replace SVG sample chart.
- [x] Candlestick series.
- [x] OHLC data model.
- [x] Timeframe switching.
- [x] 1m.
- [x] 5m.
- [x] 15m.
- [x] 30m.
- [x] 1H.
- [x] 4H.
- [x] 1D.
- [x] Crosshair.
- [x] Zoom.
- [x] Pan.
- [ ] Volume.
- [x] Fullscreen.
- [x] Chart settings.
- [ ] Connection status.
- [ ] Stale-data indicator.

## 4.4 Indicators

Initial:

- [ ] EMA.
- [ ] SMA.
- [ ] RSI.
- [ ] MACD.
- [ ] Bollinger Bands.
- [ ] Stochastic.
- [ ] ATR.
- [ ] Parabolic SAR.
- [ ] Alligator.
- [ ] Awesome Oscillator.
- [ ] Fractals.

Architecture:

- [ ] Indicator registry.
- [ ] Indicator settings.
- [ ] Enable/disable.
- [ ] Multiple indicators.
- [ ] Indicator persistence.
- [ ] Reset chart settings.

## 4.5 Drawing tools

- [ ] Trend line.
- [ ] Horizontal line.
- [ ] Vertical line.
- [ ] Ray.
- [ ] Fibonacci retracement.
- [ ] Rectangle.
- [ ] Price marker.
- [ ] Text annotation.
- [ ] Remove selected.
- [ ] Remove all.
- [ ] Drawing persistence.

---

# PHASE 5 — Order Panel UX

## 5.1 Fields

- [x] Instrument.
- [x] Direction.
- [x] Amount.
- [x] Duration.
- [ ] Expiry.
- [x] Available balance.
- [x] Minimum amount.
- [x] Maximum amount.
- [x] Potential return.
- [ ] Fees where applicable.
- [x] Risk disclosure.

## 5.2 Amount UX

- [x] Stepper.
- [x] Presets.
- [x] Validation.
- [x] Min/max enforcement from server configuration.
- [x] Server accepts validated decimal trade amounts.
- [ ] Currency display.
- [x] Invalid amount state.

## 5.3 Duration UX

- [x] Stepper.
- [x] Allowed-duration list from server.
- [x] Server duration constraints.
- [x] Server duration constraints.
- [x] Market trading rules are supplied by the backend.
- [x] Expiry preview.

## 5.4 Trade states

- [x] Draft.
- [x] Confirming.
- [ ] Pending.
- [ ] Accepted.
- [ ] Open.
- [ ] Rejected.
- [ ] Failed.
- [ ] Won.
- [ ] Lost.
- [ ] Cancelled.
- [ ] Expired.

## 5.5 Submission safety

- [x] Disable duplicate submission.
- [x] Client request ID.
- [x] Server idempotency key.
- [x] Pending/submitting state.
- [ ] Retry policy.
- [x] Error recovery.
- [x] Confirmation UI.

---

# PHASE 6 — Positions & History

## 6.1 Open positions

- [x] Server-driven data.
- [x] Position ID.
- [x] Instrument.
- [x] Direction.
- [x] Entry.
- [x] Mark/current.
- [x] Amount.
- [x] Duration.
- [x] Countdown.
- [x] Server settlement P&L; no client-side authoritative P&L calculation.
- [x] Status.
- [x] Details drawer/modal.

## 6.2 History

- [x] Trade ID.
- [x] Instrument.
- [x] Direction.
- [x] Entry.
- [x] Exit.
- [x] Amount.
- [x] Duration.
- [x] Open time.
- [x] Close time.
- [x] Result.
- [x] P&L.
- [x] Fees.
- [x] Settlement reference.

## 6.3 History UX

- [ ] Search.
- [ ] Status filter.
- [ ] Asset filter.
- [ ] Direction filter.
- [ ] Date range.
- [ ] Pagination.
- [ ] Sort.
- [ ] Export.
- [ ] Empty state.
- [ ] Loading state.
- [ ] Error state.

---

# PHASE 7 — Frontend State Architecture

## 7.1 Separate state domains

- [ ] Server state.
- [ ] Market state.
- [ ] Session state.
- [ ] UI state.
- [ ] Form state.

## 7.2 Define stores/services

- [ ] Session store.
- [ ] Market store.
- [ ] Trading UI store.
- [ ] Notification store.
- [ ] Wallet store.
- [ ] Portfolio store.

## 7.3 Prevent authority leaks

- [x] No authoritative balance in local state.
- [x] No authoritative payout in local state.
- [x] No authoritative settlement in local state.
- [ ] No authorization decisions in UI components.

---

# PHASE 8 — API Abstraction

Create:

```text
src/api/
├── client.ts
├── auth.ts
├── market.ts
├── trades.ts
├── wallet.ts
├── portfolio.ts
└── notifications.ts
```

Tasks:

- [x] HTTP client foundation.
- [x] Base URL configuration.
- [x] Request timeout.
- [x] Error normalization.
- [x] Browser credential/session transport (`credentials: include`) foundation.
- [ ] Retry rules (deferred for non-idempotent financial mutations).
- [x] Cache policy: server-authoritative reads are no-store by default; realtime provides live updates.
- [x] Request tracing/correlation ID.
- [x] Idempotency-Key transport support.
- [x] Domain API modules for auth, market, portfolio, trades, wallet, and notifications.
- [x] Backend route/service boundary for user-scoped server-state reads.

---

# PHASE 9 — WebSocket Client

Create:

```text
src/realtime/
├── connection.ts
├── subscriptions.ts
├── events.ts
└── reconnect.ts
```

Tasks:

- [x] Connect.
- [x] Authenticate.
- [x] Subscribe.
- [x] Unsubscribe.
- [x] Heartbeat.
- [x] Reconnect.
- [x] Exponential backoff.
- [x] Connection state.
- [x] Subscription recovery.
- [x] Message validation.
- [x] Message-size limits.
- [x] Event versioning.
- [x] Subscription message contract.
- [x] Subscription authorization contract.
- [x] Mount realtime client only for authenticated frontend sessions.

Market events:

- [x] Price update.
- [ ] Candle update.
- [x] Market status.
- [x] Trade status.
- [x] Position update.
- [x] Wallet update.
- [ ] Notification event.

---

# PHASE 10 — Authentication UI

## 10.1 Login

- [ ] Email/username field.
- [ ] Password field.
- [ ] Validation.
- [ ] Loading.
- [x] Error.
- [ ] Rate-limit state.
- [ ] Locked-account state.
- [ ] Remember-device behavior where appropriate.

## 10.2 Registration

- [ ] Registration fields.
- [ ] Password rules.
- [ ] Terms/consent.
- [ ] Validation.
- [ ] Email verification.

## 10.3 Password recovery

- [ ] Forgot password.
- [ ] Reset password.
- [ ] Expired-token state.
- [ ] Success state.

## 10.4 2FA

- [ ] Challenge.
- [ ] Code validation.
- [ ] Recovery code handling.
- [ ] Rate limiting UX.

## 10.5 Session/device

- [ ] Active sessions.
- [ ] Device list.
- [ ] Revoke session.
- [ ] Login history.
- [ ] Security event list.

---

# PHASE 11 — Dashboard

- [x] Portfolio value.
- [x] Trading balance.
- [x] Today's P&L.
- [x] Win/loss.
- [x] Trade count.
- [x] Volume.
- [x] Recent trades.
- [ ] Favorite assets.
- [x] Performance chart.
- [x] Loading.
- [x] Empty.
- [x] Error.

---

# PHASE 12 — Portfolio & Analytics

- [x] Performance chart.
- [x] Daily P&L.
- [x] Weekly P&L.
- [x] Monthly P&L.
- [x] Win rate.
- [x] Loss rate.
- [x] Trade count.
- [x] Volume.
- [x] Average trade.
- [x] Asset performance.
- [x] Export.

---

# PHASE 13 — Wallet Frontend

## 13.1 Wallet overview

- [x] Available balance.
- [x] Locked balance.
- [x] Total balance.
- [ ] Pending funds.
- [x] Recent transactions.

## 13.2 Deposit

- [x] Demo deposit method.
- [x] Amount.
- [x] Limits.
- [ ] Verification requirements for real money.
- [ ] Pending state for asynchronous provider processing.
- [x] Success.
- [x] Failure/error handling.

## 13.3 Withdrawal

- [x] Destination.
- [x] Amount.
- [x] Limits.
- [x] Demo fee handling.
- [ ] Verification for real-money withdrawals.
- [ ] Explicit confirmation step for real-money withdrawals.
- [ ] Pending provider state.
- [ ] Provider-rejected state.
- [x] Completed demo withdrawal.

## 13.4 Transactions

- [x] Deposit.
- [x] Withdrawal.
- [x] Trade settlement.
- [x] Fee.
- [x] Adjustment.
- [x] Search.
- [x] Filter.
- [x] Date range.
- [x] Pagination.
- [x] Export.

---

# PHASE 14 — Backend Foundation

## 14.1 Node.js

- [x] Create backend package.
- [x] TypeScript.
- [x] Fastify decision and foundation.
- [x] Environment validation.
- [x] Structured logging.
- [x] Error handling.
- [x] Request IDs/correlation contract.
- [x] Health and readiness endpoints.
- [x] Baseline API security headers.
- [x] Graceful shutdown handling.
- [x] Backend foundation test suite.
- [ ] API versioning beyond the initial `/api/v1` foundation.

## 14.2 Database

- [x] MySQL.
- [x] Prisma ORM 7 integration.
- [x] Migration strategy and initial migration.
- [x] Connection pooling configuration.
- [ ] Backup strategy.

Initial entities:

```text
User
Session
Device
Account
Asset
Market
Order
Position
Trade
Settlement
Wallet
WalletTransaction
LedgerEntry
Deposit
Withdrawal
KycCase
Notification
AuditLog
```

## 14.3 Redis

- [x] Redis development deployment.
- [x] Connection handling.
- [~] Market cache primitives (actual market-data population is deferred to Phase 15).
- [x] Pub/sub.
- [~] Session/temporary-state primitives (actual session usage is deferred to authentication).
- [x] TTL policy.
- [x] Cache invalidation.

---

# PHASE 15 — Market Data Service

- [x] Choose market provider.
- [x] Provider adapter.
- [x] Asset registry.
- [x] Symbol mapping.
- [x] Price normalization.
- [x] Timestamp normalization.
- [x] OHLC normalization.
- [x] Volume normalization.
- [x] Market status.
- [x] Provider reconnect/retry backoff.
- [x] Provider failure handling.
- [x] Redis publishing.
- [x] WebSocket distribution.

---

# PHASE 16 — Trading Engine

This is a high-risk backend phase.

## 16.1 Validation
- [x] User eligibility.
- [x] Account status.
- [x] Asset availability.
- [x] Market availability.
- [x] Amount limits.
- [x] Duration limits.
- [x] Balance availability.
- [x] Risk limits.
- [x] Duplicate request protection.

## 16.2 Order lifecycle

- [x] Create.
- [x] Validate.
- [x] Accept.
- [x] Reject.
- [x] Open.
- [x] Update.
- [x] Close.
- [x] Settle.

## 16.3 Settlement

- [x] Define authoritative price source.
- [x] Define settlement timestamp.
- [x] Define settlement rules.
- [x] Define fees.
- [x] Calculate result.
- [x] Persist settlement.
- [x] Create ledger entries for stake and fee movements.
- [x] Publish trade and position/wallet events.

## 16.4 Idempotency

- [x] Client request ID.
- [x] Server idempotency key.
- [x] Duplicate detection.
- [x] Replay protection through unique idempotency keys and transactional state claims.
- [x] Transactional state claims and conditional wallet updates.

---

# PHASE 17 — Financial Ledger

Rules:

> Never update a financial balance without a corresponding durable ledger record.

Tasks:

- [x] Double-entry or equivalent auditable ledger design.
- [x] Immutable ledger entries.
- [x] Transaction IDs.
- [x] Reference IDs.
- [x] Currency.
- [x] Amount.
- [x] Direction.
- [x] Balance snapshot where required.
- [x] Audit metadata.
- [x] Database transaction boundaries.
- [x] Reconciliation process.

Conceptual transaction:

```text
BEGIN

create ledger entry
update wallet/account
create transaction record

COMMIT
```

---

# PHASE 18 — Payments

- [ ] Select payment provider.
- [ ] Provider adapter.
- [ ] Deposit initiation.
- [ ] Deposit webhook.
- [ ] Webhook signature verification.
- [ ] Deposit idempotency.
- [ ] Withdrawal initiation.
- [ ] Withdrawal authorization.
- [ ] Withdrawal status.
- [ ] Reconciliation.
- [ ] Failed payment handling.
- [ ] Audit logging.

---

# PHASE 19 — KYC / AML

- [ ] Select provider.
- [ ] Identity verification flow.
- [ ] Document upload if required.
- [ ] Verification status.
- [ ] Manual review state.
- [ ] Restricted account state.
- [ ] AML checks.
- [ ] Transaction monitoring.
- [ ] Audit trail.
- [ ] Data retention policy.

---

# PHASE 20 — Notifications

- [x] Notification entity.
- [x] Notification API.
- [x] WebSocket notification events.
- [x] Unread count.
- [x] Mark read.
- [x] Mark all read.
- [x] Notification center.
- [ ] Toast.
- [ ] Email integration.
- [x] Security alerts.
- [x] Trade results.
- [x] Deposit status.
- [x] Withdrawal status.
- [ ] System announcements.

---

# PHASE 21 — Admin Application

Admin should be a separate application boundary.

## Dashboard

- [ ] Users.
- [ ] Active users.
- [ ] Deposits.
- [ ] Withdrawals.
- [ ] Open trades.
- [ ] Volume.
- [ ] System health.

## Users

- [ ] Search.
- [ ] View.
- [ ] Restrict.
- [ ] Suspend.
- [ ] Session management.
- [ ] KYC status.

## Trading

- [ ] Trades.
- [ ] Open positions.
- [ ] Settlements.
- [ ] Asset configuration.
- [x] Market status.
- [ ] Rules.

## Finance

- [ ] Wallets.
- [ ] Deposits.
- [ ] Withdrawals.
- [ ] Reconciliation.
- [ ] Ledger.

## Risk

- [ ] Limits.
- [ ] Exposure.
- [ ] Risk rules.
- [ ] Monitoring.

## Audit

- [ ] Audit logs.
- [ ] Admin actions.
- [ ] Security events.
- [ ] Export.

---

# PHASE 22 — Accessibility

- [ ] Keyboard navigation.
- [ ] Focus management.
- [ ] Modal focus trap.
- [ ] Screen-reader labels.
- [ ] ARIA states.
- [ ] Contrast.
- [ ] Reduced motion.
- [ ] Touch targets.
- [ ] Error announcements.
- [ ] Table semantics.
- [ ] Form semantics.

---

# PHASE 23 — Mobile UX

Do not simply shrink desktop.

## Mobile

- [x] Bottom navigation.
- [x] Asset picker drawer.
- [x] Chart toolbar.
- [x] Order panel layout.
- [x] Trade confirmation.
- [ ] Positions.
- [ ] History.
- [ ] Wallet.
- [ ] Account.
- [ ] Notifications.

Test at:

```text
320px
360px
375px
390px
414px
768px
1024px
1440px+
```

---

# PHASE 24 — Loading / Error / Empty States

Every major feature:

- [ ] Loading.
- [x] Empty.
- [x] Error.
- [ ] Offline.
- [ ] Reconnecting.
- [ ] Unauthorized.
- [ ] Forbidden.
- [ ] Maintenance.
- [ ] Unavailable.

---

# PHASE 25 — Testing

## Unit

- [ ] Formatters.
- [ ] Validation.
- [ ] State transitions.
- [ ] Indicator utilities.
- [ ] API error normalization.

## Component

- [ ] AssetList.
- [x] Chart toolbar.
- [ ] Order panel.
- [ ] History.
- [ ] Wallet.
- [ ] Login.
- [ ] Notifications.

## Integration

- [ ] Auth.
- [ ] Market subscription.
- [ ] Trade submission.
- [x] Position update.
- [x] Wallet update.

## E2E

- [ ] Register.
- [ ] Login.
- [ ] Verify email.
- [ ] 2FA.
- [ ] Open trading room.
- [ ] Select asset.
- [ ] Change timeframe.
- [ ] Validate trade.
- [ ] Submit demo trade.
- [ ] View position.
- [ ] View history.
- [ ] Wallet flow.
- [ ] Session expiration.
- [ ] WebSocket reconnect.

---

# PHASE 26 — CI/CD

Create GitHub Actions.

Pipeline:

```text
checkout
   ↓
setup Node 24
   ↓
npm ci
   ↓
lint
   ↓
typecheck
   ↓
unit/component tests
   ↓
build
   ↓
security checks
```

Later:

```text
E2E
   ↓
Docker build
   ↓
staging deployment
   ↓
smoke tests
```

Tasks:

- [ ] CI workflow.
- [ ] Dependency scanning.
- [ ] Secret scanning.
- [ ] Build artifact.
- [ ] Staging deployment.
- [ ] Production deployment.
- [ ] Rollback process.

---

# PHASE 27 — Production Infrastructure

## Edge

- [ ] DNS.
- [ ] TLS.
- [ ] Nginx or edge proxy.
- [ ] Security headers.
- [ ] CSP.
- [ ] HSTS.
- [ ] Referrer-Policy.
- [ ] Permissions-Policy.
- [ ] Rate limiting.

## Application

- [ ] Docker.
- [ ] API container.
- [ ] Worker container.
- [ ] WebSocket.
- [ ] Health checks.

## Database

- [ ] MySQL.
- [ ] Backups.
- [ ] Restore testing.
- [ ] Monitoring.
- [ ] Connection limits.

## Redis

- [ ] Persistence policy where required.
- [ ] Monitoring.
- [ ] Failure handling.

---

# PHASE 28 — Observability

- [ ] Structured logs.
- [ ] Request IDs.
- [ ] Error tracking.
- [ ] Metrics.
- [ ] API latency.
- [ ] WebSocket connections.
- [ ] Market-data freshness.
- [ ] Trade processing latency.
- [ ] Settlement failures.
- [ ] Wallet reconciliation failures.
- [ ] Payment failures.
- [ ] Security alerts.

---

# PHASE 29 — Security Hardening

## Frontend

- [ ] No secrets in bundle.
- [ ] Secure cookies.
- [ ] CSP.
- [ ] Security headers.
- [ ] Dependency scanning.
- [ ] XSS review.
- [ ] CSRF strategy.
- [ ] Origin validation.

## Backend

- [ ] Authentication.
- [ ] Authorization.
- [ ] RBAC.
- [ ] Tenant/resource ownership checks.
- [ ] Rate limiting.
- [ ] Input validation.
- [ ] SQL safety.
- [ ] SSRF review.
- [ ] File-upload controls.
- [ ] Webhook verification.
- [ ] Idempotency.
- [ ] Replay protection.
- [ ] Audit logging.

## Financial

- [ ] Ledger integrity.
- [ ] Balance reconciliation.
- [ ] Settlement auditability.
- [ ] Withdrawal controls.
- [ ] Exposure limits.
- [ ] Risk limits.
- [ ] Transaction monitoring.

---

# PHASE 30 — Final QA

## Functional

- [ ] Authentication.
- [ ] Trading.
- [ ] History.
- [ ] Wallet.
- [ ] Portfolio.
- [ ] Notifications.
- [ ] Account.
- [Admin.

## Responsive

- [ ] Desktop.
- [ ] Laptop.
- [ ] Tablet.
- [ ] Mobile.

## Network

- [ ] Slow network.
- [ ] Offline.
- [ ] Reconnect.
- [ ] WebSocket disconnect.
- [ ] API timeout.

## Security

- [ ] Unauthorized access.
- [ ] Cross-user access.
- [ ] Replay.
- [ ] Duplicate trade.
- [ ] Duplicate payment webhook.
- [ ] Session revocation.
- [ ] Rate limiting.

## Operational

- [ ] Backup.
- [ ] Restore.
- [ ] Monitoring.
- [ ] Alerting.
- [ ] Rollback.
- [ ] Incident procedure.

---

# PHASE 31 — Release Gates

A production release is blocked until:

- [ ] Product instrument is formally defined.
- [ ] Legal/compliance review is complete for target jurisdictions.
- [ ] Backend authorization is implemented.
- [ ] Financial ledger is implemented.
- [ ] Settlement is deterministic and auditable.
- [ ] Idempotency is implemented.
- [ ] Authentication is production-ready.
- [ ] KYC/AML requirements are implemented where applicable.
- [ ] Payment processing is verified.
- [ ] Critical E2E tests pass.
- [ ] CI is green.
- [ ] Security review is complete.
- [ ] Backup/restore has been tested.
- [ ] Monitoring is operational.
- [ ] Rollback procedure exists.

---

# CURRENT STATUS — 2026-10-02

## Completed in the current backend milestone

- [x] Frontend/backend monorepo separation.
- [x] Fastify backend foundation.
- [x] Prisma ORM 7 + MySQL persistence.
- [x] Redis + WebSocket realtime foundation.
- [x] Dependency vulnerability remediation and clean npm audit.
- [x] Durable database-backed sessions with hashed opaque session tokens.
- [x] scrypt password hashing.
- [x] HttpOnly session-cookie authentication.
- [x] Registration and email-verification token lifecycle.
- [x] Login/logout/current-user/session-management APIs.
- [x] Password reset token lifecycle with session revocation.
- [x] Authenticated WebSocket handshake.
- [x] Authentication tests and backend documentation.

## Completed milestone

### `SLSPOT-007 — Market Data Service`

- [x] Twelve Data provider adapter.
- [x] Development asset registry and provider symbol mapping.
- [x] Quote normalization and market-status normalization.
- [x] OHLC/time-series normalization.
- [x] MySQL market-state persistence.
- [x] Redis-backed market price/status events.
- [x] Public market candle API.
- [x] Provider failure isolation and exponential retry backoff.
- [x] Trading Room server-state market/candle consumption.

Implemented in:
- `backend/src/market/`
- `backend/src/api/routes.ts`
- `frontend/src/hooks/useMarketState.ts`
- `frontend/src/hooks/useServerState.ts`
- `frontend/src/components/trading/ChartWorkspace.tsx`
- `docs/MARKET_DATA.md`

### `SLSPOT-005 — API & WebSocket Contract`

- [x] Define REST response conventions.
- [x] Define authentication/session contract for frontend integration.
- [x] Define market-data response schema.
- [x] Define realtime subscription model.
- [x] Define event authorization rules by user/session.
- [x] Define pagination/filter/sort conventions.
- [x] Define idempotency and request-correlation conventions.
- [x] Add shared frontend-facing TypeScript contracts where practical.
- [x] Add contract documentation and backend/frontend contract types.
- [x] Add contract-focused automated tests.

Implemented in:
- `docs/API_CONTRACTS.md`
- `backend/src/contracts/api.ts`
- `backend/src/contracts/realtime.ts`
- `backend/src/contracts/*.test.ts`
- `frontend/src/api/contracts.ts`
- `frontend/src/realtime/contracts.ts`
- `frontend/src/api/client.ts`

## Completed milestones

### `SLSPOT-006 — Frontend Server-State Integration`

- [x] Connect frontend authentication screens to server auth/session APIs.
- [x] Add session bootstrap and `/auth/me` state.
- [x] Add auth-aware logout control backed by the server session.
- [x] Add session-list/revocation UI.
- [x] Introduce server-state service boundaries for market, portfolio, wallet, and notifications.
- [x] Replace demo auth/session authority with backend responses.
- [x] Add unauthorized/session-expired handling.
- [x] Add forbidden state handling.
- [x] Add frontend API integration tests.

Implemented in:
- `frontend/src/auth/AuthProvider.tsx`
- `frontend/src/auth/types.ts`
- `frontend/src/api/auth.ts`
- `frontend/src/api/client.ts`
- `frontend/src/api/market.ts`
- `frontend/src/api/portfolio.ts`
- `frontend/src/api/trades.ts`
- `frontend/src/api/wallet.ts`
- `frontend/src/api/notifications.ts`
- `frontend/src/hooks/useAsyncResource.ts`
- `frontend/src/hooks/useServerState.ts`
- `frontend/src/hooks/useMarketState.ts`
- `frontend/src/components/ui/ApiState.tsx`
- `frontend/src/pages/WorkspacePage.tsx`
- `frontend/src/pages/TradingPage.tsx`
- `frontend/src/pages/AccessPage.tsx`
- `frontend/src/components/routing/ProtectedRoute.tsx`
- `frontend/src/components/layout/TopBar.tsx`

SLSPOT-006 is complete. The next major dependency is server-authoritative trading and its financial controls; wallet mutations remain intentionally disabled until the ledger/payment milestones.

## Completed milestone

Phase 16 — Server-authoritative trading engine

- [x] Server-authoritative market price is read from persisted Market state and provider-fed realtime updates.
- [x] Server-authoritative wallet/account is created during auth registration/login and is never trusted from browser state.
- [x] Server-authoritative order creation with eligibility, market, amount, duration, balance, exposure and duplicate-request validation.
- [x] Atomic stake reservation and separate fee ledger movement.
- [x] Server-authoritative positions and trade records.
- [x] Automatic expiry settlement worker plus manual server-price settlement endpoint.
- [x] Settlement persistence with payout, fees, P&L, timestamp and reference ID.
- [x] Conditional trade claims, wallet balance updates and idempotent settlement records.
- [x] Realtime trade/position/wallet events with authenticated user-channel delivery.
- [x] Trading UI no longer owns authoritative positions, settlement, balances, payout or demo trade state.
- [x] Trading UI creates server orders with an idempotency key and reloads server state after mutations/events.
- [x] Unit coverage for core settlement direction and payout calculations.

### Required before real-money execution

The trading engine milestone is complete for the currently defined server-side fixed-duration ruleset. Phase 1 product/legal decisions and the later financial-ledger/payment/compliance milestones remain release blockers for any real-money product.

## Immediate next milestone

Positions / History / Portfolio / Financial Ledger hardening

## Following milestones

```text
API + WebSocket contracts ✅
        ↓
Frontend server-state integration ✅
        ↓
Market Data Service ✅
        ↓
Server-authoritative trading engine ✅
        ↓
Positions / History / Portfolio hardening
        ↓
Financial Ledger
        ↓
Wallet + Payments
        ↓
KYC / AML
        ↓
Notifications
        ↓
Admin
        ↓
CI / Observability / Security
        ↓
Production readiness
```

## Current architecture gate

The browser remains non-authoritative for balances, prices, trade settlement and financial state. Authentication, market data, trading orders, positions and settlement are now server-backed. Full financial-ledger reconciliation, payments, KYC/AML, production authorization and the Phase 1 product/legal gate remain blocking before any real-money execution.

# Definition of Done

A task is not complete merely because the UI appears to work.

A feature is complete only when:

```text
UI
+
state
+
API contract
+
security
+
error handling
+
responsive behavior
+
tests
+
documentation
```

For financial features, additionally require:

```text
authorization
+
idempotency
+
durable persistence
+
ledger/audit trail
+
reconciliation
```
