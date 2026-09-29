import { runMonitoringCycle } from './monitor.js';
import {
  getWatchlist, setWatchlist, deleteWatchlist,
  addMonitoredChat, removeMonitoredChat, KV_AVAILABLE, STORAGE_MODE, probeStorage,
  getChatHistory, appendChatMessage, bumpAskUsage,
} from './store.js';
import { chatEnabled, chatReply, gatherEvidence } from './chat.js';
import { getOraclePrice, getPancakeQuote, simulateTrade, getMarketSession, TOKENS, SUPPORTED_TICKERS, resolveTicker } from '../public/data.mjs';

const BOT_USERNAME = 'Sessia_BNBAI_bot';
const TELEGRAM_API = 'https://api.telegram.org';

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  response.end(JSON.stringify(payload));
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    request.on('data', (chunk) => chunks.push(chunk));
    request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    request.on('error', reject);
  });
}

async function telegram(method, body) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error('bot unavailable');
  const res = await fetch(`${TELEGRAM_API}/bot${token}/${method}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`telegram ${method} failed: ${res.status}`);
  return res.json();
}

async function reply(chatId, text) {
  return telegram('sendMessage', { chat_id: chatId, text, parse_mode: 'Markdown' });
}

// Parse ticker list from user message
function parseTickers(text) {
  return text.toUpperCase().split(/[\s,]+/).map((t) => resolveTicker(t)).filter(Boolean);
}

// Parse threshold from message e.g. "2%" → 2, "1.5" → 1.5
function parseThreshold(text) {
  const m = text.match(/(\d+(?:\.\d+)?)\s*%/);
  return m ? parseFloat(m[1]) : null;
}

function tickerList() {
  return SUPPORTED_TICKERS.map((t) => `• *${t}* — ${TOKENS[t].name}`).join('\n');
}

async function handleBotMessage(chatId, text, username) {
  const lower = text.toLowerCase().trim();

  // /start — welcome and onboarding
  if (lower.startsWith('/start')) {
    const watchlist = await getWatchlist(chatId);
    if (watchlist?.tickers?.length) {
      await reply(chatId,
        `Welcome back to *Sessia*, ${username || 'Researcher'}.\n\n` +
        `You're watching: *${watchlist.tickers.join(', ')}*\n` +
        `Alert threshold: *${watchlist.thresholdPct ?? 1.5}%* deviation\n` +
        `Session filter: *${watchlist.alertSession ?? 'all'}*\n\n` +
        `Send a ticker to get current prices, or type /watch to update your watchlist.`
      );
    } else {
      await reply(chatId,
        `👋 *Sessia* — Personalized Research Agent for Tokenized Stocks on BNB Chain.\n\n` +
        `I watch seven tokenized stocks on BNB Chain, priced by the APRO on-chain feed and the PancakeSwap pools where they trade, and I alert you when a price drifts.\n\n` +
        `*Supported assets:*\n${tickerList()}\n\n` +
        `To start, tell me what to watch:\n` +
        `_/watch NVDA TSLA_\n\n` +
        `Or ask for a live price:\n` +
        `_/price NVDA_`
      );
    }
    return;
  }

  // /help
  if (lower.startsWith('/help')) {
    await reply(chatId,
      `*Sessia Commands*\n\n` +
      `/price NVDA — Live oracle price + market session\n` +
      `/watch NVDA TSLA — Set your watchlist\n` +
      `/threshold 2% — Set alert threshold (default 1.5%)\n` +
      `/session closed — Alert only when US market is closed\n` +
      `/session open — Alert only when US market is open\n` +
      `/session all — Alert any time (default)\n` +
      `/watchlist — Show your current watchlist\n` +
      `/simulate NVDA 100 — Simulate a $100 trade\n` +
      `/stop — Stop monitoring\n\n` +
      `_Sessia uses APRO Oracle on BSC for reference prices._`
    );
    return;
  }

  // /price TICKER
  if (lower.startsWith('/price')) {
    const parts = text.trim().split(/\s+/);
    const ticker = resolveTicker(parts[1]);
    if (!ticker) {
      await reply(chatId, `Supported tickers:\n${tickerList()}\n\nUsage: /price NVDA`);
      return;
    }
    const [oracle, session] = await Promise.all([getOraclePrice(ticker), Promise.resolve(getMarketSession())]);
    if (!oracle) {
      await reply(chatId, `⚠️ Could not fetch price for *${ticker}* right now. Oracle may be updating. Try again in a minute.`);
      return;
    }
    const token = TOKENS[ticker];
    await reply(chatId,
      `*${ticker} / ${token.name}*\n\n` +
      `*Reference price:* $${oracle.price.toFixed(2)}\n` +
      `*Source:* ${oracle.source}\n` +
      `*Updated:* ${Math.round(oracle.ageSeconds / 60)} min ago\n` +
      `*Session:* ${session.label}\n` +
      `${oracle.stale ? '⚠️ _Data may be stale — oracle not updated recently._' : ''}\n\n` +
      `_Use /simulate ${ticker} 100 to model a $100 trade._`
    );
    return;
  }

  // /watch TICKER [TICKER...]
  // Boundary required: '/watchlist' must fall through to its own handler below.
  if (/^\/watch(\s|$)/.test(lower)) {
    if (!KV_AVAILABLE) {
      await reply(chatId, 'Watchlist storage is not configured yet. Please try again shortly.');
      return;
    }
    const parts = text.trim().split(/\s+/);
    parts.shift(); // remove /watch
    const tickers = parts.map((t) => resolveTicker(t)).filter(Boolean);
    if (!tickers.length) {
      await reply(chatId, `Tell me which assets to watch. Example:\n/watch NVDA TSLA META\n\nSupported:\n${tickerList()}`);
      return;
    }
    const existing = await getWatchlist(chatId) ?? {};
    const updated = { ...existing, tickers, alertSession: existing.alertSession ?? 'all', thresholdPct: existing.thresholdPct ?? 1.5 };
    await setWatchlist(chatId, updated);
    await addMonitoredChat(chatId);
    await reply(chatId,
      `✅ *Watchlist updated.*\n\n` +
      `Watching: *${tickers.join(', ')}*\n` +
      `Alert threshold: *${updated.thresholdPct}%* deviation\n` +
      `Session: *${updated.alertSession}*\n\n` +
      `I'll alert you when a deviation exceeds your threshold.\n` +
      `Use /threshold to adjust sensitivity.`
    );
    return;
  }

  // /threshold 2%
  if (lower.startsWith('/threshold')) {
    const t = parseThreshold(text);
    if (!t || t < 0.1 || t > 20) {
      await reply(chatId, `Set a threshold between 0.1% and 20%.\nExample: /threshold 2%`);
      return;
    }
    const existing = await getWatchlist(chatId) ?? { tickers: [], alertSession: 'all' };
    await setWatchlist(chatId, { ...existing, thresholdPct: t });
    await reply(chatId, `✅ Alert threshold set to *${t}%* deviation.`);
    return;
  }

  // /session closed|open|all
  if (lower.startsWith('/session')) {
    const parts = lower.split(/\s+/);
    const mode = parts[1];
    if (!['closed', 'open', 'all'].includes(mode)) {
      await reply(chatId, `Valid options: /session closed | /session open | /session all`);
      return;
    }
    const existing = await getWatchlist(chatId) ?? { tickers: [], thresholdPct: 1.5 };
    await setWatchlist(chatId, { ...existing, alertSession: mode });
    const desc = mode === 'closed' ? 'when the US market is closed only'
      : mode === 'open' ? 'when the US market is open only'
      : 'at any time';
    await reply(chatId, `✅ Sessia will alert you *${desc}*.`);
    return;
  }

  // /watchlist — show current config
  if (lower.startsWith('/watchlist')) {
    const wl = await getWatchlist(chatId);
    if (!wl?.tickers?.length) {
      await reply(chatId, `You have no active watchlist. Use /watch NVDA TSLA to start monitoring.`);
      return;
    }
    await reply(chatId,
      `*Your Sessia Watchlist*\n\n` +
      `Assets: *${wl.tickers.join(', ')}*\n` +
      `Threshold: *${wl.thresholdPct ?? 1.5}%*\n` +
      `Session filter: *${wl.alertSession ?? 'all'}*\n\n` +
      `Use /price NVDA for current data, or /simulate NVDA 100 to model a trade.`
    );
    return;
  }

  // /simulate TICKER [AMOUNT]
  if (lower.startsWith('/simulate')) {
    const parts = text.trim().split(/\s+/);
    const ticker = resolveTicker(parts[1]);
    const amount = parseFloat(parts[2]) || 100;
    if (!ticker) {
      await reply(chatId, `Usage: /simulate NVDA 100\n\nSupported:\n${tickerList()}`);
      return;
    }
    const token = TOKENS[ticker];
    const dexAddress = token?.bstocks?.address || token?.xstocks?.address;
    const [oracle, dexQuote] = await Promise.all([
      getOraclePrice(ticker),
      dexAddress ? getPancakeQuote(dexAddress, amount) : Promise.resolve(null),
    ]);
    if (!oracle) {
      await reply(chatId, `⚠️ Could not get oracle price for *${ticker}* right now.`);
      return;
    }
    if (!dexQuote) {
      await reply(chatId,
        `*${ticker} — Simulation (oracle only)*\n\n` +
        `Reference price: *$${oracle.price.toFixed(2)}*\n` +
        `No on-chain DEX quote available for this issuer yet.\n` +
        `${dexAddress ? '' : '_No BSC token address registered for this asset._'}`
      );
      return;
    }
    const sim = simulateTrade({
      refPrice: oracle.price,
      dexPrice: dexQuote.pricePerToken,
      tradeUSDT: amount,
      feePct: dexQuote.poolFeePct ?? 0.25,
      extraSlippagePct: dexQuote.priceImpactPct ?? 0,
    });
    const session = getMarketSession();
    await reply(chatId,
      `*${ticker} — $${amount} Trade Simulation*\n\n` +
      `*Oracle ref price:* $${oracle.price.toFixed(2)}\n` +
      `*DEX market price:* $${dexQuote.pricePerToken.toFixed(2)}\n` +
      `*Apparent deviation:* ${sim.deviationPct > 0 ? '+' : ''}${sim.deviationPct}%\n` +
      `*Route:* ${dexQuote.route}\n` +
      `*Price impact:* ${(dexQuote.priceImpactPct ?? 0).toFixed(3)}%\n\n` +
      `*Cost breakdown:*\n` +
      `  Route fee: ${sim.routeFeePct}%\n` +
      `  Est. slippage: ${sim.slippagePct}%\n` +
      `  Total cost: ${sim.totalCostPct}%\n\n` +
      `*Est. remaining edge:* ${sim.remainingPct > 0 ? '+' : ''}${sim.remainingPct}%\n` +
      `*Est. output:* $${sim.estimatedOutput}\n\n` +
      `*Session:* ${session.label}\n\n` +
      `_${sim.note}_`
    );
    return;
  }

  // /stop — remove monitoring
  if (lower.startsWith('/stop')) {
    await deleteWatchlist(chatId);
    await removeMonitoredChat(chatId);
    await reply(chatId, `Sessia monitoring stopped. Your watchlist has been cleared.\n\nUse /start anytime to begin again.`);
    return;
  }

  // Free text: the conversational layer answers first when it is configured.
  // Anything it states is grounded in the same on-chain reads the commands use,
  // and a failed or missing model call falls through to the command list below.
  const mentionedTickers = parseTickers(text);

  // Natural language watch: "monitor NVIDIA and alert me if anything goes wrong".
  // An action beats a paragraph, so this sets the rule instead of describing it.
  // Guarded against questions ("should I watch NVDA?") which belong to the chat.
  const asksToWatch = /\b(monitor|watch|track|alert|notify|keep an eye|let me know)\b/i.test(text);
  const opensAsQuestion = /^\s*(should|would|could|why|what|how|when|whether|is|are|does|do|can)\b/i.test(text);
  if (asksToWatch && !opensAsQuestion && mentionedTickers.length && KV_AVAILABLE) {
    const existing = await getWatchlist(chatId) ?? {};
    const thresholdPct = parseThreshold(text) ?? existing.thresholdPct ?? 1.5;
    const tickers = [...new Set([...(existing.tickers ?? []), ...mentionedTickers])];
    await setWatchlist(chatId, { ...existing, tickers, alertSession: existing.alertSession ?? 'all', thresholdPct });
    await addMonitoredChat(chatId);
    const prices = await Promise.all(tickers.map((ticker) => getOraclePrice(ticker).then((p) => p?.price ?? null).catch(() => null)));
    const now = tickers.map((ticker, i) => (prices[i] ? `${ticker} $${Number(prices[i]).toFixed(2)}` : ticker)).join(', ');
    await reply(chatId, `Watching *${tickers.join(', ')}*. Right now: ${now}. I stay quiet unless one moves ${thresholdPct}% from its reference price, any session. Change the bar with /threshold ${thresholdPct}.`);
    return;
  }
  if (chatEnabled()) {
    const chatWatchlist = await getWatchlist(chatId);
    const history = await getChatHistory(chatId);
    const answer = await chatReply({ text, watchlist: chatWatchlist, history });
    if (answer) {
      await reply(chatId, answer);
      await appendChatMessage(chatId, 'user', text);
      await appendChatMessage(chatId, 'assistant', answer);
      return;
    }
  }

  if (mentionedTickers.length) {
    await reply(chatId,
      `I see you mentioned *${mentionedTickers.join(', ')}*.\n\n` +
      `Try:\n` +
      `/price ${mentionedTickers[0]} — Current oracle price\n` +
      `/watch ${mentionedTickers.join(' ')} — Add to watchlist\n` +
      `/simulate ${mentionedTickers[0]} 100 — Model a $100 trade`
    );
    return;
  }

  // Default
  await reply(chatId,
    `Sessia is monitoring tokenized stocks on BNB Chain.\n\n` +
    `Ask me anything in plain text, or use a command:\n` +
    `/watch /price /simulate /watchlist /threshold /session /help\n\n` +
    `Supported assets: ${SUPPORTED_TICKERS.join(', ')}`
  );
}

