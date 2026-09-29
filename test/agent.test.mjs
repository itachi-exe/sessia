import test from 'node:test';
import assert from 'node:assert/strict';
import { createAgentReply } from '../public/agent.mjs';

test('agent responds to a stock monitoring instruction with a concrete confirmation', () => {
  const reply = createAgentReply('Watch NVDA when it moves more than 2% while the market is closed.');
  assert.match(reply, /NVDA/);
  assert.match(reply, /2%/);
  assert.match(reply, /closed/i);
});

test('agent responds to simulation requests with a clear research limitation', () => {
  const reply = createAgentReply('Simulate a $100 trade for NVDA.');
  assert.match(reply, /\$100/);
  assert.match(reply, /estimate/i);
  assert.match(reply, /not.*transaction/i);
});
