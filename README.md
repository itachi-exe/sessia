# Sessia

**Personalized AI Research Agent for Tokenized Stocks on BNB Chain**

Built for the BNB Chain Tokenized Stocks Hackathon.

---

## What it does

Sessia monitors tokenized stocks across BNB Chain, detects unusual price deviations against on-chain oracle data, and delivers personalized, evidence-backed research alerts to each user via Telegram.

- **Live oracle prices** via APRO Oracle (BSC) — NVDA, TSLA, META, MSFT, PLTR, QQQ, SPCX
- **DEX prices** read on-chain from the deepest PancakeSwap V3 pool for each tokenized stock
- **Personalized watchlists** stored per Telegram chat ID (Vercel Blob private store, or Vercel KV when configured)
- **Conversational layer** for free text questions, answered by DeepSeek but grounded in the same live on-chain reads. The model never supplies a price, a pool or a fee: those come from the chain, and if a read fails the bot says so instead of guessing.
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

## Repository layout

```
api/                    serverless functions
  index.js              routing, Telegram command layer, POST /api/ask
  monitor.js            the five minute deviation check and alert delivery
  store.js              watchlists, observations, daily counters
agent/                  the conversational layer and its guardrails
  chat.js               evidence gathering, prompt, model call
  limits.js             per chat, per wallet and product wide allowances
public/                 the site, served static, plus the shared chain layer
  data.mjs              token registry, oracle and PancakeSwap reads, ticker resolution
scripts/
  local-server.mjs      run the site locally (npm start)
  sessia-cron.mjs       pm2 loop that fires /api/monitor every five minutes
test/                   node:test suites, 27 tests
docs/
  design.md             original product design notes
  ARCHITECTURE.md       module map, request flow, limits, deploy notes
assets/                 bot photo source
```

Three of those directories are also published on their own for readers who only want one layer: `public/` as **Sessia-frontend**, `api/` as **Sessia-backend**, `agent/` as **Sessia-agent**. Those repositories are generated copies from this monorepo (a subtree push, wired in `.github/workflows/mirror.yml`), so this repo stays the source of truth and the deploy still ships from here.

`api/` and `public/` keep their names on purpose. They are Vercel's conventions, and renaming them means giving up filesystem routing for a rewrite that can silently break `/api/*` in production. `agent/` holds the conversational layer and its guardrails, imported by `api/index.js`. Both the browser and the server read prices through the same `public/data.mjs`, so the site and the bot can never disagree about a number.

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
| any other text | Asked as a question: DeepSeek answers, grounded in the same live on-chain reads |

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
- `TELEGRAM_DAILY_LIMIT` — messages one Telegram chat may send per day (default 10, counted on every inbound message)
- `WALLET_DAILY_LIMIT` — messages one connected wallet may send to the website agent per day (default 5)
- `BSC_RPC_URL` — RPC used to check that a wallet has sent a transaction before it is allowed in (default `https://bsc-dataseed.binance.org`)
- `TELEGRAM_WEBHOOK_SECRET` — random hex string
- `BLOB_READ_WRITE_TOKEN` — set automatically when a Vercel Blob store is linked to the project (storage layer; setting `KV_REST_API_URL` + `KV_REST_API_TOKEN` switches storage to Vercel KV)
- `CRON_SECRET` — protects `/api/monitor`
- `DEEPSEEK_API_KEY` — key for the conversational layer. With it, free text questions get an answer; without it the bot replies with the command list. `DEEPSEEK_MODEL` overrides the model (default `deepseek-chat`, the non-reasoning variant, chosen for reply latency).

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
SESSIA_CRON_SECRET=<your-cron-secret> pm2 start scripts/sessia-cron.mjs --name sessia-cron
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

## Limits

Both doors spend one DeepSeek key, so both are capped per UTC day, and the counters live in the same store as the watchlists, so a cold start or a restart cannot reset them.

| Door | Identity | Allowance | Extra rule |
| --- | --- | --- | --- |
| `@Sessia_BNBAI_bot` | Telegram chat id | 10 messages a day | every inbound message counts, commands included, so no wording slips past the cap |
| `agent.html` | connected wallet | 5 messages a day | the wallet signs the access message once a day, and must have sent at least one transaction on BNB Chain |

A wallet that only ever received funds reports a nonce of 0 and is refused, which is the point: a freshly generated wallet cannot farm free answers. `TELEGRAM_DAILY_LIMIT` and `WALLET_DAILY_LIMIT` change the numbers without a code change. Refusals cost nothing and are one line.

## Verification (2026-09-29)

Run against the live deployment and the chain, not against fixtures:

- Storage round trip on the deployed stack: `GET /api/health` returns `storageMode: vercel-blob`, `storageReady: true`.
- Cross-process persistence: a watchlist written by the production webhook was read back by a separate local process through the same store.
- Command routing: `/start`, `/watch`, `/watchlist`, `/simulate`, `/stop` exercised through the real handler; `/watchlist` now falls through from the `/watch` prefix correctly.
- Alert path: an injected 4.87% oracle deviation produced one alert, and the second monitoring cycle inside the cooldown produced none.
- Cron: `sessia-cron` under pm2 returns 200 every five minutes (`pricesChecked=7`).
- Telegram: `POST /api/telegram/setup` returned `webhookConfigured: true` for `Sessia_BNBAI_bot`.
- Conversational layer: a free-text question sent through the production webhook came back with live figures (oracle, pool, gap) and both turns were read back from Blob by a separate process. Follow-up questions resolve against the stored turns; with `DEEPSEEK_API_KEY` absent the bot falls back to the command list.
- Name and intent handling: `NVIDIA`, `Tesla`, `Nasdaq` and the on-chain symbols all resolve to the same asset, and a message that asks to monitor an asset sets the alert rule (`watchlist = {"tickers":["NVDA"],"thresholdPct":1.5,"alertSession":"all"}` read back from Blob) instead of describing it.
- Web agent: `POST /api/ask` on the live deployment returned a grounded answer with its evidence list, and a browser run of `/agent.html` produced a live-price reply with no console errors. The landing page strip now reads the APRO feed instead of hardcoded demo prices.
- Token registry: every enabled address was read on-chain (symbol, decimals, deepest V3 pool, live price) before being written into `public/data.mjs`.
- Alerting, end to end: with the bar tightened to 0.01% the five minute loop fired a real alert (`alertsSent=1`, `session=US MARKET OPEN`) and delivered it to Telegram, then the bar was put back to 1.5%.
- Audit checks: `/api/monitor` returns 401 without the secret, `/api/ask` replies `cache-control: no-store` with HSTS and no wildcard CORS, a prompt injection asking for the system prompt was refused, and the model key being absent falls back to the command list instead of failing.
- Limits: the Telegram handler answered ten messages from one chat and refused the eleventh, the twelfth and a `/price` command with `You have used all 10 messages for today`. On the live deployment `POST /api/ask` refused a wallet that had never transacted (`no_transactions`), refused a tampered signature (`bad_signature`), answered five times for a signed wallet with chain history and refused the sixth (`daily_limit`). A live chain read of the PancakeSwap router returned a nonce of 1.
- Test suite: 27 tests, 27 passing. The old template agent and its public system prompt file were deleted, along with their tests, because the agent is now the server side layer in `agent/chat.js`.

---

## License

MIT
