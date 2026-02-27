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
      drawdownStartAge: null,
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

// ── Account-specific drawdown rate overrides ─────────────────────────────────

test('sippDrawdownRateOverride draws specifically from SIPP from retirement age', () => {
  // Problem statement case: SIPP set to draw 3% from retirement age (58).
  // Without the fix the SIPP would only be drawn after higher-priority pots
  // are exhausted (potentially age 82). With the fix sippWithdrawn > 0 in
  // the very first retirement year.
  const currentYear = new Date().getFullYear();
  const config = makeConfig({
    balance:       0,      // ISA disabled by setting balance=0 and disabling below
    growthRate:    0,
    drawdownRate:  0,      // No global portfolio drawdown; only SIPP-specific draw
    spending:      0,
    currentAge:    58,
    retirementAge: 58,
    endAge:        60,
  });
  config.isa.enabled  = false;
  config.sipp.enabled = true;
  config.sipp.balance = 100000;
  config.sipp.growthRate = 0;
  config.sipp.accessAge  = 57;      // SIPP accessible from 57
  config.withdrawalOrder = ['isa', 'sipp', 'premiumBonds', 'cash'];

  // Apply 3% SIPP-specific drawdown to all three years
  for (let yr = currentYear; yr <= currentYear + 2; yr++) {
    config.overrides[yr] = { sippDrawdownRateOverride: 3 };
  }

  const rows = runProjection(config);

  // Year 0 (age 58): SIPP should draw 3% = 3,000
  assert.strictEqual(rows[0].sippWithdrawn, 3000);
  // Year 1 (age 59): 3% of 97,000 = 2,910
  assert.strictEqual(rows[1].sippWithdrawn, 2910);
});

test('sippDrawdownRateOverride: SIPP draws its specific rate even when ISA/PB are first in order', () => {
  // Core bug scenario: ISA has a large balance AND is first in the withdrawal
  // order. Without the fix the SIPP would not be drawn at all while ISA
  // remains non-zero. With the fix sippWithdrawn > 0 in the first year.
  const currentYear = new Date().getFullYear();
  const config = makeConfig({
    balance:       200000,   // Large ISA balance
    growthRate:    0,
    drawdownRate:  0,        // No global drawdown
    spending:      0,
    currentAge:    58,
    retirementAge: 58,
    endAge:        59,
  });
  config.sipp.enabled   = true;
  config.sipp.balance   = 100000;
  config.sipp.growthRate = 0;
  config.sipp.accessAge  = 57;
  config.withdrawalOrder = ['isa', 'sipp', 'premiumBonds', 'cash'];
  config.overrides[currentYear] = { sippDrawdownRateOverride: 3 };

  const rows = runProjection(config);

  // ISA has no rate override → ISA balance unchanged (0 drawn from ISA)
  assert.strictEqual(rows[0].isaWithdrawn, 0);
  // SIPP draws 3% = 3,000 regardless of withdrawal order
  assert.strictEqual(rows[0].sippWithdrawn, 3000);
  assert.strictEqual(rows[0].sippBalance, 97000);
});

test('sippDrawdownRateOverride is excluded from main portfolio withdrawal', () => {
  // When a SIPP-specific rate is set, the SIPP should not also be drawn
  // from by the main portfolio withdrawal strategy (no double-counting).
  const currentYear = new Date().getFullYear();
  const config = makeConfig({
    balance:       0,
    growthRate:    0,
    drawdownRate:  0,
    spending:      5000,   // Spending gap covered by SIPP draw
    currentAge:    58,
    retirementAge: 58,
    endAge:        59,
  });
  config.isa.enabled     = false;
  config.sipp.enabled    = true;
  config.sipp.balance    = 200000;
  config.sipp.growthRate = 0;
  config.sipp.accessAge  = 57;
  config.withdrawalOrder = ['isa', 'sipp', 'premiumBonds', 'cash'];
  // 3% of 200,000 = 6,000 — more than covers the 5,000 spending gap
  config.overrides[currentYear] = { sippDrawdownRateOverride: 3 };

  const rows = runProjection(config);

  // SIPP draws exactly 3% = 6,000 (not 5,000 spending gap + 6,000 rate draw)
  assert.strictEqual(rows[0].sippWithdrawn, 6000);
  assert.strictEqual(rows[0].sippBalance, 194000);
  // Spending is 5,000 and SIPP drew 6,000 → no shortfall
  assert.strictEqual(rows[0].shortfall, 0);
});

