// Binance Web3 market-data layer: shapes, headers, caching, failure handling.
//
// These run against a stubbed fetch. The live version of the same reads is
// scripts/binance-smoke.mjs, which prints real latency for the DevEx report.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  clearBinanceCache,
  getAssetStatus,
  getMarketStatus,
  getRwaTokens,
  getTokenDynamic,
  getVenueBoard,
  reasonLabel,
  sessionLabel,
  BinanceDataError,
} from '../public/binance.mjs';

const NVDA_BSTOCKS = '0x02fca66c1d1afb4e2a7884261eb00f63598a7436';
const NVDA_XSTOCKS = '0xc845b2894dbddd03858fd2d643b4ef725fe0849d';

// Trimmed copies of real responses, kept to the fields the parser reads.
const CATALOG = {
  code: '000000',
  data: [
    { ticker: 'NVDA', symbol: 'NVDAB', fullName: 'NVIDIA (bStocks)', chainId: 56, contractAddress: NVDA_BSTOCKS, type: 3, multiplier: 1.000778 },
    { ticker: 'NVDA', symbol: 'NVDAx', fullName: 'NVIDIA (xStocks)', chainId: 56, contractAddress: NVDA_XSTOCKS, type: 2, multiplier: 1.000918 },
    { ticker: 'NVDA', symbol: 'NVDAon', fullName: 'NVIDIA (Ondo)', chainId: 56, contractAddress: '0x00000000000000000000000000000000000000aa', type: 1, multiplier: 1.0017 },
    { ticker: 'NVDA', symbol: 'NVDAx', fullName: 'NVIDIA (xStocks, Solana)', chainId: 501, contractAddress: 'So11111111111111111111111111111111111111112', type: 2 },
  ],
};

const DYNAMIC_BSTOCKS = {
  code: '000000',
  data: {
    symbol: 'NVDAB',
    ticker: 'NVDA',
    type: 3,
    tokenInfo: {
      price: '228.19745058011526',
      priceChangePct24h: '-1.071',
      totalHolders: null,
      bnHolder: 9722,
      bnTrader: 13605,
      volume24h: '127686010',
      sharesMultiplier: '1.0007782237528078',
    },
    stockInfo: {
      price: null,
      priceToEarnings: '28.44',
      eps: '8.02',
      dividendYield: '0.03',
      marketCap: '5490000000000',
    },
    statusInfo: { openState: true, reasonCode: 'TRADING' },
  },
};

const MARKET_STATUS = {
  code: '000000',
  data: { marketStatus: 'premarket', openState: true, reasonCode: 'TRADING', nextOpen: '2026-09-30T13:31:00Z', offhours: { openState: true } },
};

const ASSET_STATUS = {
  code: '000000',
  data: { marketStatus: 'premarket', openState: true, reasonCode: 'TRADING', reasonMsg: 'trading' },
};

function stubFetch(handler) {
  const calls = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url, options });
    const body = handler(url);
    return {
      status: 200,
      ok: true,
      json: async () => body,
    };
  };
  return {
    calls,
    restore: () => {
      globalThis.fetch = original;
    },
  };
}

test('every request carries Accept-Encoding: identity', async () => {
  clearBinanceCache();
  const stub = stubFetch(() => MARKET_STATUS);
  try {
    await getMarketStatus({ fresh: true });
    assert.equal(stub.calls.length, 1);
    assert.equal(stub.calls[0].options.headers['Accept-Encoding'], 'identity');
  } finally {
    stub.restore();
  }
});

test('the catalog filters to BSC and keeps one row per issuer', async () => {
  clearBinanceCache();
  const stub = stubFetch(() => CATALOG);
  try {
    const tokens = await getRwaTokens({ chainId: 56 });
    assert.equal(tokens.length, 3);
    assert.deepEqual([...new Set(tokens.map((token) => token.issuer))].sort(), ['Ondo', 'bStocks', 'xStocks']);
    assert.equal(tokens.find((token) => token.symbol === 'NVDAB').multiplier, 1.000778);
  } finally {
    stub.restore();
  }
});

test('the catalog is cached, so a chatty caller does not refetch 1900 rows', async () => {
  clearBinanceCache();
  const stub = stubFetch(() => CATALOG);
  try {
    await getRwaTokens({ chainId: 56 });
    await getRwaTokens({ chainId: 56 });
    assert.equal(stub.calls.length, 1);
  } finally {
    stub.restore();
  }
});

