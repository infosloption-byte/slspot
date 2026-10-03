## Current Architecture Milestone — 2026-10-03

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

## Current Frontend Task Audit — 2026-10-03

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
- [x] Wallet deposit/withdraw demo forms with server-backed demo funding and transaction table.
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

These UI items are now wired to server-authoritative authentication, market data, balances, orders, settlement and demo wallet operations. Real-money payment processing remains a separate production milestone.
# Current Frontend Implementation Update — 2026-10-03

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
- [x] Wallet deposit / withdrawal demo flows are server-backed for DEMO mode; real-money payment processing remains a later milestone.
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
- [~] Loading/offline/reconnecting states across all features (global loading bar plus offline/reconnect banner now implemented; per-feature coverage remains).
- [~] Full accessibility audit and focus trapping (shared Select/Modal/Drawer coverage added; full feature audit remains).
- [~] Unit/component/E2E test suite (shared UI, realtime parsing, API retry coverage added; broader component/E2E coverage remains).
- [x] CI quality gates.
- [~] Latest frontend fix commits are ready for local validation; GitHub Actions has not returned a workflow run for these commits yet.


## Reconciliation audit — 2026-10-03
- [x] Shared UI primitives added: Button, Input, Dropdown, Tabs, Badge, Modal, Drawer, DataTable, and ConfirmDialog.
- [x] Safe API retry policy added with transient-status handling and idempotency-key protection.
- [x] Dashboard favorite-assets section added using the existing watchlist persistence.
- [x] Trading order panel now displays quote currency, estimated fee, total return, expiry preview, and an idempotent retry action.
- [x] Live `market.candle` events are emitted by the backend poller and consumed by the chart for 5-minute candles.
- [x] CI workflow added with lint, typecheck, test, dependency audit, Prisma generation, and build gates.


The checklist was reconciled against the current main implementation before continuing feature work. Only repository-backed functionality is marked complete; production-only items remain open.

- [x] Protected-route loading state is implemented by ProtectedRoute.
- [x] Forbidden-state handling is implemented at the frontend API/state boundary.
- [x] Server-backed DEMO wallet funding is implemented; real-money payment integration remains pending.
- [x] Shared custom Select implementation is present and viewport-safe.
- [x] Trade History standalone and Trading Room filters use themed custom dropdown panels.
- [x] Trading Room embedded history retains its column-wise desktop layout independently from the standalone History page.
- [x] Asset Picker Sort uses the shared themed selector and category filters use the responsive spacing grid.
- [x] Realtime reconnect handling includes reconnect state and subscription recovery.

The remaining unchecked production-hardening, compliance, accessibility, testing, CI/CD, admin, payments and infrastructure items remain intentionally open.

## Hardening milestone update — 2026-10-04

Security hardening implementation update — 2026-10-04:

- [x] HttpOnly session cookies no longer expose raw authentication session tokens in login/2FA JSON responses.
- [x] Session authentication rejects revoked devices.
- [x] Signed session-bound CSRF token transport and trusted-origin checks are enforced on state-changing API requests.
- [x] Redis-backed request rate limiting is enforced with production fail-closed behavior when Redis is unavailable.
- [x] Admin RBAC now distinguishes ADMIN from SUPER_ADMIN for sensitive role/session actions.
- [x] Cross-user idempotency replay for demo deposits/withdrawals is rejected.
- [x] Trade and demo funding mutations now create durable audit events.
- [x] Provider URL configuration is constrained to prevent SSRF through the market-data adapter.
- [x] Multipart uploads are rejected because no controlled upload endpoint exists yet.
- [x] Frontend and admin CSP/security headers are defined for development/preview and browser CSP is embedded in the application documents.


Implemented on `main`:

