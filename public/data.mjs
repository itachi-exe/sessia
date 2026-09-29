// Sessia token catalog — BNB Chain tokenized stocks
// All APRO oracle addresses confirmed from docs.apro.com (BSC mainnet, 2026-09)
// bStocks issuer: Binance (bStocks) | xStocks issuer: Backed Finance | Ondo Global Markets

export const BSC_RPC = 'https://bsc-dataseed.binance.org/';
export const USDT_ADDRESS = '0x55d398326f99059fF775485246999027B3197955'; // BSC USDT (18 dec)
export const CHAIN_ID = 56;

// AggregatorV3Interface function selectors (4-byte keccak256)
const LATEST_ROUND_DATA_SELECTOR = '0xfeaf968c'; // latestRoundData()
const DECIMALS_SELECTOR = '0x313ce567';          // decimals()

export const TOKENS = {
  NVDA: {
    name: 'NVIDIA',
    ticker: 'NVDA',
    bstocks: {
      symbol: 'NVDAB',
      address: '0x02Fca66C1D1aFB4E2A7884261eB00F63598a7436', // verified 2026-09-29: symbol()=NVDAB, decimals()=18, PancakeSwap V3 0.25% pool 0x8fb4243b553ac29ba088acf00b9b7da24bd6690c, prices 228.90 USDT
      issuer: 'bStocks (Binance)',
      decimals: 18,
    },
    xstocks: {
      symbol: 'NVDAx',
      address: null, // no BSC pool with real liquidity found on 2026-09-29; leave null until an on-chain verified address exists.
      issuer: 'xStocks (Backed Finance)',
      decimals: 18,
    },
    apro_feed: '0x310EFC9Fefe89B8085F89E91Ac782Bef6416499E',
    sector: 'Technology',
  },
  TSLA: {
    name: 'Tesla',
    ticker: 'TSLA',
    bstocks: {
      symbol: 'TSLAB',
      address: '0x5b1910eAaD6450E50f816082Aa078C41F10C292f', // verified 2026-09-29: symbol()=TSLAB, decimals()=18, PancakeSwap V3 0.25% pool 0xb0f5e5400e8f0f7c242f2b7740c004f020579c41, prices 357.54 USDT
      issuer: 'bStocks (Binance)',
      decimals: 18,
    },
    xstocks: {
      symbol: 'TSLAx',
      address: null, // no BSC pool with real liquidity found on 2026-09-29; leave null until an on-chain verified address exists.
      issuer: 'xStocks (Backed Finance)',
      decimals: 18,
    },
    apro_feed: '0xe1bc21701Bc8FFa39DaecDb8f58263C1d5e1c0bc',
    sector: 'Automotive / Energy',
  },
  META: {
    name: 'Meta Platforms',
    ticker: 'META',
    bstocks: {
      symbol: 'METAB',
      address: '0x7425889FE94F9d693E8daefE88BCCed6AcFEf4c0', // verified 2026-09-29: symbol()=METAB, decimals()=18, PancakeSwap V3 0.25% pool 0xc2151a561e928d16576d75ea88544543ac63d80b, prices 718.00 USDT
      issuer: 'bStocks (Binance)',
      decimals: 18,
    },
    xstocks: {
      symbol: 'METAx',
      address: null, // no BSC pool with real liquidity found on 2026-09-29; leave null until an on-chain verified address exists.
      issuer: 'xStocks (Backed Finance)',
      decimals: 18,
    },
    apro_feed: '0x32Fd1E5E20b091Df7286EE8C69937C4A8D619885',
    sector: 'Technology',
  },
  MSFT: {
    name: 'Microsoft',
    ticker: 'MSFT',
    bstocks: {
      symbol: 'MSFTB',
      address: '0x80106cb3EAD06659A5ad19DF39D9b4733863B9b0', // verified 2026-09-29: symbol()=MSFTB, decimals()=18, PancakeSwap V3 0.25% pool 0x5018b018ceb7645c927c5cf246786f89ebcbe7ea, prices 509.53 USDT
      issuer: 'bStocks (Binance)',
      decimals: 18,
    },
    xstocks: {
      symbol: 'MSFTx',
      address: null, // no BSC pool with real liquidity found on 2026-09-29; leave null until an on-chain verified address exists.
      issuer: 'xStocks (Backed Finance)',
      decimals: 18,
    },
    apro_feed: '0xBC92F296c48E31409eD4DbD638F1fbe0ee5A3724',
    sector: 'Technology',
  },
  PLTR: {
    name: 'Palantir',
    ticker: 'PLTR',
    bstocks: {
      symbol: 'PLTRB',
      address: null, // no BSC pool with real liquidity found on 2026-09-29; leave null until an on-chain verified address exists.
      issuer: 'bStocks (Binance)',
      decimals: 18,
    },
    xstocks: null,
    apro_feed: '0xBb0535d8C1B1adB790beD2d9b84d4Dbc78fdD902',
    sector: 'Technology / Defence',
  },
  QQQ: {
    name: 'Invesco QQQ Trust',
    ticker: 'QQQ',
    bstocks: {
      symbol: 'QQQB',
      address: '0x205812CdBed920aFf76C6580abD681a46D11efc7', // verified 2026-09-29: symbol()=QQQB, decimals()=18, deepest PancakeSwap V3 pool is the 0.01% tier 0xe531fcb1f5a195de7608b9f4f9518544c2cdb693, prices 734.39 USDT
      issuer: 'bStocks (Binance)',
      decimals: 18,
    },
    xstocks: null,
    apro_feed: '0x2708567c468db65a72095716FCff023dcDfEA07A',
    sector: 'ETF',
  },
  SPCX: {
    name: 'SpaceX',
    ticker: 'SPCX',
    bstocks: {
      symbol: 'SPCXB',
      address: '0xbe9d156892e55e7154bcd3cb0fea677f9d3103e1',
      issuer: 'bStocks (Binance)',
      decimals: 18,
    },
    xstocks: {
      symbol: 'SPCXx',
      address: '0x68fa48b1c2fe52b3d776e1953e0e782b5044ce28',
      issuer: 'xStocks (Backed Finance)',
      decimals: 18,
    },
    apro_feed: '0x44c4173459121690613Bc22C110c4f0624254f3E',
    sector: 'Pre-IPO / Space',
  },
};

