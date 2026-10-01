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
      const amount = x402.priceUsd != null ? `${x402.priceUsd} ${x402.symbol || 'U'}` : 'not configured';
      price.textContent = `${amount} per call`;
      price.title = [x402.network, card.name, card.hash].filter(Boolean).join(' | ');
    })
    .catch(() => {
      price.textContent = 'unavailable';
    });
}
