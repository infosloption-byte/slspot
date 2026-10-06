# SL Spot Market Data

## Provider architecture

SL Spot uses a backend-only multi-exchange crypto feed:

    Binance WS (primary)
          |
    Kraken WS (fallback)
          |
      OKX WS (secondary fallback)
          v
    Normalized Tick -> Market Data Service -> Redis / MySQL -> SL Spot WebSocket -> Trading Room Chart

Binance is the preferred source. Kraken becomes active only when Binance data is no longer fresh for an asset, and OKX is the next fallback. All three streams remain warm so recovery does not require a cold connection.

The browser never connects directly to an exchange. Exchange credentials are not required for public market-data feeds.

## Current scope

The exchange stack is crypto-only. Binance, Kraken and OKX are appropriate for crypto spot market data, but they are not a replacement for a general FX, equities, commodities or index feed.

The default registry enables BTC/USD, ETH/USD, BNB/USD, SOL/USD, XRP/USD, DOGE/USD, ADA/USD, AVAX/USD and LINK/USD.

Legacy non-crypto defaults (EUR/USD, GBP/USD, AAPL/USD, TSLA/USD, XAU/USD and NAS100/USD) are kept inactive until a dedicated multi-asset provider is selected.

For exchange transport, the internal USD-labelled crypto pairs use the exchanges' liquid USD-stable spot markets where required. This mapping must be treated as part of the formal pricing policy before real-money launch.

## Configuration

    MARKET_DATA_PROVIDER=multi-exchange
    MARKET_DATA_ENABLED=true
    MARKET_DATA_BOOTSTRAP_ASSETS=true
    MARKET_DATA_POLL_INTERVAL_MS=15000
    MARKET_DATA_REQUEST_TIMEOUT_MS=10000

    BINANCE_ENABLED=true
    BINANCE_REST_URL=https://api.binance.com
    BINANCE_WS_URL=wss://stream.binance.com:9443

    KRAKEN_ENABLED=true
    KRAKEN_BASE_URL=https://api.kraken.com
    KRAKEN_WS_URL=wss://ws.kraken.com/v2

    OKX_ENABLED=true
    OKX_BASE_URL=https://www.okx.com
    OKX_WS_URL=wss://ws.okx.com/ws/v5/public

OKX should use the port-443 websocket URL without :8443. OKX has announced that port 8443 will stop accepting WebSocket connections after October 31, 2026.

## Realtime ticks

The provider streams normalize into a common tick record containing provider, external symbol, price, exchange timestamp and provider sequence/trade identifier.

The service keeps a separate latest tick per provider and asset. Source selection follows this order:

    Binance fresh -> use Binance
    Binance stale -> Kraken fresh -> use Kraken
    Binance + Kraken stale -> OKX fresh -> use OKX
    none fresh -> market unavailable (or explicit development simulation)

Only the currently selected source is published as the authoritative market.price event. A source recovery automatically promotes Binance again when a fresh Binance tick arrives.

## Candles and REST fallback

Historical candles use the same ordered provider chain. If Binance REST fails or an interval is unsupported, Kraken is attempted, then OKX.

Exchange WebSocket ticks take precedence over REST snapshots while a fresh tick stream is available, so a slower REST response cannot overwrite a newer realtime price.

## Trading-price audit

Every new trade records entry provider, entry timestamp and entry price.

Every completed settlement records entry price, entry provider, entry timestamp, settlement provider, settlement timestamp and settlement price.

The settlement service prefers the trade's entry provider while it remains fresh. If that source is unavailable at expiry, the active fallback source may be used according to the configured policy, and the fallback provider is recorded in the settlement.

This is intentionally auditable: the application never silently changes the pricing source.

## Chart rendering

The backend publishes realtime price events at roughly 10 Hz. The browser interpolates from the currently displayed price toward the newest authoritative tick using requestAnimationFrame, allowing the chart to render smoothly around 60fps without changing the settlement price.

The interpolation is visual only. Server-side trading and settlement continue to use the raw authoritative price/timestamp.

## Development simulation

Simulation is development-only and should be explicitly enabled with MARKET_DATA_SIMULATE=true. It is never allowed in production.

## Operational guidance

Monitor provider connection state, per-provider tick freshness, active provider per asset, source-switch events, REST quote failures, candle fallback usage and settlement price source.

For production fixed-duration trading, the provider failover policy should be documented as part of the product's official settlement rules before enabling real-money execution.
