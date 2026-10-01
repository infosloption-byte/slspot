# SL Spot / SL Option — Full Implementation Task File

**Repository:** `infosloption-byte/slspot`  
**Branch:** `main`  
**Current status:** Frontend foundation / Trading Terminal V0  
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

## 2.1 Midnight Signal

- [x] Establish dark graphite base.
- [x] Establish cyan market accent.
- [x] Establish amber attention accent.
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
- [ ] IconButton
- [ ] Input
- [ ] Select
- [ ] Dropdown
- [ ] Tabs
- [ ] Badge
- [ ] Tooltip
- [ ] Modal
- [ ] Drawer
- [ ] Toast
- [ ] Skeleton
- [ ] EmptyState
- [ ] ErrorState
- [ ] DataTable
- [ ] Pagination
- [ ] ConfirmDialog

---

# PHASE 3 — Application Routing

## 3.1 Public routes

- [ ] `/`
- [ ] `/login`
- [ ] `/register`
- [ ] `/forgot-password`
- [ ] `/reset-password`
- [ ] `/verify-email`
- [ ] `/2fa`

## 3.2 Authenticated routes

- [ ] `/app`
- [ ] `/app/trading`
- [ ] `/app/dashboard`
- [ ] `/app/portfolio`
- [ ] `/app/wallet`
- [ ] `/app/history`
- [ ] `/app/alerts`
- [ ] `/app/account`
- [ ] `/app/security`
- [ ] `/app/support`

## 3.3 Route behavior

- [ ] Active navigation state.
- [ ] Not-found page.
- [ ] Unauthorized state.
- [ ] Forbidden state.
- [ ] Loading route state.
- [ ] Protected route boundary.
- [ ] Redirect rules.

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
- [ ] Convert navigation buttons to real routes.
- [ ] Add mobile navigation behavior.
- [ ] Add keyboard shortcuts.
- [ ] Add global loading state.
- [ ] Add global connection status.

## 4.2 Asset watchlist

- [x] Mock asset list.
- [x] Asset selection.
- [ ] Search.
- [ ] Favorites.
- [ ] Favorite persistence.
- [ ] Categories.
- [ ] Crypto filter.
- [ ] FX filter.
- [ ] Stocks filter.
- [ ] Commodities filter.
- [ ] Indices filter.
- [ ] Recent assets.
- [ ] Sorting.
- [ ] Live price.
- [ ] Percentage change.
- [ ] Volume.
- [ ] Market status.
- [ ] Mobile asset picker.
- [ ] Loading state.
- [ ] Empty state.
- [ ] Error state.

## 4.3 Chart

- [ ] Add Lightweight Charts.
- [ ] Replace SVG sample chart.
- [ ] Candlestick series.
- [ ] OHLC data model.
- [ ] Timeframe switching.
- [ ] 1m.
- [ ] 5m.
- [ ] 15m.
- [ ] 30m.
- [ ] 1H.
- [ ] 4H.
- [ ] 1D.
- [ ] Crosshair.
- [ ] Zoom.
- [ ] Pan.
- [ ] Volume.
- [ ] Fullscreen.
- [ ] Chart settings.
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

- [ ] Instrument.
- [ ] Direction.
- [ ] Amount.
- [ ] Duration.
- [ ] Expiry.
- [ ] Available balance.
- [ ] Minimum amount.
- [ ] Maximum amount.
- [ ] Potential return.
- [ ] Fees where applicable.
- [ ] Risk disclosure.

## 5.2 Amount UX

- [x] Stepper.
- [x] Presets.
- [ ] Validation.
- [ ] Min/max enforcement from server configuration.
- [ ] Decimal rules.
- [ ] Currency display.
- [ ] Invalid amount state.

## 5.3 Duration UX

- [x] Stepper.
- [ ] Allowed-duration list from server.
- [ ] Minimum duration.
- [ ] Maximum duration.
- [ ] Market-specific duration rules.
- [ ] Expiry preview.

## 5.4 Trade states

- [ ] Draft.
- [ ] Confirming.
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

- [ ] Disable duplicate submission.
- [ ] Client request ID.
- [ ] Server idempotency key.
- [ ] Pending state.
- [ ] Retry policy.
- [ ] Error recovery.
- [ ] Confirmation UI.