export const SUPPORTED_TICKERS = Object.keys(TOKENS);

// Resolve ticker from user input (case insensitive, common aliases)
// Names people actually type when they mean a ticker: "monitor NVIDIA", "is Tesla
// cheap". Kept here so every surface (commands, Telegram chat, the web agent)
// resolves the same word to the same asset.
const COMPANY_NAMES = {
  NVIDIA: 'NVDA',
  TESLA: 'TSLA',
  FACEBOOK: 'META',
  INSTAGRAM: 'META',
  MICROSOFT: 'MSFT',
  PALANTIR: 'PLTR',
  NASDAQ: 'QQQ',
  NASDAQ100: 'QQQ',
  SPACEX: 'SPCX',
};

export function resolveTicker(input) {
  const upper = String(input || '').toUpperCase().trim()
    .replace(/^(NVDAB|NVDAX|NVIDIASTOCK)$/, 'NVDA')
    .replace(/^(TSLAB|TSLAX|TESLASTOCK)$/, 'TSLA')
    .replace(/^(METAB|METAX)$/, 'META')
    .replace(/^(MSFTB|MSFTX)$/, 'MSFT')
    .replace(/^(PLTRB|PLTRX)$/, 'PLTR')
    .replace(/^(QQQB|QQQX)$/, 'QQQ')
    .replace(/^(SPCXB|SPCXX)$/, 'SPCX');
  if (TOKENS[upper]) return upper;
  const named = COMPANY_NAMES[upper];
  return named && TOKENS[named] ? named : null;
}

// Encode eth_call for latestRoundData()
function encodeLatestRoundData() { return LATEST_ROUND_DATA_SELECTOR; }
function encodeDecimals() { return DECIMALS_SELECTOR; }

// Call BSC RPC — returns raw hex result
async function ethCall(to, data, rpc = BSC_RPC) {
  const body = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_call', params: [{ to, data }, 'latest'] });
  const res = await fetch(rpc, { method: 'POST', headers: { 'content-type': 'application/json' }, body });
  if (!res.ok) throw new Error(`RPC error ${res.status}`);
  const json = await res.json();
  if (json.error) throw new Error(`RPC call error: ${json.error.message}`);
  return json.result;
}

