// Sessia server-side state: watchlists, Telegram chat ids, observations, alert cooldowns.
//
// Storage order:
//   1. Vercel KV (Upstash Redis REST) when KV_REST_API_URL + KV_REST_API_TOKEN are set
//   2. Vercel Blob (private store, one JSON document per key) when BLOB_READ_WRITE_TOKEN is set
//
// There is deliberately no process-memory fallback: it would imply persistence that
// does not exist. STORAGE_MODE reports which backend is actually writing.

import { put, get, del } from '@vercel/blob';

const KV_REST_URL = process.env.KV_REST_API_URL;
const KV_REST_TOKEN = process.env.KV_REST_API_TOKEN;
const BLOB_READ_WRITE_TOKEN = process.env.BLOB_READ_WRITE_TOKEN;

const KV_MODE = Boolean(KV_REST_URL && KV_REST_TOKEN);
const BLOB_MODE = !KV_MODE && Boolean(BLOB_READ_WRITE_TOKEN);

export const STORAGE_MODE = KV_MODE ? 'vercel-kv' : (BLOB_MODE ? 'vercel-blob' : 'unavailable');
export const KV_AVAILABLE = STORAGE_MODE !== 'unavailable';

const OBSERVATION_LIMIT = 288; // 24 hours at one sample every 5 minutes
const CHAT_HISTORY_LIMIT = 8;  // rolling turns kept per chat for follow-up questions
const TOMBSTONE = { deleted: true };

// ---------------------------------------------------------------- Vercel KV (Redis REST)

