const GENERIC_ERROR = 'Something did not load. Please try again.';

const MESSAGES = {
  4001: 'Wallet connection was cancelled.',
  '-32002': 'Your wallet already has a connection request open.',
  'wallet-missing': 'No wallet found in this browser. Open this page inside MetaMask on your phone, or install a BNB Chain wallet app, then tap Connect wallet.',
  'wallet-empty': 'Your wallet did not share an account. Unlock it and tap Connect wallet again.',
};

export function safeErrorMessage(error) {
  return MESSAGES[String(error?.code)] || GENERIC_ERROR;
}

export function safeParseJson(value, fallback) {
  try { return JSON.parse(value); } catch { return fallback; }
}

export function safeStorageValue(getter, fallback) {
  try { return getter(); } catch { return fallback; }
}

export async function safeFetchJson(url, options) {
  try {
    const response = await fetch(url, options);
    if (!response.ok) throw new Error('request failed');
    return await response.json();
  } catch { throw new Error(GENERIC_ERROR); }
}

export function installGlobalErrorHandling(report) {
  const safeReport = () => report(GENERIC_ERROR);
  window.addEventListener('error', (event) => { event.preventDefault(); safeReport(); });
  window.addEventListener('unhandledrejection', (event) => { event.preventDefault(); safeReport(); });
}
