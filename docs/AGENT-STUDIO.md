# BNB Agent Studio integration

Sessia is a research agent for tokenized stocks on BNB Chain. It is also a service: another
agent can discover it, pay for one research read, and take the answer away as a canonical
deliverable it can submit against an on-chain job.

Three pieces of the BNB Agent Studio stack are used, and they are used as the SDK defines
them, not as a lookalike:

| Studio stack | Where it lives in this repo | State |
| --- | --- | --- |
| ERC-8004 identity | `agent/agent-card.js`, served at `/.well-known/agent-card.json` | live |
| ERC-8183 task interface | `agent/erc8183.js`, `POST /api/agent/task` | live |
| x402 v2 payments | `agent/x402.js`, `GET /api/agent/research` | live, paywall needs one env var |

## What is actually on

`GET /.well-known/agent-card.json` returns the EIP-8004 registration file with a
capabilities block and the x402 route. An agent that reads it learns the name, the one
capability on sale, the price, the settlement asset and the two endpoints to call.

`POST /api/agent/task` takes a job description in the ERC-8183 wire shape, does the
research, and answers with a `DeliverableManifest` whose hash is taken over canonical JSON,
the same bytes the SDK hashes. The buyer can submit that hash on chain without
re-serialising anything.

`GET /api/agent/research?ticker=NVDA` is the priced read. Without an `X-PAYMENT` header it
answers 402 with one x402 v2 `accepts` entry: scheme `exact`, the U asset on BNB Chain, the
amount in base units as a string, a 300 second window, and the EIP-712 domain
(`extra.name`, `extra.version`) the buyer needs to sign. The seller checks chain, payee,
amount, expiry and envelope shape itself, then hands the envelope to the facilitator to
recover the signature. No facilitator, no service: an unconfigured paywall answers 503 with
`would_charge` instead of pretending a call was paid for.

Prices are strings on the wire. JavaScript cannot tell 2 from 2.0, and the whole point of the
manifest hash is that both sides agree byte for byte.

## What one Studio step switches on

The repo side is done and tested offline. Two things need the Studio CLI and a wallet, which
is why they are not in the deployed build yet:

1. **Identity.** Register the card so `registrations[]` stops being empty:
   `bag erc8004 register --network bsc-testnet --protocol A2A --endpoint https://sessia-beta.vercel.app/.well-known/agent-card.json --name Sessia --description "Research agent for tokenized stocks on BNB Chain"`
   Then set `SESSIA_AGENT_ID`, `SESSIA_IDENTITY_REGISTRY` and `SESSIA_AGENT_CHAIN_ID`, and
   the card publishes the registration on its own.
2. **Paywall.** Set `X402_PAY_TO` to the address that should receive the U, and
   `X402_FACILITATOR_URL` to the facilitator that settles. The 503 turns into a 402 and a
   buyer can pay.

## Verifying it without a wallet

The Studio CLI can probe a live 402 and show what a buyer would be asked to pay:

```
bag x402 quote "https://sessia-beta.vercel.app/api/agent/research?ticker=NVDA"
```

The same reads the endpoint would do are also in the test suite, which runs offline:
`node --test test/agent-commerce.test.mjs` covers the registration file keys, the 402
challenge shape, the terms checks, the manifest hash and the canonical JSON parity with
Python's `json.dumps`.

## What is deliberately not here

No agent wallet, no keystore and no private key live in this repo or on the server. The
identity and the payee are environment values, set once, read at request time. That is why
this integration can be shipped before the wallet exists.
