// The machine-facing half of the agent page: what another agent can discover here
// and what one call costs. Read live from the card so the number shown is the
// number the paywall would charge.
const price = document.getElementById('machine-price');
if (price) {
  fetch('/.well-known/agent-card.json')
    .then((response) => (response.ok ? response.json() : null))
    .then((card) => {
      if (!card) {
        price.textContent = 'unavailable';
        return;
      }
      const x402 = card.x402 || {};
      price.textContent = `${x402.priceUsd} ${x402.symbol} per call`;
      price.title = `${x402.network} · ${card.hash}`;
    })
    .catch(() => {
      price.textContent = 'unavailable';
    });
}
