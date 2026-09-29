import test from 'node:test';
import assert from 'node:assert/strict';
import { buildInvestigation, simulateTrade } from '../public/research-engine.mjs';

const observation = {
  asset: 'NVIDIA',
  symbol: 'xNVDA',
  issuer: 'OpenFi',
  tokenPrice: 184.21,
  referencePrice: 180.41,
  observedAt: '2026-09-22T08:42:00.000Z',
  referenceAt: '2026-09-22T08:41:00.000Z',
  session: 'US market closed',
  baselineLow: 0.3,
  baselineHigh: 0.8,
  baselineSamples: 148,
  peerDeviation: 0.6,
  dataMode: 'Recorded demo data',
};

test('buildInvestigation separates observations, signals, and limitations', () => {
  const report = buildInvestigation(observation);
  assert.equal(report.deviationPct, 2.11);
  assert.equal(report.isUnusual, true);
  assert.match(report.observations[0], /Recorded demo data/);
  assert.ok(report.signals.some((signal) => signal.includes('outside')));
  assert.ok(report.limitations.some((item) => item.includes('not a guarantee')));
});

test('simulateTrade models fees and slippage without claiming profit', () => {
  const simulation = simulateTrade({ amountUsd: 100, apparentDeviationPct: 2.11, feePct: 0.25, slippagePct: 0.96 });
  assert.equal(simulation.totalCostPct, 1.21);
  assert.equal(simulation.remainingDifferencePct, 0.9);
  assert.match(simulation.disclosure, /estimate/i);
});
