/**
 * autoFillDrawdown.test.js — Unit tests for calcAutoFillDrawdown
 *
 * Covers: no-gap case, ISA-only, SIPP-only, proportional split,
 * balance clamping, and edge cases (zero balances, both disabled).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calcAutoFillDrawdown } from '../js/engine/autoFillDrawdown.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Build a minimal projection row with just the fields calcAutoFillDrawdown needs.
 */
function makeRow({ requiredSpending = 30000, totalIncome = 10000, isaBalance = 100000, sippBalance = 100000 } = {}) {
  return { requiredSpending, totalIncome, isaBalance, sippBalance };
}

/**
 * Build a minimal config enabling/disabling ISA and SIPP.
 */
function makeConfig({ isaEnabled = true, sippEnabled = true } = {}) {
  return {
    isa:  { enabled: isaEnabled },
    sipp: { enabled: sippEnabled },
  };
}

// ── No gap ────────────────────────────────────────────────────────────────────

test('no gap: totalIncome already meets requiredSpending → both draws are 0', () => {
  const result = calcAutoFillDrawdown(
    makeRow({ requiredSpending: 30000, totalIncome: 30000 }),
    makeConfig(),
  );
  assert.strictEqual(result.isaExtraDraw, 0);
  assert.strictEqual(result.sippExtraDraw, 0);
});

test('surplus: totalIncome exceeds requiredSpending → both draws are 0', () => {
  const result = calcAutoFillDrawdown(
    makeRow({ requiredSpending: 20000, totalIncome: 35000 }),
    makeConfig(),
  );
  assert.strictEqual(result.isaExtraDraw, 0);
  assert.strictEqual(result.sippExtraDraw, 0);
});

// ── Proportional split ────────────────────────────────────────────────────────

test('equal balances → gap split 50/50 between ISA and SIPP', () => {
  const result = calcAutoFillDrawdown(
    makeRow({ requiredSpending: 30000, totalIncome: 10000, isaBalance: 100000, sippBalance: 100000 }),
    makeConfig(),
  );
  const gap = 20000;
  assert.strictEqual(result.isaExtraDraw, gap / 2);
  assert.strictEqual(result.sippExtraDraw, gap / 2);
});

test('ISA balance 3×SIPP → ISA gets 75%, SIPP gets 25%', () => {
  const result = calcAutoFillDrawdown(
    makeRow({ requiredSpending: 40000, totalIncome: 0, isaBalance: 75000, sippBalance: 25000 }),
    makeConfig(),
  );
  assert.strictEqual(result.isaExtraDraw, 30000);   // 40000 × 0.75
  assert.strictEqual(result.sippExtraDraw, 10000);  // 40000 × 0.25
});

// ── ISA disabled ──────────────────────────────────────────────────────────────

test('ISA disabled → all gap goes to SIPP', () => {
  const result = calcAutoFillDrawdown(
    makeRow({ requiredSpending: 30000, totalIncome: 10000, isaBalance: 100000, sippBalance: 50000 }),
    makeConfig({ isaEnabled: false }),
  );
  assert.strictEqual(result.isaExtraDraw, 0);
  assert.strictEqual(result.sippExtraDraw, 20000);
});

test('ISA disabled and SIPP balance too small → SIPP clamped to its balance', () => {
  const result = calcAutoFillDrawdown(
    makeRow({ requiredSpending: 30000, totalIncome: 10000, sippBalance: 5000 }),
    makeConfig({ isaEnabled: false }),
  );
  assert.strictEqual(result.isaExtraDraw, 0);
  assert.strictEqual(result.sippExtraDraw, 5000);
});

// ── SIPP disabled ─────────────────────────────────────────────────────────────

test('SIPP disabled → all gap goes to ISA', () => {
  const result = calcAutoFillDrawdown(
    makeRow({ requiredSpending: 30000, totalIncome: 10000, isaBalance: 50000, sippBalance: 100000 }),
    makeConfig({ sippEnabled: false }),
  );
  assert.strictEqual(result.isaExtraDraw, 20000);
  assert.strictEqual(result.sippExtraDraw, 0);
});

test('SIPP disabled and ISA balance too small → ISA clamped to its balance', () => {
  const result = calcAutoFillDrawdown(
    makeRow({ requiredSpending: 30000, totalIncome: 10000, isaBalance: 5000 }),
    makeConfig({ sippEnabled: false }),
  );
  assert.strictEqual(result.isaExtraDraw, 5000);
  assert.strictEqual(result.sippExtraDraw, 0);
});

// ── Balance clamping ──────────────────────────────────────────────────────────

test('ISA balance smaller than its proportional share → clamped to ISA balance', () => {
  // ISA: 5000, SIPP: 100000 — gap 20000; ISA share ≈ 952, but let's test explicit clamping:
  // Use ISA=1000, SIPP=99000 → ISA weight ≈ 1%, gap=20000 → isaDraw ≈ 200 (under balance, no clamp needed)
  // Better: force clamp by making ISA tiny vs gap
  const result = calcAutoFillDrawdown(
    makeRow({ requiredSpending: 100000, totalIncome: 0, isaBalance: 1000, sippBalance: 99000 }),
    makeConfig(),
  );
  // ISA share = 1000/100000 × 100000 = 1000 — exactly at balance, clamped to 1000
  assert.ok(result.isaExtraDraw <= 1000, `isaExtraDraw ${result.isaExtraDraw} should not exceed balance 1000`);
  assert.ok(result.sippExtraDraw <= 99000, `sippExtraDraw ${result.sippExtraDraw} should not exceed balance 99000`);
});

// ── Both accounts depleted / zero balances ────────────────────────────────────

test('both balances are zero → both draws are 0', () => {
  const result = calcAutoFillDrawdown(
    makeRow({ requiredSpending: 30000, totalIncome: 0, isaBalance: 0, sippBalance: 0 }),
    makeConfig(),
  );
  assert.strictEqual(result.isaExtraDraw, 0);
  assert.strictEqual(result.sippExtraDraw, 0);
});

test('both accounts disabled → both draws are 0', () => {
  const result = calcAutoFillDrawdown(
    makeRow({ requiredSpending: 30000, totalIncome: 0 }),
    makeConfig({ isaEnabled: false, sippEnabled: false }),
  );
  assert.strictEqual(result.isaExtraDraw, 0);
  assert.strictEqual(result.sippExtraDraw, 0);
});

// ── Rounding ──────────────────────────────────────────────────────────────────

test('draws are whole pounds (Math.round applied)', () => {
  // Use imbalanced weights so raw division produces fractional values
  const result = calcAutoFillDrawdown(
    makeRow({ requiredSpending: 30000, totalIncome: 10001, isaBalance: 100000, sippBalance: 200000 }),
    makeConfig(),
  );
  // gap = 19999; isaWeight = 1/3 → 6666.33... → rounds to 6666
  assert.strictEqual(result.isaExtraDraw,  Math.round(19999 / 3));
  assert.strictEqual(result.sippExtraDraw, Math.round(19999 * 2 / 3));
});
