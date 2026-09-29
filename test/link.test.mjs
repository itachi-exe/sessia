import test from 'node:test';
import assert from 'node:assert/strict';

// The store has no memory fallback in production on purpose. The suite turns it on so the
// link logic is exercised without touching a network store.
process.env.SESSIA_STORE_MODE = 'memory';
const {
  setLinkCode, takeLinkCode, setChatWallet, getChatWallet, getWalletChat, clearChatWallet,
  conversationKeyFor,
} = await import('../api/store.js');

const ADDRESS = '0x8f3cf7ad23cd3cadbd9735aff958023239c6a063';

test('a link code works once and then is gone', async () => {
  await setLinkCode('AB12CD34', ADDRESS);
  assert.equal(await takeLinkCode('ab12cd34'), ADDRESS, 'the code redeems for the signed wallet');
  assert.equal(await takeLinkCode('AB12CD34'), null, 'a second use is refused');
});

test('a chat and a wallet point at each other until unlinked', async () => {
  const chatId = 'link-test-chat';
  await setChatWallet(chatId, ADDRESS.toUpperCase());
  assert.equal(await getChatWallet(chatId), ADDRESS, 'the chat resolves to the wallet');
  assert.equal(await getWalletChat(ADDRESS), chatId, 'the wallet resolves back to the chat');
  await clearChatWallet(chatId, ADDRESS);
  assert.equal(await getChatWallet(chatId), null);
  assert.equal(await getWalletChat(ADDRESS), null);
});

test('an expired code is refused', async () => {
  await setLinkCode('ZZ99YY88', ADDRESS, -1);
  assert.equal(await takeLinkCode('ZZ99YY88'), null);
});

test('a linked chat shares the wallet conversation key', async () => {
  const chatId = 'test-chat-2';
  assert.equal(await conversationKeyFor(chatId), chatId);
  await setChatWallet(chatId, ADDRESS);
  assert.equal(await conversationKeyFor(chatId), `wallet-${ADDRESS}`);
  await clearChatWallet(chatId, ADDRESS);
  assert.equal(await conversationKeyFor(chatId), chatId);
});

test('an unknown code is refused', async () => {
  assert.equal(await takeLinkCode('NOPE1234'), null);
});
