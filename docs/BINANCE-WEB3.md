# Binance Web3 integration

Two surfaces, deliberately split. Market data needs no credentials, so Sessia works with
an empty environment. Execution-flavoured endpoints are signed and switch on with a key.

| Surface | Host | Auth | Used for |
| --- | --- | --- | --- |
| Wallet-direct market data | `www.binance.com/bapi/defi/...` | none | registry, session, per issuer prices, candles, fundamentals |
| Signed Web3 API | `web3.binance.com/build/...` | `X-OC-APIKEY` + HMAC | aggregated quotes, swaps, RWA price batch |

Code map:

| File | What it does |
| --- | --- |
| `public/binance.mjs` | the unkeyed market data layer, with in-process caching and degradation |
| `agent/w3w.js` | the signed client: signature, headers, error mapping, quote summarising |
| `test/binance-market.test.mjs` | shapes, headers, caching, failure paths |
| `test/w3w-signing.test.mjs` | signature vectors, header contract, error codes |
| `scripts/binance-smoke.mjs` | live reads with latency, and the registry cross-check |
| `scripts/verify-api.mjs` | drives the real handler end to end, including three bot commands |

## Market data endpoints in use

All of them on chain 56, all of them live in the product.

| Endpoint | What Sessia takes from it |
| --- | --- |
| `GET /bapi/defi/v1/public/wallet-direct/buw/wallet/market/token/rwa/stock/detail/list/ai` | the tokenized stock registry: symbol, ticker, chain, contract, `type` (issuer) |
| `GET .../rwa/market/status/ai` | the US session: premarket, regular, postmarket, overnight, closed, next open |
| `GET .../rwa/asset/market/status/ai?chainId=56&contractAddress=` | per asset state and `reasonCode`, so a halt or a corporate action is never read as a dislocation |
| `GET /bapi/defi/v2/public/wallet-direct/buw/wallet/market/token/rwa/dynamic/ai?chainId=56&contractAddress=` | token price, 24h change, holders, traders, multiplier, and the underlying fundamentals |
| `GET .../rwa/meta/ai?chainId=56&contractAddress=` | company profile and the proof of collateral attestation for the issuer |
| `GET .../dex/market/token/kline/ai?chainId=56&contractAddress=&interval=1h&limit=` | candles |

Two things every caller needs:

1. Send `Accept-Encoding: identity`. Without it the body arrives in a form the default
   fetch decoder mishandles.
2. Send a normal browser User-Agent. The edge answers a plain client with an empty body.

## Signed endpoints in use

`agent/w3w.js` implements the signing contract: preHash is
`timestamp + METHOD + requestPath + body`, HMAC-SHA256, base64, with the `/build` prefix
inside the signed path. Headers: `X-OC-APIKEY`, `X-OC-TIMESTAMP` (ISO8601 with
milliseconds), `X-OC-SIGN`, optional `X-OC-RECV-WINDOW` (default 5000, max 60000) and
`X-OC-NONCE`.

| Endpoint | Purpose | State |
| --- | --- | --- |
| `GET /build/api/v1/dex/market/rwa/tokens` | registry through the signed surface | implemented, needs a key |
| `GET /build/api/v1/dex/market/rwa/price` | token price plus underlying reference price | implemented, needs a key |
| `GET /build/api/v1/dex/market/rwa/underlying-market` | underlying market state | implemented, needs a key |
| `GET /build/api/v1/dex/aggregator/quote` | aggregated quote, SWAP and RFQ modes | implemented, needs a key |
| `GET /build/api/v1/dex/aggregator/swap` | swap calldata for a quote id | implemented, needs a key |
| `GET /build/api/v1/dex/aggregator/supported/chain` | supported chains | implemented, needs a key |

Without `W3W_API_KEY` and `W3W_SECRET_KEY` the client reports itself unconfigured and
`/api/health` answers `"web3ApiSigned": false`. Nothing falls back to a fabricated number:
the research path uses the unkeyed surface, and a signed call that is wanted but not
configured fails loudly with `NOT_CONFIGURED`.

Key issuance is behind the Web3 API developer portal and needs a Binance account or a
wallet, so the repo is built to be fully useful before a key exists and to gain the quote
path the moment one is added. That is the honest state of the integration rather than a
claim that the signed path runs in production.

## The read that matters

Sessia's main output is a comparison, not a number. For NVDA, on one chain, on 30 Sep 2026
premarket:

| Issuer | Symbol | Price | Holders | State |
| --- | --- | --- | --- | --- |
| Ondo Global Markets | NVDAon | $228.17 | 58,068 | premarket |
| xStocks (Backed Finance) | NVDAx | $227.99 | 16 | premarket |
| bStocks (Binance) | NVDAB | $228.11 | 9,722 | premarket |

0.08% apart. On TSLA the same read was 2.16%, on PLTR 8.51%, on QQQ 0.41%. The spread is
the product: the same claim on the same chain, priced three times.
