// Sessia — Binance Web3 API client (signed).
//
// The public wallet-direct surface in public/binance.mjs needs no credentials and
// covers research. This file is the credentialed half: the Web3 API that turns a
// research read into an executable route (aggregated quote across LiquidMesh,
// PcsXRfq, InchFusion and CowSwap) and returns the tokenized-stock endpoints that
// need a key.
//
// Auth contract, exactly as documented:
//   Base URL            https://web3.binance.com/build
//   Signed requestPath  /build/api/v1/... including the raw query string
//   preHash             timestamp + METHOD + requestPath + body
//   X-OC-SIGN           base64(HMAC-SHA256(preHash, secret))
//   X-OC-TIMESTAMP      ISO 8601 with milliseconds, UTC
//
// The single most common failure is dropping the /build prefix from the signed
// path: the request still routes, and you get 40102 Signature error back. Sessia
// builds the path once and uses the same string for both the signature and the
// request, so the two can never drift.
//
// Equity specifics worth knowing before reading the routes:
//   - Ondo tokens always route RFQ and can be unavailable outside US market hours
//     (40367). bStocks can return a mix of a LiquidMesh SWAP route and a PcsXRfq
//     route in one response. xStocks trade on ordinary AMM pools.
//   - RFQ routes need userWalletAddress in /quote; the EIP-712 signature later must
//     come from that same wallet.
//   - quoteId lives about 30 seconds.

import crypto from 'node:crypto';

export const W3W_BASE = 'https://web3.binance.com/build';
const REQUEST_TIMEOUT_MS = 12000;

export const W3W_ERRORS = {
  40001: 'invalid request parameters',
  40101: 'API key missing, invalid, or disabled',
  40102: 'signature mismatch or missing',
  40103: 'timestamp expired or request replayed',
  40104: 'API key lacks the required permission',
  40367: 'token unavailable outside US market hours',
  40369: 'token unavailable (equity market closed)',
  40401: 'quote expired',
  40462: 'swap does not match the cached quote',
  40466: 'invalid fee percent',
  40467: 'invalid referrer address',
  40468: 'conflicting referrer params',
  42900: 'rate limit exceeded',
};

export class W3WError extends Error {
  constructor(message, { status = 0, code = null, path = null } = {}) {
    super(message);
    this.name = 'W3WError';
    this.status = status;
    this.code = code;
    this.path = path;
  }
}

export function w3wConfigured(env = process.env) {
  return Boolean(env.W3W_API_KEY && env.W3W_SECRET_KEY);
}

export function w3wTimestamp(now = Date.now()) {
  return new Date(now).toISOString();
}

// Deterministic: same inputs, same signature. This is what the unit tests pin.
export function buildSignature({ timestamp, method, requestPath, body = '', secret }) {
  const preHash = `${timestamp}${String(method).toUpperCase()}${requestPath}${body}`;
  return crypto.createHmac('sha256', secret).update(preHash, 'utf8').digest('base64');
}

export function buildRequest({ method = 'GET', path, query, body = '', apiKey, secret, timestamp }) {
  const normalizedMethod = String(method).toUpperCase();
  const rawQuery = query ? new URLSearchParams(query).toString() : '';
  // Signed path carries the /build prefix and the raw query string, and is reused
  // verbatim for the request URL so the two cannot disagree.
  const requestPath = `/build${path}${rawQuery ? `?${rawQuery}` : ''}`;
  const headers = {
    Accept: 'application/json',
    'Accept-Encoding': 'identity',
    'X-OC-APIKEY': apiKey,
    'X-OC-TIMESTAMP': timestamp,
    'X-OC-SIGN': buildSignature({ timestamp, method: normalizedMethod, requestPath, body, secret }),
  };
  if (body) headers['Content-Type'] = 'application/json';
  return {
    url: `${W3W_BASE}${path}${rawQuery ? `?${rawQuery}` : ''}`,
    requestPath,
    headers,
    method: normalizedMethod,
    body,
  };
}

