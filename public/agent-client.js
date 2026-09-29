import { createAgentReply } from './agent.mjs';
import { shortenAddress } from './wallet.mjs';
import { installGlobalErrorHandling, safeFetchJson, safeParseJson, safeStorageValue } from './error-handling.mjs';

const $ = (selector) => document.querySelector(selector);
const wallet = safeParseJson(safeStorageValue(() => localStorage.getItem('sessia-wallet'), null), null);
$('#wallet-address').textContent = wallet?.address ? shortenAddress(wallet.address) : 'Wallet not connected';

function addMessage(text, role) {
  const article = document.createElement('article');
  article.className = `message ${role}`;
  if (role === 'agent') {
    const avatar = document.createElement('span'); avatar.className = 'avatar';
    const logo = document.createElement('img'); logo.src = '/sessia-logo.svg'; logo.alt = ''; avatar.append(logo); article.append(avatar);
  }
  const body = document.createElement('div');
  const paragraph = document.createElement('p'); paragraph.textContent = text; body.append(paragraph); article.append(body);
  $('#chat').append(article); article.scrollIntoView({ behavior: 'smooth', block: 'end' });
}
installGlobalErrorHandling(() => addMessage('Something did not load. Please try again.', 'agent'));
function send(text) { const value = text.trim(); if (!value) return; addMessage(value, 'user'); window.setTimeout(() => addMessage(createAgentReply(value), 'agent'), 220); }
$('#composer').addEventListener('submit', (event) => { event.preventDefault(); const input = $('#message'); send(input.value); input.value = ''; });
document.querySelectorAll('[data-prompt]').forEach((button) => button.addEventListener('click', () => send(button.dataset.prompt)));
$('#new-chat').addEventListener('click', () => { $('#chat').innerHTML = ''; addMessage('New investigation ready. What asset or route should I research?', 'agent'); $('#message').focus(); });
$('#disconnect').addEventListener('click', () => { safeStorageValue(() => localStorage.removeItem('sessia-wallet'), null); window.location.assign('/'); });

const telegramDialog = $('#telegram-dialog');
document.querySelectorAll('[data-telegram-connect]').forEach((button) => button.addEventListener('click', () => {
  const startPayload = wallet?.address?.replace(/^0x/, '') || 'connect';
  window.open(`https://t.me/Sessia_BNBAI_bot?start=${encodeURIComponent(startPayload)}`, '_blank', 'noopener');
}));
$('#close-telegram').addEventListener('click', () => telegramDialog.close());
$('#save-telegram').addEventListener('click', async () => {
  const chatId = $('#telegram-chat-id').value.trim();
  const status = $('#telegram-status');
  if (!/^[-]?\d+$/.test(chatId)) { status.textContent = 'Enter the numeric chat ID provided by Telegram.'; return; }
  status.textContent = 'Checking notification bot…';
  try {
    const health = await safeFetchJson('/api/health', { cache: 'no-store' });
    if (!health.telegram) { status.textContent = 'The notification bot is not configured yet. No channel was saved.'; return; }
    localStorage.setItem('sessia-telegram-chat-id', chatId);
    status.textContent = 'Channel saved. Alerts will be sent after server-side delivery is enabled.';
  } catch { status.textContent = 'Could not verify notification delivery. No channel was saved.'; }
});
