# SL Spot — Black Gold design system

## Concept
A fast, simple binary/spot trading terminal. Near-black surfaces, one confident yellow accent, and green/red used only for market direction. Layout follows SL Spot's own identity.

## Colour rules
| Role | Token | Notes |
| --- | --- | --- |
| Base surfaces | --bg-0 … --bg-3, --panel, --panel-raised | True-black to graphite steps |
| Brand / primary / active | --accent | Text on yellow uses --accent-ink |
| Accent tints | --accent-soft, --accent-line | Hover, selected, focus |
| Market up / down | --green, --red | Directional/P&L semantics only |
| Text | --text, --muted, --muted-2 | |

## Typography scale
| Role | Size | Weight |
| --- | ---: | ---: |
| Page title | 28px | 800 |
| Section title | 16px | 750 |
| Body copy | 13px | 400–600 |
| Controls | 11–12px | 600–750 |
| Eyebrow / metadata | 9–10px | 800–900 |
| Dense table text | 10–11px | 500–750 |

## Spacing scale
Use a compact 4px rhythm: 4px micro-gap, 6px dense gap, 8px standard gap, 10–12px content gap, 14–16px panel padding, 18px card padding, and 24px page padding.

## Layout
- Left rail: 64px; becomes a bottom tab bar under 820px.
- Top bar: 56px.
- Trading room: flexible chart + 300px trade panel; trade panel stacks beneath the chart under 820px.
- All authenticated routes share AppShell and an Outlet.

## Component states
Reusable components should cover default, hover, focus-visible, active/selected, disabled, busy/loading, error/destructive, success, and warning states where relevant.

## Accessibility
Interactive controls should provide visible focus, semantic roles, accurate ARIA state, Escape handling for overlays, focus trapping/restoration for dialogs and drawers, appropriate touch targets, and explicit error descriptions. Shared Select provides keyboard navigation and viewport-safe menu positioning. Modal and Drawer provide focus management. Input exposes validation and descriptions.

## Reusable primitives
- Button
- Input
- Select
- Dropdown
- Tabs
- Badge
- Modal
- Drawer
- DataTable
- ConfirmDialog
- Toast
- Tooltip
- Skeleton
- EmptyState
- ErrorState
- Pagination

## Current implementation note
The shared primitives are intentionally separate from feature components. Feature code should use these primitives for new forms, menus, dialogs, tabs, tables, and confirmations instead of adding new browser-native controls.
## Contrast requirement
Normal text should target at least 4.5:1 contrast against its adjacent surface; large text should target at least 3:1. Focus indicators and essential non-text controls should remain visibly distinguishable from surrounding surfaces.