import test from 'node:test';
import assert from 'node:assert/strict';
import { BSC_CHAIN, connectWallet, shortenAddress } from '../public/wallet.mjs';

test('connectWallet requests accounts and switches to BNB Smart Chain when needed', async () => {
  const calls = [];
  const provider = { request: async ({ method, params }) => { calls.push({ method, params }); if (method === 'eth_requestAccounts') return ['0x1234567890123456789012345678901234567890']; if (method === 'eth_chainId') return '0x1'; if (method === 'wallet_switchEthereumChain') return null; } };
  const wallet = await connectWallet(provider);
  assert.equal(wallet.address, '0x1234567890123456789012345678901234567890');
  assert.equal(wallet.chainId, BSC_CHAIN.chainId);
  assert.deepEqual(calls.map(call => call.method), ['eth_requestAccounts', 'eth_chainId', 'wallet_switchEthereumChain']);
});

test('shortenAddress retains identifying prefix and suffix', () => assert.equal(shortenAddress('0x1234567890123456789012345678901234567890'), '0x1234…7890'));
