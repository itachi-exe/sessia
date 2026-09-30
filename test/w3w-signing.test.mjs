// Binance Web3 API client: signature construction, header contract, error mapping.
//
// The signature is pinned to an independently computed HMAC-SHA256 vector, and to
// a preHash that visibly carries the /build prefix. Dropping that prefix is the
// documented cause of 40102 and cannot be caught by a live call until a key exists,
// so it is caught here instead.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

import {
  buildRequest,
  buildSignature,
  summarizeQuote,
  W3W_ERRORS,
  W3WError,
  w3wConfigured,
  w3wQuote,
  w3wRwaPrice,
} from '../agent/w3w.js';

test('the signed path carries the /build prefix and the raw query', () => {
  const built = buildRequest({
    method: 'GET',
    path: '/api/v1/dex/market/price',
    query: { chainId: 1, symbol: 'ETH USDT' },
    apiKey: 'test-key',
    secret: 'test-secret',
    timestamp: '2026-05-11T10:08:57.715Z',
  });
  assert.equal(built.requestPath, '/build/api/v1/dex/market/price?chainId=1&symbol=ETH+USDT');
  assert.equal(built.url, 'https://web3.binance.com/build/api/v1/dex/market/price?chainId=1&symbol=ETH+USDT');
  assert.equal(built.headers['X-OC-APIKEY'], 'test-key');
  assert.equal(built.headers['X-OC-TIMESTAMP'], '2026-05-11T10:08:57.715Z');
});

test('the signature matches an independently computed HMAC-SHA256', () => {
  const timestamp = '2026-05-11T10:08:57.715Z';
  const requestPath = '/build/api/v1/dex/market/price?chainId=1&symbol=ETH+USDT';
  const secret = 'test-secret';
  const preHash = `${timestamp}GET${requestPath}`;
  const expected = crypto.createHmac('sha256', secret).update(preHash, 'utf8').digest('base64');

  const signature = buildSignature({ timestamp, method: 'GET', requestPath, body: '', secret });
  assert.equal(signature, expected);
  // Same inputs, same bytes: the header can never disagree with the request URL.
  assert.equal(buildSignature({ timestamp, method: 'GET', requestPath, body: '', secret }), expected);
});

test('a POST body is part of the signed string', () => {
  const base = { timestamp: '2026-05-11T10:08:57.715Z', method: 'POST', requestPath: '/build/api/v1/dex/market/rwa/price', secret: 'test-secret' };
  assert.notEqual(
    buildSignature({ ...base, body: '' }),
    buildSignature({ ...base, body: '{"tokenContractAddress":["0xabc"]}' }),
  );
});

test('credentials missing is a named error, not a silent empty read', async () => {
  assert.equal(w3wConfigured({}), false);
  assert.equal(w3wConfigured({ W3W_API_KEY: 'a', W3W_SECRET_KEY: 'b' }), true);
  await assert.rejects(
    () => w3wQuote({ fromTokenAddress: '0x1', toTokenAddress: '0x2', amount: '1', env: {} }),
    (error) => {
      assert.ok(error instanceof W3WError);
      assert.equal(error.code, 'NOT_CONFIGURED');
      return true;
    },
  );
});

test('a signed request sends the four documented headers', async () => {
  const original = globalThis.fetch;
  const seen = [];
  globalThis.fetch = async (url, options) => {
    seen.push({ url, options });
    return { status: 200, ok: true, json: async () => ({ code: '0', data: { routes: [] } }) };
  };
  try {
    await w3wQuote({
      fromTokenAddress: '0x55d398326f99059fF775485246999027B3197955',
      toTokenAddress: '0x02fca66c1d1afb4e2a7884261eb00f63598a7436',
      amount: '100000000000000000000',
      userWalletAddress: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC',
      env: { W3W_API_KEY: 'test-key', W3W_SECRET_KEY: 'test-secret' },
    });
    assert.equal(seen.length, 1);
    const headers = seen[0].options.headers;
    for (const name of ['X-OC-APIKEY', 'X-OC-TIMESTAMP', 'X-OC-SIGN']) {
      assert.ok(headers[name], `${name} missing`);
    }
    assert.equal(headers['Accept-Encoding'], 'identity');
    // The URL that goes out and the string that was signed are the same path.
    assert.ok(seen[0].url.includes('/build/api/v1/dex/aggregator/quote?'));
    const signed = crypto
      .createHmac('sha256', 'test-secret')
      .update(`${headers['X-OC-TIMESTAMP']}GET${'/build/api/v1/dex/aggregator/quote'
        + new URL(seen[0].url).search}`, 'utf8')
      .digest('base64');
    assert.equal(headers['X-OC-SIGN'], signed);
  } finally {
    globalThis.fetch = original;
  }
});

test('server side error codes carry their documented meaning', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => ({ status: 200, ok: true, json: async () => ({ code: 40102, msg: 'Signature error' }) });
  try {
    await assert.rejects(
      () => w3wRwaPrice({ tokenContractAddress: '0x1', env: { W3W_API_KEY: 'k', W3W_SECRET_KEY: 's' } }),
      (error) => {
        assert.equal(error.code, 40102);
        assert.match(error.message, /signature mismatch or missing/);
        return true;
      },
    );
  } finally {
    globalThis.fetch = original;
  }
});

test('the documented error table keeps the entries the equity flow depends on', () => {
  for (const [code, meaning] of Object.entries({ 40101: /API key/, 40102: /signature/, 40367: /market hours/, 40401: /expired/ })) {
    assert.match(W3W_ERRORS[code], meaning);
  }
});

test('quote summary picks the best route and keeps every vendor', () => {
  const summary = summarizeQuote({
    routes: [
      { vendorName: 'LiquidMesh', executionMode: 'RFQ', toTokenAmount: '999000', priceImpactPercent: '0.01', quoteId: 'a' },
      { vendorName: 'PcsXRfq', executionMode: 'RFQ', toTokenAmount: '1005000', priceImpactPercent: '0.00', quoteId: 'b' },
    ],
  });
  assert.equal(summary.routeCount, 2);
  assert.equal(summary.best.vendor, 'PcsXRfq');
  assert.equal(summary.routes.length, 2);
  assert.deepEqual(summarizeQuote(null), { routes: [], best: null, routeCount: 0 });
});
