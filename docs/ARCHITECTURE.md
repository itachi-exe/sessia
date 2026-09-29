# Architecture

Sessia is one deployment with three layers. Nothing is executed on chain, and the
only paid dependency is the model key, which never leaves the server.

## Layers

**Frontend (`public/`)** — plain ES modules, no build step, no framework.
- `index.html`, `client.js`, `styles.css`: the research page and its rail.
- `agent.html`, `agent-client.js`: the agent page, gated by a wallet.
- `data.mjs`: the chain side. Token registry, APRO oracle reads, PancakeSwap
  quotes, V3 slot0 reads, market session. Imported by the browser *and* by the
  server, which is deliberate: the numbers on the page and the numbers in an
  answer come from the same functions.
- `wallet.mjs`, `agent-access.mjs`: wallet connect, the daily access signature.

**Backend (`api/`)** — Vercel functions, one entry point.
- `index.js`: the router. Telegram webhook, `/api/ask`, `/api/price`,
  `/api/monitor`, `/api/health`, `/api/telegram/setup`.
- `store.js`: durable state. KV when configured, Vercel Blob otherwise.
  Watchlists, chat history, counters, tombstones.
- `monitor.js`: the alert loop. Compares the pool price against the oracle and
  alerts on drift, with a one hour cooldown per chat and ticker.
- `chat.js`: the model layer. `gatherEvidence()` reads the chain, `chatReply()`
  answers with those reads injected as notes.
- `limits.js`: the caps. Per Telegram chat, per signed wallet, and one product
  wide ceiling.

**Scripts (`scripts/`, `sessia-cron.mjs`)**
- `scripts/local-server.mjs`: serves `public/` locally for front end work.
- `sessia-cron.mjs`: calls `/api/monitor` every five minutes from this box.

## Request flow

    Telegram  ->  /api/telegram   ->  limits (chat, then global budget)
                                  ->  commands, or chat.js -> data.mjs -> chain
                                  ->  store.js (history, watchlist)
                                  ->  Telegram sendMessage

    Browser   ->  /api/ask        ->  limits (wallet signature, chain history,
                                      wallet quota, connection cap, global budget)
                                  ->  chat.js -> data.mjs -> chain
                                  ->  reply with the evidence list

    Cron      ->  /api/monitor    ->  store.js (watchlists)
                                  ->  data.mjs -> chain
                                  ->  Telegram alert (drift past the bar)

## Trust boundaries

- The browser is untrusted. A wallet signature proves ownership of an address
  for the day; it never authorises a transfer, and no code path submits a
  transaction.
- The model is untrusted for facts. It never supplies a number: every figure in
  an answer comes from `gatherEvidence()`.
- Secrets live in Vercel environment variables and on this host outside the
  repository. Nothing key shaped is tracked in git.

## State

| Key | Holds | Lifetime |
| --- | --- | --- |
| `watchlist-<chat>` | tickers, threshold, session | until stopped |
| `chat-history-<chat>` | last 8 turns | rolling |
| `ask-tg-<chat>-<date>` | Telegram messages today | one day |
| `ask-wallet-<address>-<date>` | wallet answers today | one day |
| `ask-ip-<ip>-<date>` | connection caps | one day |
| `ask-global-<date>` | product wide budget | one day |

## Deployment

- Vercel project `sessia-beta`, production alias `https://sessia-beta.vercel.app`.
- `vercel.json` rewrites every route to `api/index.js` and declares the daily
  monitor cron.
- Env: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `TELEGRAM_SETUP_SECRET`,
  `CRON_SECRET`, `BLOB_READ_WRITE_TOKEN`, `DEEPSEEK_API_KEY`, `BOT_PHOTO_B64`,
  optional `TELEGRAM_DAILY_LIMIT`, `WALLET_DAILY_LIMIT`, `GLOBAL_DAILY_LIMIT`.

## Tests

`npm test` runs `node --test test/*.test.mjs`. The suite covers the chain maths,
the ticker and company name resolution, the model layer's grounding, and every
limit including the wallet signature binding and the day keys.
