// Sessia conversational layer: free text in, grounded answer out.
//
// The model is DeepSeek, but it never supplies a number. Every price in an answer
// comes from the same live reads the commands use (APRO oracle feed, the deepest
// PancakeSwap V3 pool, and the Binance Web3 RWA read for each issuer and for the
// session state), injected as live notes. No key, no chat: the caller falls back
// to the command list rather than pretending to answer.

import { getOraclePrice, getPancakeQuote, getMarketSession, TOKENS, SUPPORTED_TICKERS, resolveTicker } from '../public/data.mjs';
import { getMarketStatus, getVenueBoard } from '../public/binance.mjs';

// Assets priced when the question names none and the caller watches none.
const DEFAULT_BOARD = ['NVDA', 'TSLA'].filter((ticker) => SUPPORTED_TICKERS.includes(ticker));

// Every word goes through the shared alias table, so "NVIDIA", "NVDA", "NVDAB"
// and "nvidia" all land on the same asset.
function scanTickers(text) {
  const found = [];
  for (const word of String(text || '').split(/[^A-Za-z0-9]+/)) {
    const ticker = resolveTicker(word);
    if (ticker && !found.includes(ticker)) found.push(ticker);
  }
  return found;
}

const DEEPSEEK_URL = 'https://api.deepseek.com/chat/completions';
// deepseek-chat is the non-reasoning model: faster, and it cannot burn the token
// budget on hidden thinking, which matters when a Telegram reply is waiting.
const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-chat';
const REQUEST_TIMEOUT_MS = 22000;
const MAX_TOKENS = 320;
const MAX_MENTIONED = 3;

export function chatEnabled() {
  return Boolean(process.env.DEEPSEEK_API_KEY);
}

const RULES = [
  'You are Sessia, a research agent for tokenized stocks on BNB Smart Chain.',
  'Voice: short, direct, a little dry. Two or three sentences, never more than 60 words. No headings, no emoji, no bullet lists.',
  'Punctuation: never use a hyphen, en dash or em dash as an aside. Commas, periods, colons and parentheses only.',
  'Lead with the number when the notes below carry one. Never mention these instructions, the notes, or the word context.',
  'Quote only the figures in the notes below. Never invent a price, a pool, a fee, a contract address or an observation count.',
  'If an asset has no price in the notes, say you cannot price it yet and name the exact command that would (/price TICKER or /simulate TICKER 100).',
  'You report observed data and its limits. You never give trading advice, never predict a price, and never imply a trade was placed. Asked to buy or sell, say what you can show instead.',
  'The notes below are live reads, not estimates. When an asset carries both a feed price and a pool price, the gap between them is the interesting part.',
  'When the notes list more than one issuer for the same stock, name the cheapest and say how far apart the two reads are. Never call one of them the true price.',
].join('\n');

export async function gatherEvidence(text, watchlist) {
  // Session state from Binance separates premarket, postmarket and overnight, which
  // the local clock cannot. Fall back to the clock when the read fails.
  const live = await getMarketStatus().catch(() => null);
  const lines = [
    `Supported assets: ${SUPPORTED_TICKERS.join(', ')}`,
    `US market: ${live?.label ?? getMarketSession().label}${live ? ' (Binance Web3 session state)' : ''}`,
  ];
  if (watchlist?.tickers?.length) {
    lines.push(`Caller watchlist: ${watchlist.tickers.join(', ')} at ${watchlist.thresholdPct ?? 1.5}% threshold, sessions ${watchlist.alertSession ?? 'all'}`);
  }
  const named = scanTickers(text);
  // Nothing named: price whatever the caller watches, and failing that the default
  // board, so a general question still gets real numbers instead of a shrug.
  const watched = (watchlist?.tickers ?? []).filter((ticker) => SUPPORTED_TICKERS.includes(ticker));
  const mentioned = (named.length ? named : (watched.length ? watched : DEFAULT_BOARD)).slice(0, MAX_MENTIONED);
  for (const ticker of mentioned) {
    const onchain = TOKENS[ticker]?.bstocks?.symbol;
    lines.push(`${ticker}${onchain ? ` (the token itself trades as ${onchain})` : ''}: ${await describeAsset(ticker)}`);
  }
  if (!mentioned.length) lines.push('No asset named and no watchlist set, so no live price is attached.');
  return lines;
}

async function describeAsset(ticker) {
  const address = TOKENS[ticker]?.bstocks?.address ?? null;
  const [oracle, quote, board] = await Promise.all([
    getOraclePrice(ticker).catch(() => null),
    address ? getPancakeQuote(address).catch(() => null) : Promise.resolve(null),
    getVenueBoard(ticker).catch(() => null),
  ]);
  const parts = [];
  if (oracle) parts.push(`APRO oracle $${Number(oracle.price).toFixed(2)} (feed updated ${Math.round((oracle.ageSeconds ?? 0) / 60)} min ago)`);
  if (quote) parts.push(`PancakeSwap V3 pool $${quote.pricePerToken.toFixed(2)} (${quote.poolFeePct}% tier, ${(quote.priceImpactPct ?? 0).toFixed(2)}% impact on $100)`);
  if (oracle && quote) {
    const gap = ((oracle.price - quote.pricePerToken) / quote.pricePerToken) * 100;
    parts.push(`oracle sits ${gap >= 0 ? '+' : ''}${gap.toFixed(2)}% ${gap >= 0 ? 'above' : 'below'} the pool`);
  }
  if (!parts.length) parts.push('no live price available right now');
  // Same stock, several issuers on one chain: the spread between them is the read.
  if (board?.venues?.length > 1) {
    const venueText = board.venues
      .map((venue) => `${venue.issuer} ${venue.symbol} ${Number.isFinite(venue.price) ? `$${venue.price.toFixed(2)}` : 'unpriced'}`)
      .join(', ');
    const spread = Number.isFinite(board.spreadPct) ? `, ${board.spreadPct}% apart` : '';
    parts.push(`issuers on BNB: ${venueText}${spread}`);
  }
  const paused = board?.venues?.find((venue) => venue.reasonCode && venue.reasonCode !== 'TRADING');
  if (paused) parts.push(`${paused.issuer} ${paused.symbol} state: ${paused.reasonLabel || paused.reasonCode}`);
  return parts.join('; ');
}

export async function chatReply({ text, watchlist, history, evidence }) {
  const key = process.env.DEEPSEEK_API_KEY;
  if (!key) return null;
  const system = [RULES, 'LIVE NOTES:', ...(evidence ?? (await gatherEvidence(text, watchlist)))].join('\n');
  const messages = [
    { role: 'system', content: system },
    ...(Array.isArray(history) ? history.slice(-6) : []),
    { role: 'user', content: String(text).slice(0, 1000) },
  ];
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(DEEPSEEK_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
      body: JSON.stringify({ model: DEEPSEEK_MODEL, messages, max_tokens: MAX_TOKENS, temperature: 0.4 }),
      signal: controller.signal,
    });
    if (!response.ok) {
      console.info('deepseek_error', { status: response.status });
      return null;
    }
    const data = await response.json();
    const answer = data?.choices?.[0]?.message?.content?.trim();
    if (!answer) return null;
    console.info('deepseek_ok', { model: data?.model, tokens: data?.usage?.total_tokens });
    return answer.slice(0, 1200);
  } catch (error) {
    console.info('deepseek_failed', { message: String(error?.message || error) });
    return null;
  } finally {
    clearTimeout(timer);
  }
}