test('isaDrawdownRateOverride draws specifically from ISA at the configured rate', () => {
  const currentYear = new Date().getFullYear();
  const config = makeConfig({
    balance:       100000,
    growthRate:    0,
    drawdownRate:  0,
    spending:      0,
    currentAge:    60,
    retirementAge: 60,
    endAge:        61,
  });
  config.overrides[currentYear] = { isaDrawdownRateOverride: 5 };

  const rows = runProjection(config);

  // ISA draws 5% = 5,000 specifically
  assert.strictEqual(rows[0].isaWithdrawn, 5000);
  assert.strictEqual(rows[0].isaBalance, 95000);
});

test('sippDrawdownRateOverride respects sippAccessAge (no draw before access age)', () => {
  // If retirement starts before the SIPP access age, the SIPP-specific rate
  // override should not draw from SIPP until the access age is reached.
  const currentYear = new Date().getFullYear();
  const config = makeConfig({
    balance:       0,
    growthRate:    0,
    drawdownRate:  0,
    spending:      0,
    currentAge:    55,
    retirementAge: 55,
    endAge:        60,
  });
  config.isa.enabled     = false;
  config.sipp.enabled    = true;
  config.sipp.balance    = 100000;
  config.sipp.growthRate = 0;
  config.sipp.accessAge  = 57;   // SIPP not accessible before 57
  config.withdrawalOrder = ['isa', 'sipp'];

  // Apply 3% SIPP rate override to all years
  for (let yr = currentYear; yr <= currentYear + 5; yr++) {
    config.overrides[yr] = { sippDrawdownRateOverride: 3 };
  }

  const rows = runProjection(config);

  // Age 55 (i=0) and 56 (i=1): SIPP not yet accessible — no draw
  assert.strictEqual(rows[0].sippWithdrawn, 0, 'Age 55: SIPP should not draw before accessAge');
  assert.strictEqual(rows[1].sippWithdrawn, 0, 'Age 56: SIPP should not draw before accessAge');
  // Age 57 (i=2): SIPP accessible — draw begins
  assert.ok(rows[2].sippWithdrawn > 0, 'Age 57: SIPP should start drawing at accessAge');
});

test('sippDrawdownRateOverride and global portfolio drawdown coexist correctly', () => {
  // SIPP draws at its specific rate (3%) from SIPP specifically.
  // Remaining portfolio gap comes from ISA (global 4% rate, excluding SIPP).
  const currentYear = new Date().getFullYear();
  const config = makeConfig({
    balance:       100000,   // ISA
    growthRate:    0,
    drawdownRate:  4,        // Global portfolio rate = 4%
    spending:      0,
    currentAge:    58,
    retirementAge: 58,
    endAge:        59,
  });
  config.sipp.enabled    = true;
  config.sipp.balance    = 100000;
  config.sipp.growthRate = 0;
  config.sipp.accessAge  = 57;
  config.withdrawalOrder = ['isa', 'sipp'];
  config.overrides[currentYear] = { sippDrawdownRateOverride: 3 };

  const rows = runProjection(config);

  // SIPP draws 3% of its own balance = 3,000 (specific)
  assert.strictEqual(rows[0].sippWithdrawn, 3000);
  // Total portfolio (200,000) × 4% = 8,000. SIPP already drew 3,000.
  // Adjusted gap = max(0, 8,000 − 3,000) = 5,000 drawn from ISA.
  assert.strictEqual(rows[0].isaWithdrawn, 5000);
  // Total withdrawn = 3,000 (SIPP) + 5,000 (ISA) = 8,000
  assert.strictEqual(rows[0].totalWithdrawn, 8000);
});

// ── ISA drawdownStartAge constraint ─────────────────────────────────────────

