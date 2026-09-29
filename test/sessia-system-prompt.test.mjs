import test from 'node:test';
import assert from 'node:assert/strict';
import { SESSIA_SYSTEM_PROMPT } from '../public/sessia-system-prompt.mjs';

test('Sessia prompt defines personalization, evidence, and user-confirmed action constraints', () => {
  assert.match(SESSIA_SYSTEM_PROMPT, /personal research agent/i);
  assert.match(SESSIA_SYSTEM_PROMPT, /User Memory/i);
  assert.match(SESSIA_SYSTEM_PROMPT, /Observed facts/i);
  assert.match(SESSIA_SYSTEM_PROMPT, /Never invent/i);
  assert.match(SESSIA_SYSTEM_PROMPT, /explicit user confirmation/i);
});

test('Sessia prompt has a smooth flow for first interaction and alerts', () => {
  assert.match(SESSIA_SYSTEM_PROMPT, /First conversation/i);
  assert.match(SESSIA_SYSTEM_PROMPT, /signal.*investigate.*explain.*simulate.*act/is);
  assert.match(SESSIA_SYSTEM_PROMPT, /Telegram/i);
});