async function w3wFetch({ method = 'GET', path, query, body = '', env = process.env }) {
  const apiKey = env.W3W_API_KEY;
  const secret = env.W3W_SECRET_KEY;
  if (!apiKey || !secret) {
    throw new W3WError('Binance Web3 credentials are not configured (W3W_API_KEY / W3W_SECRET_KEY)', {
      code: 'NOT_CONFIGURED',
      path,
    });
  }
  const timestamp = w3wTimestamp();
  const built = buildRequest({ method, path, query, body, apiKey, secret, timestamp });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const started = Date.now();
  let status = 0;
  let payload = null;
  try {
    const response = await fetch(built.url, {
      method: built.method,
      headers: built.headers,
      body: built.body || undefined,
      signal: controller.signal,
    });
    status = response.status;
    payload = await response.json().catch(() => null);
  } catch (error) {
    const reason = error?.name === 'AbortError' ? `timed out after ${REQUEST_TIMEOUT_MS}ms` : error?.message || 'network error';
    throw new W3WError(`Web3 API ${path} ${reason}`, { status, path });
  } finally {
    clearTimeout(timer);
  }

  const latencyMs = Date.now() - started;
  const code = payload?.code ?? null;
  if (code !== null && String(code) !== '0' && String(code) !== '000000') {
    const explanation = W3W_ERRORS[code];
    throw new W3WError(
      `Web3 API ${path} error ${code}${explanation ? ` (${explanation})` : ''}: ${payload?.msg || payload?.message || 'no message'}`,
      { status, code, path },
    );
  }
  return { data: payload?.data ?? payload, latencyMs, status, code };
}

// ---------------------------------------------------------------------------
// Market API — RWA data (tokenized stocks)
// ---------------------------------------------------------------------------

export function w3wRwaTokens({ binanceChainId = 56, platform, env = process.env } = {}) {
  return w3wFetch({ path: '/api/v1/dex/market/rwa/tokens', query: { binanceChainId, platform }, env });
}

export function w3wRwaPrice({ tokenContractAddress, binanceChainId = 56, env = process.env } = {}) {
  return w3wFetch({ path: '/api/v1/dex/market/rwa/price', query: { binanceChainId, tokenContractAddress }, env });
}

export function w3wRwaUnderlyingMarket({ tokenContractAddress, binanceChainId = 56, env = process.env } = {}) {
  return w3wFetch({ path: '/api/v1/dex/market/rwa/underlying-market', query: { binanceChainId, tokenContractAddress }, env });
}

export function w3wRwaPlatforms({ env = process.env } = {}) {
  return w3wFetch({ path: '/api/v1/dex/market/rwa/platforms', env });
}

// ---------------------------------------------------------------------------
// Trading API — route discovery for an equity token
// ---------------------------------------------------------------------------

export function w3wQuote({
  binanceChainId = 56,
  fromTokenAddress,
  toTokenAddress,
  amount,
  userWalletAddress,
  slippagePercent,
  autoSlippage,
  vendor,
  feePercent,
  feeSource,
  env = process.env,
} = {}) {
  return w3wFetch({
    path: '/api/v1/dex/aggregator/quote',
    query: {
      binanceChainId,
      fromTokenAddress,
      toTokenAddress,
      amount,
      userWalletAddress,
      slippagePercent,
      autoSlippage,
      vendor,
      feePercent,
      feeSource,
    },
    env,
  });
}

export function w3wSupportedChains({ binanceChainId, env = process.env } = {}) {
  return w3wFetch({ path: '/api/v1/dex/aggregator/supported/chain', query: { binanceChainId }, env });
}

// Route summary shaped for the research answer: which vendors priced the trade,
// what mode each route uses, and how much of the input survives the route.
export function summarizeQuote(data) {
  const routes = data?.routes || data?.list || (Array.isArray(data) ? data : []);
  const shaped = routes.map((route) => ({
    vendor: route.vendorName || route.vendor || null,
    executionMode: route.executionMode || null,
    toTokenAmount: route.toTokenAmount ? Number(route.toTokenAmount) : null,
    priceImpactPct: route.priceImpactPercent != null ? Number(route.priceImpactPercent) : null,
    quoteId: route.quoteId || null,
  }));
  const priced = shaped.filter((route) => Number.isFinite(route.toTokenAmount));
  const best = priced.sort((a, b) => b.toTokenAmount - a.toTokenAmount)[0] || null;
  return { routes: shaped, best, routeCount: shaped.length };
}