test('ISA drawdown deferred when drawdownStartAge > retirementAge', () => {
  // Issue: ISA shows drawdown starting at retirement (55) but engine correctly
  // defers to the explicit drawdownStartAge (59).
  const config = makeConfig({
    balance:       100000,
    growthRate:    0,
    drawdownRate:  0,
    spending:      10000,
    currentAge:    55,
    retirementAge: 55,
    endAge:        60,
  });
  config.isa.drawdownStartAge = 59;
  config.cash.enabled  = true;
  config.cash.balance  = 50000;
  config.cash.growthRate = 0;
  config.withdrawalOrder = ['isa', 'cash'];

  const rows = runProjection(config);

  // Ages 55–58: ISA not accessible; spending covered by cash
  for (let i = 0; i < 4; i++) {
    assert.strictEqual(rows[i].isaWithdrawn, 0, `Age ${55 + i}: ISA should not draw before drawdownStartAge 59`);
    assert.strictEqual(rows[i].cashWithdrawn, 10000, `Age ${55 + i}: cash should cover spending`);
  }
  // Age 59: ISA accessible — spending drawn from ISA (first in order)
  assert.strictEqual(rows[4].isaWithdrawn, 10000, 'Age 59: ISA should draw from drawdownStartAge');
  assert.strictEqual(rows[4].cashWithdrawn, 0, 'Age 59: cash not drawn when ISA covers spending');
});

test('isaDrawdownRateOverride respects drawdownStartAge (no draw before access age)', () => {
  // When drawdownStartAge is set beyond retirement age, the ISA-specific rate
  // override must not draw from ISA until the drawdownStartAge is reached.
  const currentYear = new Date().getFullYear();
  const config = makeConfig({
    balance:       100000,
    growthRate:    0,
    drawdownRate:  0,
    spending:      0,
    currentAge:    55,
    retirementAge: 55,
    endAge:        60,
  });
  config.isa.drawdownStartAge = 59;

  // Apply 5% ISA rate override to all years
  for (let yr = currentYear; yr <= currentYear + 5; yr++) {
    config.overrides[yr] = { isaDrawdownRateOverride: 5 };
  }

  const rows = runProjection(config);

  // Ages 55–58: ISA not yet accessible — no draw
  assert.strictEqual(rows[0].isaWithdrawn, 0, 'Age 55: ISA should not draw before drawdownStartAge');
  assert.strictEqual(rows[1].isaWithdrawn, 0, 'Age 56: ISA should not draw before drawdownStartAge');
  assert.strictEqual(rows[2].isaWithdrawn, 0, 'Age 57: ISA should not draw before drawdownStartAge');
  assert.strictEqual(rows[3].isaWithdrawn, 0, 'Age 58: ISA should not draw before drawdownStartAge');
  // Age 59: ISA accessible — draw begins
  assert.ok(rows[4].isaWithdrawn > 0, 'Age 59: ISA should start drawing at drawdownStartAge');
});

// ── Per-account drawdown independent of retirementAge ───────────────────────

test('SIPP draws from accessAge even when retirementAge is later', () => {
  // UK scenario: NMPA reached at 57 while still working until 65.
  // SIPP should start drawing at 57 regardless of retirementAge.
  const config = makeConfig({
    balance:       0,
    growthRate:    0,
    drawdownRate:  4,
    spending:      0,
    currentAge:    55,
    retirementAge: 65,
    endAge:        58,
  });
  config.isa.enabled     = false;
  config.sipp.enabled    = true;
  config.sipp.balance    = 100000;
  config.sipp.growthRate = 0;
  config.sipp.accessAge  = 57;
  config.withdrawalOrder = ['sipp'];

  const rows = runProjection(config);

  // Ages 55–56: SIPP not yet accessible (accessAge = 57) — no draw
  assert.strictEqual(rows[0].sippWithdrawn, 0, 'Age 55: SIPP should not draw before accessAge');
  assert.strictEqual(rows[1].sippWithdrawn, 0, 'Age 56: SIPP should not draw before accessAge');
  // Age 57: SIPP accessible — draws at 4% of 100,000 = 4,000, even though not yet retired
  assert.strictEqual(rows[2].sippWithdrawn, 4000, 'Age 57: SIPP should draw at accessAge even before retirementAge');
  assert.strictEqual(rows[2].sippBalance, 96000);
  // Phase label remains 'accumulate' because retirementAge (65) not reached
  assert.strictEqual(rows[2].phase, 'accumulate');
});