---

# PHASE 6 — Positions & History

## 6.1 Open positions

- [ ] Server-driven data.
- [ ] Position ID.
- [ ] Instrument.
- [ ] Direction.
- [ ] Entry.
- [ ] Mark/current.
- [ ] Amount.
- [ ] Duration.
- [ ] Countdown.
- [ ] Current P&L.
- [ ] Status.
- [ ] Details drawer/modal.

## 6.2 History

- [ ] Trade ID.
- [ ] Instrument.
- [ ] Direction.
- [ ] Entry.
- [ ] Exit.
- [ ] Amount.
- [ ] Duration.
- [ ] Open time.
- [ ] Close time.
- [ ] Result.
- [ ] P&L.
- [ ] Fees.
- [ ] Settlement reference.

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

- [ ] No authoritative balance in local state.
- [ ] No authoritative payout in local state.
- [ ] No authoritative settlement in local state.
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

- [ ] HTTP client.
- [ ] Base URL configuration.
- [ ] Request timeout.
- [ ] Error normalization.
- [ ] Session handling.
- [ ] Retry rules.
- [ ] Cache policy.
- [ ] Request tracing/correlation ID.

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

- [ ] Connect.
- [ ] Authenticate.
- [ ] Subscribe.
- [ ] Unsubscribe.
- [ ] Heartbeat.
- [ ] Reconnect.
- [ ] Exponential backoff.
- [ ] Connection state.
- [ ] Subscription recovery.
- [ ] Message validation.
- [ ] Message-size limits.
- [ ] Event versioning.

Market events:

- [ ] Price update.
- [ ] Candle update.
- [ ] Market status.
- [ ] Trade status.
- [ ] Position update.
- [ ] Wallet update.
- [ ] Notification event.

---

# PHASE 10 — Authentication UI

## 10.1 Login

- [ ] Email/username field.
- [ ] Password field.
- [ ] Validation.
- [ ] Loading.
- [ ] Error.
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

- [ ] Portfolio value.
- [ ] Trading balance.
- [ ] Today's P&L.
- [ ] Win/loss.
- [ ] Trade count.
- [ ] Volume.
- [ ] Recent trades.
- [ ] Favorite assets.
- [ ] Performance chart.
- [ ] Loading.
- [ ] Empty.
- [ ] Error.

---

# PHASE 12 — Portfolio & Analytics

- [ ] Performance chart.
- [ ] Daily P&L.
- [ ] Weekly P&L.
- [ ] Monthly P&L.
- [ ] Win rate.
- [ ] Loss rate.
- [ ] Trade count.
- [ ] Volume.
- [ ] Average trade.
- [ ] Asset performance.
- [ ] Export.

---

# PHASE 13 — Wallet Frontend

## 13.1 Wallet overview

- [ ] Available balance.
- [ ] Locked balance.
- [ ] Total balance.
- [ ] Pending funds.
- [ ] Recent transactions.

## 13.2 Deposit

- [ ] Deposit methods.
- [ ] Amount.
- [ ] Limits.
- [ ] Verification requirements.
- [ ] Pending state.
- [ ] Success.
- [ ] Failure.

## 13.3 Withdrawal

- [ ] Destination.
- [ ] Amount.
- [ ] Limits.
- [ ] Fees.
- [ ] Verification.
- [ ] Confirmation.
- [ ] Pending.
- [ ] Rejected.
- [ ] Completed.

## 13.4 Transactions

- [ ] Deposit.
- [ ] Withdrawal.
- [ ] Trade settlement.
- [ ] Fee.
- [ ] Adjustment.
- [ ] Search.
- [ ] Filter.
- [ ] Date range.
- [ ] Pagination.
- [ ] Export.

---

# PHASE 14 — Backend Foundation

## 14.1 Node.js

- [ ] Create backend package.
- [ ] TypeScript.
- [ ] Fastify or NestJS decision.
- [ ] Environment validation.
- [ ] Structured logging.
- [ ] Error handling.
- [ ] Request IDs.
- [ ] Health endpoint.

## 14.2 Database

- [ ] MySQL.
- [ ] Prisma.
- [ ] Migration strategy.
- [ ] Connection pooling.
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