- [x] Frontend React/TypeScript hardening fixes for API abort handling, DataTable generics, React purity lint rules, Select state management, chart candle derivation, and trade expiry clock handling.
- [x] Six dedicated frontend stores: session, market, trading UI, notification, wallet, and portfolio.
- [x] Server-authoritative account capability endpoint at `GET /api/v1/auth/capabilities`.
- [x] Trading and wallet funding UI now consumes server-provided capability state rather than hard-coded authorization rules.
- [x] Focused mobile UX pass for positions, history, wallet, account and notifications, plus narrow-screen layout refinements.
- [x] Focused accessibility pass covering shared keyboard interaction, focus management, reduced motion, ARIA/status announcements, modal focus handling, screen-reader labels, and mobile touch sizing.
- [~] Full manual accessibility/device QA and broad E2E coverage remain release-quality validation work.

# SL Spot / SL Option — Full Implementation Task File

**Repository:** `infosloption-byte/slspot`  
**Branch:** `main`  
**Current status:** Frontend + backend foundation + persistence + realtime + authentication + server-authoritative trading engine + server-backed DEMO wallet  
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

- [x] Generate and commit `package-lock.json`.
- [x] Confirm Node 24 LTS development baseline.
- [x] Confirm supported npm version.
- [ ] Add dependency update policy.
- [x] Add dependency vulnerability scanning.

## 0.3 Quality gates

- [x] Define required checks:
  - [x] lint
  - [x] typecheck
  - [x] unit tests
  - [x] build
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
- [x] Document typography scale.
- [x] Document spacing scale.
- [x] Document component states.
- [x] Document accessibility contrast requirements.

## 2.2 Components

Create reusable primitives:

- [x] Button
- [x] IconButton
- [x] Input
- [x] Select
- [x] Dropdown
- [x] Tabs
- [x] Badge
- [x] Tooltip
- [x] Modal
- [x] Drawer
- [x] Toast
- [x] Skeleton
- [x] EmptyState
- [x] ErrorState
- [x] DataTable
- [x] Pagination
- [x] ConfirmDialog

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
- [x] Forbidden state.
- [x] Loading route state.
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
- [ ] Add keyboard shortcuts (later).
- [x] Add global loading state.
- [x] Add global connection status.

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
- [x] Recent assets.
- [x] Sorting.
- [x] Live price.
- [x] Percentage change.
- [x] Volume.
- [x] Market status.
- [x] Mobile asset picker.
- [x] Loading state.
- [x] Empty state.
- [x] Error state.

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
- [x] Volume.
- [x] Fullscreen.
- [x] Chart settings.
- [x] Connection status.
- [x] Stale-data indicator.

## 4.4 Indicators

Initial:

- [x] EMA.
- [x] SMA.
- [x] RSI.
- [x] MACD.
- [x] Bollinger Bands.
- [x] Stochastic.
- [x] ATR.
- [x] Parabolic SAR.
- [x] Alligator.
- [x] Awesome Oscillator.
- [x] Fractals.

Architecture:

- [x] Indicator registry.
- [x] Indicator settings.
- [x] Enable/disable.
- [x] Multiple indicators.
- [x] Indicator persistence.
- [x] Reset chart settings.

## 4.5 Drawing tools

- [x] Trend line.
- [x] Horizontal line.
- [x] Vertical line.
- [x] Ray.
- [x] Fibonacci retracement.
- [x] Rectangle.
- [x] Price marker.
- [x] Text annotation.
- [x] Remove selected.
- [x] Remove all.
- [x] Drawing persistence.

---

# PHASE 5 — Order Panel UX

## 5.1 Fields

- [x] Instrument.
- [x] Direction.
- [x] Amount.
- [x] Duration.
- [x] Expiry.
- [x] Available balance.
- [x] Minimum amount.
- [x] Maximum amount.
- [x] Potential return.
- [x] Fees where applicable.
- [x] Risk disclosure.

## 5.2 Amount UX

- [x] Stepper.
- [x] Presets.
- [x] Validation.
- [x] Min/max enforcement from server configuration.
- [x] Server accepts validated decimal trade amounts.
- [x] Currency display.
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
- [x] Pending.
- [x] Accepted.
- [x] Open.
- [x] Rejected.
- [x] Failed.
- [x] Won.
- [x] Lost.
- [x] Cancelled.
- [x] Expired.

## 5.5 Submission safety

- [x] Disable duplicate submission.
- [x] Client request ID.
- [x] Server idempotency key.
- [x] Pending/submitting state.
- [x] Retry policy with idempotent request recovery.
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