async function handleTelegramUpdate(request, response) {
  const webhookSecretMatches = Boolean(process.env.TELEGRAM_WEBHOOK_SECRET)
    && request.headers['x-telegram-bot-api-secret-token'] === process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!process.env.TELEGRAM_BOT_TOKEN || !webhookSecretMatches) {
    console.info('telegram_webhook_rejected', { hasToken: Boolean(process.env.TELEGRAM_BOT_TOKEN), webhookSecretMatches });
    sendJson(response, 401, { ok: false }); return;
  }

  const raw = await readBody(request);
  let update = null;
  try { update = JSON.parse(raw); } catch { /* ignore */ }

  const message = update?.message;
  const chatId = message?.chat?.id;
  const text = String(message?.text || '');
  const username = message?.from?.first_name || message?.from?.username || '';
  console.info('telegram_webhook_received', { hasChat: Boolean(chatId), textLen: text.length, updateId: update?.update_id });

  if (chatId && text) {
    try {
      await handleBotMessage(chatId, text, username);
    } catch (err) {
      console.error('bot_handler_error', err?.message);
      try { await reply(chatId, 'Something went wrong. Please try again.'); } catch { /* ignore */ }
    }
  }
  sendJson(response, 200, { ok: true });
}

async function configureTelegram(request, response, url) {
  if (url.searchParams.get('key') !== process.env.TELEGRAM_SETUP_SECRET || !process.env.TELEGRAM_BOT_TOKEN) {
    sendJson(response, 401, { ok: false }); return;
  }
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const webhookUrl = `${url.origin}/api/telegram`;

  // Set bot photo from base64-encoded PNG env var (set once via vercel env add)
  if (process.env.BOT_PHOTO_B64) {
    try {
      const photoBytes = Buffer.from(process.env.BOT_PHOTO_B64, 'base64');
      const form = new FormData();
      form.append('photo', new Blob([photoBytes], { type: 'image/png' }), 'sessia-logo.png');
      await fetch(`https://api.telegram.org/bot${token}/setMyPhoto`, { method: 'POST', body: form });
    } catch { /* non-fatal */ }
  }

  await telegram('setMyDescription', { description: 'Sessia is a personalized research agent for tokenized stocks on BNB Smart Chain. Monitor signals, investigate deviations, and receive evidence-backed research alerts.' });
  await telegram('setMyShortDescription', { short_description: 'Personalized tokenized-stock research on BNB Smart Chain.' });
  await telegram('setMyCommands', { commands: [
    { command: 'start', description: 'Begin with Sessia' },
    { command: 'watch', description: 'Set your watchlist (e.g. /watch NVDA TSLA)' },
    { command: 'price', description: 'Live oracle price (e.g. /price NVDA)' },
    { command: 'simulate', description: 'Model a trade (e.g. /simulate NVDA 100)' },
    { command: 'watchlist', description: 'View your current watchlist' },
    { command: 'threshold', description: 'Set alert threshold (e.g. /threshold 2%)' },
    { command: 'session', description: 'Filter by session: closed / open / all' },
    { command: 'stop', description: 'Stop monitoring and clear watchlist' },
    { command: 'help', description: 'Full command reference' },
  ] });
  await telegram('setWebhook', { url: webhookUrl, secret_token: process.env.TELEGRAM_WEBHOOK_SECRET, allowed_updates: ['message'], drop_pending_updates: true });
  const webhookInfo = await telegram('getWebhookInfo', {});
  sendJson(response, 200, { ok: true, bot: BOT_USERNAME, webhookConfigured: webhookInfo?.result?.url === webhookUrl });
}

