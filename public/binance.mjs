// Sessia — Binance Web3 market-data layer for tokenized stocks.
//
// Everything in this file reads the same wallet-direct surface the Binance Web3
// Wallet uses for tokenized equities: the full RWA token list, the underlying
// company profile, US session state, per-asset market state (including corporate
// actions), live price/liquidity/volume, and candles.
//
// Three things matter when calling these endpoints:
//   1. Send `Accept-Encoding: identity`. The edge answers with a brotli body that
//      fetch() mis-decodes when this header is missing, and you get garbage instead
//      of an error.
//   2. The RWA list is large (~1900 rows across all chains). Filter by chainId 56
//      for BSC and cache it; do not call it per message.
//   3. The payloads are nested and repeat the same field names with different
//      meanings: `tokenInfo.price` is the on-chain token price, `stockInfo.price`
//      is the underlying market price and is usually null, `totalHolders` is null
//      while `bnHolder` and `bnTrader` carry the BNB Chain counts.
//
// Nothing here needs an API key. The signed Web3 API path lives in agent/w3w.js.

export const BINANCE_API = 'https://www.binance.com/bapi/defi';
export const BSC_CHAIN_ID = 56;

// Issuer types as documented by Binance for the RWA token list.
export const ISSUER_TYPES = { 1: 'Ondo', 2: 'xStocks', 3: 'bStocks' };

// Only the reason codes we have actually observed, plus the ones the docs name.
// Anything unknown is surfaced raw rather than guessed at.
export const REASON_LABELS = {
  TRADING: 'trading normally',
  PAUSE: 'trading paused',
  HALT: 'halted',
  EARNINGS: 'earnings window',
  DIVIDEND: 'dividend event',
  SPLIT: 'share split',
  SUSPEND: 'suspended',
};

const REQUEST_TIMEOUT_MS = 9000;
const LIST_TTL_MS = 10 * 60 * 1000;
const SESSION_TTL_MS = 45 * 1000;
const ASSET_TTL_MS = 45 * 1000;
const DYNAMIC_TTL_MS = 30 * 1000;
const PROFILE_TTL_MS = 6 * 60 * 60 * 1000;

const cache = new Map();

function cacheGet(key, ttlMs) {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > ttlMs) return null;
  return hit.value;
}

function cacheSet(key, value) {
  cache.set(key, { at: Date.now(), value });
  return value;
}

export class BinanceDataError extends Error {
  constructor(message, { status = 0, code = null } = {}) {
    super(message);
    this.name = 'BinanceDataError';
    this.status = status;
    this.code = code;
  }
}

const num = (value) => {
  // Number(null) is 0, and every one of these payloads uses null for "not reported",
  // so the null check has to come first or a missing field reads as a real zero.
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

async function binanceGet(path, params = {}) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    query.set(key, String(value));
  }
  const suffix = query.toString() ? `?${query}` : '';
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const started = Date.now();
  let body = null;
  let status = 0;
  try {
    const response = await fetch(`${BINANCE_API}${path}${suffix}`, {
      headers: {
        Accept: 'application/json',
        // Required. Without it the response arrives brotli-encoded and decodes to garbage.
        'Accept-Encoding': 'identity',
        'User-Agent': 'Mozilla/5.0 (compatible; Sessia/1.0)',
      },
      signal: controller.signal,
    });
    status = response.status;
    body = await response.json().catch(() => null);
  } catch (error) {
    const reason =
      error?.name === 'AbortError' ? `timed out after ${REQUEST_TIMEOUT_MS}ms` : error?.message || 'network error';
    throw new BinanceDataError(`Binance ${path} ${reason}`, { status });
  } finally {
    clearTimeout(timer);
  }

  const latencyMs = Date.now() - started;
  if (!body || typeof body !== 'object') {
    throw new BinanceDataError(`Binance ${path} returned an unreadable body`, { status });
  }
  // Most of these endpoints answer HTTP 200 with a string code, so the status line
  // tells you nothing. Success is '000000', not 0.
  const code = String(body.code ?? '');
  if (code && code !== '000000' && code !== '0') {
    throw new BinanceDataError(`Binance ${path} error ${code}: ${body.message || body.msg || 'unknown'}`, {
      status,
      code,
    });
  }
  return { data: body.data ?? body, latencyMs, status, code: code || '000000' };
}

