<div align="center">
<img src="public/mark.png" width="104" alt="Sessia" />

# Sessia

**Research before action.** Tokenized stocks on BNB Chain, read live on chain.

A Telegram bot and a web agent that answer one question well: what does the evidence say about this asset right now?

[Live](https://sessia-beta.vercel.app) · [Agent](https://sessia-beta.vercel.app/agent.html) · [Bot](https://t.me/Sessia_BNBAI_bot) · BNB Chain 56

</div>

---

## What Sessia is

Tokenized stocks such as NVDA and TSLA trade on BNB Chain around the clock, in pools that
are thin, young, and easy to misread. The interesting question is not where the price has
been, it is whether the number in front of you is the number the asset is actually worth.
Sessia answers that with the chain itself: the pool, the oracle, the session, the spread.

**bStocks is the asset universe here.** Sessia is built on the bStocks tokens Binance
issues on chain 56. Every ticker in `public/data.mjs` carries its bStocks contract, the
on chain reads resolve against that contract, and the address list is checked against the
one Binance's own RWA registry publishes for the same ticker (see
`scripts/binance-smoke.mjs`). xStocks and Ondo are read as well, because the same stock
issued three times on one chain is the comparison a researcher actually needs.

Three ideas shape the product:

1. **Evidence, not opinion.** Every answer quotes the reads behind it, with the block-fresh
   numbers, the source, and the age of the quote. If a feed is stale, the answer says so
   instead of smoothing over it.
2. **Nothing is signed for you.** Sessia holds no keys and has no code path that can move
   an asset. It researches, sizes, and explains. The wallet stays yours.
3. **A paid model behind a gate.** Answers run on a paid model key that never leaves the
   server, so access is metered: a wallet proves ownership and history, and gets a small
   daily allowance. The gate is the reason the key can exist at all.

---

## Screenshots

The landing page: one line of what it does, then the live read.

![The landing page](docs/screenshots/landing.png)

Research on a single asset: the oracle price, the pool price, and the gap between them.

![Research view](docs/screenshots/research.png)

The agent, before a wallet is connected. The composer stays closed until a signature arrives.

![The agent gate](docs/screenshots/agent-gate.png)

The same agent answering a real question, with the reads it used.

![An agent answer](docs/screenshots/agent-answer.png)

The agent on a phone.

<img src="docs/screenshots/agent-mobile.png" width="300" alt="Agent on a phone" />

---

## Product

### One assistant, two doors

Telegram and the site run the same agent over the same reads. The difference is how you get in.

| Door | What you use it for | What it costs you |
| --- | --- | --- |
| Telegram | commands, questions, and the alerts | 10 messages a day per chat, commands included |
| The site | the agent page, with the reads laid out | 5 questions a day per wallet, 40 requests a day per connection |
| Everything | one ceiling for the day | 500 answers across the whole product |

### The bot

| Command | What it does |
| --- | --- |
| `/price NVDA` | the APRO oracle price, the session, and every issuer of that stock on BNB Chain |
| `/venues NVDA` | the same stock across bStocks, xStocks and Ondo: price, holders, 24h volume, and how far apart they are |
| `/stocks` | the tokenized stock universe Binance tracks on BNB Chain, grouped by issuer (search with `/stocks NVDA`) |
| `/threshold 1.5` | set the divergence that should trigger an alert for this chat |
| `/session` | whether the US session is open, pre-market, after hours, or closed |
| `/watchlist` | what this chat is watching |
| `/simulate NVDA 100` | the estimated fill for a $100 trade, with the fee and slippage assumptions stated |
| `/link` | bind this chat to a wallet so both share one conversation |
| `/unlink` | break that link |
| `/stop` | stop monitoring |
| `/help` | the list, and where the numbers come from |

### Issuers on one chain

The same stock is issued more than once on BNB Chain, and the three issues do not trade at
the same price. `/venues NVDA` prices all of them side by side and reports the spread. On
the day this was written that spread was 0.08% on NVDA, 2.16% on TSLA and 8.51% on PLTR,
which is the difference between a tight market and a stale quote nobody has taken yet.

The alert engine reads the same per asset state, so a venue that Binance reports as
anything other than `TRADING` (a halt, an earnings window, a corporate action) is never
read as a dislocation.

### The alert engine

