# SL Spot frontend architecture

## State boundaries

The frontend uses six dedicated external stores under `frontend/src/state/`:

- `sessionStore` — authenticated session status and user identity.
- `marketStore` — realtime quote snapshots keyed by asset ID.
- `tradingUiStore` — Trading Room selections, history filters, pagination, sound preference, and other cross-component trading UI state.
- `notificationStore` — unread notification count and the latest notification timestamp.
- `walletStore` — selected DEMO/REAL wallet mode.
- `portfolioStore` — server-backed portfolio summary, analytics and position snapshots.

The stores are intentionally lightweight and use React's `useSyncExternalStore`; no new third-party state library is required.

## Server state

API/domain hooks remain the transport boundary for server state. Hooks such as `usePortfolioSummary`, `usePortfolioAnalytics`, `usePortfolioPositions`, and `useTradingCapabilities` load authoritative backend state and synchronize relevant snapshots into the stores.

The browser must not become the source of truth for:

- balances
- market prices
- payout rates
- settlement outcomes
- trade eligibility
- wallet funding eligibility

## Authorization and capabilities

The backend exposes:

`GET /api/v1/auth/capabilities`

The response describes whether trading, deposit, and withdrawal operations are enabled for each wallet mode and supplies a server-generated reason when an operation is unavailable.

Frontend components consume those capabilities for presentation and interaction gating. The backend trading and wallet services remain authoritative and must independently enforce authorization and eligibility.

## UI and form state

Local component state remains appropriate for short-lived presentation/form state such as open dialogs, form field values, transient toast messages, and loading/submission controls.

When state is shared across feature components or represents a durable UI preference, use the corresponding dedicated store.

## Realtime

The authenticated realtime client remains responsible for WebSocket connection lifecycle, subscription recovery and event validation. Realtime events update server-state hooks/stores rather than turning the browser into an authoritative financial state manager.

## Accessibility and responsive behavior

Shared UI primitives own reusable keyboard/focus behavior where possible. Feature screens should use shared `Select`, `Dropdown`, `Modal`, `Drawer`, `Button`, `Input`, `DataTable`, and `ConfirmDialog` primitives rather than recreating interaction patterns.

Responsive CSS is handled at feature boundaries and tested against the supported narrow-to-wide viewport matrix. Final manual browser/device verification remains a QA task.
