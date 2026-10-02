# SL Spot Market Data

## Provider

The first market-data adapter is Twelve Data. The provider API key is backend-only and is never sent to the browser.

Twelve Data documents HTTP-header authentication using `Authorization: apikey ...` and REST quote/time-series endpoints. citeturn812593search0turn812593search2

Configure the backend with:

```env
MARKET_DATA_PROVIDER=twelve-data
MARKET_DATA_ENABLED=true
MARKET_DATA_API_KEY=your_twelve_data_key
MARKET_DATA_BOOTSTRAP_ASSETS=true
MARKET_DATA_POLL_INTERVAL_MS=15000
MARKET_DATA_REQUEST_TIMEOUT_MS=10000
```

Production requires an explicit API key when Twelve Data market data is enabled.

## Registry

Development bootstrap provisions these application assets:

| SL Spot asset | Provider symbol |
| --- | --- |
| BTC/USD | BTC/USD |
| ETH/USD | ETH/USD |
| SOL/USD | SOL/USD |
| XRP/USD | XRP/USD |
| EUR/USD | EUR/USD |
| GBP/USD | GBP/USD |
| AAPL/USD | AAPL |
| TSLA/USD | TSLA |
| XAU/USD | XAU/USD |
| NAS100/USD | NDX |

Provider availability can vary by instrument, exchange and subscription plan. A failed individual quote moves that market to maintenance rather than exposing provider errors to the browser.

## Data flow

```text
Twelve Data REST API
        ↓
TwelveDataProvider
        ↓
MarketDataService
   ├── MySQL Market.lastPrice/status/lastPriceAt
   └── Redis slspot:realtime:v1
                 ↓
          RealtimeGateway
                 ↓
       browser market:<assetId>
```

The application exposes normalized candles through:

```text
GET /api/v1/market/assets/:assetId/candles?interval=5min&limit=200
```

Supported intervals include 1min, 5min, 15min, 30min, 45min, 1h, 2h, 4h, 8h, 1day, 1week and 1month. citeturn812593search0

The Trading Room combines the REST candle snapshot with the application's `market.price` and `market.status` realtime events.

## Failure handling

A quote poll is isolated per market. Provider failures mark the affected market `MAINTENANCE`, publish a maintenance status event when Redis is available, increase the polling delay with exponential backoff, and retry automatically.

## Local setup

Create or update `backend/.env`:

```env
MARKET_DATA_PROVIDER=twelve-data
MARKET_DATA_ENABLED=true
MARKET_DATA_API_KEY=your_twelve_data_key
MARKET_DATA_BOOTSTRAP_ASSETS=true
MARKET_DATA_POLL_INTERVAL_MS=15000
MARKET_DATA_REQUEST_TIMEOUT_MS=10000
```

Then run:

```powershell
cd backend
npm run typecheck
npm test
npm run test:market
npm run dev
```

Without a provider key, set `MARKET_DATA_ENABLED=false` to disable polling while keeping the API available.

## Provider transport boundary

The first implementation intentionally uses REST polling instead of making Twelve Data's WebSocket service a hard dependency of SL Spot's browser realtime layer. Twelve Data documents WebSocket streaming with plan-dependent limits. citeturn812593search0turn811464search0turn811464search2

```text
external provider
       ↓
provider adapter
       ↓
normalized platform event
       ↓
Redis
       ↓
SL Spot WebSocket
       ↓
browser
```

## Scope boundary

This milestone does not implement order submission, server-authoritative execution, settlement, payout calculation, wallet mutation, ledger posting, deposits, or withdrawals.