// Decode int256 from hex result (handles both positive and negative)
function decodeInt256(hex) {
  if (!hex || hex === '0x') return null;
  const clean = hex.slice(2);
  const padded = clean.padStart(64, '0');
  const value = BigInt('0x' + padded);
  // Handle two's complement for negative
  const max = BigInt('0x' + 'f'.repeat(64));
  if (value > BigInt('0x' + '7' + 'f'.repeat(63))) return -(max - value + 1n);
  return value;
}

// Parse latestRoundData response (5 × 32-byte slots)
function parseLatestRoundData(hex) {
  if (!hex || hex === '0x') return null;
  const data = hex.slice(2);
  if (data.length < 320) return null;
  const slots = [];
  for (let i = 0; i < 5; i++) slots.push(data.slice(i * 64, (i + 1) * 64));
  const answer = decodeInt256('0x' + slots[1]);
  const updatedAt = BigInt('0x' + slots[3]);
  return { answer, updatedAt };
}

// Fetch APRO oracle price for a token
export async function getOraclePrice(ticker) {
  const token = TOKENS[ticker];
  if (!token?.apro_feed) return null;
  try {
    const [rdResult, decResult] = await Promise.all([
      ethCall(token.apro_feed, encodeLatestRoundData()),
      ethCall(token.apro_feed, encodeDecimals()),
    ]);
    const rd = parseLatestRoundData(rdResult);
    if (!rd) return null;
    const decimals = decResult ? Number(BigInt('0x' + decResult.slice(2).slice(-2))) : 8;
    const price = Number(rd.answer) / Math.pow(10, decimals);
    const age = Math.floor(Date.now() / 1000) - Number(rd.updatedAt);
    return {
      ticker,
      price,
      decimals,
      updatedAt: Number(rd.updatedAt),
      ageSeconds: age,
      source: 'APRO Oracle (BSC)',
      feedAddress: token.apro_feed,
      stale: age > 7200, // flag if >2h old
    };
  } catch {
    return null;
  }
}

// Fetch PancakeSwap quote: USDT in → tokenOut, returns price per token in USDT
// ---------------------------------------------------------------- on-chain DEX quotes
// The old router.pancakeswap.finance HTTP endpoint no longer resolves (DNS dead), so the
// quote is read straight from the chain: the deepest PancakeSwap V3 pool for token/USDT.

export const PANCAKE_V3_FACTORY = '0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865';
const V3_FEE_TIERS = [100, 500, 2500, 10000];
const V3_GET_POOL_SELECTOR = '0x1698ee82';
const V3_SLOT0_SELECTOR = '0x3850c7bd';
const V3_LIQUIDITY_SELECTOR = '0x1a686502';
const V3_TOKEN0_SELECTOR = '0x0dfe1681';
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

function encodeAddressParam(address) {
  return address.toLowerCase().replace(/^0x/, '').padStart(64, '0');
}

function encodeUintParam(value) {
  return BigInt(value).toString(16).padStart(64, '0');
}

// Deepest V3 pool quoting token/USDT, ranked by in-range liquidity.
async function findDeepestV3Pool(tokenAddress, rpc = BSC_RPC) {
  let best = null;
  for (const fee of V3_FEE_TIERS) {
    let pool;
    try {
      const raw = await ethCall(PANCAKE_V3_FACTORY, V3_GET_POOL_SELECTOR + encodeAddressParam(tokenAddress) + encodeAddressParam(USDT_ADDRESS) + encodeUintParam(fee), rpc);
      pool = '0x' + raw.slice(2 + 24).toLowerCase();
    } catch { continue; }
    if (pool === ZERO_ADDRESS) continue;
    try {
      const [slot0, liquidity, token0] = await Promise.all([
        ethCall(pool, V3_SLOT0_SELECTOR, rpc),
        ethCall(pool, V3_LIQUIDITY_SELECTOR, rpc),
        ethCall(pool, V3_TOKEN0_SELECTOR, rpc),
      ]);
      const liquidityValue = liquidity && liquidity !== '0x' ? BigInt(liquidity) : 0n;
      if (!slot0 || slot0 === '0x' || liquidityValue <= 0n) continue;
      const candidate = {
        fee,
        pool,
        liquidity: liquidityValue,
        slot0,
        token0: '0x' + token0.slice(2 + 24).toLowerCase(),
      };
      if (!best || candidate.liquidity > best.liquidity) best = candidate;
    } catch { continue; }
  }
  return best;
}

