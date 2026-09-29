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

export async function connectWallet(provider) {
  if (!provider?.request) throw new Error('Wallet provider not found. Install or unlock MetaMask, then try again.');
  const accounts = await provider.request({ method: 'eth_requestAccounts' });
  if (!accounts?.[0]) throw new Error('No wallet account was approved.');
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
