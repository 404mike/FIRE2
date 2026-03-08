/**
 * pensionEngine.test.js — Unit tests for getPensionIncome
 *
 * Covers: activation ages, disabled pensions, combined totals.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getPensionIncome } from '../js/engine/pensionEngine.js';

// Helper: default config with both pensions enabled
function makeConfig(overrides = {}) {
  return {
    statePensionAge: 67,
    dbPension:    { enabled: true,  annualIncome: 12000, startAge: 65 },
    statePension: { enabled: true,  annualIncome: 11000 },
    ...overrides,
  };
}

// ── DB Pension ───────────────────────────────────────────────────────────────

test('DB pension is zero before its start age', () => {
  const { dbIncome } = getPensionIncome(makeConfig(), 64);
  assert.strictEqual(dbIncome, 0);
});

test('DB pension activates at its start age', () => {
  const { dbIncome } = getPensionIncome(makeConfig(), 65);
  assert.strictEqual(dbIncome, 12000);
});

test('DB pension remains active after its start age', () => {
  const { dbIncome } = getPensionIncome(makeConfig(), 70);
  assert.strictEqual(dbIncome, 12000);
});

test('disabled DB pension contributes nothing even after start age', () => {
  const config = makeConfig({
    dbPension: { enabled: false, annualIncome: 12000, startAge: 65 },
  });
  const { dbIncome } = getPensionIncome(config, 70);
  assert.strictEqual(dbIncome, 0);
});

// ── State Pension ────────────────────────────────────────────────────────────

test('state pension is zero before state pension age', () => {
  const { stateIncome } = getPensionIncome(makeConfig(), 66);
  assert.strictEqual(stateIncome, 0);
});

test('state pension activates at state pension age', () => {
  const { stateIncome } = getPensionIncome(makeConfig(), 67);
  assert.strictEqual(stateIncome, 11000);
});

test('state pension remains active after state pension age', () => {
  const { stateIncome } = getPensionIncome(makeConfig(), 80);
  assert.strictEqual(stateIncome, 11000);
});
test('disabled state pension contributes nothing even after state pension age', () => {
  const config = makeConfig({
    statePension: { enabled: false, annualIncome: 11000 },
  });
  const { stateIncome } = getPensionIncome(config, 70);
  assert.strictEqual(stateIncome, 0);
});

// ── Combined total ───────────────────────────────────────────────────────────

test('total is zero when neither pension has activated', () => {
  const { total, dbIncome, stateIncome } = getPensionIncome(makeConfig(), 64);
  assert.strictEqual(total, 0);
  assert.strictEqual(dbIncome, 0);
  assert.strictEqual(stateIncome, 0);
});

test('total is DB income only when state pension has not yet activated', () => {
  // age 65: DB active, state pension not yet (starts at 67)
  const { total, dbIncome, stateIncome } = getPensionIncome(makeConfig(), 65);
  assert.strictEqual(dbIncome, 12000);
  assert.strictEqual(stateIncome, 0);
  assert.strictEqual(total, 12000);
});

test('total is sum of both active pensions', () => {
  const { total, dbIncome, stateIncome } = getPensionIncome(makeConfig(), 67);
  assert.strictEqual(dbIncome, 12000);
  assert.strictEqual(stateIncome, 11000);
  assert.strictEqual(total, 23000);
});

// ── State pension inflation adjustment ───────────────────────────────────────

test('state pension is scaled by inflationFactor when active', () => {
  // inflationFactor of 1.1 = 10% cumulative inflation
  const { stateIncome } = getPensionIncome(makeConfig(), 67, 1.1);
  assert.strictEqual(stateIncome, 11000 * 1.1);
});

test('state pension inflation does not apply before state pension age', () => {
  // Even with a non-unity inflationFactor, income is 0 before activation age
  const { stateIncome } = getPensionIncome(makeConfig(), 66, 1.5);
  assert.strictEqual(stateIncome, 0);
});

test('DB pension is inflation-adjusted (consistent real value)', () => {
  // DB income grows with inflation so its real purchasing power stays constant
  const { dbIncome } = getPensionIncome(makeConfig(), 65, 1.2);
  assert.strictEqual(dbIncome, 12000 * 1.2);
});

test('inflationFactor defaults to 1 (no inflation) when omitted', () => {
  // Backward-compatible: calling without inflationFactor gives nominal value
  const { stateIncome } = getPensionIncome(makeConfig(), 70);
  assert.strictEqual(stateIncome, 11000);
});

test('total reflects inflated state pension and inflated DB pension', () => {
  const factor = 1.25;
  const { total, dbIncome, stateIncome } = getPensionIncome(makeConfig(), 67, factor);
  assert.strictEqual(dbIncome, 12000 * factor);
  assert.strictEqual(stateIncome, 11000 * factor);
  assert.strictEqual(total, 12000 * factor + 11000 * factor);
});

// ── pensionGrowthFactor (4th parameter) ──────────────────────────────────────

test('pensionGrowthFactor overrides inflationFactor for state pension when provided', () => {
  // inflationFactor=1.1, pensionGrowthFactor=1.2 → state pension uses 1.2
  const { stateIncome } = getPensionIncome(makeConfig(), 67, 1.1, 1.2);
  assert.strictEqual(stateIncome, 11000 * 1.2);
});

test('pensionGrowthFactor null falls back to inflationFactor', () => {
  const { stateIncome } = getPensionIncome(makeConfig(), 67, 1.1, null);
  assert.strictEqual(stateIncome, 11000 * 1.1);
});

test('DB pension is not affected by pensionGrowthFactor (uses inflationFactor only)', () => {
  // DB pension uses inflationFactor (1.1), not pensionGrowthFactor (1.5)
  const { dbIncome } = getPensionIncome(makeConfig(), 65, 1.1, 1.5);
  assert.strictEqual(dbIncome, 12000 * 1.1);
});

// ── computePensionGrowthFactor ────────────────────────────────────────────────

import { computePensionGrowthFactor } from '../js/engine/pensionEngine.js';

function makeGrowthConfig(overrides = {}) {
  return {
    inflationRate: 2.5,
    statePension: {
      growthModel: 'real',
      customGrowthRate: 3.0,
      ...overrides.statePension,
    },
    ...overrides,
  };
}

test('computePensionGrowthFactor: "real" model equals standard inflation factor', () => {
  const config = makeGrowthConfig();
  // 5 years at 2.5% inflation
  const factor = computePensionGrowthFactor(config, 5);
  assert.ok(Math.abs(factor - Math.pow(1.025, 5)) < 0.0001, `Expected ~${Math.pow(1.025, 5)}, got ${factor}`);
});

test('computePensionGrowthFactor: "tripleLock" with inflation below 2.5% uses 2.5%', () => {
  const config = makeGrowthConfig({ inflationRate: 1, statePension: { growthModel: 'tripleLock', customGrowthRate: 2.5 } });
  // 5 years at max(1%, 2.5%) = 2.5%
  const factor = computePensionGrowthFactor(config, 5);
  assert.ok(Math.abs(factor - Math.pow(1.025, 5)) < 0.0001, `Expected ~${Math.pow(1.025, 5)}, got ${factor}`);
});

test('computePensionGrowthFactor: "tripleLock" with inflation above 2.5% uses inflation rate', () => {
  const config = makeGrowthConfig({ inflationRate: 4, statePension: { growthModel: 'tripleLock', customGrowthRate: 2.5 } });
  // 5 years at max(4%, 2.5%) = 4%
  const factor = computePensionGrowthFactor(config, 5);
  assert.ok(Math.abs(factor - Math.pow(1.04, 5)) < 0.0001, `Expected ~${Math.pow(1.04, 5)}, got ${factor}`);
});

test('computePensionGrowthFactor: "custom" uses customGrowthRate', () => {
  const config = makeGrowthConfig({ inflationRate: 2.5, statePension: { growthModel: 'custom', customGrowthRate: 3.0 } });
  const factor = computePensionGrowthFactor(config, 5);
  assert.ok(Math.abs(factor - Math.pow(1.03, 5)) < 0.0001, `Expected ~${Math.pow(1.03, 5)}, got ${factor}`);
});

test('computePensionGrowthFactor: year 0 always returns 1 (no growth in base year)', () => {
  const config = makeGrowthConfig();
  assert.strictEqual(computePensionGrowthFactor(config, 0), 1);
});

test('computePensionGrowthFactor: defaults to "real" model when growthModel is absent', () => {
  const config = { inflationRate: 3, statePension: {} };
  const factor = computePensionGrowthFactor(config, 10);
  assert.ok(Math.abs(factor - Math.pow(1.03, 10)) < 0.0001);
});
