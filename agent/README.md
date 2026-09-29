# agent/

The conversational layer and its guardrails. This is the part that talks to the
model, so it is also the part that spends money, and every rule that keeps that
spend bounded lives here.

- `chat.js` gathers live evidence from BNB Chain and one feed, builds the prompt,
  and asks DeepSeek for the reply. The model never supplies a number: every figure
  in an answer comes from `public/data.mjs` reads.
- `limits.js` holds the daily allowances: 10 messages per Telegram chat, 5 per
  signed wallet that has chain history, and a product wide ceiling for the day.

Imported by `api/index.js`. Tests: `test/chat.test.mjs`, `test/limits.test.mjs`.
