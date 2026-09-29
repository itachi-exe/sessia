# Sessia

**Personalized AI Research Agent for Tokenized Stocks on BNB Chain**

Built for the BNB Chain Tokenized Stocks Hackathon.

---

## What it does

Sessia monitors tokenized stocks across BNB Chain, detects unusual price deviations against on-chain oracle data, and delivers personalized, evidence-backed research alerts to each user via Telegram.

- **Live oracle prices** via APRO Oracle (BSC) — NVDA, TSLA, META, MSFT, PLTR, QQQ, SPCX
- **DEX prices** read on-chain from the deepest PancakeSwap V3 pool for each tokenized stock
- **Personalized watchlists** stored per Telegram chat ID (Vercel Blob private store, or Vercel KV when configured)
- **5-minute monitoring** via pm2 cron process firing Telegram alerts
- **Session-aware** — knows when NYSE is open, closed, or weekend
- **Evidence-first** — separates observations, signals, and limitations in every alert

---

## Architecture

```
Telegram Bot (@Sessia_BNBAI_bot)
        │
        ▼
Vercel Serverless (api/index.js)
        │
        ├── APRO Oracle (BSC RPC) ─── latestRoundData() on-chain
        ├── PancakeSwap V3 pools (BSC RPC) ─── slot0 + liquidity for the DEX side
        └── Vercel Blob (private store) ─── watchlists, cooldowns, observations

pm2: sessia-cron (every 5 min)
        │
        └── POST /api/monitor ─── check all users, fire alerts
```

**Stack:** Node.js, Vercel Serverless, Vercel Blob, Telegram Bot API, BNB Smart Chain (chain ID 56)

---

## Bot commands

| Command | Description |
|---|---|
| `/start` | Onboarding and status |
| `/watch NVDA TSLA` | Set your watchlist |
| `/price NVDA` | Live oracle price + session |
| `/simulate NVDA 100` | Model a $100 trade via PancakeSwap |
| `/watchlist` | View current config |
| `/threshold 2%` | Set alert sensitivity |
| `/session closed` | Alert only when US market is closed |
| `/session open` | Alert only when US market is open |
| `/session all` | Alert any time (default) |
| `/stop` | Stop monitoring and clear watchlist |
| `/help` | Full reference |

---

## Supported assets

| Ticker | Name | APRO Feed | bStocks | xStocks |
|---|---|---|---|---|
| NVDA | NVIDIA | ✓ | NVDAB | NVDAx |
| TSLA | Tesla | ✓ | TSLAB | TSLAx |
| META | Meta Platforms | ✓ | METAB | METAx |
| MSFT | Microsoft | ✓ | MSFTB | MSFTx |
| PLTR | Palantir | ✓ | PLTRB | — |
| QQQ | Invesco QQQ | ✓ | QQQB | — |
| SPCX | SpaceX | ✓ | SPCXB | SPCXx |

All APRO oracle contract addresses are from [docs.apro.com](https://docs.apro.com/en/data-push/price-feed-contract.md) (BSC mainnet, September 2026).

Only the bStocks addresses are enabled (NVDAB, TSLAB, METAB, MSFTB, QQQB, SPCXB), and each was verified on-chain on 2026-09-29: `symbol()` matched, `decimals()` returned 18, and the token has a PancakeSwap V3 pool quoting against USDT with live depth. The xStocks tokens and PLTRB have no BSC pool with meaningful liquidity, so `public/data.mjs` leaves them `null` instead of guessing an address; `SPCXx` exists but carries only a few hundred dollars of liquidity, so it will not produce a usable quote.

---

## Setup

### 1. Clone and install

```bash
git clone https://github.com/your-org/sessia
cd sessia
npm install
```

### 2. Configure environment

Copy `.env.example` to `.env.local` and fill in:

- `TELEGRAM_BOT_TOKEN` — from BotFather
- `TELEGRAM_WEBHOOK_SECRET` — random hex string
- `BLOB_READ_WRITE_TOKEN` — set automatically when a Vercel Blob store is linked to the project (storage layer; setting `KV_REST_API_URL` + `KV_REST_API_TOKEN` switches storage to Vercel KV)
- `CRON_SECRET` — protects `/api/monitor`

### 3. Deploy

```bash
vercel --prod
```

### 4. Register webhook and bot commands

```bash
curl -X POST "https://your-deployment.vercel.app/api/telegram/setup?key=YOUR_SETUP_SECRET"
```

### 5. Start monitoring cron (on your server)

```bash
SESSIA_CRON_SECRET=<your-cron-secret> pm2 start sessia-cron.mjs --name sessia-cron
pm2 save
```

### 6. Storage store

This project is wired to a Vercel Blob store named `sessia-watchlists` (private access), already linked to the Vercel project, which sets `BLOB_READ_WRITE_TOKEN`. `api/store.js` keeps one JSON document per key: watchlist per chat, the monitored chat list, alert cooldowns, and a rolling window of observations per ticker. Set `KV_REST_API_URL` and `KV_REST_API_TOKEN` to move storage to Vercel KV; the call sites do not change.

---

## Development

```bash
npm test         # Run test suite (Node built-in test runner)
npm start        # Local dev server on port 3000
```

---

## Data disclosures

- Reference prices come from APRO Oracle on BNB Smart Chain. Each observation includes a timestamp and freshness flag.
- The DEX side is the deepest PancakeSwap V3 pool quoting the token against USDT, read on-chain (slot0 plus in-range liquidity), so the fee tier and price impact are real pool values rather than an off-chain estimate.
- Baselines are built from collected observations. Early baselines are labeled as limited.
- No transaction is submitted without explicit user confirmation.
- Sessia alerts are research signals, not trade recommendations.

---

## Verification (2026-09-29)

Run against the live deployment and the chain, not against fixtures:

- Storage round trip on the deployed stack: `GET /api/health` returns `storageMode: vercel-blob`, `storageReady: true`.
- Cross-process persistence: a watchlist written by the production webhook was read back by a separate local process through the same store.
- Command routing: `/start`, `/watch`, `/watchlist`, `/simulate`, `/stop` exercised through the real handler; `/watchlist` now falls through from the `/watch` prefix correctly.
- Alert path: an injected 4.87% oracle deviation produced one alert, and the second monitoring cycle inside the cooldown produced none.
- Cron: `sessia-cron` under pm2 returns 200 every five minutes (`pricesChecked=7`).
- Telegram: `POST /api/telegram/setup` returned `webhookConfigured: true` for `Sessia_BNBAI_bot`.
- Token registry: every enabled address was read on-chain (symbol, decimals, deepest V3 pool, live price) before being written into `public/data.mjs`.
- Test suite: 17 tests, 17 passing.

---

## License

MIT
