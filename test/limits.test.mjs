import test from 'node:test';
import assert from 'node:assert/strict';
import { privateKeyToAccount } from 'viem/accounts';
import { accessChallenge, consumeGlobalBudget, consumeTelegramMessage, consumeWalletMessage, dayKey, verifyWalletAccess } from '../api/limits.js';

// A throwaway key that only exists in this test. No funds, no chain history.
const ACCOUNT = privateKeyToAccount('0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d');

test('the daily key is UTC and the challenge binds address and day', () => {
  const now = Date.UTC(2026, 8, 29, 23, 30);
  assert.equal(dayKey(now), '2026-09-29');
  assert.match(accessChallenge('0xABC', now), /0xabc\n2026-09-29$/);
});

// Same semantics as the store's counter, in memory, so the limit maths is tested
// without touching Blob.
function memoryCounter() {
  const seen = new Map();
  return async (key, limit) => {
    const used = seen.get(key) ?? 0;
    if (used >= limit) return { allowed: false, used, limit };
    seen.set(key, used + 1);
    return { allowed: true, used: used + 1, limit };
  };
}

test('a telegram chat gets exactly its daily allowance', async () => {
  const counter = memoryCounter();
  const first = await consumeTelegramMessage('chat-1', { limit: 2, counter });
  const second = await consumeTelegramMessage('chat-1', { limit: 2, counter });
  const third = await consumeTelegramMessage('chat-1', { limit: 2, counter });
  assert.equal(first.allowed, true);
  assert.equal(second.allowed, true);
  assert.equal(third.allowed, false);
  assert.equal(third.used, 2);
});

test('the product wide budget stops the day when it is spent', async () => {
  const counter = memoryCounter();
  const first = await consumeGlobalBudget({ limit: 2, counter });
  const second = await consumeGlobalBudget({ limit: 2, counter });
  const third = await consumeGlobalBudget({ limit: 2, counter });
  assert.deepEqual([first.allowed, second.allowed, third.allowed], [true, true, false]);
  assert.equal(third.remaining, 0);
});
test('a wallet gets exactly five answers a day', async () => {
  const counter = memoryCounter();
  const results = [];
  for (let index = 0; index < 6; index += 1) results.push(await consumeWalletMessage('0xabc', { counter }));
  assert.deepEqual(results.slice(0, 5).map((entry) => entry.allowed), [true, true, true, true, true]);
  assert.equal(results[5].allowed, false);
  assert.equal(results[5].limit, 5);
});

async function withStubbedNonce(nonce, run) {
  const original = globalThis.fetch;
  globalThis.fetch = async () => ({ json: async () => ({ result: nonce }) });
  try {
    return await run();
  } finally {
    globalThis.fetch = original;
  }
}

test('a wallet that never signed is refused', async () => {
  const result = await verifyWalletAccess({ address: ACCOUNT.address });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'no_signature');
});

test('a signature alone is not enough for a fresh wallet', async () => {
  const now = Date.UTC(2026, 8, 29, 12, 0);
  const signature = await ACCOUNT.signMessage({ message: accessChallenge(ACCOUNT.address, now) });
  const result = await withStubbedNonce('0x0', () => verifyWalletAccess({ address: ACCOUNT.address, signature, now }));
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'no_transactions');
});

test('a signed wallet that has sent a transaction is allowed', async () => {
  const now = Date.UTC(2026, 8, 29, 12, 0);
  const signature = await ACCOUNT.signMessage({ message: accessChallenge(ACCOUNT.address, now) });
  const result = await withStubbedNonce('0x5', () => verifyWalletAccess({ address: ACCOUNT.address, signature, now }));
  assert.equal(result.ok, true);
  assert.equal(result.transactions, 5);
});

test('a signature from another day does not carry over', async () => {
  const now = Date.UTC(2026, 8, 29, 12, 0);
  const other = Date.UTC(2026, 9, 1, 12, 0);
  const signature = await ACCOUNT.signMessage({ message: accessChallenge(ACCOUNT.address, other) });
  const result = await withStubbedNonce('0x5', () => verifyWalletAccess({ address: ACCOUNT.address, signature, now }));
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'bad_signature');
});

