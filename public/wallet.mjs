export const BSC_CHAIN = {
  chainId: '0x38',
  chainName: 'BNB Smart Chain',
  nativeCurrency: { name: 'BNB', symbol: 'BNB', decimals: 18 },
  rpcUrls: ['https://bsc-dataseed.binance.org/'],
  blockExplorerUrls: ['https://bscscan.com/'],
};

export function shortenAddress(address) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export const WALLET_MISSING = 'No wallet found in this browser. Open this page inside MetaMask on your phone, or install a BNB Chain wallet app, then tap Connect wallet.';

function walletError(message, code) {
  const error = new Error(message);
  error.code = code;
  return error;
}

export async function connectWallet(provider) {
  if (!provider?.request) throw walletError(WALLET_MISSING, 'wallet-missing');
  const accounts = await provider.request({ method: 'eth_requestAccounts' });
  if (!accounts?.[0]) throw walletError('Your wallet did not share an account. Unlock it and tap Connect wallet again.', 'wallet-empty');
  const currentChain = await provider.request({ method: 'eth_chainId' });
  if (currentChain !== BSC_CHAIN.chainId) {
    try {
      await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: BSC_CHAIN.chainId }] });
    } catch (error) {
      if (error.code !== 4902) throw error;
      await provider.request({ method: 'wallet_addEthereumChain', params: [BSC_CHAIN] });
    }
  }
  return { address: accounts[0], chainId: BSC_CHAIN.chainId };
}
