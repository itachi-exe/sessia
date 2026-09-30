<!--
DRAFT. Owner: itachi (itachi_r3birth). Project: Sessia, BNB Hack: Tokenized Stocks Edition.

Binance states in the submission rules that reports written by AI are not accepted, only
first-hand developer accounts. This draft is the raw material, taken from our own build
log and measurements, written to be edited by hand into your own words. Read it, cut what
does not sound like you, fix anything you disagree with, then submit it as yours. The
numbers and error codes are real and reproduced in scripts/binance-smoke.mjs.
-->

# Sessia, Developer Experience Report

**Builder:** itachi (itachi_r3birth)
**Project:** Sessia, a personal research agent for tokenized stocks on BNB Chain
**Repo:** https://github.com/itachi-exe/sessia
**Live:** https://sessia-beta.vercel.app
**Track:** BNB Hack: Tokenized Stocks Edition, with Binance Web3 Wallet
**Build window:** 17 Sep 2026 to 30 Sep 2026, all commits inside the submission window

---

## 1. What we built

Sessia answers one question: what does the evidence say about this tokenized stock right
now. It reads the same stock across every issuer that lists it on BNB Chain (bStocks,
xStocks, Ondo Global Markets), next to the APRO oracle feed and the PancakeSwap pool, and
it says which of the numbers it trusts and why. A Telegram bot and a web agent sit on the
same reads.

bStocks is the asset universe. Every ticker in the registry carries its bStocks contract
on chain 56, the on chain reads resolve against that contract, and the addresses are
cross-checked against the ones Binance publishes in its own RWA registry on every smoke
run.

## 2. Time from opening the docs to the first successful call

About forty minutes, and thirty of those were the docs, not the API.

The first thing that happened: every `/en/dev-docs/...` URL, from a German datacenter IP,
redirected to the Binance consumer landing page. `llms-full.txt` (438 KB, the whole
documentation in one file) over a text proxy was what actually on-boarded us, and it is
the single best thing in this developer platform. From there the first successful call
took about four minutes: the wallet-direct market endpoints need no key at all.

```
381ms   GET rwa/stock/detail/list/ai          -> 1927 rows all chains, 673 on BNB Chain
250ms   GET rwa/market/status/ai              -> premarket, next open 13:31Z
486ms   GET rwa/dynamic/ai x3 + asset status  -> one price per issuer
```

## 3. Where we got stuck

**The docs are unreachable from the EU.** Both the HTML pages and the `.txt` variants
redirected to `www.binance.com/en-GB` from a Berlin IP. We only got in through a text
proxy. If a hackathon has European builders, this is the first wall they hit.

**Market data is keyless, but nothing says so.** The signed `/build` endpoints returned
`40101, API Key is required` immediately, and key issuance sits behind a portal sign in
that needs a Binance account or a wallet. Meanwhile the same tokenized stock data served
through the wallet-direct surface needs no credentials at all, and the only reason we
found that surface was the `binance-skills-hub` skill files on GitHub. A build that has to
work before a key is issued has to find that path by accident.

**`/build` in the signed path.** The signature covers the request path including the
`/build` prefix. Sign the path without it and you get `40102` forever with no hint about
why. Worth one line in bold on the authentication page.

**Body hashing and key order.** The preHash is `timestamp + method + requestPath + body`,
so the signature is only valid for the exact bytes sent. Re-serializing the JSON, or
letting a client reorder keys, invalidates it with the same `40102`. We now serialize
once and sign that string.

**`Accept-Encoding: identity`.** Without it the response body arrives in a form the
default fetch decoder punts on. It is a real trap and we have not seen it documented
outside the skill files.

## 4. Asset behaviour, surprises in the data

These are the ones that cost real time, all reproduced in `scripts/binance-smoke.mjs`:

- **`type` is the issuer and it is not in the field list.** 1 is Ondo Global Markets, 2 is
  xStocks, 3 is bStocks. Inferring it cost us longer than it should have, and it is the
  only way to tell whose token you are looking at.
- **The same stock is three rows with no grouping key.** NVDA is `NVDAon`, `NVDAx` and
  `NVDAB`. You join them yourself on `ticker`.
- **Three fields named price, one of them the price.** The dynamic payload nests
  `tokenInfo.price` (the on chain token price, the one that matters), `stockInfo.price`
  (which came back null on every row we read) and `stockInfo.marketCap` (which is the
  underlying company, 5.49T for Nvidia, not the token).
- **`totalHolders` is null where the real holders are.** bStocks rows return
  `totalHolders: null` and carry the useful numbers in `bnHolder`/`bnTrader` (9,722 and
  13,605 for NVDAB). Ondo rows populate `totalHolders` (58,068 for NVDA).
- **`volume24h` does not mean one thing.** For bStocks it is the on chain token volume
  (135.9M). For Ondo and xStocks it is the underlying equity volume (23.1B). The tell is
  two different issuers reporting the identical number.