- [ ] Redis deployment.
- [ ] Connection handling.
- [ ] Market cache.
- [ ] Pub/sub.
- [ ] Session/temporary state where appropriate.
- [ ] TTL policy.
- [ ] Cache invalidation.

---

# PHASE 15 — Market Data Service

- [ ] Choose market provider.
- [ ] Provider adapter.
- [ ] Asset registry.
- [ ] Symbol mapping.
- [ ] Price normalization.
- [ ] Timestamp normalization.
- [ ] OHLC normalization.
- [ ] Volume normalization.
- [ ] Market status.
- [ ] Provider reconnect.
- [ ] Provider failure handling.
- [ ] Redis publishing.
- [ ] WebSocket distribution.

---

# PHASE 16 — Trading Engine

This is a high-risk backend phase.

## 16.1 Validation
- [ ] User eligibility.
- [ ] Account status.
- [ ] Asset availability.
- [ ] Market availability.
- [ ] Amount limits.
- [ ] Duration limits.
- [ ] Balance availability.
- [ ] Risk limits.
- [ ] Duplicate request protection.

## 16.2 Order lifecycle

- [ ] Create.
- [ ] Validate.
- [ ] Accept.
- [ ] Reject.
- [ ] Open.
- [ ] Update.
- [ ] Close.
- [ ] Settle.

## 16.3 Settlement

- [ ] Define authoritative price source.
- [ ] Define settlement timestamp.
- [ ] Define settlement rules.
- [ ] Define fees.
- [ ] Calculate result.
- [ ] Persist settlement.
- [ ] Create ledger entries.
- [ ] Publish trade event.

## 16.4 Idempotency

- [ ] Client request ID.
- [ ] Server idempotency key.
- [ ] Duplicate detection.
- [ ] Replay protection.
- [ ] Transaction locking.

---

# PHASE 17 — Financial Ledger

Rules:

> Never update a financial balance without a corresponding durable ledger record.

Tasks:

- [ ] Double-entry or equivalent auditable ledger design.
- [ ] Immutable ledger entries.
- [ ] Transaction IDs.
- [ ] Reference IDs.
- [ ] Currency.
- [ ] Amount.
- [ ] Direction.
- [ ] Balance snapshot where required.
- [ ] Audit metadata.
- [ ] Database transaction boundaries.
- [ ] Reconciliation process.

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

- [ ] Notification entity.
- [ ] Notification API.
- [ ] WebSocket notification events.
- [ ] Unread count.
- [ ] Mark read.
- [ ] Mark all read.
- [ ] Notification center.
- [ ] Toast.
- [ ] Email integration.
- [ ] Security alerts.
- [ ] Trade results.
- [ ] Deposit status.
- [ ] Withdrawal status.
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
- [ ] Market status.
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

- [ ] Bottom navigation.
- [ ] Asset picker drawer.
- [ ] Chart toolbar.
- [ ] Order panel layout.
- [ ] Trade confirmation.
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
- [ ] Empty.
- [ ] Error.
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
- [ ] Chart toolbar.
- [ ] Order panel.
- [ ] History.
- [ ] Wallet.
- [ ] Login.
- [ ] Notifications.

## Integration

- [ ] Auth.
- [ ] Market subscription.
- [ ] Trade submission.
- [ ] Position update.
- [ ] Wallet update.

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

# PRIORITY ORDER

## P0 — Blocking decisions/security

- [ ] Product instrument decision.
- [ ] Jurisdiction/compliance decision.
- [ ] Ledger design.
- [ ] Authentication architecture.
- [ ] Backend authority model.

## P1 — Next development milestone

- [ ] Routing.
- [ ] Design-system primitives.
- [ ] Trading Terminal V1.
- [ ] Lightweight Charts.
- [ ] Watchlist UX.
- [ ] Order states.
- [ ] Positions/history.
- [ ] Loading/error/offline states.
- [ ] API contract.
- [ ] WebSocket contract.

## P2 — Platform foundation

- [ ] Node backend.
- [ ] MySQL/Prisma.
- [ ] Redis.
- [ ] Market-data service.
- [ ] Authentication backend.
- [ ] Demo trading.

## P3 — Financial platform

