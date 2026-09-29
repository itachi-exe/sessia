// Sessia monitoring engine — runs on /api/monitor (cron or manual trigger)
// Checks all user watchlists, fetches oracle prices, and fires Telegram alerts

import {
  getAllMonitoredChatIds, getWatchlist, isAlertSuppressed, suppressAlert, recordObservation,
} from './store.js';
import { getOraclePrice, getPancakeQuote, simulateTrade, getMarketSession, TOKENS, SUPPORTED_TICKERS } from '../public/data.mjs';

const TELEGRAM_API = 'https://api.telegram.org';

async function telegramSend(chatId, text) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return;
  try {
    await fetch(`${TELEGRAM_API}/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' }),
    });
  } catch { /* best-effort */ }
}

function formatAlert({ ticker, oraclePrice, deviationPct, session, sim, token }) {
  const direction = deviationPct > 0 ? '▲' : '▼';
  const absDeviation = Math.abs(deviationPct).toFixed(2);
  const lines = [
    `🔔 *SESSIA ALERT — ${ticker}/${token.name}*`,
    ``,
    `*Deviation:* ${direction} ${absDeviation}% vs APRO reference`,
    `*Reference price:* $${oraclePrice.price.toFixed(2)} (${Math.round(oraclePrice.ageSeconds / 60)}min old)`,
    `*Session:* ${session.label}`,
    `*Source:* ${oraclePrice.source}`,
  ];
  if (sim) {
    lines.push('');
    lines.push(`*$100 simulation:*`);
    lines.push(`Route fee: ${sim.routeFeePct}% | Est. slippage: ${sim.slippagePct}%`);
    lines.push(`Est. remaining edge: ${sim.remainingPct > 0 ? '+' : ''}${sim.remainingPct}%`);
    lines.push(`Est. output: $${sim.estimatedOutput}`);
    lines.push(`_${sim.note}_`);
  }
  lines.push('');
  lines.push(`_This is a research signal, not a trade recommendation._`);
  return lines.join('\n');
}

async function checkTicker(ticker) {
  const oraclePrice = await getOraclePrice(ticker);
  if (!oraclePrice || oraclePrice.stale) return null;

  const token = TOKENS[ticker];
  const dexAddress = token?.bstocks?.address || token?.xstocks?.address;
  let dexQuote = null;
  if (dexAddress) {
    dexQuote = await getPancakeQuote(dexAddress, 100).catch(() => null);
  }

  const dexPrice = dexQuote?.pricePerToken ?? null;
  const deviationPct = dexPrice
    ? ((dexPrice - oraclePrice.price) / oraclePrice.price) * 100
    : null;

  const sim = (dexPrice && deviationPct !== null)
    ? simulateTrade({
      refPrice: oraclePrice.price,
      dexPrice,
      tradeUSDT: 100,
      feePct: dexQuote?.poolFeePct ?? 0.25,
      extraSlippagePct: dexQuote?.priceImpactPct ?? 0,
    })
    : null;

  return { ticker, oraclePrice, dexPrice, dexQuote, deviationPct, sim, token };
}

export async function runMonitoringCycle() {
  const session = getMarketSession();

  // Pre-fetch all oracle prices and record observations
  const priceResults = await Promise.allSettled(
    SUPPORTED_TICKERS.map((ticker) => checkTicker(ticker))
  );

  const prices = {};
  for (let i = 0; i < SUPPORTED_TICKERS.length; i++) {
    const ticker = SUPPORTED_TICKERS[i];
    const result = priceResults[i];
    if (result.status === 'fulfilled' && result.value) {
      prices[ticker] = result.value;
      // Record observation for baseline building
      if (result.value.oraclePrice) {
        recordObservation(ticker, {
          ticker,
          oraclePrice: result.value.oraclePrice.price,
          dexPrice: result.value.dexPrice,
          session: session.label,
          ts: Date.now(),
        }).catch(() => {});
      }
    }
  }

  // Get all users to alert
  const chatIds = await getAllMonitoredChatIds();
  const alertsSent = [];

  for (const chatId of chatIds) {
    const watchlist = await getWatchlist(chatId);
    if (!watchlist?.tickers?.length) continue;

    const threshold = watchlist.thresholdPct ?? 1.5;
    const alertSession = watchlist.alertSession ?? 'all';

    // Session filter
    if (alertSession === 'closed' && session.open) continue;
    if (alertSession === 'open' && !session.open) continue;

    for (const ticker of watchlist.tickers) {
      const data = prices[ticker];
      if (!data?.deviationPct) continue;
      if (Math.abs(data.deviationPct) < threshold) continue;

      // Check cooldown
      const suppressed = await isAlertSuppressed(chatId, ticker);
      if (suppressed) continue;

      // Send alert
      const msg = formatAlert({ ...data, session });
      await telegramSend(chatId, msg);
      await suppressAlert(chatId, ticker, 3600); // 1h cooldown
      alertsSent.push({ chatId, ticker, deviationPct: data.deviationPct });
    }
  }

  return {
    session: session.label,
    pricesChecked: Object.keys(prices).length,
    usersChecked: chatIds.length,
    alertsSent,
  };
}