// USDT price of one token, read from a PancakeSwap V3 pool's slot0 word.
// Both sides carry 18 decimals on BSC, so no decimal scaling is required.
export function priceFromV3Slot0(sqrtPriceX96, usdtIsToken0) {
  const sqrtPrice = Number(BigInt(sqrtPriceX96)) / 2 ** 96;
  const priceToken1PerToken0 = sqrtPrice * sqrtPrice;
  if (!Number.isFinite(priceToken1PerToken0) || priceToken1PerToken0 <= 0) return null;
  const pricePerToken = usdtIsToken0 ? 1 / priceToken1PerToken0 : priceToken1PerToken0;
  return Number.isFinite(pricePerToken) && pricePerToken > 0 ? pricePerToken : null;
}

// Spot price for a trade of `amountUSDT` against the deepest PancakeSwap V3 pool.
// The field name stays pricePerToken because the bot and the monitor read it.
export async function getPancakeQuote(tokenAddress, amountUSDT = 100) {
  try {
    const pool = await findDeepestV3Pool(tokenAddress);
    if (!pool) return null;
    const sqrtPriceX96 = BigInt('0x' + pool.slot0.slice(2, 66));
    if (sqrtPriceX96 <= 0n) return null;
    const usdtIsToken0 = pool.token0 === USDT_ADDRESS.toLowerCase();
    const pricePerToken = priceFromV3Slot0(sqrtPriceX96, usdtIsToken0);
    if (pricePerToken === null) return null;
    // In-range virtual reserves: x = L/sqrtP (token side), y = L*sqrtP (USDT side).
    const sqrtPrice = Number(sqrtPriceX96) / 2 ** 96;
    const usdtSideVirtualReserve = (Number(pool.liquidity) * sqrtPrice) / 1e18;
    const priceImpactPct = usdtSideVirtualReserve > 0
      ? (amountUSDT / (usdtSideVirtualReserve + amountUSDT)) * 100
      : null;
    return {
      tokenAddress,
      inputUSDT: amountUSDT,
      tokensOut: amountUSDT / pricePerToken,
      pricePerToken,
      priceImpactPct,
      poolAddress: pool.pool,
      poolFeePct: pool.fee / 10000,
      poolLiquidity: pool.liquidity.toString(),
      route: `PancakeSwap V3 ${pool.fee / 10000}% pool`,
      source: 'PancakeSwap V3 pool (on-chain)',
    };
  } catch {
    return null;
  }
}

// Simulate a trade: given oracle ref price and dex market price, model costs
export function simulateTrade({ refPrice, dexPrice, tradeUSDT = 100, feePct = 0.25, extraSlippagePct = 0 }) {
  if (!refPrice || !dexPrice) return null;
  const deviationPct = ((dexPrice - refPrice) / refPrice) * 100;
  const routeFeePct = feePct;
  const slippagePct = extraSlippagePct || Math.min(Math.abs(deviationPct) * 0.2, 2.0);
  const totalCostPct = routeFeePct + slippagePct;
  const remainingPct = deviationPct - totalCostPct;
  const estimatedOutput = tradeUSDT * (1 - totalCostPct / 100);
  return {
    tradeUSDT,
    deviationPct: parseFloat(deviationPct.toFixed(3)),
    routeFeePct,
    slippagePct: parseFloat(slippagePct.toFixed(3)),
    totalCostPct: parseFloat(totalCostPct.toFixed(3)),
    remainingPct: parseFloat(remainingPct.toFixed(3)),
    estimatedOutput: parseFloat(estimatedOutput.toFixed(2)),
    note: 'Estimate only. Refresh quote before any wallet request. Gas not included.',
  };
}

// Market session helper
export function getMarketSession() {
  const now = new Date();
  const utcHour = now.getUTCHours();
  const utcDay = now.getUTCDay(); // 0=Sun, 6=Sat
  const isWeekend = utcDay === 0 || utcDay === 6;
  // NYSE: 14:30–21:00 UTC (ET 09:30–16:00)
  const inNYSEHours = utcHour >= 14 && (utcHour < 21 || (utcHour === 21 && now.getUTCMinutes() === 0));
  if (isWeekend) return { label: 'WEEKEND', open: false };
  if (inNYSEHours) return { label: 'US MARKET OPEN', open: true };
  return { label: 'US MARKET CLOSED', open: false };
}
