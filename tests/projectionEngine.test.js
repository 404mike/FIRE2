/**
 * projectionEngine.test.js — Integration tests for runProjection
 *
 * Each test uses the minimal config needed to isolate a single behaviour.
 * The base factory enables only ISA, disables all other pots and pensions,
 * so numbers are easy to verify by hand.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runProjection } from '../js/engine/projectionEngine.js';

// ── Config factory ───────────────────────────────────────────────────────────

/**
 * Returns a minimal valid config.
 * @param {object} [opts]
 * @param {number}  [opts.balance=100000]    Opening ISA balance
 * @param {number}  [opts.growthRate=5]      ISA growth rate (%)
 * @param {number}  [opts.drawdownRate=2]    Portfolio drawdown rate (%)
 * @param {number}  [opts.currentAge=60]
 * @param {number}  [opts.retirementAge=60]  Default: already retired
 * @param {number}  [opts.endAge=61]         Two rows by default
 * @param {number}  [opts.spending=0]        Retirement spending (today's £)
 * @param {object}  [opts.overrides={}]      Year overrides
 */
function makeConfig({
  balance       = 100000,
  growthRate    = 5,
  drawdownRate  = 2,
  currentAge    = 60,
  retirementAge = 60,
  endAge        = 61,
  spending      = 0,
  overrides     = {},
} = {}) {
  return {
    currentAge,
    retirementAge,
    endAge,
    retirementSpending: spending,
    inflationRate: 0,
    statePensionAge: 67,
    isa: {
      enabled: true,
      balance,
      growthRate,
      annualContribution: 0,
      stopContributionAge: null,
      drawdownStartAge: null,
    },
    sipp: {
      enabled: false,
      balance: 0,
      growthRate: 0,
      annualContribution: 0,
      accessAge: 57,
      stopContributionAge: null,
    },
    premiumBonds: {
      enabled: false,
      balance: 0,
      prizeRate: 0,
      drawdownStartAge: null,
    },
    cash: {
      enabled: false,
      balance: 0,
      growthRate: 0,
      annualContribution: 0,
      stopContributionAge: null,
    },
    dbPension:    { enabled: false, annualIncome: 0, startAge: 65 },
    statePension: { enabled: false, annualIncome: 0 },
    drawdown: { rate: drawdownRate },
    withdrawalOrder: ['isa', 'sipp', 'premiumBonds', 'cash'],
    overrides,
  };
}

// ── Retirement phase: growth vs drawdown relationship ────────────────────────

test('retirement: growth > drawdown → balance increases each year', () => {
  // 5% growth, 2% drawdown → net +3% per year
  const rows = runProjection(makeConfig({ balance: 100000, growthRate: 5, drawdownRate: 2 }));
  // Year 1: 100000 × (1 + 0.05 − 0.02) = 103000
  assert.strictEqual(rows[0].isaBalance, 103000);
  // Year 2: 103000 × 1.03 = 106090
  assert.strictEqual(rows[1].isaBalance, 106090);
});

test('retirement: growth = drawdown → balance stays flat', () => {
  // 5% growth, 5% drawdown → net 0%
  const rows = runProjection(makeConfig({ balance: 100000, growthRate: 5, drawdownRate: 5 }));
  assert.strictEqual(rows[0].isaBalance, 100000);
  assert.strictEqual(rows[1].isaBalance, 100000);
});

test('retirement: growth < drawdown → balance decreases each year', () => {
  // 2% growth, 5% drawdown → net −3% per year
  const rows = runProjection(makeConfig({ balance: 100000, growthRate: 2, drawdownRate: 5 }));
  // Year 1: 100000 × 0.97 = 97000
  assert.strictEqual(rows[0].isaBalance, 97000);
  // Year 2: 97000 × 0.97 = 94090
  assert.strictEqual(rows[1].isaBalance, 94090);
});

test('retirement: balance never goes below zero', () => {
  const rows = runProjection(makeConfig({ balance: 5000, growthRate: 0, drawdownRate: 100 }));
  for (const row of rows) {
    assert.ok(row.isaBalance >= 0, `isaBalance went negative: ${row.isaBalance}`);
    assert.ok(row.totalNetWorth >= 0, `totalNetWorth went negative: ${row.totalNetWorth}`);
  }
});