test('a non-zero code is an error even though the HTTP status is 200', async () => {
  clearBinanceCache();
  const stub = stubFetch(() => ({ code: '100001', message: 'system error' }));
  try {
    await assert.rejects(() => getMarketStatus({ fresh: true }), (error) => {
      assert.ok(error instanceof BinanceDataError);
      assert.equal(error.code, '100001');
      assert.match(error.message, /system error/);
      return true;
    });
  } finally {
    stub.restore();
  }
});

test('totalHolders null falls back to the BNB holder count', async () => {
  clearBinanceCache();
  const stub = stubFetch(() => DYNAMIC_BSTOCKS);
  try {
    const dynamic = await getTokenDynamic({ address: NVDA_BSTOCKS });
    assert.equal(dynamic.holders, 9722);
    assert.equal(dynamic.traders, 13605);
    assert.equal(dynamic.price, 228.19745058011526);
    assert.equal(dynamic.sharesMultiplier, 1.0007782237528078);
    assert.equal(dynamic.priceToEarnings, 28.44);
    assert.equal(dynamic.reasonCode, 'TRADING');
  } finally {
    stub.restore();
  }
});

test('venue board prices every issuer and reports the spread', async () => {
  clearBinanceCache();
  const prices = { [NVDA_BSTOCKS]: '228.19', [NVDA_XSTOCKS]: '227.98', '0x00000000000000000000000000000000000000aa': '228.24' };
  const stub = stubFetch((url) => {
    if (url.includes('/stock/detail/list/ai')) return CATALOG;
    if (url.includes('/rwa/dynamic/ai')) {
      const address = new URL(url).searchParams.get('contractAddress');
      return { code: '000000', data: { tokenInfo: { price: prices[address], volume24h: '1000', bnHolder: 12 }, stockInfo: {}, statusInfo: { reasonCode: 'TRADING' } } };
    }
    if (url.includes('/asset/market/status/ai')) return ASSET_STATUS;
    if (url.includes('/rwa/market/status/ai')) return MARKET_STATUS;
    throw new Error(`unexpected url ${url}`);
  });
  try {
    const board = await getVenueBoard('nvda');
    assert.equal(board.ticker, 'NVDA');
    assert.equal(board.venues.length, 3);
    assert.equal(board.cheapest.issuer, 'xStocks');
    assert.equal(board.spreadPct, 0.11);
    assert.equal(board.session.label, 'US PREMARKET');
  } finally {
    stub.restore();
  }
});

test('a venue with no price is kept in the board but never counted as cheapest', async () => {
  clearBinanceCache();
  const stub = stubFetch((url) => {
    if (url.includes('/stock/detail/list/ai')) return { code: '000000', data: [CATALOG.data[0], CATALOG.data[1]] };
    if (url.includes('/rwa/dynamic/ai')) {
      const address = new URL(url).searchParams.get('contractAddress');
      return address === NVDA_BSTOCKS
        ? { code: '000000', data: { tokenInfo: {}, stockInfo: {}, statusInfo: {} } }
        : { code: '000000', data: { tokenInfo: { price: '227.98' }, stockInfo: {}, statusInfo: {} } };
    }
    if (url.includes('market/status/ai')) return MARKET_STATUS;
    throw new Error(`unexpected url ${url}`);
  });
  try {
    const board = await getVenueBoard('NVDA');
    assert.equal(board.venues.length, 2);
    assert.equal(board.cheapest.issuer, 'xStocks');
    assert.equal(board.spreadPct, null);
  } finally {
    stub.restore();
  }
});

test('session and reason labels stay readable', () => {
  assert.equal(sessionLabel('premarket'), 'US PREMARKET');
  assert.equal(sessionLabel('regular'), 'US MARKET OPEN');
  assert.equal(sessionLabel('overnight'), 'US OVERNIGHT');
  assert.equal(sessionLabel('something_new'), 'US SESSION SOMETHING_NEW');
  assert.equal(reasonLabel('TRADING'), 'trading normally');
  assert.equal(reasonLabel('WEIRD_CODE'), 'weird_code');
  assert.equal(reasonLabel(null), null);
});

test('a dead endpoint degrades instead of throwing through the read', async () => {
  clearBinanceCache();
  const original = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error('network down');
  };
  try {
    const board = await getVenueBoard('NVDA');
    assert.deepEqual(board.venues, []);
    const asset = await getMarketStatus({ fresh: true }).catch(() => null);
    assert.equal(asset, null);
  } finally {
    globalThis.fetch = original;
  }
});
