const KEY = 'sessia-state-v1';

export function createSessiaStore(storage = globalThis.localStorage) {
  let state = read(storage);
  function persist() { try { storage.setItem(KEY, JSON.stringify(state)); } catch { /* Local-only state may be unavailable. Keep the current session usable. */ } }
  return {
    getState: () => structuredClone(state),
    addAsset(asset) {
      const ticker = String(asset.ticker || '').trim().toUpperCase();
      if (!ticker) throw new Error('A ticker is required.');
      if (state.assets.some((item) => item.ticker === ticker && item.representation === asset.representation)) throw new Error('That representation is already being watched.');
      const item = { id: cryptoSafeId(), ticker, representation: String(asset.representation || ticker).trim(), issuer: String(asset.issuer || 'Unverified'), session: asset.session || 'any', createdAt: new Date().toISOString() };
      state.assets.push(item); persist(); return structuredClone(item);
    },
    saveRule(rule) {
      if (!state.assets.some((asset) => asset.id === rule.assetId)) throw new Error('Select a watched asset before creating a rule.');
      const item = { assetId: rule.assetId, thresholdPct: Number(rule.thresholdPct), session: rule.session || 'any', notify: Boolean(rule.notify) };
      state.rules = state.rules.filter((existing) => existing.assetId !== item.assetId);
      state.rules.push(item); persist(); return structuredClone(item);
    },
    removeAsset(assetId) { state.assets = state.assets.filter((asset) => asset.id !== assetId); state.rules = state.rules.filter((rule) => rule.assetId !== assetId); persist(); },
  };
}

export function parseMonitoringRule(input) {
  const text = String(input || '');
  const ticker = (text.match(/\b([A-Z]{1,5})\b/) || [])[1];
  const threshold = text.match(/(?:above|over|greater than)\s+(\d+(?:\.\d+)?)\s*%/i);
  const session = /market is closed|closed.session|while closed/i.test(text) ? 'closed' : /regular|market open/i.test(text) ? 'regular' : 'any';
  if (!ticker || !threshold) throw new Error('Use a ticker and a percentage, for example: “Watch NVDA while the market is closed. Alert me above 1.5%.”');
  return { ticker, thresholdPct: Number(threshold[1]), session };
}

function read(storage) { try { const parsed = JSON.parse(storage.getItem(KEY) || '{"assets":[],"rules":[]}'); return { assets: Array.isArray(parsed.assets) ? parsed.assets : [], rules: Array.isArray(parsed.rules) ? parsed.rules : [] }; } catch { return { assets: [], rules: [] }; } }
function cryptoSafeId() { return globalThis.crypto?.randomUUID?.() || `asset-${Date.now()}-${Math.random().toString(16).slice(2)}`; }
