// ---------------------------------------------------------------- rate limits
//
// Two doors spend the DeepSeek key: Telegram chats and the website agent. Each door
// is capped per day per identity, and the counters live in the same store as the
// watchlists, so a restart cannot reset them.
//
// The wallet door also asks the wallet to prove ownership with a signature and to
// have sent at least one transaction on BNB Chain, so a freshly made wallet cannot
// farm free answers.

import { bumpAskUsage } from './store.js';

export const TELEGRAM_DAILY_LIMIT = Number(process.env.TELEGRAM_DAILY_LIMIT || 10);
export const WALLET_DAILY_LIMIT = Number(process.env.WALLET_DAILY_LIMIT || 5);
export const ACCESS_PREFIX = 'Sessia agent access';

export function dayKey(now = Date.now()) {
  return new Date(now).toISOString().slice(0, 10);
}

// What the wallet signs. One signature covers a whole day, so a returning visitor
// is not asked to sign on every message.
export function accessChallenge(address, now = Date.now()) {
  return `${ACCESS_PREFIX}\n${String(address || '').toLowerCase()}\n${dayKey(now)}`;
}

// Telegram: every inbound message from a chat counts, command or question, so there
// is no wording that slips past the cap.
export async function consumeTelegramMessage(chatId, { limit = TELEGRAM_DAILY_LIMIT, now = Date.now(), counter = bumpAskUsage } = {}) {
  const usage = await counter(`tg-${chatId}`, limit);
  return { allowed: usage.allowed, used: usage.used, limit, remaining: Math.max(0, limit - usage.used) };
}

// Website agent: the allowance belongs to the wallet, not the browser, so clearing
// storage or opening a new tab buys nothing.
export async function consumeWalletMessage(address, { limit = WALLET_DAILY_LIMIT, now = Date.now(), counter = bumpAskUsage } = {}) {
  const usage = await counter(`wallet-${String(address || '').toLowerCase()}`, limit);
  return { allowed: usage.allowed, used: usage.used, limit, remaining: Math.max(0, limit - usage.used) };
}

export const BSC_RPC_URL = process.env.BSC_RPC_URL || 'https://bsc-dataseed.binance.org';

// How many transactions this address has ever sent. A wallet that only ever received
// funds reports 0, which is the point: fresh wallets cannot farm answers.
export async function transactionsSent(address, { rpcUrl = BSC_RPC_URL, fetcher = fetch } = {}) {
  const response = await fetcher(rpcUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_getTransactionCount', params: [address, 'latest'] }),
  });
  const data = await response.json();
  if (!data?.result) throw new Error('rpc_unavailable');
  return Number.parseInt(data.result, 16);
}

// Signature plus history. Returns a reason code and a line the page can show.
export async function verifyWalletAccess({ address, signature, now = Date.now(), verifier, rpcUrl = BSC_RPC_URL, fetcher = fetch } = {}) {
  const normalized = String(address || '').trim();
  if (!/^0x[0-9a-fA-F]{40}$/.test(normalized)) {
    return { ok: false, reason: 'invalid_address', message: 'Connect a BNB Chain wallet first.' };
  }
  if (!signature) {
    return { ok: false, reason: 'no_signature', message: 'Sign the access message to use the agent.', challenge: accessChallenge(normalized, now) };
  }
  const challenge = accessChallenge(normalized, now);
  const check = verifier || (await import('viem')).verifyMessage;
  const valid = await Promise.resolve(check({ address: normalized, message: challenge, signature })).catch(() => false);
  if (!valid) {
    return { ok: false, reason: 'bad_signature', message: 'That signature does not match the wallet.', challenge };
  }
  let sent = 0;
  try {
    sent = await transactionsSent(normalized, { rpcUrl, fetcher });
  } catch {
    return { ok: false, reason: 'rpc_unavailable', message: 'The chain is not answering right now. Try again in a moment.' };
  }
  if (sent < 1) {
    return { ok: false, reason: 'no_transactions', message: 'This wallet has never sent a transaction on BNB Chain, so it cannot use the agent.' };
  }
  return { ok: true, address: normalized.toLowerCase(), transactions: sent };
}