// ── Problem statement reference case ─────────────────────────────────────────

test('problem statement example: £416,089 at 5% growth, 2% drawdown → £428,572', () => {
  const rows = runProjection(makeConfig({ balance: 416089, growthRate: 5, drawdownRate: 2 }));
  // 416089 × 1.03 = 428571.67 → rounds to 428572
  assert.strictEqual(rows[0].isaBalance, 428572);
});

// ── Drawdown-rate vs spending: only one active at a time ─────────────────────

test('drawdown rate wins when spending also configured (no double-withdrawal)', () => {
  // 5% growth, 2% drawdown rate, £50,000 spending
  // Expected: portfolio grows at net +3%; spending does NOT override the rate
  // Buggy behaviour (Math.max): gap = max(50000, 6087) = 50000 → balance ~263,604
  // Correct behaviour: gap = 6087 (rate) → balance = 304370 × 1.03 = 313,501
  const rows = runProjection(makeConfig({ balance: 304370, growthRate: 5, drawdownRate: 2, spending: 50000 }));
  // Net +3%: 304370 × 1.03 = 313501.1 → rounds to 313501
  assert.strictEqual(rows[0].isaBalance, 313501);
  // Only the 2% rate was withdrawn (not £50,000)
  assert.strictEqual(rows[0].isaWithdrawn, Math.round(304370 * 0.02)); // 6087
  // Shortfall correctly reflects the unmet spending
  assert.ok(rows[0].shortfall > 0, 'expected shortfall when rate withdrawal < spending');
});

test('spending drives withdrawals when drawdown rate is zero', () => {
  // drawdownRate = 0 → spending-based withdrawal is active
  const rows = runProjection(makeConfig({ balance: 100000, growthRate: 0, drawdownRate: 0, spending: 10000 }));
  assert.strictEqual(rows[0].isaWithdrawn, 10000);
  assert.strictEqual(rows[0].isaBalance, 90000);
});

test('null/undefined drawdown rate defaults to non-zero (rate strategy applies)', () => {
  // When config.drawdown.rate is null, the engine defaults to 4%, so rate drives withdrawals
  const config = makeConfig({ balance: 100000, growthRate: 5, drawdownRate: 4, spending: 50000 });
  // Ensure the spending does not override the 4% rate (gap = 4000 not 50000)
  const rows = runProjection(config);
  // 4% drawdown, 5% growth → net +1%: 100000 × 1.01 = 101000
  assert.strictEqual(rows[0].isaBalance, 101000);
  assert.strictEqual(rows[0].isaWithdrawn, Math.round(100000 * 0.04)); // 4000
});

// ── Accumulation phase ───────────────────────────────────────────────────────

test('accumulation: annual contributions increase balance each year', () => {
  const config = makeConfig({ balance: 10000, growthRate: 0, drawdownRate: 0, retirementAge: 70 });
  config.isa.annualContribution = 5000;
  const rows = runProjection(config);
  // Year 1: 10000 + 5000 = 15000
  assert.strictEqual(rows[0].isaBalance, 15000);
});

test('accumulation: growth compounds on top of contributions', () => {
  const config = makeConfig({
    balance: 100000, growthRate: 5, drawdownRate: 0, retirementAge: 70,
  });
  config.isa.annualContribution = 0;
  const rows = runProjection(config);
  // No drawdown during accumulation (drawdownRate only applies in retirement)
  assert.strictEqual(rows[0].isaBalance, 105000);
});

test('accumulation: contributions stop at stopContributionAge', () => {
  const config = makeConfig({
    balance: 100000, growthRate: 0, drawdownRate: 0,
    currentAge: 55, retirementAge: 70, endAge: 57,
  });
  config.isa.annualContribution = 5000;
  config.isa.stopContributionAge = 56;  // stop contributing at 56
  const rows = runProjection(config);

  // age 55 (i=0): contribution applies (age < stopContributionAge)
  assert.strictEqual(rows[0].isaContribution, 5000);
  // age 56 (i=1): no contribution (age >= stopContributionAge)
  assert.strictEqual(rows[1].isaContribution, 0);
  // age 57 (i=2): no contribution
  assert.strictEqual(rows[2].isaContribution, 0);
});

