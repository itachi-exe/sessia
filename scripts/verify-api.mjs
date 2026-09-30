// Drives the real Vercel handler in-process with mocked requests, so the price
// path, the health probe and three bot commands can be read end to end without a
// deploy, a Telegram token or a webhook. Anything the bot would send is captured.
//
//   node scripts/verify-api.mjs

import { Buffer } from 'node:buffer';

process.env.TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || 'verify-token';
process.env.TELEGRAM_WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET || 'verify-secret';

const { default: handler } = await import('../api/index.js');

const sent = [];
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, options = {}) => {
  if (String(url).includes('api.telegram.org')) {
    const body = typeof options.body === 'string' ? JSON.parse(options.body) : (options.body ?? {});
    sent.push(String(body.text ?? ''));
    return { ok: true, status: 200, json: async () => ({ ok: true, result: { message_id: 1 } }), text: async () => '{"ok":true}' };
  }
  if (String(url).includes('/build/api/')) {
    // No Web3 API key exists in this environment; the signed path must report that
    // instead of hanging or inventing a quote.
    return { ok: false, status: 401, json: async () => ({ code: 40101, msg: 'API Key is required' }), text: async () => '{"code":40101}' };
  }
  return realFetch(url, options);
};

const call = async (path, { method = 'GET', body = null, headers = {} } = {}) => {
  const chunks = body ? [Buffer.from(JSON.stringify(body))] : [];
  // The handler reads the body through the Node stream interface, so the mock has
  // to speak both interfaces: async iterator and .on().
  const listeners = new Map();
  const request = {
    method,
    url: path,
    headers,
    on(event, listener) {
      if (!listeners.has(event)) listeners.set(event, []);
      listeners.get(event).push(listener);
      return request;
    },
    async *[Symbol.asyncIterator]() {
      for (const chunk of chunks) yield chunk;
    },
  };
  const emit = (event, value) => (listeners.get(event) ?? []).forEach((listener) => listener(value));
  const pump = async () => {
    for (const chunk of chunks) emit('data', chunk);
    emit('end');
  };
  let status = 0;
  let payload = null;
  const response = {
    setHeader() {},
    writeHead(code) { status = code; },
    status(code) { status = code; return this; },
    json(value) { payload = value; return this; },
    send(value) { payload = value; return this; },
    end(value) { if (value !== undefined && payload === null) { try { payload = JSON.parse(value); } catch { payload = value; } } },
  };
  // readBody attaches its listeners while the handler runs, so the body is pumped
  // on the next tick rather than synchronously.
  setTimeout(pump, 5);
  await handler(request, response);
  return { status, payload };
};
const check = (label, condition, detail) => {
  console.log(`${condition ? 'ok  ' : 'FAIL'}  ${label}${detail ? ` -> ${detail}` : ''}`);
  if (!condition) process.exitCode = 1;
};

// 1. Health must expose the new data layer without pretending to hold a key.
const health = await call('/api/health');
check('GET /api/health returns 200', health.status === 200, `status=${health.status}`);
check('health reports Binance market data', health.payload?.binanceMarketData?.reachable === true, JSON.stringify(health.payload?.binanceMarketData));
check('health reports the signed Web3 API as unconfigured', health.payload?.web3ApiSigned === false, `web3ApiSigned=${health.payload?.web3ApiSigned}`);

// 2. Price read: oracle plus session plus every issuer.
const price = await call('/api/price?ticker=NVDA');
check('GET /api/price returns 200', price.status === 200, `status=${price.status}`);
check('price carries an oracle read', Number.isFinite(price.payload?.oracle?.price), `oracle=${price.payload?.oracle?.price}`);
check('price carries a Binance session', typeof price.payload?.session?.label === 'string', `session=${price.payload?.session?.label}`);
check('price carries per-issuer reads', (price.payload?.venues?.venues?.length ?? 0) >= 2, JSON.stringify(price.payload?.venues?.venues?.map((venue) => `${venue.issuer} ${venue.price}`)));

const telegram = async (text) => {
  sent.length = 0;
  const result = await call('/api/telegram', {
    method: 'POST',
    headers: { 'x-telegram-bot-api-secret-token': process.env.TELEGRAM_WEBHOOK_SECRET },
    body: { update_id: Math.floor(Math.random() * 1e6), message: { message_id: 1, chat: { id: 424242 }, from: { first_name: 'verify' }, text } },
  });
  return { status: result.status, replies: [...sent] };
};

// 3. Bot commands.
const venues = await telegram('/venues NVDA');
check('/venues answers with an issuer board', venues.replies.some((text) => /Issuers are|BINANCE/i.test(text) || text.includes('bStocks')), venues.replies[0]?.split('\n').slice(0, 6).join(' | '));

const stocks = await telegram('/stocks NVDA');
check('/stocks searches the full registry', stocks.replies.some((text) => /match/i.test(text) && text.includes('NVDA')), stocks.replies[0]?.split('\n').slice(0, 4).join(' | '));

const priceCmd = await telegram('/price NVDA');
check('/price still answers with the oracle price', priceCmd.replies.some((text) => /Reference price/.test(text)), priceCmd.replies[0]?.split('\n').slice(0, 5).join(' | '));

const help = await telegram('/help');
check('/help lists the new commands', help.replies.some((text) => text.includes('/venues') && text.includes('/stocks')), help.replies[0]?.split('\n').length + ' lines');

console.log('\n--- sample replies ---');
for (const replyText of [venues.replies[0], stocks.replies[0], priceCmd.replies[0]].filter(Boolean)) {
  console.log(replyText);
  console.log('·');
}

// 4. Agent commerce: discovery document and the two paid routes.
const card = await call('/.well-known/agent-card.json');
check('agent card is served at the well known path', card.status === 200 && card.payload?.name === 'Sessia', `status=${card.status} name=${card.payload?.name}`);
check('agent card lists the ERC8183 and x402 services', (card.payload?.services ?? []).some((s) => s.name === 'ERC8183') && (card.payload?.services ?? []).some((s) => s.name === 'x402'), (card.payload?.services ?? []).map((s) => s.name).join(','));
check('agent card carries a registration file hash', /^0x[0-9a-f]{64}$/.test(card.payload?.hash ?? ''), card.payload?.hash);

const research = await call('/api/agent/research?ticker=NVDA');
const researchGate = research.payload?.challenge ?? research.payload?.would_charge ?? research.payload;
check('priced research route answers with a payment gate', research.status === 402 || research.status === 503, `status=${research.status} error=${research.payload?.error}`);
check('the gate prices one call in base units', BigInt(researchGate?.accepts?.[0]?.amount ?? '0') === 50000000000000000n, `amount=${researchGate?.accepts?.[0]?.amount}`);

const task = await call('/api/agent/task', { method: 'POST', body: { job_id: 1, chain_id: 56, input: 'NVDA' } });
check('ERC8183 task route answers a job with a gate of its own', task.status === 402 || task.status === 503, `status=${task.status} error=${task.payload?.error}`);
check('an unnamed job is refused with a reason', (await call('/api/agent/task', { method: 'POST', body: { input: 'NVDA' } })).status === 400, '');

process.exit(process.exitCode ?? 0);
