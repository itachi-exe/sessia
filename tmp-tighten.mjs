const { getWatchlist, setWatchlist } = await import('./api/store.js');
const chatId = process.env.CID;
const current = await getWatchlist(chatId);
await setWatchlist(chatId, { ...current, thresholdPct: 0.01 });
const after = await getWatchlist(chatId);
console.log('bar now', after.thresholdPct, 'tickers', after.tickers.join(','));
