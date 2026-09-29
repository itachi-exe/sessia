import { connectWallet, shortenAddress } from './wallet.mjs';
import { installGlobalErrorHandling, safeFetchJson, safeParseJson, safeStorageValue } from './error-handling.mjs';
import { clearAccess, signIn, storedAccess } from './agent-access.mjs';

const $ = (selector) => document.querySelector(selector);
let wallet = safeParseJson(safeStorageValue(() => localStorage.getItem('sessia-wallet'), null), null);
let access = storedAccess();
let remaining = null;

const provider = () => (typeof window === 'undefined' ? null : window.ethereum);
const hasProvider = () => Boolean(provider()?.request);

// The agent runs on a paid model key, so it opens for a wallet that signed and has
// sent a transaction on BNB Chain: five answers a day per wallet.
function renderAccess(note) {
  const address = access?.address || wallet?.address;
  $('#wallet-address').textContent = address ? shortenAddress(address) : 'Wallet not connected';
  const input = $('#message');
  input.disabled = !access;
  input.placeholder = access ? 'Ask Sessia to research an asset…' : 'Connect a wallet to ask…';
  const button = $('#connect-wallet');
  button.hidden = Boolean(access);
  button.textContent = wallet?.address ? `Sign in as ${shortenAddress(wallet.address)}` : 'Connect wallet';
  document.body.classList.toggle('gated', !access);
  const label = $('#wallet-label');
  if (label) label.textContent = access ? 'CONNECTED WALLET' : 'WALLET';
  const disconnect = $('#disconnect');
  if (disconnect) disconnect.hidden = !access;
  $('#access-note').textContent = note || (access
    ? `Signed in as ${shortenAddress(access.address)} · ${remaining ?? 5} of 5 messages left today`
    : hasProvider()
      ? 'Your wallet needs at least one transaction on BNB Chain, and gets 5 questions a day.'
      : 'No wallet found in this browser. Open this page inside MetaMask, or install a BNB Chain wallet, then connect.');
}
renderAccess();

async function connect() {
  if (access) return;
  if (!hasProvider()) { renderAccess(); return; }
  const button = $('#connect-wallet');
  button.disabled = true;
  $('#access-note').textContent = 'Waiting for your wallet…';
  try {
    const connected = await connectWallet(provider());
    wallet = connected;
    safeStorageValue(() => localStorage.setItem('sessia-wallet', JSON.stringify(connected)), null);
    access = await signIn(provider());
    renderAccess();
    $('#message').focus();
  } catch (error) {
    renderAccess(error?.message || 'The wallet did not approve the signature.');
  } finally {
    button.disabled = false;
  }
}
$('#connect-wallet').addEventListener('click', connect);
$('#access-note').addEventListener('click', connect);

// Arriving from the landing page with a wallet already authorised: finish the sign in
// once, so nobody has to hunt for the button.
if (!access && wallet?.address && hasProvider()) {
  let attempted = true;
  try { attempted = sessionStorage.getItem('sessia-autosign') === '1'; } catch { attempted = false; }
  if (!attempted) {
    try { sessionStorage.setItem('sessia-autosign', '1'); } catch { /* private mode */ }
    connect();
  }
}

function addMessage(text, role) {
  const article = document.createElement('article');
  article.className = `message ${role}`;
  if (role === 'agent') {
    const avatar = document.createElement('span'); avatar.className = 'avatar';
    const logo = document.createElement('img'); logo.src = '/mascot-round.png'; logo.alt = ''; avatar.append(logo); article.append(avatar);
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
  if (!access) { renderAccess('Connect your wallet first, then link Telegram.'); return; }
  if (!telegramDialog.open) telegramDialog.showModal?.();
}));
$('#close-telegram').addEventListener('click', () => telegramDialog.close());
$('#save-telegram').addEventListener('click', async () => {
  const status = $('#telegram-status');
  const codeSlot = $('#telegram-code');
  if (!access) { status.textContent = 'Connect your wallet first, then a link code can be signed.'; return; }
  $('#save-telegram').disabled = true;
  status.textContent = 'Asking the server for a signed code…';
  try {
    const data = await safeFetchJson('/api/link', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ address: access.address, signature: access.signature }) });
    if (!data?.ok) { status.textContent = data?.message || 'No code was created. Try again in a moment.'; return; }
    codeSlot.textContent = data.code;
    status.textContent = data.deepLink ? 'Telegram opens in another tab: press Start there. The code works once.' : `Send /link ${data.code} to the Sessia bot. The code works once.`;
    if (data.deepLink) window.open(data.deepLink, '_blank', 'noopener');
  } catch { status.textContent = 'Could not reach the server for a code.'; }
  finally { $('#save-telegram').disabled = false; }
});
