// Agent commerce: identity file, x402 challenge, terms checks, ERC-8183 deliverable.
//
// The canonical JSON form is the one thing that must not drift: the SDK hashes the
// same string this repo produces. Python does it in the same test.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { buildAgentCard, buildRegistrationFile } from '../agent/agent-card.js';
import { canonicalJson, keccakOfCanonicalJson } from '../agent/canonical.js';
import { JobError, buildDeliverable, parseJobDescription } from '../agent/erc8183.js';
import { U_BSC, challenge, checkTerms, parsePaymentEnvelope, priceToBaseUnits, verifyPayment } from '../agent/x402.js';

const BASE = 'https://sessia-beta.vercel.app';
const PAY_TO = '0x' + '11'.repeat(20);

test('canonical JSON matches Python json.dumps for the same structure', () => {
  const value = { z: [1, 'two', { b: true, a: null }], a: { n: 'line\nbreak', u: 'ü' }, m: 0.5 };
  const js = canonicalJson(value);
  const py = execFileSync('python3', ['-c',
    'import json,sys; print(json.dumps(json.loads(sys.stdin.read()), sort_keys=True, separators=(",", ":"), ensure_ascii=True))',
  ], { input: JSON.stringify(value) }).toString().trim();
  assert.equal(js, py);
  assert.equal(js.slice(0, 8), '{"a":{"n');
});

test('registration file carries the EIP-8004 keys and one ERC8183 service', () => {
  const file = buildRegistrationFile({ baseUrl: BASE, env: { X402_PAY_TO: PAY_TO } });
  assert.equal(file.type, 'https://eips.ethereum.org/EIPS/eip-8004#registration-v1');
  assert.equal(file.name, 'Sessia');
  assert.ok(file.services.some((s) => s.name === 'ERC8183'));
  assert.ok(file.services.some((s) => s.name === 'web'));
  const card = buildAgentCard({ baseUrl: BASE, env: { X402_PAY_TO: PAY_TO } });
  const x402 = card.x402;
  assert.equal(x402.protocol, 'x402');
  assert.equal(x402.priceUsd, 0.05);
  assert.equal(x402.network, U_BSC.network);
  assert.equal(x402.asset, U_BSC.address);
  assert.equal(x402.payTo, PAY_TO);
});

test('the 402 challenge is the v2 shape a Studio buyer signs against', () => {
  const env = { X402_PAY_TO: PAY_TO };
  const body = challenge({ resource: `${BASE}/api/agent/research?ticker=NVDA`, env });
  assert.equal(body.x402Version, 2);
  assert.equal(body.accepts.length, 1);
  assert.equal(body.accepts[0].scheme, 'exact');
  assert.equal(body.accepts[0].network, U_BSC.network);
  assert.equal(body.accepts[0].amount, priceToBaseUnits(0.05));
  assert.equal(body.accepts[0].extra.name, 'United Stables');
  assert.equal(body.accepts[0].maxTimeoutSeconds, 300);
  assert.equal(body.resource, `${BASE}/api/agent/research?ticker=NVDA`);
});

function envelopeFor(requirement, changes = {}) {
  const auth = Object.assign({
    from: '0x' + '22'.repeat(20),
    to: requirement.payTo,
    value: requirement.amount,
    validAfter: 0,
    validBefore: Math.floor(Date.now() / 1000) + 300,
    nonce: '0x' + 'ab'.repeat(32),
  }, changes.authorization);
  const envelope = {
    x402Version: 2,
    scheme: 'exact',
    network: changes.network || requirement.network,
    payload: { signature: '0x' + 'cd'.repeat(65), authorization: auth },
  };
  return { envelope, header: Buffer.from(JSON.stringify(envelope), 'utf-8').toString('base64') };
}

test('the envelope round trips, and terms catch a wrong payee or a short payment', () => {
  const requirement = challenge({ resource: 'r', env: { X402_PAY_TO: PAY_TO } }).accepts[0];
  const built = envelopeFor(requirement);
  const parsed = parsePaymentEnvelope(built.header);
  assert.equal(parsed.authorization.to, PAY_TO);
  assert.equal(parsed.network, U_BSC.network);
  assert.equal(checkTerms({ envelope: parsed, requirement }).ok, true);

  const wrongPayee = envelopeFor(requirement, { authorization: { to: '0x' + '33'.repeat(20) } });
  assert.equal(checkTerms({ envelope: wrongPayee.envelope, requirement }).ok, false);

  const short = envelopeFor(requirement, { authorization: { value: '1' } });
  assert.equal(checkTerms({ envelope: short.envelope, requirement }).ok, false);

  const expired = envelopeFor(requirement, { authorization: { validBefore: 1 } });
  assert.equal(checkTerms({ envelope: expired.envelope, requirement }).ok, false);

  const otherChain = envelopeFor(requirement, { network: 'eip155:97' });
  assert.equal(checkTerms({ envelope: otherChain.envelope, requirement }).ok, false);
});

test('verifyPayment refuses when no facilitator is configured', async () => {
  const requirement = challenge({ resource: 'r', env: { X402_PAY_TO: PAY_TO } }).accepts[0];
  const built = envelopeFor(requirement);
  const verdict = await verifyPayment({ header: built.header, requirement, env: {} });
  assert.equal(verdict.ok, false);
  assert.match(verdict.reason, /facilitator/);
});

test('the deliverable manifest hashes the same bytes the buyer will submit', () => {
  const payload = { ticker: 'NVDA', price: 228.19 };
  const built = buildDeliverable({ jobId: 7, chainId: 56, payload, deliverableUrl: `${BASE}/api/agent/research?ticker=NVDA` });
  assert.equal(built.manifest.job_id, 7);
  assert.equal(built.manifest.chain_id, 56);
  assert.equal(built.manifest.response, canonicalJson(payload));
  assert.equal(built.hash, keccakOfCanonicalJson(built.manifest));
  assert.match(built.hash, /^0x[0-9a-f]{64}$/);
  assert.equal(built.optParams.deliverable_url, `${BASE}/api/agent/research?ticker=NVDA`);
});

test('a job description without an id or a chain is refused by name', () => {
  assert.throws(() => parseJobDescription({ input: 'NVDA' }), JobError);
  assert.throws(() => parseJobDescription('not json'), JobError);
  const job = parseJobDescription({ job_id: '7', chain_id: '56', input: 'NVDA' });
  assert.equal(job.jobId, 7);
  assert.equal(job.chainId, 56);
  assert.equal(job.capability, 'stock-research');
  assert.equal(job.input, 'NVDA');
});
