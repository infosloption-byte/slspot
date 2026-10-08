# SL Spot Market Data

## Provider architecture

SL Spot uses a backend-only Binance crypto feed:

    Binance WS (trade ticks) -> Market Data Service -> Redis / MySQL -> SL Spot WebSocket -> Trading Room Chart
    Binance REST             -> candles, 24h change/volume, quote when the stream is silent

Binance is the only price source. There is deliberately no cross-exchange failover: Kraken and OKX
quote different bases (USD vs USDT) and a trade must never be priced from two sources. If Binance
stops delivering, the market goes stale and new trades are refused until it recovers.

The browser never connects directly to an exchange. Exchange credentials are not required.

## Current scope

Crypto only: BTC, ETH, BNB, SOL, XRP, DOGE, ADA, AVAX and LINK (internal `X/USD` labels map to Binance `XUSDT` spot).
Legacy non-crypto defaults (EUR/USD, GBP/USD, AAPL/USD, TSLA/USD, XAU/USD, NAS100/USD) are inactive until a multi-asset provider is chosen.

## Configuration

    MARKET_DATA_PROVIDER=binance
    MARKET_DATA_ENABLED=true
    MARKET_DATA_BOOTSTRAP_ASSETS=true
    MARKET_DATA_POLL_INTERVAL_MS=15000
    MARKET_DATA_REQUEST_TIMEOUT_MS=10000

    BINANCE_ENABLED=true
    BINANCE_REST_URL=https://api.binance.com
    BINANCE_WS_URL=wss://stream.binance.com:9443

## Realtime ticks and settlement

Binance trade ticks are normalized and cached per asset, together with a short (6 minute) tick history.
New trades record entry price, provider and timestamp from the latest fresh tick (max age
`TRADING_MARKET_MAX_AGE_MS`, default 10s).

Settlement uses the tick in force at the trade's expiry instant (the newest tick at or before `expiresAt`),
not the tick current when the settlement worker happens to run. If no tick history covers the expiry
instant (for example after a restart) the current fresh price is used, a warning is logged and the
settlement keeps the real tick timestamp so the delay is visible in the audit record.
Every settlement stores entry price/provider/timestamp and settlement price/provider/timestamp.

Candles come from Binance REST. Exchange WebSocket ticks take precedence over REST snapshots while the stream is fresh.

## Production rollout

Run migration `20261007000000_binance_only_markets` (moves crypto markets to `binance`, deactivates non-crypto assets).
The new assets (SOL, XRP, DOGE, ADA, AVAX, LINK) need one boot with `MARKET_DATA_BOOTSTRAP_ASSETS=true` to be created.
Remove any `MARKET_DATA_PROVIDER=twelve-data` and Kraken/OKX variables from the environment.

## Chart rendering

The backend publishes realtime price events at roughly 10 Hz. The browser interpolates from the currently displayed price toward the newest authoritative tick using requestAnimationFrame, allowing the chart to render smoothly around 60fps without changing the settlement price.

The interpolation is visual only. Server-side trading and settlement continue to use the raw authoritative price/timestamp.

## No simulated prices

Prices are never simulated or guessed, in demo or real mode, in development or production. New trades need a fresh Binance tick; settlement uses the tick in force at expiry. If no reliable price is available the trade is refused (new trade) or, after `TRADING_VOID_AFTER_MS`, voided with a full refund and a notification (expired trade). If candle history cannot be loaded, the chart shows the feed as unavailable instead of drawing made-up history. `MARKET_DATA_SIMULATE` is no longer supported and aborts startup if set.

## Operational guidance

Monitor provider connection state, per-provider tick freshness, active provider per asset, source-switch events, REST quote failures, candle fallback usage and settlement price source.

For production fixed-duration trading, the provider failover policy should be documented as part of the product's official settlement rules before enabling real-money execution.
