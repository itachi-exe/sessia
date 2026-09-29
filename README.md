# Sessia

**Personalized AI Research Agent for Tokenized Stocks on BNB Chain**

Built for the BNB Chain Tokenized Stocks Hackathon.

---

## What it does

Sessia monitors tokenized stocks across BNB Chain, detects unusual price deviations against on-chain oracle data, and delivers personalized, evidence-backed research alerts to each user via Telegram.

- **Live oracle prices** via APRO Oracle (BSC) — NVDA, TSLA, META, MSFT, PLTR, QQQ, SPCX
- **DEX quotes** via PancakeSwap Router v0 for real trade simulation
- **Personalized watchlists** stored per Telegram chat ID in Vercel KV
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
        ├── PancakeSwap Router v0 API ─── live DEX quotes
        └── Vercel KV (Redis) ─── watchlists, cooldowns, observations

pm2: sessia-cron (every 5 min)
        │
        └── POST /api/monitor ─── check all users, fire alerts
```

**Stack:** Node.js, Vercel Serverless, Vercel KV, Telegram Bot API, BNB Smart Chain (chain ID 56)

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
- `KV_REST_API_URL` + `KV_REST_API_TOKEN` — from Vercel KV dashboard
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

### 6. Create Vercel KV store

Go to [vercel.com/dashboard → Storage → KV](https://vercel.com/dashboard), create a store named `sessia-kv`, and connect it to the project. The `KV_REST_API_URL` and `KV_REST_API_TOKEN` env vars will be added automatically.

---

## Development

```bash
npm test         # Run test suite (Node built-in test runner)
npm start        # Local dev server on port 3000
```

---

## Data disclosures

- Reference prices come from APRO Oracle on BNB Smart Chain. Each observation includes a timestamp and freshness flag.
- DEX quotes from PancakeSwap Router are estimates. Final execution output may differ from quoted values.
- Baselines are built from collected observations. Early baselines are labeled as limited.
- No transaction is submitted without explicit user confirmation.
- Sessia alerts are research signals, not trade recommendations.

---

## License

MIT
