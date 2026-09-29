import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveTicker, SUPPORTED_TICKERS } from '../public/data.mjs';

test('company names resolve to their supported ticker', () => {
  assert.equal(resolveTicker('NVIDIA'), 'NVDA');
  assert.equal(resolveTicker('nvidia'), 'NVDA');
  assert.equal(resolveTicker('Tesla'), 'TSLA');
  assert.equal(resolveTicker('facebook'), 'META');
  assert.equal(resolveTicker('Nasdaq'), 'QQQ');
});

test('on-chain symbols and plain tickers resolve too', () => {
  assert.equal(resolveTicker('NVDAB'), 'NVDA');
  assert.equal(resolveTicker('NVDAx'), 'NVDA');
  assert.equal(resolveTicker('nvda'), 'NVDA');
});

test('unsupported words resolve to null rather than a guess', () => {
  assert.equal(resolveTicker('AAPL'), null);
  assert.equal(resolveTicker('BITCOIN'), null);
  assert.equal(resolveTicker('monitor'), null);
});

test('every supported ticker resolves to itself', () => {
  for (const ticker of SUPPORTED_TICKERS) assert.equal(resolveTicker(ticker), ticker, ticker);
});