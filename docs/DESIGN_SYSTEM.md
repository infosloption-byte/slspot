# SL Spot — Black Gold design system

## Concept

A fast, simple binary/spot trading terminal. Near-black surfaces, one confident yellow accent, and green/red used **only** for market direction. Layout follows the familiar broker pattern (left rail, top account bar, chart in the centre, trade panel on the right) with SL Spot's own identity.

## Colour rules

| Role | Token | Notes |
| --- | --- | --- |
| Base surfaces | `--bg-0` … `--bg-3`, `--panel`, `--panel-raised` | True-black to graphite steps |
| Brand / primary action / active state | `--accent` (`#ffc21a`) | Text on yellow uses `--accent-ink` |
| Accent tints | `--accent-soft`, `--accent-line` | Hover, selected, focus |
| Market up / down | `--green`, `--red` | Never used for brand or decoration |
| Text | `--text`, `--muted`, `--muted-2` | |

## Layout

- **Left rail** (64px): icon navigation. Becomes a bottom tab bar under 820px.
- **Top bar** (56px): logo, live status, notifications, account balance, Deposit.
- **Trading room**: chart (flexible) + trade panel (`--trade-w`, 300px). Activity tabs sit under the chart. Under 820px the trade panel stacks beneath the chart.
- All `/app/*` pages share one `AppShell` (React Router layout route with `<Outlet />`).

## Components

- `.btn--primary` yellow, `.btn--ghost` outlined
- `.segmented` / `.chip` — quick selectors for time and investment
- `.trade-btn--up` / `--down` — large green / red actions
- `.rail-link`, `.account-chip`, `.asset-tabs`, `.stepper`, `.payout-card`

## Principles

- Chart gets the largest continuous canvas.
- One primary action colour; direction colours stay meaningful.
- Short labels, large tap targets, tabular numerals for prices.
