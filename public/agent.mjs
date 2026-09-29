export { SESSIA_SYSTEM_PROMPT } from './sessia-system-prompt.mjs';

export function createAgentReply(message) {
  const text = message.trim();
  const ticker = text.match(/\b([A-Z]{2,5})\b/)?.[1] || 'this asset';
  const amount = text.match(/\$[\d,]+/)?.[0];
  const threshold = text.match(/\b(\d+(?:\.\d+)?)%/)?.[0];
  const closed = /closed|after hours|overnight/i.test(text);

  if (/simulat|trade size|route/i.test(text)) {
    return `I can model ${amount || 'your selected'} ${ticker} route with available fees and slippage. The result is an estimate for research, not a transaction or profit claim.`;
  }
  if (/watch|monitor|alert/i.test(text)) {
    return `I will monitor ${ticker}${threshold ? ` for moves above ${threshold}` : ''}${closed ? ' while the traditional market is closed' : ''}. I will report the reference timestamp, session baseline, and execution limits when it triggers.`;
  }
  if (/why|explain|investigat|deviation/i.test(text)) {
    return `For ${ticker}, I will separate observed price and reference data from calculated deviation, then call out session context, peer representations, liquidity, and missing evidence.`;
  }
  return `I am ready to research ${ticker}. Ask me to monitor an asset, investigate a deviation, or simulate a supported route.`;
}
