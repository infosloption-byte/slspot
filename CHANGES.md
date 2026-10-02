# UI / theme update — Black Gold

## Changed
- `src/styles/theme.css` — new black + yellow tokens
- `src/styles/global.css` — fully rewritten (organised in 11 sections)
- `src/App.tsx` — `/app/*` now uses a nested layout route
- `src/components/layout/AppShell.tsx` — now only the shared frame (rail + top bar + `<Outlet />`)
- `src/components/layout/Sidebar.tsx` — slim icon rail with History link, bottom tab bar on mobile
- `src/components/layout/TopBar.tsx` — SL SPOT logo, notifications, account balance, Deposit button
- `src/components/trading/TradePanel.tsx` — vertical panel: payout %, time buttons, investment stepper + quick amounts, payout card, big UP / DOWN buttons (validation and confirm flow unchanged)
- `src/components/trading/ChartWorkspace.tsx` — yellow/green/red chart colours, asset tab + "+" button, removed duplicate price tag
- `src/components/ui/BrandMark.tsx` — new yellow logo tile
- `src/data/mockCandles.ts` — demo candles now end at the asset's quoted price
- `index.html`, `README.md`, `docs/DESIGN_SYSTEM.md` — renamed to SL Spot, theme notes

## Added
- `src/pages/TradingPage.tsx` — trading room state moved out of AppShell
- `CHANGES.md`

## Unchanged
`AssetList`, `BottomPanel`, `WorkspacePage`, `AccessPage` (only restyled through CSS).