test('ISA with explicit drawdownStartAge before retirementAge draws early', () => {
  // Scenario: user sets ISA drawdownStartAge = 60 but retirementAge = 65.
  // ISA should start drawing at 60, not 65.
  const config = makeConfig({
    balance:       100000,
    growthRate:    0,
    drawdownRate:  4,
    spending:      0,
    currentAge:    58,
    retirementAge: 65,
    endAge:        61,
  });
  config.isa.drawdownStartAge = 60;

  const rows = runProjection(config);

  // Ages 58–59: ISA not yet at drawdownStartAge — no draw
  assert.strictEqual(rows[0].isaWithdrawn, 0, 'Age 58: ISA should not draw before drawdownStartAge 60');
  assert.strictEqual(rows[1].isaWithdrawn, 0, 'Age 59: ISA should not draw before drawdownStartAge 60');
  // Age 60: ISA starts drawing at 4% of 100,000 = 4,000, even though not yet retired
  assert.strictEqual(rows[2].isaWithdrawn, 4000, 'Age 60: ISA draws at explicit drawdownStartAge even before retirementAge');
  assert.strictEqual(rows[2].phase, 'accumulate');
});

test('ISA contributions continue while SIPP draws before retirementAge', () => {
  // When SIPP starts drawing pre-retirement, ISA contributions should still happen
  // (the user is still working and contributing to their ISA).
  const config = makeConfig({
    balance:       0,
    growthRate:    0,
    drawdownRate:  4,
    spending:      0,
    currentAge:    57,
    retirementAge: 65,
    endAge:        58,
  });
  config.isa.enabled            = true;
  config.isa.balance            = 50000;
  config.isa.annualContribution = 10000;
  config.sipp.enabled    = true;
  config.sipp.balance    = 100000;
  config.sipp.growthRate = 0;
  config.sipp.accessAge  = 57;
  config.withdrawalOrder = ['isa', 'sipp'];

  const rows = runProjection(config);

  // ISA contribution still made (not yet retired)
  assert.strictEqual(rows[0].isaContribution, 10000, 'Age 57: ISA contribution should continue pre-retirement');
  // SIPP draws 4% of pre-growth portfolio (50000 + 100000) = 6,000;
  // ISA is not accessible before retirementAge (65) so SIPP is drawn
  assert.strictEqual(rows[0].sippWithdrawn, 6000, 'Age 57: SIPP draws 4% of pre-growth portfolio');
  assert.strictEqual(rows[0].isaWithdrawn, 0, 'Age 57: ISA not drawn (before retirementAge)');
});

// ── Cash: contribution tracking ─────────────────────────────────────────────

test('cash contribution is tracked in the output row', () => {
  const config = makeConfig({ balance: 0, growthRate: 0, drawdownRate: 0, retirementAge: 70 });
  config.cash.enabled            = true;
  config.cash.balance            = 10000;
  config.cash.growthRate         = 0;
  config.cash.annualContribution = 3000;
  const rows = runProjection(config);
  // Year 0: contribution = 3000
  assert.strictEqual(rows[0].cashContribution, 3000);
  // Balance: 10000 + 3000 = 13000
  assert.strictEqual(rows[0].cashBalance, 13000);
});

test('cash contribution stops at stopContributionAge', () => {
  const config = makeConfig({
    balance: 0, growthRate: 0, drawdownRate: 0,
    currentAge: 55, retirementAge: 70, endAge: 57,
  });
  config.cash.enabled            = true;
  config.cash.balance            = 10000;
  config.cash.growthRate         = 0;
  config.cash.annualContribution = 3000;
  config.cash.stopContributionAge = 56;  // stop at 56

  const rows = runProjection(config);

  // age 55 (i=0): contribution applies
  assert.strictEqual(rows[0].cashContribution, 3000);
  // age 56 (i=1): no contribution
  assert.strictEqual(rows[1].cashContribution, 0);
  // age 57 (i=2): no contribution
  assert.strictEqual(rows[2].cashContribution, 0);
});