The monitor loop wakes every five minutes, reads each watched asset, compares the pool
price with the APRO oracle, and messages every chat watching that asset when the gap
crosses that chat's own threshold. One alert per ticker per chat per hour, so a market
that stays dislocated does not turn into a stream of noise.

### The wallet gate

A wallet gets in with two proofs: a signature over a dated message, and at least one
transaction on BNB Chain. The signature expires with the day, and the history check is
the reason an empty freshly funded address cannot use the agent. Answers come from a
paid model key that never leaves the server, which is why the allowance exists at all.

### Linking Telegram to a wallet

Open the agent page, connect the wallet, press Connect Telegram. The server verifies the
signature, returns a short single-use code, and the bot redeems it on Start. From then on
the chat and the site are one identity: the same conversation, the same context, the same
wallet allowance. `/link` shows the state, `/unlink` breaks it. A bare address never links
anything on its own, because anybody can type anybody's address.

---

## Agent access (BNB Agent Studio)

Sessia is not only something you talk to. It is a service another agent can find, hire and
pay, using the BNB Agent Studio stack as the Studio SDK defines it.

| Endpoint | What it is |
| --- | --- |
| `GET /.well-known/agent-card.json` | EIP-8004 registration file: name, services, the capability on sale, the price, and the data URI the identity registry stores |
| `POST /api/agent/task` | ERC-8183 job interface: takes a job description, answers with a deliverable manifest whose hash is the hash a buyer submits on chain |
| `GET /api/agent/research?ticker=NVDA` | The priced read. 402 with an x402 v2 challenge until it is paid, the research note once it settles |

One research call costs 0.05 U on BNB Chain and settles through a facilitator over EIP-3009.
The seller checks the chain, the payee, the amount, the expiry and the envelope shape itself
before the facilitator is asked to recover the signature. With no payee configured the
endpoint answers 503 and says what it would have charged, rather than pretending a call was
paid for.

The agent page shows the same card live, in the rail: discovery path, task path, price per
call.

Why it is shaped this way, what the Studio CLI switches on, and how to verify it without a
wallet: [docs/AGENT-STUDIO.md](docs/AGENT-STUDIO.md).

---

## Architecture

```mermaid
flowchart TB
  T[Telegram chat] -->|update| H[api/index.js webhook]
  P[Agent page] -->|question + signature| ASK[/api/ask/]
  P -->|reads| PRICE[/api/price/]
  P -->|signed link request| LINK[/api/link/]
  H --> GATE{Wallet and chat allowances}
  ASK --> GATE
  LINK --> CODE[Single-use code, 15 minutes]
  GATE --> CHAT[agent/chat.js]
  CHAT --> EV[Evidence: pool, oracle, session, issuer board]
  EV --> RPC[(BNB Chain RPC)]
  EV --> ORACLE[(APRO oracle feed)]
  EV --> BW3[(Binance Web3 RWA read)]
  CHAT --> STORE[(Vercel Blob)]
  CODE --> STORE
  CRON[scripts/sessia-cron.mjs, every 5 minutes] --> MON[/api/monitor/]
  MON --> STORE
  MON -->|alert| T
```

| Path | What it is | Where it runs |
| --- | --- | --- |
| `api/` | the serverless entry point: webhook, `/api/ask`, `/api/price`, `/api/link`, `/api/monitor`, storage | Vercel functions, Node 20 |
| `agent/` | the conversational layer and the allowance guardrails | imported by `api/` |
| `public/` | the site, the browser modules, and the live reads | Vercel edge |
| `scripts/` | the monitor loop and a local static server | pm2 on the box |
| `test/` | the suite, plain `node:test` | CI and locally |
| `docs/` | architecture notes, design notes, README screenshots | read |
| `assets/` | the mascot source | read |

| Module | Responsibility |
| --- | --- |
| `api/index.js` | routing, the Telegram command layer, the wallet gate, the link codes |
| `api/monitor.js` | one alert pass: read every watched asset, compare, notify the watchers |
| `api/store.js` | the storage driver: Vercel Blob in production, files locally, memory in tests |
| `agent/chat.js` | a question plus evidence becomes one grounded answer |
| `agent/limits.js` | per chat, per wallet, per connection, product-day allowances |
| `agent/w3w.js` | the signed Binance Web3 API path: quotes and swaps, switched on by key |
| `agent/agent-card.js` | the EIP-8004 registration file and the agent card served at the well known path |
| `agent/erc8183.js` | the job wire format: parse a description, build a deliverable manifest and its hash |
| `agent/x402.js` | the paywall: priced challenge, envelope parsing, terms checks, facilitator verify |
| `agent/canonical.js` | canonical JSON and keccak hashing, byte-identical to the Studio SDK |
| `public/binance.mjs` | the Binance Web3 RWA read: registry, session, per asset state, prices per issuer |

