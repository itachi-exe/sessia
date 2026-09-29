import { buildInvestigation, simulateTrade } from './research-engine.mjs';
import { createSessiaStore, parseMonitoringRule } from './sessia-store.mjs';
import { connectWallet, shortenAddress } from './wallet.mjs';
import { installGlobalErrorHandling, safeErrorMessage } from './error-handling.mjs';

const observation = { asset: 'NVIDIA', symbol: 'xNVDA', issuer: 'OpenFi', tokenPrice: 184.21, referencePrice: 180.41, observedAt: '2026-09-22T08:42:00.000Z', referenceAt: '2026-09-22T08:41:00.000Z', session: 'US market closed', baselineLow: 0.3, baselineHigh: 0.8, baselineSamples: 148, peerDeviation: 0.6, dataMode: 'Recorded demo data' };
const report = buildInvestigation(observation);
const store = createSessiaStore();
const $ = (selector) => document.querySelector(selector);
const escapeHtml = (value) => String(value).replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]);

$('#evidence-list').innerHTML = report.observations.map((item, i) => `<li><b>0${i + 1}</b><span>${escapeHtml(item)}</span></li>`).join('');
$('#signal-summary').textContent = report.signals[1] + ' ' + report.signals[2];
$('#dialog-body').innerHTML = `<section><h3>Observed facts</h3>${report.observations.map(item => `<p>${escapeHtml(item)}</p>`).join('')}</section><section><h3>Calculated signals</h3>${report.signals.map(item => `<p>${escapeHtml(item)}</p>`).join('')}</section><section><h3>Limitations</h3>${report.limitations.map(item => `<p>${escapeHtml(item)}</p>`).join('')}</section>`;

function refreshSimulation() {
  const amountUsd = Number($('#trade-size').value);
  const simulation = simulateTrade({ amountUsd, apparentDeviationPct: report.deviationPct, feePct: 0.25, slippagePct: 0.96 });
  $('#size-output').textContent = `$${amountUsd}`;
  $('#remaining').textContent = `${simulation.remainingDifferencePct.toFixed(2)}%`;
  $('#estimate').textContent = `Estimated route output: $${simulation.estimatedOutput.toFixed(2)}`;
}
function renderWatchlist() {
  const state = store.getState();
  $('#config-state').textContent = `${state.assets.length} WATCHED ASSET${state.assets.length === 1 ? '' : 'S'}`;
  $('#watchlist-empty').hidden = state.assets.length > 0;
  $('#watchlist-items').innerHTML = state.assets.map((asset) => {
    const rule = state.rules.find((item) => item.assetId === asset.id);
    const ruleText = rule ? `Alert ${rule.thresholdPct}% · ${rule.session} session` : 'No monitoring rule';
    return `<li><div class="watch-asset"><b>${escapeHtml(asset.ticker)} <span>/ ${escapeHtml(asset.representation)}</span></b><span>${escapeHtml(asset.issuer)} · ${escapeHtml(ruleText)}</span></div><button class="remove-asset" data-remove="${escapeHtml(asset.id)}">Remove</button></li>`;
  }).join('');
  document.querySelectorAll('[data-remove]').forEach((button) => button.addEventListener('click', () => { store.removeAsset(button.dataset.remove); renderWatchlist(); toast('Monitoring removed.'); }));
}
function toast(message) { const el = $('#toast'); el.textContent = message; el.classList.add('show'); setTimeout(() => el.classList.remove('show'), 3200); }

$('#rule-form').addEventListener('submit', (event) => {
  event.preventDefault();
  try {
    const rule = parseMonitoringRule($('#rule-input').value);
    const asset = store.addAsset({ ticker: rule.ticker, representation: $('#representation').value, issuer: $('#issuer').value, session: rule.session });
    store.saveRule({ assetId: asset.id, thresholdPct: rule.thresholdPct, session: rule.session, notify: true });
    event.currentTarget.reset(); renderWatchlist(); toast(`${asset.ticker} monitoring is active in this browser.`);
  } catch { toast('Check the asset and alert threshold, then try again.'); }
});
$('#trade-size').addEventListener('input', refreshSimulation);
$('#details').addEventListener('click', () => $('#evidence-dialog').showModal());
$('#close-dialog').addEventListener('click', () => $('#evidence-dialog').close());
$('#evidence-dialog').addEventListener('click', (event) => { if (event.target === $('#evidence-dialog')) $('#evidence-dialog').close(); });
async function requestWalletConnection() {
  const button = $('#connect');
  button.disabled = true;
  button.textContent = 'Connecting…';
  try {
    const wallet = await connectWallet(window.ethereum);
    localStorage.setItem('sessia-wallet', JSON.stringify(wallet));
    window.location.assign('/agent.html');
  } catch (error) {
    button.innerHTML = 'Connect wallet <span>↗</span>';
    toast(safeErrorMessage(error));
  } finally { button.disabled = false; }
}

$('#connect').addEventListener('click', requestWalletConnection);
window.ethereum?.on?.('accountsChanged', (accounts) => {
  const button = $('#connect');
  if (!accounts[0]) { button.innerHTML = 'Connect wallet <span>↗</span>'; button.classList.remove('connected'); return; }
  button.innerHTML = `${shortenAddress(accounts[0])} <span>●</span>`;
  button.classList.add('connected');
});
$('#prepare').addEventListener('click', () => toast('No transaction was created. Live quotes and explicit wallet review are required.'));
$('#demo-trigger').addEventListener('click', () => { document.querySelector('#research').scrollIntoView({ behavior: 'smooth' }); toast('Recorded NVDA investigation loaded.'); });
refreshSimulation(); renderWatchlist();
installGlobalErrorHandling(() => toast('Something did not load. Please try again.'));
