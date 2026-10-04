# UI / theme update — Black Gold

## 2026-10-04 — trading page and security fixes

- **Demo prices:** `getDemoPrice` was a pure function of the clock (a sine wave), so demo trades were predictable. It now uses a random walk driven by a cryptographically secure random source (`backend/src/trading/demoPrice.ts`). State is per process.
- **Realtime subscriptions:** channels are reference-counted, so the top bar, trading page and account pages can share `user:<id>` without one unmounting and unsubscribing the others.
- **CSRF recovery:** refreshing the CSRF token no longer consumes a request attempt, so non-retryable POSTs (login, logout, register) are re-sent once instead of failing with "retry limit reached".
- **API client:** the origin is resolved lazily instead of at import time, which made the module unimportable without browser globals.
- **Tests:** `npm test` now runs every `*.test.ts` through `tsx --tsconfig tsconfig.app.json`. Fixed the events test (wrong parser) and added tests for CSRF recovery, subscriptions and live candles.
- **Polling:** removed the 2.5s wallet poll and the 2.5s open-trade poll. Data refreshes from WebSocket events (coalesced), once after a reconnect, once after the earliest trade expiry as a safety net, and by polling only while the socket is down. Background refreshes no longer flip `loading`, which stopped the history/positions flicker.
- **Chart:** candle arrays keep a stable identity between ticks, so a price tick no longer regenerates the series or rebuilds indicators. Live ticks accumulate high/low on the current candle and roll over to a new candle when the period ends.

## 2026-10-02 — frontend/backend separation

- Moved the React/Vite application from the repository root into `frontend/`.
- Added a dedicated Fastify/TypeScript backend under `backend/`.
- Added `frontend/src/api/client.ts` as the initial server communication boundary.
- Added a Vite development proxy for `/api` and `/ws` to the backend.
- Updated architecture and task documentation for the monorepo layout.

## Changed
- `frontend/src/styles/theme.css` — new black + yellow tokens
- `frontend/src/styles/global.css` — fully rewritten (organised in 11 sections)
- `frontend/src/App.tsx` — `/app/*` now uses a nested layout route
- `frontend/src/components/layout/AppShell.tsx` — now only the shared frame (rail + top bar + `<Outlet />`)
- `frontend/src/components/layout/Sidebar.tsx` — slim icon rail with History link, bottom tab bar on mobile
- `frontend/src/components/layout/TopBar.tsx` — SL SPOT logo, notifications, account balance, Deposit button
- `frontend/src/components/trading/TradePanel.tsx` — vertical panel: payout %, time buttons, investment stepper + quick amounts, payout card, big UP / DOWN buttons (validation and confirm flow unchanged)
- `frontend/src/components/trading/ChartWorkspace.tsx` — yellow/green/red chart colours, asset tab + "+" button, removed duplicate price tag
- `frontend/src/components/ui/BrandMark.tsx` — new yellow logo tile
- `frontend/src/data/mockCandles.ts` — demo candles now end at the asset's quoted price
- `index.html`, `README.md`, `docs/DESIGN_SYSTEM.md` — renamed to SL Spot, theme notes

## Added
- `frontend/src/pages/TradingPage.tsx` — trading room state moved out of AppShell
- `CHANGES.md`

## Unchanged
`AssetList`, `BottomPanel`, `WorkspacePage`, `AccessPage` (only restyled through CSS).
