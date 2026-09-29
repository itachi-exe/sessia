// Sessia conversational layer: free text in, grounded answer out.
//
// The model is DeepSeek, but it never supplies a number. Every price in an answer
// comes from the same on-chain reads the commands use (APRO oracle feed plus the
// deepest PancakeSwap V3 pool), injected as CONTEXT. No key, no chat: the caller
// falls back to the command list rather than pretending to answer.

import { getOraclePrice, getPancakeQuote, TOKENS, SUPPORTED_TICKERS } from '../public/data.mjs';

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
].join('\n');

async function buildContext(text, watchlist) {
  const lines = [`Supported assets: ${SUPPORTED_TICKERS.join(', ')}`];
  if (watchlist?.tickers?.length) {
    lines.push(`Caller watchlist: ${watchlist.tickers.join(', ')} at ${watchlist.thresholdPct ?? 1.5}% threshold, sessions ${watchlist.alertSession ?? 'all'}`);
  }
  const named = SUPPORTED_TICKERS.filter((ticker) => new RegExp(`\\b${ticker}(?:B|x)?\\b`, 'i').test(text));
  // Nothing named in the question: price whatever the caller watches instead of answering blind.
  const watched = (watchlist?.tickers ?? []).filter((ticker) => SUPPORTED_TICKERS.includes(ticker));
  const mentioned = (named.length ? named : watched).slice(0, MAX_MENTIONED);
  for (const ticker of mentioned) {
    const onchain = TOKENS[ticker]?.bstocks?.symbol;
    lines.push(`${ticker}${onchain ? ` (the token itself trades as ${onchain})` : ''}: ${await describeAsset(ticker)}`);
  }
  if (!mentioned.length) lines.push('No asset named and no watchlist set, so no live price is attached.');
  return lines;
}

async function describeAsset(ticker) {
  const address = TOKENS[ticker]?.bstocks?.address ?? null;
  const [oracle, quote] = await Promise.all([
    getOraclePrice(ticker).catch(() => null),
    address ? getPancakeQuote(address).catch(() => null) : Promise.resolve(null),
  ]);
  const parts = [];
  if (oracle) parts.push(`APRO oracle $${oracle.price} (${oracle.ageMinutes ?? '?'} min old, session ${oracle.session ?? 'unknown'})`);
  if (quote) parts.push(`PancakeSwap V3 pool $${quote.pricePerToken.toFixed(4)} (${quote.poolFeePct}% tier, ${(quote.priceImpactPct ?? 0).toFixed(4)}% impact on $100)`);
  if (oracle && quote) {
    const gap = ((oracle.price - quote.pricePerToken) / quote.pricePerToken) * 100;
    parts.push(`oracle sits ${gap >= 0 ? '+' : ''}${gap.toFixed(3)}% ${gap >= 0 ? 'above' : 'below'} the pool`);
  }
  if (!parts.length) parts.push('no live price available right now');
  return parts.join('; ');
}

export async function chatReply({ text, watchlist, history }) {
  const key = process.env.DEEPSEEK_API_KEY;
  if (!key) return null;
  const system = [RULES, 'CONTEXT:', ...(await buildContext(text, watchlist))].join('\n');
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
