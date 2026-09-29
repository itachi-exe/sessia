import test from 'node:test';
import assert from 'node:assert/strict';
import { chatEnabled, chatReply } from '../agent/chat.js';

test('chatEnabled follows the presence of DEEPSEEK_API_KEY', () => {
  const saved = process.env.DEEPSEEK_API_KEY;
  delete process.env.DEEPSEEK_API_KEY;
  assert.equal(chatEnabled(), false);
  process.env.DEEPSEEK_API_KEY = 'test-key';
  assert.equal(chatEnabled(), true);
  if (saved === undefined) delete process.env.DEEPSEEK_API_KEY; else process.env.DEEPSEEK_API_KEY = saved;
});

test('chatReply returns null without a key instead of throwing', async () => {
  const saved = process.env.DEEPSEEK_API_KEY;
  delete process.env.DEEPSEEK_API_KEY;
  const answer = await chatReply({ text: 'what is NVDA trading at?', watchlist: null, history: [] });
  assert.equal(answer, null);
  if (saved === undefined) delete process.env.DEEPSEEK_API_KEY; else process.env.DEEPSEEK_API_KEY = saved;
});