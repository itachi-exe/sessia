// Live smoke test for the Binance Web3 reads. Not part of `npm test`: it needs
// network. Output is the raw material for docs/DEVEX-REPORT.md, so it prints
// latencies and the exact numbers it saw rather than a pass/fail.
//
//   node scripts/binance-smoke.mjs [TICKER...]

import {
  binanceHealth,
  getAssetStatus,
  getCompanyProfile,
  getMarketStatus,
  getRwaTokens,
  getTokenCandles,
  getVenueBoard,
  getTokenDynamic,
  BSC_CHAIN_ID,
} from '../public/binance.mjs';

const withLatency = async (label, fn) => {
  const started = Date.now();
  try {
    const value = await fn();
    return { label, ok: true, ms: Date.now() - started, value };
  } catch (error) {
    return { label, ok: false, ms: Date.now() - started, error: `${error.name}: ${error.message}` };
  }
};

const tickers = process.argv.slice(2).length ? process.argv.slice(2) : ['NVDA', 'TSLA', 'PLTR'];

const results = [];
results.push(await withLatency('GET rwa/stock/detail/list/ai (BSC)', () => getRwaTokens({ chainId: BSC_CHAIN_ID, fresh: true })));
results.push(await withLatency('GET rwa/market/status/ai', () => getMarketStatus({ fresh: true })));
results.push(await withLatency('GET rwa/market/status/ai (cached)', () => getMarketStatus()));

for (const ticker of tickers) {
  results.push(await withLatency(`GET rwa/dynamic/ai + asset/market/status (${ticker})`, () => getVenueBoard(ticker)));
}

const catalog = results[0];
if (catalog.ok) {
  const byIssuer = catalog.value.reduce((acc, token) => {
    acc[token.issuer] = (acc[token.issuer] || 0) + 1;
    return acc;
  }, {});
  console.log(`catalog: ${catalog.value.length} tokens on chain 56, ${JSON.stringify(byIssuer)}`);
}

for (const result of results) {
  if (!result.ok) {
    console.log(`${String(result.ms).padStart(6)}ms  FAIL  ${result.label} -> ${result.error}`);
    continue;
  }
  console.log(`${String(result.ms).padStart(6)}ms  ok    ${result.label}`);
  if (result.label.includes('status/ai') && !result.label.includes('cached')) {
    console.log(`          session=${result.value.status} label="${result.value.label}" openState=${result.value.openState} nextOpen=${result.value.nextOpen}`);
  }
  if (Array.isArray(result.value)) continue;
  if (result.value?.venues) {
    for (const venue of result.value.venues) {
      console.log(
        `          ${venue.issuer.padEnd(8)} ${String(venue.symbol).padEnd(8)} $${venue.price} holders=${venue.holders} ` +
          `mult=${venue.sharesMultiplier} pe=${venue.priceToEarnings} reason=${venue.reasonCode}`,
      );
    }
    console.log(`          spread across issuers: ${result.value.spreadPct}%`);
  }
}

const nvda = (await getRwaTokens()).find((token) => token.symbol === 'NVDAB');
if (nvda) {
  const profile = await withLatency('GET rwa/meta/ai', () => getCompanyProfile({ address: nvda.address }));
  const candles = await withLatency('GET token/kline/ai', () => getTokenCandles({ address: nvda.address, interval: '1h', limit: 3 }));
  const asset = await withLatency('GET rwa/asset/market/status/ai', () => getAssetStatus({ address: nvda.address, fresh: true }));
  const dynamic = await withLatency('GET rwa/dynamic/ai (single)', () => getTokenDynamic({ address: nvda.address, fresh: true }));
  for (const result of [profile, asset, dynamic, candles]) {
    console.log(`${String(result.ms).padStart(6)}ms  ${result.ok ? 'ok  ' : 'FAIL'}  ${result.label}${result.ok ? '' : ` -> ${result.error}`}`);
  }
  console.log('profile:', profile.value?.companyName, '| daily attestation:', profile.value?.dailyAttestation);
  console.log('asset state:', asset.value?.status, asset.value?.reasonCode, asset.value?.reasonMsg);
  console.log('candles(1h, last close):', candles.value?.at(-1));
}

console.log('health:', JSON.stringify(await binanceHealth()));

// The registry in public/data.mjs is the asset universe this product is built on. If a
// bStocks address ever drifts from the one Binance publishes for the same ticker, the
// oracle read is aimed at the wrong contract, so this check prints on every run.
const { TOKENS } = await import('../public/data.mjs');
const catalogFor = await getRwaTokens();
console.log('\nregistry cross-check (public/data.mjs vs Binance RWA registry)');
for (const [ticker, token] of Object.entries(TOKENS)) {
  const address = token?.bstocks?.address?.toLowerCase() ?? null;
  if (!address) {
    const listing = catalogFor.find((entry) => entry.symbol?.toLowerCase() === String(token?.bstocks?.symbol ?? '').toLowerCase());
    console.log(
      `  ${ticker.padEnd(5)} no verified pool address in this registry${
        listing ? `; Binance lists ${listing.symbol} at ${listing.address}` : '; not listed by Binance either'
      }`,
    );
    continue;
  }
  const row = catalogFor.find((entry) => entry.address?.toLowerCase() === address);
  console.log(`  ${ticker.padEnd(5)} ${address} ${row ? `ok  ${row.symbol} ${row.issuer}` : 'NOT FOUND in the Binance registry'}`);
}

process.exit(0);