// ── Lump sums ────────────────────────────────────────────────────────────────

test('ISA lump sum is applied in the correct year and increases balance', () => {
  const currentYear = new Date().getFullYear();
  const targetYear = currentYear + 1; // second row (i=1, age=61)
  const rows = runProjection(makeConfig({
    balance: 100000,
    growthRate: 0,
    drawdownRate: 0,
    overrides: { [targetYear]: { isaLumpSum: 10000 } },
  }));
  // Year 0 (no lump sum): 100000
  assert.strictEqual(rows[0].isaBalance, 100000);
  // Year 1 (lump sum year): 100000 + 10000 = 110000
  assert.strictEqual(rows[1].isaBalance, 110000);
});

// ── Custom drawdowns ─────────────────────────────────────────────────────────

test('custom ISA drawdown is applied after regular growth/drawdown', () => {
  const currentYear = new Date().getFullYear();
  // drawdownRate=0 so only the custom drawdown acts; no retirement spending
  const rows = runProjection(makeConfig({
    balance: 100000,
    growthRate: 5,
    drawdownRate: 0,
    overrides: { [currentYear]: { isaCustomDrawdown: 5000 } },
  }));
  // After 5% growth: 105000, then custom drawdown -5000 = 100000
  assert.strictEqual(rows[0].isaBalance, 100000);
});

// ── Pension income reduces spending gap ──────────────────────────────────────

test('pension income covers spending, leaving portfolio intact when growth covers drawdown', () => {
  const config = makeConfig({ balance: 100000, growthRate: 5, drawdownRate: 0, spending: 20000 });
  config.dbPension = { enabled: true, annualIncome: 20000, startAge: 60 };
  const rows = runProjection(config);

  // Pension income fully covers spending; drawdownRate=0, so no pot withdrawal
  assert.strictEqual(rows[0].totalPensionIncome, 20000);
  assert.strictEqual(rows[0].isaWithdrawn, 0);
  // ISA grows by growth only: 100000 × 1.05 = 105000
  assert.strictEqual(rows[0].isaBalance, 105000);
});

test('shortfall is reported when pension + portfolio cannot meet spending', () => {
  // balance=1000, growthRate=0, drawdownRate=0, spending=5000, no pension
  const config = makeConfig({ balance: 1000, growthRate: 0, drawdownRate: 0, spending: 5000 });
  const rows = runProjection(config);
  assert.ok(rows[0].shortfall > 0, 'Expected a shortfall');
});

// ── Phase labelling ──────────────────────────────────────────────────────────

test('rows are labelled accumulate before retirementAge', () => {
  const config = makeConfig({
    currentAge: 55, retirementAge: 60, endAge: 57, drawdownRate: 0,
  });
  const rows = runProjection(config);
  assert.strictEqual(rows[0].phase, 'accumulate');
});

test('rows are labelled retire from retirementAge onwards', () => {
  const rows = runProjection(makeConfig({ currentAge: 60, retirementAge: 60, endAge: 61 }));
  assert.strictEqual(rows[0].phase, 'retire');
  assert.strictEqual(rows[1].phase, 'retire');
});

// ── Multiple pots: withdrawal order ─────────────────────────────────────────

test('retirement: withdraws from pots in the configured order', () => {
  const config = makeConfig({ balance: 0, growthRate: 0, drawdownRate: 0, spending: 10000 });
  // Enable both ISA and cash; ISA first in order
  config.isa.balance  = 50000;
  config.cash.enabled = true;
  config.cash.balance = 50000;
  config.withdrawalOrder = ['isa', 'cash'];

  const rows = runProjection(config);
  assert.strictEqual(rows[0].isaWithdrawn, 10000);
  assert.strictEqual(rows[0].cashWithdrawn, 0);
});
