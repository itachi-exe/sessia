import test from 'node:test';
import assert from 'node:assert/strict';
import { priceFromV3Slot0, TOKENS } from '../public/data.mjs';

// Fixture read from the live PancakeSwap V3 NVDAB/USDT 0.25% pool
// (0x8FB4243b553aC29BA088aCf00B9B7dA24bD6690C) slot0 word, 2026-09-29.
const NVDAB_SLOT0 = 1198670787455875600403134885262n;

test('priceFromV3Slot0 converts a pool word into USDT per token', () => {
  const price = priceFromV3Slot0(NVDAB_SLOT0, false);
  assert.ok(price !== null);
  assert.ok(Math.abs(price - 228.8973) < 0.01, `expected about 228.90, got ${price}`);
});

test('priceFromV3Slot0 inverts when USDT is the pool token0', () => {
  const price = priceFromV3Slot0(NVDAB_SLOT0, true);
  assert.ok(price !== null);
  assert.ok(Math.abs(price - 1 / 228.8973) < 0.00001, `expected the reciprocal, got ${price}`);
});

test('priceFromV3Slot0 returns null for an empty pool', () => {
  assert.equal(priceFromV3Slot0(0n, false), null);
});

test('every enabled BSC token address is a well formed 20 byte address', () => {
  let enabled = 0;
  for (const [ticker, asset] of Object.entries(TOKENS)) {
    for (const kind of ['bstocks', 'xstocks']) {
      const token = asset[kind];
      if (!token || token.address === null) continue;
      enabled += 1;
      assert.match(token.address, /^0x[0-9a-fA-F]{40}$/, `${ticker}.${kind} address is malformed`);
    }
  }
  // NVDAB, TSLAB, METAB, MSFTB, QQQB, SPCXB and SPCXx (the last one carries thin liquidity).
  assert.equal(enabled, 7, 'expected seven BSC token addresses in the registry');
});

test('unverified issuers stay null rather than pointing at an unverified contract', () => {
  assert.equal(TOKENS.PLTR.bstocks.address, null);
  assert.equal(TOKENS.NVDA.xstocks.address, null);
});
