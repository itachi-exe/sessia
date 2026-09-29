const GENERIC_ERROR = 'Something did not load. Please try again.';

export function safeErrorMessage(error) {
  if (error?.code === 4001) return 'Wallet connection was cancelled.';
  if (error?.code === -32002) return 'Your wallet already has a connection request open.';
  return GENERIC_ERROR;
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
