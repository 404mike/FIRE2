/**
 * projectionUtils.test.js — Unit tests for the projectYear utility function
 *
 * Verifies the core mathematical invariant for all account projections:
 *   closing = opening × (1 + growthRate − drawdownRate) + lumpSumIn − extraDrawOut
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { projectYear } from '../js/engine/projectionUtils.js';

// ── Growth vs drawdown relationship ─────────────────────────────────────────

test('growth > drawdown: balance increases', () => {
  // 5% growth, 2% drawdown → net +3%
  const result = projectYear(100000, 0.05, 0.02);
  assert.strictEqual(result, 103000);
});

test('growth = drawdown: balance stays flat', () => {
  // 5% growth, 5% drawdown → net 0%
  const result = projectYear(100000, 0.05, 0.05);
  assert.strictEqual(result, 100000);
});

test('growth < drawdown: balance decreases', () => {
  // 2% growth, 5% drawdown → net -3%
  const result = projectYear(100000, 0.02, 0.05);
  assert.strictEqual(result, 97000);
});

// ── Floor behaviour ──────────────────────────────────────────────────────────

test('balance never goes below zero', () => {
  // Extreme drawdown far exceeding balance
  assert.strictEqual(projectYear(100000, 0, 2.0), 0);
});

test('zero opening balance stays zero', () => {
  assert.strictEqual(projectYear(0, 0.05, 0.02), 0);
});

// ── Lump sums and extra withdrawals ─────────────────────────────────────────

test('lump sum is added after growth/drawdown', () => {
  // 100000 × 1.03 = 103000, then +5000 lump sum
  const result = projectYear(100000, 0.05, 0.02, 5000);
  assert.strictEqual(result, 108000);
});

test('extra draw-out is subtracted after growth/drawdown', () => {
  // 100000 × 1.03 = 103000, then -3000 withdrawal
  const result = projectYear(100000, 0.05, 0.02, 0, 3000);
  assert.strictEqual(result, 100000);
});

test('lump sum and extra draw-out are both applied after growth/drawdown', () => {
  // 100000 × 1.03 = 103000, +2000 lump sum, -1000 extra draw → 104000
  const result = projectYear(100000, 0.05, 0.02, 2000, 1000);
  assert.strictEqual(result, 104000);
});

test('extra draw-out does not push balance below zero', () => {
  // After growth/drawdown: 103000, but extra draw of 200000 → floors at 0
  const result = projectYear(100000, 0.05, 0.02, 0, 200000);
  assert.strictEqual(result, 0);
});

// ── Zero rates ───────────────────────────────────────────────────────────────

test('zero growth and zero drawdown: balance unchanged', () => {
  assert.strictEqual(projectYear(50000, 0, 0), 50000);
});

test('zero growth only: balance decreases by drawdown amount', () => {
  assert.strictEqual(projectYear(50000, 0, 0.1), 45000);
});

// ── Problem statement example ────────────────────────────────────────────────

test('problem statement example: £416,089 at 5% growth, 2% drawdown ≈ £428,572', () => {
  // Expected: 416089 × 1.03 = 428571.67
  const result = projectYear(416089, 0.05, 0.02);
  assert.ok(
    Math.abs(result - 428571.67) < 1,
    `Expected ≈ 428571.67, got ${result}`,
  );
});
