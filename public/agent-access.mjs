// Wallet access for the agent page. One signature covers one UTC day, so a returning
// visitor signs once, and the allowance follows the wallet rather than the browser.

import { connectWallet } from './wallet.mjs';

export const ACCESS_PREFIX = 'Sessia agent access';
const STORE_KEY = 'sessia-agent-access';

export function dayKey(now = Date.now()) {
  return new Date(now).toISOString().slice(0, 10);
}

export function accessChallenge(address, now = Date.now()) {
  return `${ACCESS_PREFIX}\n${String(address).toLowerCase()}\n${dayKey(now)}`;
}

export function storedAccess() {
  try {
    const value = JSON.parse(window.localStorage.getItem(STORE_KEY) || 'null');
    if (value?.address && value?.signature && value.day === dayKey()) return value;
  } catch { /* storage unavailable */ }
  return null;
}

export async function signIn(provider) {
  const target = provider || window.ethereum;
  const { address } = await connectWallet(target);
  const signature = await target.request({ method: 'personal_sign', params: [accessChallenge(address), address] });
  const value = { address, signature, day: dayKey() };
  try { window.localStorage.setItem(STORE_KEY, JSON.stringify(value)); } catch { /* storage unavailable */ }
  return value;
}

export function clearAccess() {
  try { window.localStorage.removeItem(STORE_KEY); } catch { /* storage unavailable */ }
}