async function handleMonitor(request, response) {
  // Verify cron secret or admin key
  const cronSecret = process.env.CRON_SECRET;
  const provided = request.headers['authorization']?.replace('Bearer ', '') || new URL(request.url, 'https://x').searchParams.get('key');
  if (cronSecret && provided !== cronSecret) {
    sendJson(response, 401, { ok: false, message: 'unauthorized' }); return;
  }
  try {
    const result = await runMonitoringCycle();
    console.info('monitor_cycle_complete', result);
    sendJson(response, 200, { ok: true, ...result });
  } catch (err) {
    console.error('monitor_cycle_error', err?.message);
    sendJson(response, 500, { ok: false, message: 'Monitor cycle failed.' });
  }
}

async function handlePriceApi(request, response, url) {
  const ticker = url.searchParams.get('ticker')?.toUpperCase();
  const resolved = ticker ? resolveTicker(ticker) : null;
  if (!resolved) {
    sendJson(response, 400, { ok: false, message: 'Invalid ticker', supported: SUPPORTED_TICKERS });
    return;
  }
  const [oracle, session] = await Promise.all([getOraclePrice(resolved), Promise.resolve(getMarketSession())]);
  sendJson(response, oracle ? 200 : 503, { ok: Boolean(oracle), ticker: resolved, oracle, session });
}