- [x] Search.
- [x] Status filter.
- [x] Asset filter.
- [x] Direction filter.
- [x] Date range.
- [x] Pagination.
- [x] Sort.
- [x] Export.
- [x] Empty state.
- [x] Loading state.
- [x] Error state.

---

# PHASE 7 — Frontend State Architecture

## 7.1 Separate state domains

- [x] Server state is isolated behind API/domain hooks.
- [x] Market state is isolated behind the market hook/realtime subscription boundary.
- [x] Session state is isolated behind AuthProvider/session store semantics.
- [x] UI state remains local to feature components unless cross-feature sharing is required.
- [x] Form state remains local to feature forms.

## 7.2 Define stores/services

- [x] Session store.
- [x] Market store.
- [x] Trading UI store.
- [x] Notification store.
- [x] Wallet store.
- [x] Portfolio store.

## 7.3 Prevent authority leaks

- [x] No authoritative balance in local state.
- [x] No authoritative payout in local state.
- [x] No authoritative settlement in local state.
- [x] No authorization decisions in UI components. Frontend action gating now consumes server-provided `/auth/capabilities`; final server-security review remains part of Phase 29.

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
- [x] Retry rules for safe/idempotent requests; non-idempotent requests without an idempotency key are not retried.
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
- [x] Candle update.
- [x] Market status.
- [x] Trade status.
- [x] Position update.
- [x] Wallet update.
- [x] Notification event.

---

# PHASE 10 — Authentication UI

## 10.1 Login

- [x] Email/username field.
- [x] Password field.
- [x] Validation.
- [x] Loading.
- [x] Error.
- [x] Rate-limit state.
- [x] Locked-account state.
- [x] Remember-device behavior where appropriate.

## 10.2 Registration

- [x] Registration fields.
- [x] Password rules.
- [x] Terms/consent.
- [x] Validation.
- [x] Email verification.

## 10.3 Password recovery

- [x] Forgot password.
- [x] Reset password.
- [x] Expired-token state.
- [x] Success state.

## 10.4 2FA

- [x] Challenge.
- [x] Code validation.
- [x] Recovery code handling.
- [x] Rate limiting UX.

## 10.5 Session/device

- [x] Active sessions.
- [x] Device list.
- [x] Revoke session.
- [x] Login history.
- [x] Security event list.

---

# PHASE 11 — Dashboard

- [x] Portfolio value.
- [x] Trading balance.
- [x] Today's P&L.
- [x] Win/loss.
- [x] Trade count.
- [x] Volume.
- [x] Recent trades.
- [x] Favorite assets.
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
- [x] Pending funds.
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
- [x] Audit logging.

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
- [x] Toast.
- [ ] Email integration.
- [x] Security alerts.
- [x] Trade results.
- [x] Deposit status.
- [x] Withdrawal status.
- [ ] System announcements.

---

# PHASE 21 — Admin Application

Implemented initial separate admin boundary. The backend now enforces admin access through `AdminAccess`, the admin console lives under `admin/`, and configured active users can be bootstrapped with `ADMIN_BOOTSTRAP_EMAILS`.


Admin should be a separate application boundary.

## Dashboard

- [x] Users.
- [x] Active users.
- [x] Deposits.
- [x] Withdrawals.
- [x] Open trades.
- [x] Volume.
- [x] System health.

## Users

- [x] Search.
- [x] View.
- [x] Restrict.
- [x] Suspend.
- [x] Session management.
- [x] KYC status.

## Trading

- [x] Trades.
- [x] Open positions.
- [x] Settlements.
- [x] Asset configuration.
- [x] Market status.
- [x] Rules.

## Finance

- [x] Wallets.
- [x] Deposits.
- [x] Withdrawals.
- [x] Reconciliation.
- [x] Ledger.

## Risk

- [x] Limits.
- [x] Exposure.
- [x] Risk rules.
- [x] Monitoring.

## Audit

- [x] Audit logs.
- [x] Admin actions.
- [x] Security events.
- [x] Export.

---

