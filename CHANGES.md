# UI / theme update — Black Gold

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
