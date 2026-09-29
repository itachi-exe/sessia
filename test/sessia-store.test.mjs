import test from 'node:test';
import assert from 'node:assert/strict';
import { createSessiaStore, parseMonitoringRule } from '../public/sessia-store.mjs';

function memoryStorage() {
  const data = new Map();
  return { getItem: (key) => data.get(key) || null, setItem: (key, value) => data.set(key, value) };
}

test('watchlist persists a supported asset with a user-defined monitoring preference', () => {
  const storage = memoryStorage();
  const store = createSessiaStore(storage);
  const asset = store.addAsset({ ticker: 'NVDA', representation: 'NVDAB', issuer: 'bStocks', session: 'closed' });
  store.saveRule({ assetId: asset.id, thresholdPct: 1.5, session: 'closed', notify: true });

  const reloaded = createSessiaStore(storage);
  assert.equal(reloaded.getState().assets.length, 1);
  assert.deepEqual(reloaded.getState().rules[0], { assetId: asset.id, thresholdPct: 1.5, session: 'closed', notify: true });
});

test('plain language rule parser extracts ticker, threshold, and market session', () => {
  assert.deepEqual(parseMonitoringRule('Watch NVDA while the market is closed. Alert me above 1.5%.'), {
    ticker: 'NVDA', thresholdPct: 1.5, session: 'closed'
  });
});