# PHASE 22 — Accessibility

- [~] Keyboard navigation — shared Select, Dropdown and wallet menu covered; full application keyboard walkthrough remains QA.
- [x] Focus management.
- [x] Modal focus trap.
- [x] Screen-reader labels.
- [x] ARIA states.
- [x] Contrast requirements documented and focus-visible styling applied.
- [x] Reduced motion support.
- [x] Touch targets for primary mobile controls.
- [x] Error/loading announcements on shared async/error states and trade dialogs.
- [x] Table semantics in reusable DataTable and preserved contextual mobile tables.
- [x] Form semantics in shared controls and existing labelled forms.

---

# PHASE 23 — Mobile UX

Do not simply shrink desktop.

## Mobile

- [x] Bottom navigation.
- [x] Asset picker drawer.
- [x] Chart toolbar.
- [x] Order panel layout.
- [x] Trade confirmation.
- [x] Positions.
- [x] History.
- [x] Wallet.
- [x] Account.
- [x] Notifications.
- [~] Final device/browser matrix validation remains QA.

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

- [x] Loading.
- [x] Empty.
- [x] Error.
- [~] Offline — global banner and Trading Room fallback covered; per-feature verification remains.
- [~] Reconnecting — realtime connection/status recovery covered; per-feature verification remains.
- [x] Unauthorized.
- [x] Forbidden.
- [x] Maintenance.
- [x] Unavailable.

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

- [x] CI workflow.
- [x] Dependency scanning.
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
- [~] Security headers — frontend dev/preview and backend API headers are hardened; production static-site edge headers remain part of Phase 27.
- [x] CSP.
- [ ] HSTS.
- [ ] Referrer-Policy.
- [ ] Permissions-Policy.
- [x] Rate limiting.

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

- [x] No secrets in bundle.
- [x] Secure cookies.
- [ ] CSP.
- [ ] Security headers.
- [x] Dependency scanning.
- [x] XSS review.
- [x] CSRF strategy.
- [x] Origin validation.

## Backend

- [x] Authentication.
- [x] Authorization.
- [x] RBAC.
- [x] Tenant/resource ownership checks.
- [ ] Rate limiting.
- [x] Input validation.
- [x] SQL safety.
- [x] SSRF review.
- [x] File-upload controls — multipart uploads are explicitly rejected until a dedicated controlled upload path exists.
- [x] Webhook verification — HMAC-SHA256 verification utility is ready; provider-specific ingestion remains in the Payments milestone.
- [x] Idempotency.
- [x] Replay protection.
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

# CURRENT STATUS — 2026-10-03

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
- [x] Registration terms/consent persistence.
- [x] Password lockout and `Retry-After` rate-limit contract.
- [x] Login/logout/current-user/session-management APIs.
- [x] TOTP two-factor challenge/setup/enable/disable and recovery-code lifecycle.
- [x] Device tracking, login history, and security-event APIs.
- [x] Remember-device session lifetime option.
- [x] Password reset token lifecycle with session revocation and lockout reset.
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
- [x] Provider quote change/volume persistence for server-backed asset and chart state.
- [x] Trading Room server-state market/candle consumption with loading/error/reconnect/stale-feed feedback.

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

SLSPOT-006 is complete. Demo wallet mutations and financial-ledger posting are now server-backed; real-money payment processing remains gated behind product, payment, KYC/AML, authorization and compliance milestones.

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
- [x] Trading UI shows explicit submitting/accepted/open/rejected/failed lifecycle feedback.
- [x] Unit coverage for core settlement direction and payout calculations.

### Required before real-money execution

The trading engine milestone is complete for the currently defined server-side fixed-duration ruleset. Phase 1 product/legal decisions and the later financial-ledger/payment/compliance milestones remain release blockers for any real-money product.

## Immediate next milestone

Production hardening: testing, accessibility, admin, payments/KYC-AML, CI/CD, observability and release security

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
Positions / History / Portfolio / Financial Ledger ✅
        ↓
Wallet + demo funding ✅
        ↓
Notifications core ✅
        ↓
Production hardening
        ↓
Payments + KYC / AML
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
