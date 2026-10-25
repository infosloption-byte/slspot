# SL Spot — Frontend trading UX verification

## Changed in this branch
- Explicit order review for demo and real trades; real-trading confirmation warns of stake risk
- Submission mutex and idempotency-preserving network retry; order state visible
- UI blocks trading on stale/offline feeds and non-open markets; API must validate independently
- Fee-adjusted net profit/settlement display and balance-aware preset stakes
- Collapsed-by-default mobile stake controls, viewport/safe-area overrides, and readable contrast
- Focus-trapped mobile navigation and market picker; topmost modal owns Escape/Tab
- Trade-history filters reuse the shared custom Select component

## Automated
Run inside `frontend/`: `npm ci && npm run lint && npm run typecheck && npm test && npm run build`.
GitHub CI runs these on pull requests. A completed build does not replace live quote or order tests.

## Browser/mobile acceptance matrix
For each of 320, 360, 375, 430, 600, 768, 820, 1024, 1440px viewport widths:
- Open trading, swap markets, switch timeframes, open indicators and fullscreen chart
- Expand/collapse trade controls; verify no chart obstruction and safe-area padding
- Open navigation/market picker; Tab, Shift+Tab, Escape, mouse outside, restore trigger focus
- Open order review and back out; confirm one order exactly once with rapid double clicks
- Change stake/duration, inspect minimums/maximums, balance and fee-adjusted outcome
- Toggle Demo/Real; preview from one wallet must never survive the switch
- Simulate disconnected and stale realtime feed; trading disabled and explanatory reason shown
- Simulate delayed/ambiguous order submission; retry with the SAME clientRequestId
- Confirm order status matches server; check open positions and history after reconnect
- Verify accessibility zoom 200%, reduced motion, and iOS/Android keyboard interaction

## Follow-up release gates
- Verify backend order creation is idempotent per clientRequestId and quote freshness is enforced
- Real-money compliance and KYC/payment launch prerequisites are separate gates
- Execute automated end-to-end browser tests once a test environment/credentials are available
