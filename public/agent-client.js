import { shortenAddress } from './wallet.mjs';
import { installGlobalErrorHandling, safeFetchJson, safeParseJson, safeStorageValue } from './error-handling.mjs';
import { clearAccess, signIn, storedAccess } from './agent-access.mjs';

const $ = (selector) => document.querySelector(selector);
const wallet = safeParseJson(safeStorageValue(() => localStorage.getItem('sessia-wallet'), null), null);
let access = storedAccess();
let remaining = null;

// The agent runs on a paid model key, so it opens for a wallet that signed and has
// sent a transaction on BNB Chain: five answers a day per wallet.
function renderAccess(note) {
  $('#wallet-address').textContent = access?.address ? shortenAddress(access.address) : 'Wallet not connected';
  $('#message').disabled = !access;
  $('#message').placeholder = access ? 'Ask Sessia to research an asset…' : 'Connect a wallet to ask…';
  $('#access-note').textContent = note || (access
    ? `Signed in as ${shortenAddress(access.address)} · ${remaining ?? 5} of 5 messages left today`
    : 'Connect a wallet to ask. Your wallet needs at least one transaction on BNB Chain, and gets 5 questions a day.');
}
renderAccess();

$('#access-note').addEventListener('click', async () => {
  if (access) return;
  $('#access-note').textContent = 'Waiting for your wallet…';
  try {
    access = await signIn(window.ethereum);
    renderAccess();
    $('#message').focus();
  } catch (error) {
    renderAccess(error?.message || 'The wallet did not approve the signature.');
  }
});

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
  return { article, paragraph };
}
installGlobalErrorHandling(() => addMessage('Something did not load. Please try again.', 'agent'));

// The agent answers from /api/ask, which reads the APRO feed and the PancakeSwap
// pools on BNB Chain server-side. The wallet is sent along with the message so the
// service can verify it and count the answer against that wallet's daily allowance.
async function askAgent(value) {
  if (!access) throw new Error('Connect a wallet to ask.');
  const post = (body) => fetch('/api/ask', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  let response = await post({ message: value, address: access.address, signature: access.signature });
  let data = await response.json().catch(() => null);
  // One signature covers one UTC day. If it expired, sign again and retry once.
  if (response.status === 403 && (data?.reason === 'bad_signature' || data?.reason === 'no_signature')) {
    access = await signIn(window.ethereum);
    response = await post({ message: value, address: access.address, signature: access.signature });
    data = await response.json().catch(() => null);
  }
  if (response.status === 403 && data?.reason === 'daily_limit') {
    remaining = 0;
    renderAccess(data.message);
    throw new Error(data.message);
  }
  if (!response.ok || !data?.ok) throw new Error(data?.message || 'The agent did not answer. Try again.');
  remaining = data.remaining ?? remaining;
  return data;
}

function send(text) {
  const value = text.trim();
  if (!value) return;
  if (!access) { renderAccess(); return; }
  addMessage(value, 'user');
  const { paragraph } = addMessage('Reading the chain', 'agent');
  askAgent(value)
    .then((data) => { paragraph.textContent = data.reply; renderAccess(); })
    .catch((error) => { paragraph.textContent = error.message; });
}
$('#composer').addEventListener('submit', (event) => { event.preventDefault(); const input = $('#message'); send(input.value); input.value = ''; });
document.querySelectorAll('[data-prompt]').forEach((button) => button.addEventListener('click', () => send(button.dataset.prompt)));
$('#new-chat').addEventListener('click', () => { $('#chat').innerHTML = ''; addMessage('New investigation ready. What asset or route should I research?', 'agent'); $('#message').focus(); });
$('#disconnect').addEventListener('click', () => { clearAccess(); safeStorageValue(() => localStorage.removeItem('sessia-wallet'), null); window.location.assign('/'); });

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
