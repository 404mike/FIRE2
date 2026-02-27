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
