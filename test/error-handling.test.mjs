import test from 'node:test';
import assert from 'node:assert/strict';
import { safeErrorMessage, safeParseJson, safeStorageValue } from '../public/error-handling.mjs';

test('safeErrorMessage never exposes backend, provider, or stack details', () => {
  assert.equal(safeErrorMessage(new Error('FetchError: POST https://secret.example/api failed')), 'Something did not load. Please try again.');
  assert.equal(safeErrorMessage({ code: 4001 }), 'Wallet connection was cancelled.');
  assert.equal(safeErrorMessage({ code: -32002 }), 'Your wallet already has a connection request open.');
});

test('safe JSON and storage parsing fall back without throwing', () => {
  assert.equal(safeParseJson('{bad json}', null), null);
  assert.deepEqual(safeParseJson('{"connected":true}', {}), { connected: true });
  assert.equal(safeStorageValue(() => { throw new Error('storage denied'); }, 'fallback'), 'fallback');
});
