#!/usr/bin/env node
// Sessia monitor pinger — runs every 5 minutes via pm2
// Calls the Sessia /api/monitor endpoint with the cron secret

const ENDPOINT = 'https://sessia-beta.vercel.app/api/monitor';
const SECRET = process.env.SESSIA_CRON_SECRET || '';
const INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

async function ping() {
  try {
    const res = await fetch(ENDPOINT, {
      method: 'GET',
      headers: { Authorization: `Bearer ${SECRET}` },
      signal: AbortSignal.timeout(20000),
    });
    const body = await res.json();
    console.log(`[sessia-cron] ${new Date().toISOString()} — ${res.status} pricesChecked=${body.pricesChecked} alertsSent=${body.alertsSent?.length ?? 0} session=${body.session}`);
  } catch (err) {
    console.error(`[sessia-cron] ${new Date().toISOString()} — error: ${err.message}`);
  }
}

// Run immediately then on interval
ping();
setInterval(ping, INTERVAL_MS);
console.log(`[sessia-cron] Started. Pinging ${ENDPOINT} every 5 minutes.`);