test('cashContributionOverride replaces regular contribution for that year', () => {
  const currentYear = new Date().getFullYear();
  const config = makeConfig({ balance: 0, growthRate: 0, drawdownRate: 0, retirementAge: 70 });
  config.cash.enabled            = true;
  config.cash.balance            = 10000;
  config.cash.growthRate         = 0;
  config.cash.annualContribution = 3000;
  config.overrides[currentYear]  = { cashContributionOverride: 7000 };

  const rows = runProjection(config);

  // Override replaces the 3000 contribution with 7000
  assert.strictEqual(rows[0].cashContribution, 7000);
  assert.strictEqual(rows[0].cashBalance, 17000);
  // Year 1: back to regular contribution
  assert.strictEqual(rows[1].cashContribution, 3000);
});

// ── Cash: drawdown rate override ─────────────────────────────────────────────

test('cashDrawdownRateOverride draws specifically from Cash at the configured rate', () => {
  const currentYear = new Date().getFullYear();
  const config = makeConfig({
    balance:       0,
    growthRate:    0,
    drawdownRate:  0,
    spending:      0,
    currentAge:    60,
    retirementAge: 60,
    endAge:        61,
  });
  config.isa.enabled    = false;
  config.cash.enabled   = true;
  config.cash.balance   = 100000;
  config.cash.growthRate = 0;
  config.withdrawalOrder = ['isa', 'sipp', 'premiumBonds', 'cash'];
  config.overrides[currentYear] = { cashDrawdownRateOverride: 5 };

  const rows = runProjection(config);

  // Cash draws 5% = 5,000
  assert.strictEqual(rows[0].cashWithdrawn, 5000);
  assert.strictEqual(rows[0].cashBalance, 95000);
});

test('cashDrawdownRateOverride respects drawdownStartAge (no draw before access age)', () => {
  const currentYear = new Date().getFullYear();
  const config = makeConfig({
    balance:       0,
    growthRate:    0,
    drawdownRate:  0,
    spending:      0,
    currentAge:    55,
    retirementAge: 65,
    endAge:        60,
  });
  config.isa.enabled          = false;
  config.cash.enabled         = true;
  config.cash.balance         = 100000;
  config.cash.growthRate      = 0;
  config.cash.drawdownStartAge = 58;
  config.withdrawalOrder = ['cash'];

  // Apply 5% cash rate override to all years
  for (let yr = currentYear; yr <= currentYear + 5; yr++) {
    config.overrides[yr] = { cashDrawdownRateOverride: 5 };
  }

  const rows = runProjection(config);

  // Ages 55–57: cash not yet accessible
  assert.strictEqual(rows[0].cashWithdrawn, 0, 'Age 55: cash should not draw before drawdownStartAge');
  assert.strictEqual(rows[1].cashWithdrawn, 0, 'Age 56: cash should not draw before drawdownStartAge');
  assert.strictEqual(rows[2].cashWithdrawn, 0, 'Age 57: cash should not draw before drawdownStartAge');
  // Age 58: cash accessible — draw begins
  assert.ok(rows[3].cashWithdrawn > 0, 'Age 58: cash should start drawing at drawdownStartAge');
});

test('cash drawdown deferred when drawdownStartAge is after retirementAge', () => {
  // Similar to ISA deferred drawdown: cash has explicit drawdownStartAge > retirementAge
  const config = makeConfig({
    balance:       100000,
    growthRate:    0,
    drawdownRate:  0,
    spending:      10000,
    currentAge:    55,
    retirementAge: 55,
    endAge:        60,
  });
  config.isa.enabled          = false;
  config.cash.enabled         = true;
  config.cash.balance         = 50000;
  config.cash.growthRate      = 0;
  config.cash.drawdownStartAge = 58;
  config.sipp.enabled         = true;
  config.sipp.balance         = 50000;
  config.sipp.growthRate      = 0;
  config.sipp.accessAge       = 55;
  config.withdrawalOrder = ['cash', 'sipp'];

  const rows = runProjection(config);

  // Ages 55–57: cash not accessible; spending covered by SIPP
  for (let i = 0; i < 3; i++) {
    assert.strictEqual(rows[i].cashWithdrawn, 0, `Age ${55 + i}: cash should not draw before drawdownStartAge 58`);
  }
  // Age 58: cash accessible — spending drawn from cash (first in order)
  assert.strictEqual(rows[3].cashWithdrawn, 10000, 'Age 58: cash draws from drawdownStartAge');
});
