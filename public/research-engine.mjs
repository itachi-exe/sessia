export function buildInvestigation(observation) {
  const deviationPct = Number((((observation.tokenPrice - observation.referencePrice) / observation.referencePrice) * 100).toFixed(2));
  const isUnusual = deviationPct > observation.baselineHigh || deviationPct < -observation.baselineHigh;
  const direction = deviationPct >= 0 ? 'above' : 'below';
  const outside = isUnusual ? `outside the observed ${observation.session.toLowerCase()} baseline of ${observation.baselineLow}% to ${observation.baselineHigh}%` : `within the observed ${observation.session.toLowerCase()} baseline`;

  return {
    deviationPct,
    isUnusual,
    observations: [
      `${observation.dataMode}: ${observation.symbol} was $${observation.tokenPrice.toFixed(2)} at ${formatTime(observation.observedAt)}.`,
      `Reference price was $${observation.referencePrice.toFixed(2)} at ${formatTime(observation.referenceAt)}.`,
      `Session: ${observation.session}. Baseline uses ${observation.baselineSamples} collected observations.`,
    ],
    signals: [
      `Token price is ${Math.abs(deviationPct)}% ${direction} its available reference price.`,
      `This is ${outside}.`,
      `A supported peer representation showed a ${observation.peerDeviation}% deviation in the same comparison.`,
    ],
    limitations: [
      'Recorded demo data is shown in this MVP. It is not a live market observation.',
      'A price difference is a signal for investigation, not a guarantee of profit or execution.',
      'Reference methodologies and final route quotes can differ from the available inputs.',
    ],
  };
}

export function simulateTrade({ amountUsd, apparentDeviationPct, feePct, slippagePct }) {
  const totalCostPct = Number((feePct + slippagePct).toFixed(2));
  const remainingDifferencePct = Number(Math.max(0, apparentDeviationPct - totalCostPct).toFixed(2));
  return {
    amountUsd: Number(amountUsd), feePct: Number(feePct), slippagePct: Number(slippagePct), totalCostPct, remainingDifferencePct,
    estimatedOutput: Number((amountUsd * (1 - totalCostPct / 100)).toFixed(2)),
    disclosure: 'This is an estimate from the selected demo route, not a guaranteed return or executable quote.',
  };
}

function formatTime(iso) { return new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC', timeZoneName: 'short' }); }