async function kvRequest(command, ...args) {
  if (!KV_MODE) return null;
  try {
    const res = await fetch(`${KV_REST_URL}/${command}/${args.map(encodeURIComponent).join('/')}`, {
      headers: { Authorization: `Bearer ${KV_REST_TOKEN}` },
    });
    if (!res.ok) return null;
    const json = await res.json();
    return json.result ?? null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- Vercel Blob (JSON documents)

function pathnameFor(key) {
  return `sessia/${key.replace(/[^a-zA-Z0-9._:-]/g, '_')}.json`;
}

async function blobWrite(key, value) {
  await put(pathnameFor(key), JSON.stringify(value), {
    access: 'private',
    addRandomSuffix: false,
    allowOverwrite: true,
    cacheControlMaxAge: 0,
  });
  return true;
}

async function blobRead(key) {
  try {
    const result = await get(pathnameFor(key), { access: 'private', useCache: false });
    if (!result || result.statusCode !== 200 || !result.stream) return null;
    const text = await new Response(result.stream).text();
    return JSON.parse(text);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- shared read/write/delete

async function readKey(key) {
  let value = null;
  if (KV_MODE) {
    const raw = await kvRequest('get', key);
    if (raw) { try { value = JSON.parse(raw); } catch { value = null; } }
  } else if (BLOB_MODE) {
    value = await blobRead(key);
  }
  if (value && value.deleted) return null;
  return value;
}

async function writeKey(key, value, ttlSeconds) {
  if (KV_MODE) {
    const result = ttlSeconds
      ? await kvRequest('setex', key, String(ttlSeconds), JSON.stringify(value))
      : await kvRequest('set', key, JSON.stringify(value));
    return result === 'OK';
  }
  if (BLOB_MODE) {
    try { return await blobWrite(key, value); } catch { return false; }
  }
  return false;
}

export async function deleteKey(key) {
  if (KV_MODE) { await kvRequest('del', key); return; }
  if (BLOB_MODE) {
    try { await del(pathnameFor(key)); return; } catch { /* fall through to tombstone */ }
    try { await blobWrite(key, TOMBSTONE); } catch { /* nothing left to do */ }
  }
}

function cooldownKey(chatId, ticker) {
  return `alert-cooldown-${chatId}-${String(ticker).toUpperCase()}`;
}

// ---------------------------------------------------------------- watchlists

export async function getWatchlist(chatId) {
  if (!chatId) return null;
  const doc = await readKey(`watchlist-${chatId}`);
  if (!doc || !Array.isArray(doc.tickers)) return null;
  return doc;
}

export async function setWatchlist(chatId, watchlist) {
  if (!chatId) return false;
  return writeKey(`watchlist-${chatId}`, watchlist);
}

export async function deleteWatchlist(chatId) {
  if (!chatId) return;
  await deleteKey(`watchlist-${chatId}`);
}

// ---------------------------------------------------------------- observations
// One rolling document per ticker instead of one key per sample: 288 docs per day
// would have been unlistable, and the baseline only needs the recent window.

export async function recordObservation(ticker, data) {
  const key = `obs-${String(ticker).toUpperCase()}`;
  const existing = await readKey(key);
  const samples = Array.isArray(existing?.samples) ? existing.samples : [];
  samples.push({ ...data, ticker: String(ticker).toUpperCase() });
  while (samples.length > OBSERVATION_LIMIT) samples.shift();
  await writeKey(key, { ticker: String(ticker).toUpperCase(), samples, updatedAt: Date.now() }, 86400 * 7);
}

export async function getObservations(ticker, limit = OBSERVATION_LIMIT) {
  const doc = await readKey(`obs-${String(ticker).toUpperCase()}`);
  const samples = Array.isArray(doc?.samples) ? doc.samples : [];
  return samples.slice(-limit);
}

// ---------------------------------------------------------------- alert cooldown

export async function isAlertSuppressed(chatId, ticker) {
  const doc = await readKey(cooldownKey(chatId, ticker));
  if (!doc) return false;
  const ttlSeconds = Number(doc.ttlSeconds ?? 3600);
  return Date.now() - Number(doc.at ?? 0) < ttlSeconds * 1000;
}

export async function suppressAlert(chatId, ticker, cooldownSeconds = 3600) {
  await writeKey(cooldownKey(chatId, ticker), { at: Date.now(), ttlSeconds: cooldownSeconds }, cooldownSeconds);
}

// ---------------------------------------------------------------- monitored chats

export async function getAllMonitoredChatIds() {
  const doc = await readKey('monitored-chats');
  if (Array.isArray(doc?.chatIds)) return doc.chatIds.map(String);
  if (Array.isArray(doc)) return doc.map(String);
  return [];
}

async function writeChatIds(ids) {
  await writeKey('monitored-chats', { chatIds: ids, updatedAt: Date.now() });
  return ids.length;
}

export async function addMonitoredChat(chatId) {
  const id = String(chatId);
  const ids = await getAllMonitoredChatIds();
  if (ids.includes(id)) return ids.length;
  return writeChatIds([...ids, id]);
}

export async function removeMonitoredChat(chatId) {
  const id = String(chatId);
  const ids = await getAllMonitoredChatIds();
  if (!ids.includes(id)) return ids.length;
  return writeChatIds(ids.filter((value) => value !== id));
}

// ---------------------------------------------------------------- status

// ---------------------------------------------------------------- web agent quota

// The public web agent spends the same DeepSeek key the Telegram bot uses, so each
// connection gets a daily allowance. Keyed by day, so the counter resets on its own.
// ------------------------------------------------------------------ telegram link
// A wallet and a Telegram chat can become one identity. The code is short lived and
// single use, and it only ever exists because a request carried a signature.
export async function setLinkCode(code, address, ttlSeconds = 900) {
  return writeKey(`link-code-${String(code).toUpperCase()}`, { address, at: Date.now(), ttlMs: ttlSeconds * 1000 }, ttlSeconds);
}

export async function takeLinkCode(code) {
  const key = `link-code-${String(code || '').toUpperCase()}`;
  const doc = await readKey(key);
  if (!doc?.address) return null;
  await deleteKey(key);
  // Expiry is decided here as well as by the store, so a driver without a clock
  // cannot keep a code alive past its window.
  if (Number.isFinite(doc.ttlMs) && Date.now() - Number(doc.at) > doc.ttlMs) return null;
  return doc.address;
}

export async function setChatWallet(chatId, address) {
  const wallet = String(address || '').toLowerCase();
  if (!wallet) return false;
  await writeKey(`link-wallet-${wallet}`, { chatId: String(chatId), at: Date.now() });
  return writeKey(`link-chat-${chatId}`, { address: wallet, at: Date.now() });
}

export async function getChatWallet(chatId) {
  const doc = await readKey(`link-chat-${chatId}`);
  return doc?.address || null;
}

export async function getWalletChat(address) {
  const doc = await readKey(`link-wallet-${String(address || '').toLowerCase()}`);
  return doc?.chatId || null;
}

// A linked wallet owns the thread, so the chat and the site read the same history.
export async function conversationKeyFor(chatId) {
  const linked = await getChatWallet(chatId);
  return linked ? `wallet-${linked}` : String(chatId);
}

export async function clearChatWallet(chatId, address) {
  await deleteKey(`link-chat-${chatId}`);
  if (address) await deleteKey(`link-wallet-${String(address).toLowerCase()}`);
}

export async function bumpAskUsage(ip, limit = 25) {
  const day = new Date().toISOString().slice(0, 10);
  const key = `ask-${String(ip || 'unknown').slice(0, 60)}-${day}`;
  const current = await readKey(key);
  const used = Number(current?.used ?? 0);
  if (used >= limit) return { allowed: false, used, limit };
  await writeKey(key, { used: used + 1, updatedAt: Date.now() }, 172800);
  return { allowed: true, used: used + 1, limit };
}

export async function probeStorage() {
  if (!KV_AVAILABLE) return { mode: STORAGE_MODE, ready: false };
  const stamp = Date.now();
  const wrote = await writeKey('health-probe', { stamp });
  if (!wrote) return { mode: STORAGE_MODE, ready: false };
  const readBack = await readKey('health-probe');
  return { mode: STORAGE_MODE, ready: readBack?.stamp === stamp };
}

// ---------------------------------------------------------------- chat history

export async function getChatHistory(chatId) {
  if (!chatId) return [];
  const doc = await readKey(`chat-${chatId}`);
  return Array.isArray(doc?.messages) ? doc.messages : [];
}

export async function appendChatMessage(chatId, role, content) {
  if (!chatId) return [];
  const messages = await getChatHistory(chatId);
  messages.push({ role, content: String(content).slice(0, 800) });
  while (messages.length > CHAT_HISTORY_LIMIT) messages.shift();
  await writeKey(`chat-${chatId}`, { messages, updatedAt: Date.now() }, 86400 * 14);
  return messages;
}