// ---------------------------------------------------------------- web agent

const ASK_MAX_CHARS = 400;
const ASK_DAILY_LIMIT = 25;

function clientIp(request) {
  const forwarded = request.headers['x-forwarded-for'];
  return String(Array.isArray(forwarded) ? forwarded[0] : (forwarded || 'unknown')).split(',')[0].trim();
}

// The site's agent page posts here. Same grounded answer the Telegram bot gives,
// with the raw reads returned alongside so the page can show its work.
async function handleAskApi(request, response) {
  const raw = await readBody(request);
  let payload = null;
  try { payload = JSON.parse(raw || '{}'); } catch { payload = null; }
  const message = String(payload?.message ?? '').trim().slice(0, ASK_MAX_CHARS);
  if (message.length < 2) {
    sendJson(response, 400, { ok: false, message: 'Ask about one of the supported assets.' });
    return;
  }
  if (!chatEnabled()) {
    sendJson(response, 503, { ok: false, message: 'The agent is not configured right now.' });
    return;
  }
  const quota = await bumpAskUsage(clientIp(request), ASK_DAILY_LIMIT);
  if (!quota.allowed) {
    sendJson(response, 429, { ok: false, message: `That is the daily limit (${quota.limit}) for this connection. The Telegram bot has no limit.` });
    return;
  }
  const evidence = await gatherEvidence(message, null);
  const reply = await chatReply({ text: message, watchlist: null, history: [], evidence });
  if (!reply) {
    sendJson(response, 503, { ok: false, message: 'The agent could not answer just now. Try again in a moment.' });
    return;
  }
  sendJson(response, 200, { ok: true, reply, evidence: evidence.slice(1), reads: quota.used, limit: quota.limit });
}

