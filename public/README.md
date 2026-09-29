# public/

The site, served as static files. No build step, no bundler: everything here is
plain ES modules that the browser loads directly.

- `index.html` the landing page: live price strip, the recorded investigation
  scenario (labelled as recorded on purpose), the watch form and the desk.
- `agent.html` the agent page. Wallet gated: a visitor signs once a day and needs
  at least one transaction on BNB Chain, then gets 5 questions a day.
- `data.mjs` the chain layer the whole product shares: token registry, APRO feed
  reads, PancakeSwap pool discovery, V3 slot0 quotes, ticker and company name
  resolution. The server imports the same file, so the browser and the bot can
  never disagree about a price.
- `research-engine.mjs`, `agent-client.js`, `client.js`, `store.mjs` the page logic.
- `sessia-logo.svg` the mark used across the site.

Never put a key in this directory. Anything here is downloadable by anyone.