// ---------------------------------------------------------------------------
// RWA token list — every tokenized stock Binance tracks, with issuer and address
// ---------------------------------------------------------------------------

export async function getRwaTokens({ chainId = BSC_CHAIN_ID, type, fresh = false } = {}) {
  const key = `tokens:${chainId}:${type ?? 'all'}`;
  if (!fresh) {
    const hit = cacheGet(key, LIST_TTL_MS);
    if (hit) return hit;
  }
  const { data } = await binanceGet('/v1/public/wallet-direct/buw/wallet/market/token/rwa/stock/detail/list/ai', {
    type,
  });
  const rows = Array.isArray(data) ? data : data?.list || data?.rows || [];
  const tokens = rows
    .map((row) => ({
      ticker: String(row.ticker || '').toUpperCase(),
      symbol: row.symbol || '',
      name: row.fullName || row.name || '',
      chainId: Number(row.chainId),
      address: row.contractAddress || row.address || '',
      issuerType: Number(row.type),
      issuer: ISSUER_TYPES[Number(row.type)] || 'other',
      multiplier: num(row.multiplier),
      isTradable: row.isTradable ?? null,
    }))
    .filter((token) => token.ticker && token.address && (!chainId || token.chainId === Number(chainId)));
  return cacheSet(key, tokens);
}