export default async function handler(request, response) {
  try {
    const url = new URL(request.url, 'https://sessia-beta.vercel.app');

    if (url.pathname === '/api/health') {
      const storage = await probeStorage();
      sendJson(response, 200, {
        status: 'ready', chainId: 56,
        dataMode: storage.ready ? `live-${storage.mode}` : 'stateless',
        storageMode: storage.mode,
        storageReady: storage.ready,
        telegram: Boolean(process.env.TELEGRAM_BOT_TOKEN),
        agent: chatEnabled(),
        kvConfigured: KV_AVAILABLE,
        walletExecution: false,
        supportedAssets: SUPPORTED_TICKERS,
      });
      return;
    }

    if (url.pathname === '/api/telegram' && request.method === 'POST') {
      await handleTelegramUpdate(request, response); return;
    }
    if (url.pathname === '/api/telegram/setup' && request.method === 'POST') {
      await configureTelegram(request, response, url); return;
    }
    if (url.pathname === '/api/monitor') {
      await handleMonitor(request, response); return;
    }
    if (url.pathname === '/api/price') {
      await handlePriceApi(request, response, url); return;
    }
    if (url.pathname === '/api/ask' && request.method === 'POST') {
      await handleAskApi(request, response); return;
    }

    response.writeHead(302, { location: '/index.html', 'cache-control': 'no-store' }); response.end();
  } catch (err) {
    console.error('handler_error', err?.message);
    sendJson(response, 500, { status: 'unavailable', message: 'Service temporarily unavailable.' });
  }
}
