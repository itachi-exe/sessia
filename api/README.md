# api/

Serverless functions. One entry point handles every route, which is what makes a
single `vercel.json` rewrite enough.

- `index.js` routing, the Telegram command layer, the natural language watch
  handling, and `POST /api/ask` for the website agent.
- `monitor.js` the deviation check that runs every five minutes and sends alerts,
  with a one hour cooldown per chat and ticker.
- `store.js` watchlists, observations and daily counters. Vercel Blob, with KV
  taking precedence when both are configured. Counters live here, so a restart
  cannot reset an allowance.

Everything here is server side only. No key from this layer ever reaches a browser.