The Binance Web3 reads are split on purpose. Market data (registry, session state, issuer
prices, candles) comes from the wallet-direct surface and needs no credentials, so the
product works with an empty environment. The signed endpoints (aggregated quotes, swaps)
live behind `agent/w3w.js` and turn on the moment `W3W_API_KEY` and `W3W_SECRET_KEY` are
set. Without them, `/api/health` reports `"web3ApiSigned": false` and the quote path is
simply absent rather than pretending to work.

What it deliberately does not have: no private keys, no signing, no contract writes, and no
code path that can move an asset. The health endpoint reports `"walletExecution": false`,
and it is true.

---

## Run it yourself

Needs Node 20. Nothing else is required to read the site: the deploy runs with an empty
environment, and only the agent, the bot, and the alert loop need keys.

```
npm install
npm test
npm start
```

The README screenshots come from `tests/readme_shots.py`, which drives a browser against a
running deploy and writes into `docs/screenshots/`.

Two more scripts are worth knowing:

```
node scripts/binance-smoke.mjs NVDA TSLA PLTR   # live reads, with latency, for docs/DEVEX-REPORT.md
node scripts/verify-api.mjs                     # drives the real handler: health, price, three bot commands, the agent surface
```

`verify-api.mjs` boots `api/index.js` in process with mocked requests, so the price path
and the bot commands can be read end to end without a deploy, a Telegram token or a
webhook. It is the check that says the wiring is real.

The agent needs a model key and, for shared storage, a Blob token. Telegram needs the bot
token and the webhook secret; the alert loop needs its own secret and the deployed URL.
The signed Binance Web3 endpoints need `W3W_API_KEY` and `W3W_SECRET_KEY`, and they are
optional: everything else works without them. The agent identity and the paywall need
`SESSIA_AGENT_ID`, `SESSIA_IDENTITY_REGISTRY`, `SESSIA_AGENT_CHAIN_ID`, `X402_PAY_TO` and
`X402_FACILITATOR_URL`, and they are optional too: without them the card still serves and
the priced route says what it would charge. `.env.example` lists every name with an empty
value, and it is the only env file here.

---

## Quality

| Check | State |
| --- | --- |
| Tests | 56 passing through `node:test`, no network in the suite |
| Live wiring | `scripts/verify-api.mjs` drives the deployed handler in process, 18 checks: health, price, `/price`, `/venues`, `/stocks`, `/help`, the agent card, the 402 gate, the job route |
| Live data | `scripts/binance-smoke.mjs` prints the real registry size, the session state and the per issuer prices with latency |
| Credentials | a scanner walks every blob in every commit and runs first in CI |
| Injection | the agent refuses to print its instructions or any key |
| Wallet gate | a dated signature, plus one real transaction on BNB Chain |
| Failures | closed: the monitor answers 401 without its secret, ask 403 without a wallet; a dead Binance read degrades to an empty board instead of failing the answer |
| Execution | none, on any path |
| Allowances | 10 per chat, 5 per wallet, 40 and 200 per connection, 500 product wide, daily |

---

## Roadmap

- [x] Read tokenized stocks straight off BNB Chain, pool and oracle side by side
- [x] A Telegram bot that answers commands and questions
- [x] A site agent behind a wallet signature, with the gate explained on the page
- [x] A monitor loop that alerts on divergence from the oracle
- [x] One conversation per wallet, shared between the chat and the site
- [x] The full tokenized stock universe on BNB Chain, with every issuer of a ticker priced side by side
- [x] Session and per asset state from Binance Web3, so premarket, overnight and halts are told apart
- [x] An agent surface other agents can hire: EIP-8004 card, ERC-8183 job interface, x402 priced read
- [ ] Register the agent identity on chain and switch the paywall on, once a payee address exists
- [ ] A repeat-offender list behind the allowances
- [ ] The last secrets out of query strings
- [ ] Swap the signed Web3 quote path on, once an API key is issued

<div align="center"><sub>Sessia is research, not advice. Nothing here signs for you.</sub></div>