- [ ] Trading engine.
- [ ] Settlement.
- [ ] Ledger.
- [ ] Wallet.
- [ ] Payments.
- [ ] KYC/AML.

## P4 — Product expansion

- [ ] Dashboard.
- [ ] Portfolio.
- [ ] Notifications.
- [ ] Admin.
- [ ] Mobile apps.
- [ ] Advanced charting.

## P5 — Production hardening

- [ ] CI/CD.
- [ ] Observability.
- [ ] Security hardening.
- [ ] Disaster recovery.
- [ ] Compliance operations.
- [ ] Production release.

---

# IMMEDIATE NEXT TASK

## `SLSPOT-001 — Trading Terminal V1`

### Goal

Turn the current static/demo terminal into a complete frontend interaction model without connecting real financial execution yet.

### Scope

- [ ] Implement application routes.
- [ ] Convert sidebar to real navigation.
- [ ] Build reusable UI primitives.
- [ ] Implement asset search.
- [ ] Implement asset categories.
- [ ] Implement favorites.
- [ ] Replace SVG chart with Lightweight Charts.
- [ ] Add candlestick data abstraction.
- [ ] Implement timeframes.
- [ ] Implement chart toolbar.
- [ ] Implement order validation UI.
- [ ] Implement order states.
- [ ] Implement positions states.
- [ ] Implement history UI.
- [ ] Add loading states.
- [ ] Add error states.
- [ ] Add offline/reconnect states.
- [ ] Improve mobile terminal behavior.
- [ ] Add component tests.
- [ ] Add E2E foundation.
- [ ] Update architecture documentation.

### Acceptance criteria

- [ ] All major navigation items route correctly.
- [ ] Asset search actually filters assets.
- [ ] Asset categories actually filter.
- [ ] Favorite state works.
- [ ] Chart uses a proper chart library rather than the current SVG sample.
- [ ] Timeframe changes affect the displayed chart state.
- [ ] Order panel validates invalid inputs.
- [ ] Duplicate action is prevented in the UI.
- [ ] Open positions/history use typed data models.
- [ ] Loading/error/empty states exist.
- [ ] Mobile UX is usable without desktop-only controls.
- [ ] `npm run lint` passes.
- [ ] `npm run typecheck` passes.
- [ ] `npm run build` passes.
- [ ] Automated tests pass.
- [ ] No financial operation is authoritative in the browser.

### Suggested commit

```text
feat: complete trading terminal v1
```

---

# IMMEDIATE FOLLOW-UP

## `SLSPOT-002 — API & WebSocket Contract`

After Terminal V1:

- [ ] Define REST API conventions.
- [ ] Define authentication/session contract.
- [ ] Define market-data response contract.
- [ ] Define WebSocket event contract.
- [ ] Define error format.
- [ ] Define pagination.
- [ ] Define idempotency.
- [ ] Define request correlation IDs.
- [ ] Update frontend API modules.

Suggested commit:

```text
feat: define trading api and realtime contracts
```

---

# IMMEDIATE FOLLOW-UP

## `SLSPOT-003 — Backend Foundation`

- [ ] Node.js + TypeScript.
- [ ] Framework decision.
- [ ] Prisma.
- [ ] MySQL.
- [ ] Redis.
- [ ] Authentication.
- [ ] Health checks.
- [ ] Logging.
- [ ] Error handling.
- [ ] Docker.
- [ ] Local development environment.

Suggested commit:

```text
feat: initialize trading backend foundation
```

---

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
documentation```

are all addressed.

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

---

# Final Project Roadmap

```text
CURRENT
Frontend Foundation
        │
        ▼
Trading Terminal V1
        │
        ▼
API + WebSocket Contracts
        │
        ▼
Authentication
        │
        ▼
Backend Foundation
        │
        ▼
Market Data
        │
        ▼
Demo Trading
        │
        ▼
Trading Engine
        │
        ▼
Settlement + Ledger
        │
        ▼
Wallet + Payments
        │
        ▼
KYC / AML
        │
        ▼
Portfolio + Notifications
        │
        ▼
Admin
        │
        ▼
Security / Observability / CI
        │
        ▼
Production Readiness
```

**The next implementation target is `SLSPOT-001 — Trading Terminal V1`.**