// Every representation of one ticker on a chain: bStocks, xStocks, Ondo.
export async function getRepresentations(ticker, { chainId = BSC_CHAIN_ID } = {}) {
  const wanted = String(ticker || '')
    .toUpperCase()
    .replace(/^[$#]/, '')
    .trim();
  if (!wanted) return [];
  const tokens = await getRwaTokens({ chainId });
  return tokens.filter((token) => token.ticker === wanted);
}

// ---------------------------------------------------------------------------
// Session state — the US equity session as Binance reports it, not a UTC guess
// ---------------------------------------------------------------------------

const SESSION_LABELS = {
  premarket: 'US PREMARKET',
  pre_market: 'US PREMARKET',
  regular: 'US MARKET OPEN',
  open: 'US MARKET OPEN',
  postmarket: 'US POSTMARKET',
  post_market: 'US POSTMARKET',
  overnight: 'US OVERNIGHT',
  closed: 'US MARKET CLOSED',
  pause: 'US MARKET PAUSED',
};

export function sessionLabel(status) {
  const key = String(status || '').toLowerCase();
  return SESSION_LABELS[key] || (key ? `US SESSION ${key.toUpperCase()}` : 'US SESSION UNKNOWN');
}

export function reasonLabel(code) {
  if (!code) return null;
  return REASON_LABELS[String(code).toUpperCase()] || String(code).toLowerCase();
}

export async function getMarketStatus({ chainId = BSC_CHAIN_ID, fresh = false } = {}) {
  const key = `session:${chainId}`;
  if (!fresh) {
    const hit = cacheGet(key, SESSION_TTL_MS);
    if (hit) return hit;
  }
  const { data, latencyMs } = await binanceGet('/v1/public/wallet-direct/buw/wallet/market/token/rwa/market/status/ai', {
    chainId,
  });
  const status = String(data?.marketStatus || data?.status || '').toLowerCase();
  const value = {
    status,
    label: sessionLabel(status),
    openState: Boolean(data?.openState),
    reasonCode: data?.reasonCode || null,
    nextOpen: data?.nextOpen || null,
    nextClose: data?.nextClose || null,
    nextOpenTime: num(data?.nextOpenTime),
    nextCloseTime: num(data?.nextCloseTime),
    offhours: data?.offhours || null,
    latencyMs,
  };
  return cacheSet(key, value);
}

// Per-asset state. This is where one stock stops trading while the rest of the
// market is open: halts, earnings windows, dividends, splits.
export async function getAssetStatus({ address, chainId = BSC_CHAIN_ID, fresh = false } = {}) {
  if (!address) return null;
  const key = `asset:${chainId}:${String(address).toLowerCase()}`;
  if (!fresh) {
    const hit = cacheGet(key, ASSET_TTL_MS);
    if (hit) return hit;
  }
  const { data, latencyMs } = await binanceGet(
    '/v1/public/wallet-direct/buw/wallet/market/token/rwa/asset/market/status/ai',
    { chainId, contractAddress: address },
  );
  const status = String(data?.marketStatus || data?.status || '').toLowerCase();
  const value = {
    status: status || null,
    label: status ? sessionLabel(status) : null,
    openState: data?.openState ?? null,
    reasonCode: data?.reasonCode || null,
    reasonLabel: reasonLabel(data?.reasonCode),
    reasonMsg: data?.reasonMsg || null,
    nextOpenTime: num(data?.nextOpenTime),
    nextCloseTime: num(data?.nextCloseTime),
    latencyMs,
  };
  return cacheSet(key, value);
}

// ---------------------------------------------------------------------------
// Live per-token read: price, liquidity, volume, holders, multiplier, fundamentals
// ---------------------------------------------------------------------------

export async function getTokenDynamic({ address, chainId = BSC_CHAIN_ID, type, fresh = false } = {}) {
  if (!address) return null;
  const key = `dyn:${chainId}:${String(address).toLowerCase()}:${type ?? ''}`;
  if (!fresh) {
    const hit = cacheGet(key, DYNAMIC_TTL_MS);
    if (hit) return hit;
  }
  const { data, latencyMs } = await binanceGet('/v2/public/wallet-direct/buw/wallet/market/token/rwa/dynamic/ai', {
    chainId,
    contractAddress: address,
    type,
  });
  const tokenInfo = data?.tokenInfo || {};
  const stockInfo = data?.stockInfo || {};
  const statusInfo = data?.statusInfo || {};
  const value = {
    symbol: data?.symbol || null,
    ticker: data?.ticker || null,
    issuerType: num(data?.type),
    price: num(tokenInfo.price),
    priceChangePct24h: num(tokenInfo.priceChangePct24h),
    // totalHolders is null on this surface; the BNB Chain counts arrive as bnHolder/bnTrader.
    holders: num(tokenInfo.totalHolders) ?? num(tokenInfo.bnHolder),
    traders: num(tokenInfo.bnTrader),
    volume24h: num(tokenInfo.volume24h),
    marketCap: num(tokenInfo.marketCap),
    fdv: num(tokenInfo.fdv),
    sharesMultiplier: num(tokenInfo.sharesMultiplier),
    // Underlying company numbers, this is the research half of the payload.
    underlyingMarketCap: num(stockInfo.marketCap),
    priceToEarnings: num(stockInfo.priceToEarnings),
    eps: num(stockInfo.eps),
    dividendYield: num(stockInfo.dividendYield),
    priceHigh52w: num(stockInfo.priceHigh52w),
    priceLow52w: num(stockInfo.priceLow52w),
    avgVolume30d: num(stockInfo.avgVolume30d),
    returnOnEquity: num(stockInfo.returnOnEquity),
    debtToEquity: num(stockInfo.debtToEquity),
    openState: statusInfo.openState ?? null,
    reasonCode: statusInfo.reasonCode || null,
    reasonLabel: reasonLabel(statusInfo.reasonCode),
    latencyMs,
  };
  return cacheSet(key, value);
}

export async function getCompanyProfile({ address, chainId = BSC_CHAIN_ID, fresh = false } = {}) {
  if (!address) return null;
  const key = `meta:${chainId}:${String(address).toLowerCase()}`;
  if (!fresh) {
    const hit = cacheGet(key, PROFILE_TTL_MS);
    if (hit) return hit;
  }
  const { data } = await binanceGet('/v1/public/wallet-direct/buw/wallet/market/token/rwa/meta/ai', {
    chainId,
    contractAddress: address,
  });
  const company = data?.companyInfo || {};
  const value = {
    name: data?.name || null,
    symbol: data?.symbol || null,
    ticker: data?.ticker || null,
    companyName: company.companyName || null,
    description: company.description || null,
    sector: company.sector || company.industry || null,
    // Proof-of-collateral reports, published per issuer.
    dailyAttestation: data?.dailyAttestationReports || null,
    monthlyAttestation: data?.monthlyAttestationReports || null,
  };
  return cacheSet(key, value);
}

export async function getTokenCandles({ address, chainId = BSC_CHAIN_ID, interval = '1d', limit = 5 } = {}) {
  if (!address) return [];
  const { data } = await binanceGet('/v1/public/wallet-direct/buw/wallet/dex/market/token/kline/ai', {
    chainId,
    contractAddress: address,
    interval,
    limit,
  });
  const rows = data?.klineInfos || (Array.isArray(data) ? data : data?.list || []);
  return rows.map((row) => {
    if (Array.isArray(row)) {
      const [openTime, open, high, low, close, volume] = row;
      return { openTime: num(openTime), open: num(open), high: num(high), low: num(low), close: num(close), volume: num(volume) };
    }
    return {
      openTime: num(row.openTime ?? row.t),
      open: num(row.open ?? row.o),
      high: num(row.high ?? row.h),
      low: num(row.low ?? row.l),
      close: num(row.close ?? row.c),
      volume: num(row.volume ?? row.v),
    };
  });
}

// ---------------------------------------------------------------------------
// Composed reads
// ---------------------------------------------------------------------------

const round = (value, digits = 2) => (Number.isFinite(value) ? Number(value.toFixed(digits)) : null);

export function formatUtc(ms) {
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toISOString().replace('.000Z', 'Z');
}

// One read per venue, every venue for the ticker, plus the session they trade in.
// Same stock, one or more issuers, one or more prices.
export async function getVenueBoard(ticker, { chainId = BSC_CHAIN_ID, status = null } = {}) {
  // A catalog outage degrades to an empty board instead of taking the whole read
  // down: the oracle and pool prices in the answer still stand on their own.
  const representations = await getRepresentations(ticker, { chainId }).catch(() => []);
  if (!representations.length) return { ticker, venues: [], session: status || null };
  const session = status || (await getMarketStatus({ chainId }).catch(() => null));

  const venues = await Promise.all(
    representations.map(async (token) => {
      const dynamic = await getTokenDynamic({ address: token.address, chainId, type: token.issuerType }).catch(() => null);
      const asset = await getAssetStatus({ address: token.address, chainId }).catch(() => null);
      return {
        issuer: token.issuer,
        issuerType: token.issuerType,
        symbol: token.symbol,
        address: token.address,
        price: dynamic?.price ?? null,
        priceChangePct24h: dynamic?.priceChangePct24h ?? null,
        holders: dynamic?.holders ?? null,
        traders: dynamic?.traders ?? null,
        volume24h: dynamic?.volume24h ?? null,
        sharesMultiplier: dynamic?.sharesMultiplier ?? null,
        priceToEarnings: dynamic?.priceToEarnings ?? null,
        assetStatus: asset?.status || null,
        reasonCode: asset?.reasonCode || null,
        reasonLabel: asset?.reasonLabel || null,
      };
    }),
  );

  const priced = venues.filter((venue) => Number.isFinite(venue.price) && venue.price > 0);
  const sorted = [...priced].sort((a, b) => a.price - b.price);
  const deepest = [...priced].sort((a, b) => (b.volume24h || 0) - (a.volume24h || 0))[0] || null;
  const cheapest = sorted[0] || null;
  const spreadPct =
    sorted.length > 1 && sorted[0].price > 0
      ? round(((sorted[sorted.length - 1].price - sorted[0].price) / sorted[0].price) * 100, 2)
      : null;

  return {
    ticker: String(ticker).toUpperCase(),
    venues,
    cheapest: cheapest ? { issuer: cheapest.issuer, price: cheapest.price } : null,
    deepest: deepest ? { issuer: deepest.issuer, volume24h: deepest.volume24h } : null,
    spreadPct,
    session: session
      ? { status: session.status, label: session.label, openState: session.openState, nextOpenTime: session.nextOpenTime }
      : null,
  };
}

// Cheap reachability probe for /api/health.
export async function binanceHealth() {
  const started = Date.now();
  try {
    const status = await getMarketStatus({ fresh: true });
    return {
      reachable: true,
      latencyMs: Date.now() - started,
      session: status.status,
      label: status.label,
    };
  } catch (error) {
    return { reachable: false, latencyMs: Date.now() - started, error: error.message };
  }
}

export function clearBinanceCache() {
  cache.clear();
}