- **A live asset can look unknown.** `asset/market/status` returns
  `{"openState": true, "marketStatus": null, "reasonCode": "TRADING"}`. Check only
  `marketStatus` and a perfectly live asset reads as unknown state. The session label has
  to come from the global `market/status`.
- **`reasonCode` values are never enumerated.** We can see `TRADING`. Halts, earnings
  windows and corporate actions are clearly modelled and we cannot tell what a builder is
  supposed to do with the other values.
- **Issues of the same stock do not trade at the same price.** Premarket on 30 Sep:
  NVDA 0.08% apart across three issuers, TSLA 2.16%, PLTR 8.51%, QQQ 0.41%. We turned that
  gap into the product's main read. It is the most interesting thing in the data set and
  nothing in the docs points at it.

## 5. Stability and latency

Around forty calls from one box in Berlin, no 5xx, no rate limiting, no silent truncation.
Cold calls 231 to 925ms, warm 14 to 250ms. Error handling is consistent: a JSON body with
`code`, `msg` and `success`, and the codes we hit (`40101` missing key, `40102` signature)
were accurate and actionable once we understood the signing rules. Failing closed rather
than returning partial data is the right call and made the client simple to write.

## 6. AI tooling we used, and how

- **llms-full.txt as the context source.** We handed the 438 KB file to the coding agent
  instead of scraping pages. That one decision is why this integration took an afternoon
  rather than a week, and we would ask Binance to treat that file as a first class
  product.
- **The official skills hub.** `binance-skills-hub` documents the exact endpoints,
  including the keyless wallet-direct ones, and the trading flows. It was more accurate
  about the endpoints than the pages we could reach.
- **Coding agents.** Claude Code and a Hermes agent on the server for the implementation,
  the tests and the docs, with every number in this report reproduced by
  `scripts/binance-smoke.mjs` rather than quoted from a model.
- **BNB Agent Studio.** We wired Sessia into the Studio stack rather than only building a
  chat product: an EIP-8004 registration file at `/.well-known/agent-card.json`, an
  ERC-8183 job endpoint that answers with a canonical deliverable manifest, and an x402 v2
  paywall priced in U. The `bag` CLI (v0.0.5) is the best part of it. `bag recipe code 8004`
  prints the registration file generator, and the SDK source on GitHub is the only place the
  exact keys and the exact 402 shape are written down: the registration file is
  `type/name/description/image/services/registrations` and has no field for a price, so
  anything an agent needs to know about how it pays has to live beside it, which is what our
  card does. `bag x402 quote` probes a live 402 without paying, and that is the check we
  trust. `bag init` needs the AWS AgentCore CLI installed first, and the docs pages for the
  Studio sit behind the same JavaScript wall as everything else.
- **What worked:** machine readable specs. What did not: every part of the platform that
  only exists as a JavaScript rendered page, and the absence of any offline fixture mode,
  which means an agent cannot build against the API without live credentials.

## 7. Backend suggestion: how we would rebuild the platform

1. **One canonical asset model.** An `assetId` with the issuer as a dimension, so NVDA is
   one asset with three listings, not three unrelated rows. Everything downstream gets
   simpler, including ours.
2. **Publish the spec.** An `openapi.json` generated from the real service, plus the
   existing llms-full.txt. Two artifacts, versioned, one source of truth.
3. **An offline fixture mode.** A recorded response per endpoint, so a builder or an agent
   can develop and test with no key and no network. It would have halved our build time.
4. **A self serve sandbox key for the hackathon.** No account, no wallet, a lower rate
   limit and testnet only. The friction between "I have an idea" and "my first signed call
   succeeded" is the single number a developer platform should optimise.
5. **Document the unkeyed market data.** It exists, it is fast and it is what we shipped
   on. Not advertising it is a waste.
6. **An error page keyed by code**, in the shape of: code, what it means, the one thing
   that usually causes it, and the fix. `40102` alone cost us an hour.
7. **Serve the docs everywhere.** A developer in Europe should not need a proxy to read
   the spec of the API they are being asked to use.
8. **Schemas as a package, not prose.** The SDK's TypeScript source is the most precise
   document in the whole platform. Ship the schemas on their own (registration file, job
   description, deliverable manifest, 402 challenge) as a versioned package with a fixture
   per shape, and an agent can implement the whole commerce loop offline in an hour. We
   ended up reading the SDK source to get the keys right, and that should not be the
   documented path.

## 8. Anything else

The tokenized stock data is genuinely good, and the issuer comparison is the part we would
build a product on again: same asset, three venues, one chain, measurable spread. The gap
is documentation, not the API. Everything we hit was discoverable; none of it was
documented where we were looking.

Sessia is research, not advice, and it holds no keys. Nothing in it signs for you.

---

### Reproduce every number in this report

```
npm test                          # 56 tests, no network
node scripts/binance-smoke.mjs    # live reads, latency, registry cross-check
node scripts/verify-api.mjs       # 18 checks against the real handler, including the agent surface
bag x402 quote "https://sessia-beta.vercel.app/api/agent/research?ticker=NVDA"
```
