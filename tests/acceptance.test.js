/**
 * acceptance.test.js — Acceptance tests from the projection engine spec
 *
 * Test A: Premium Bonds extra draw reduces balance
 * Test B: Withdrawal order obeyed
 * Test C: Access age blocks SIPP
 * Test D: Invariant enforcement (validateYearInvariants throws on bad data)
 * Test E: PB max cap transfer (lump sum overflow capped, excess to cash)
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runProjection } from '../js/engine/projectionEngine.js';
import { validateYearInvariants } from '../js/engine/invariants.js';

// ── Shared helpers ────────────────────────────────────────────────────────────

const currentYear = new Date().getFullYear();

/**
 * Minimal config factory. Only PB enabled by default; all other pots opt-in.
 */
function makeConfig(opts = {}) {
  return {
    currentAge:         opts.currentAge   ?? 60,
    retirementAge:      opts.retirementAge ?? 60,
    endAge:             opts.endAge        ?? 61,
    retirementSpending: opts.spending      ?? 0,
    inflationRate:      0,
    statePensionAge:    67,
    isa: {
      enabled:             opts.isaEnabled ?? false,
      balance:             opts.isaBalance ?? 0,
      growthRate:          0,
      annualContribution:  0,
      stopContributionAge: null,
      drawdownStartAge:    null,
    },
    sipp: {
      enabled:             opts.sippEnabled ?? false,
      balance:             opts.sippBalance ?? 0,
      growthRate:          0,
      annualContribution:  0,
      accessAge:           opts.sippAccessAge ?? 57,
      stopContributionAge: null,
      drawdownStartAge:    null,
    },
    premiumBonds: {
      enabled:          opts.pbEnabled ?? true,
      balance:          opts.pbBalance ?? 50000,
      prizeRate:        opts.pbRate    ?? 0,
      drawdownStartAge: null,
    },
    cash: {
      enabled:             opts.cashEnabled ?? false,
      balance:             opts.cashBalance ?? 0,
      growthRate:          0,
      annualContribution:  0,
      stopContributionAge: null,
      drawdownStartAge:    null,
    },
    dbPension:    { enabled: false, annualIncome: 0, startAge: 65 },
    statePension: { enabled: false, annualIncome: 0 },
    drawdown:     { rate: opts.drawdownRate ?? 0 },
    withdrawalOrder: opts.withdrawalOrder ?? ['premiumBonds', 'isa', 'sipp', 'cash'],
    overrides:    opts.overrides ?? {},
    maxIncome:    null,
  };
}

// ── Test A: Premium Bonds extra draw reduces balance ─────────────────────────

test('Test A: PB extra draw (premiumBondsCustomDrawdown) reduces balance and increases drawn', () => {
  const config = makeConfig({
    pbBalance:    50000,
    pbRate:       0,
    drawdownRate: 0,
    overrides: { [currentYear]: { premiumBondsCustomDrawdown: 20000 } },
  });

  const rows = runProjection(config);
  const row = rows[0];

  // PB closing = 50000 − 20000 = 30000
  assert.strictEqual(row.premiumBondsBalance, 30000, 'PB closing balance should be 30000');
  // PB drawn = 20000
  assert.strictEqual(row.premiumBondsWithdrawn, 20000, 'PB drawn should equal the custom drawdown amount');
  // Net worth reduced by the withdrawal (30000 instead of 50000)
  assert.strictEqual(row.totalNetWorth, 30000, 'Net worth should reflect the reduced PB balance');
});

test('Test A: PB extra draw is reflected in totalWithdrawn and totalIncome', () => {
  const config = makeConfig({
    pbBalance:    50000,
    pbRate:       0,
    drawdownRate: 0,
    overrides: { [currentYear]: { premiumBondsCustomDrawdown: 20000 } },
  });

  const rows = runProjection(config);
  const row = rows[0];

  assert.strictEqual(row.totalWithdrawn, 20000);
  assert.strictEqual(row.totalIncome, 20000);
});

// ── Test B: Withdrawal order obeyed ─────────────────────────────────────────

test('Test B: planned withdrawal drawn from first accessible account in order (PB before SIPP)', () => {
  const config = makeConfig({
    pbBalance:    50000,
    sippEnabled:  true,
    sippBalance:  50000,
    spending:     10000,
    drawdownRate: 0,
    withdrawalOrder: ['premiumBonds', 'sipp', 'isa', 'cash'],
  });

  const rows = runProjection(config);
  const row = rows[0];

  assert.strictEqual(row.premiumBondsWithdrawn, 10000, 'PB should be drawn first to cover spending');
  assert.strictEqual(row.sippWithdrawn, 0, 'SIPP should not be drawn while PB has funds');
  assert.strictEqual(row.shortfall, 0, 'Spending should be fully covered');
});

// ── Test C: Access age blocks SIPP ───────────────────────────────────────────

test('Test C: SIPP blocked by access age; ISA covers spending instead', () => {
  // PB empty, SIPP inaccessible (age 55 < accessAge 57), ISA has funds
  const config = makeConfig({
    pbEnabled:    true,
    pbBalance:    0,
    sippEnabled:  true,
    sippBalance:  50000,
    sippAccessAge: 57,
    isaEnabled:   true,
    isaBalance:   50000,
    spending:     10000,
    drawdownRate: 0,
    currentAge:   55,
    retirementAge: 55,
    endAge:       56,
    withdrawalOrder: ['premiumBonds', 'sipp', 'isa', 'cash'],
  });

  const rows = runProjection(config);
  const row = rows[0]; // age 55

  assert.strictEqual(row.sippWithdrawn, 0, 'SIPP inaccessible at age 55 — should not be drawn');
  assert.strictEqual(row.isaWithdrawn, 10000, 'ISA should cover spending when SIPP is blocked');
  assert.strictEqual(row.shortfall, 0, 'Spending should be fully covered via ISA');
});

// ── Test D: Invariant enforcement ─────────────────────────────────────────────

test('Test D: validateYearInvariants throws Invariant 2 when reportedWithdrawn != outflows', () => {
  // Simulate a bug where premiumBondsWithdrawn is reported as 20000
  // but the balance was not actually reduced (outflows = 0).
  assert.throws(
    () => validateYearInvariants({
      accounts: {
        premiumBonds: {
          opening: 50000, growth: 0, inflows: 0,
          outflows: 0,         // Bug: balance not changed
          transfersIn: 0, transfersOut: 0,
          closing: 50000,      // Balance unchanged
          reportedWithdrawn: 20000, // But we reported drawing 20000
        },
        isa:  { opening: 0, growth: 0, inflows: 0, outflows: 0, transfersIn: 0, transfersOut: 0, closing: 0, reportedWithdrawn: 0 },
        sipp: { opening: 0, growth: 0, inflows: 0, outflows: 0, transfersIn: 0, transfersOut: 0, closing: 0, reportedWithdrawn: 0 },
        cash: { opening: 0, growth: 0, inflows: 0, outflows: 0, transfersIn: 0, transfersOut: 0, closing: 0, reportedWithdrawn: 0 },
      },
      netWorth:  50000,
      income:    0,
      spendNeed: 0,
      shortfall: 0,
      year:      2025,
      age:       60,
    }),
    (err) => {
      assert.ok(err instanceof Error, 'Should throw an Error');
      assert.ok(
        /Invariant [12]/.test(err.message) && /premiumBonds/.test(err.message),
        `Error message should reference Invariant 1 or 2 and "premiumBonds": ${err.message}`,
      );
      return true;
    },
  );
});

test('Test D: validateYearInvariants throws Invariant 1 when closing != opening + growth + inflows − outflows', () => {
  // Balance conservation is violated: closing should be 80000 but is reported as 50000
  assert.throws(
    () => validateYearInvariants({
      accounts: {
        isa: {
          opening: 100000, growth: 5000, inflows: 0,
          outflows: 25000, // outflows reported as 25000
          transfersIn: 0, transfersOut: 0,
          closing: 50000,  // But closing is 50000 (should be 80000)
          reportedWithdrawn: 25000,
        },
        sipp:         { opening: 0, growth: 0, inflows: 0, outflows: 0, transfersIn: 0, transfersOut: 0, closing: 0, reportedWithdrawn: 0 },
        premiumBonds: { opening: 0, growth: 0, inflows: 0, outflows: 0, transfersIn: 0, transfersOut: 0, closing: 0, reportedWithdrawn: 0 },
        cash:         { opening: 0, growth: 0, inflows: 0, outflows: 0, transfersIn: 0, transfersOut: 0, closing: 0, reportedWithdrawn: 0 },
      },
      netWorth:  50000,
      income:    0,
      spendNeed: 0,
      shortfall: 0,
      year:      2025,
      age:       60,
    }),
    (err) => {
      assert.ok(err instanceof Error, 'Should throw an Error');
      assert.ok(
        /Invariant 1/.test(err.message) && /isa/.test(err.message),
        `Error message should reference "Invariant 1" and "isa": ${err.message}`,
      );
      return true;
    },
  );
});

test('Test D: runProjection invariants pass for a valid scenario (no throw)', () => {
  // Ensure the engine itself does not throw for a well-formed config
  const config = makeConfig({
    pbBalance:    50000,
    pbRate:       3,
    drawdownRate: 0,
    spending:     5000,
    overrides: { [currentYear]: { premiumBondsCustomDrawdown: 10000 } },
  });
  assert.doesNotThrow(() => runProjection(config), 'runProjection should not throw for valid config');
});

// ── Test E: PB max cap transfer ───────────────────────────────────────────────

test('Test E: PB lump sum overflow is capped at £50,000 and excess transferred to cash', () => {
  // PB opening = 50000, lump sum in = 5000 → would reach 55000, but cap = 50000.
  // Excess 5000 must go to cash.
  const config = makeConfig({
    pbBalance:    50000,
    pbRate:       0,
    cashEnabled:  true,
    cashBalance:  0,
    drawdownRate: 0,
    overrides: { [currentYear]: { premiumBondLumpSum: 5000 } },
  });

  const rows = runProjection(config);
  const row = rows[0];

  assert.strictEqual(row.premiumBondsBalance, 50000, 'PB balance should be capped at £50,000');
  assert.strictEqual(row.cashBalance, 5000, 'Excess £5,000 should transfer to cash');
  assert.strictEqual(row.totalNetWorth, 55000, 'Net worth should include both PB and the cash overflow');
});

test('Test E: PB growth overflow also capped (existing behaviour preserved)', () => {
  // PB at exactly 50000 with 3% prize rate: 50000 * 1.03 = 51500 > 50000.
  // Excess 1500 should go to cash.
  const config = makeConfig({
    pbBalance:   50000,
    pbRate:      3,
    cashEnabled: true,
    cashBalance: 0,
    drawdownRate: 0,
  });

  const rows = runProjection(config);
  const row = rows[0];

  assert.strictEqual(row.premiumBondsBalance, 50000, 'PB capped at £50,000 after growth');
  assert.strictEqual(row.cashBalance, 1500, 'Growth overflow transferred to cash');
});

test('Test E: invariants hold after PB cap transfer', () => {
  // Verify runProjection does not throw when a PB lump sum overflows the cap.
  const config = makeConfig({
    pbBalance:   50000,
    pbRate:      0,
    cashEnabled: true,
    cashBalance: 10000,
    drawdownRate: 0,
    overrides: { [currentYear]: { premiumBondLumpSum: 10000 } },
  });
  // Should not throw (invariants internally satisfied)
  assert.doesNotThrow(() => runProjection(config), 'Invariants should hold after PB cap transfer');

  const rows = runProjection(config);
  assert.strictEqual(rows[0].premiumBondsBalance, 50000, 'PB capped at 50000');
  assert.strictEqual(rows[0].cashBalance, 20000, '10000 existing cash + 10000 overflow from PB');
});

// ── Debug payload ─────────────────────────────────────────────────────────────

test('debug flag adds _debug payload with per-account ledger and invariantsPassed flag', () => {
  const config = makeConfig({ pbBalance: 50000, pbRate: 0, drawdownRate: 0 });
  const rows = runProjection(config, { debug: true });
  const row = rows[0];

  assert.ok(row._debug, 'Row should have _debug payload when debug=true');
  assert.ok(row._debug.accounts, 'Debug payload should include per-account ledger');
  assert.strictEqual(row._debug.invariantsPassed, true, 'invariantsPassed should be true');
  assert.ok('premiumBonds' in row._debug.accounts, 'Debug accounts should include premiumBonds');
});

test('debug flag is off by default (no _debug in rows)', () => {
  const config = makeConfig({ pbBalance: 50000, pbRate: 0, drawdownRate: 0 });
  const rows = runProjection(config);
  assert.ok(!rows[0]._debug, 'Row should not have _debug payload when debug is not set');
});

// ── Acceptance Test 2: Cash custom drawdown ───────────────────────────────────

test('Acceptance Test 2: cash custom drawdown reduces balance and reports withdrawn', () => {
  const config = makeConfig({
    cashEnabled:  true,
    cashBalance:  40000,
    drawdownRate: 0,
    overrides: { [currentYear]: { cashCustomDrawdown: 10000 } },
  });

  const rows = runProjection(config);
  const row = rows[0];

  // cash closing = 40000 − 10000 = 30000
  assert.strictEqual(row.cashBalance, 30000, 'Cash closing balance should be 30000');
  assert.strictEqual(row.cashWithdrawn, 10000, 'Cash withdrawn should equal the custom drawdown amount');
});

test('Acceptance Test 2: cash custom drawdown fires during accumulation phase', () => {
  // Capital reallocation must work before retirement age (pre-retirement transfer)
  const config = makeConfig({
    cashEnabled:    true,
    cashBalance:    40000,
    currentAge:     40,
    retirementAge:  65,
    endAge:         41,
    drawdownRate:   0,
    overrides: { [currentYear]: { cashCustomDrawdown: 10000 } },
  });

  const rows = runProjection(config);
  const row = rows[0];

  assert.strictEqual(row.phase, 'accumulate', 'Should be in accumulation phase');
  assert.strictEqual(row.cashBalance, 30000, 'Cash balance should be reduced by custom drawdown in accumulation');
  assert.strictEqual(row.cashWithdrawn, 10000, 'cashWithdrawn must reflect the custom drawdown amount');
});

// ── Acceptance Test 3: Withdrawal cannot exceed balance ───────────────────────

test('Acceptance Test 3: PB custom drawdown is capped at available balance', () => {
  const config = makeConfig({
    pbBalance:    10000,
    pbRate:       0,
    drawdownRate: 0,
    overrides: { [currentYear]: { premiumBondsCustomDrawdown: 20000 } },
  });

  const rows = runProjection(config);
  const row = rows[0];

  // withdrawn = min(10000, 20000) = 10000; balance = 0
  assert.strictEqual(row.premiumBondsWithdrawn, 10000, 'Withdrawn must be capped at available balance');
  assert.strictEqual(row.premiumBondsBalance, 0, 'Balance must not go below zero');
});

test('Acceptance Test 3: cash custom drawdown is capped at available balance', () => {
  const config = makeConfig({
    cashEnabled:  true,
    cashBalance:  10000,
    drawdownRate: 0,
    overrides: { [currentYear]: { cashCustomDrawdown: 20000 } },
  });

  const rows = runProjection(config);
  const row = rows[0];

  // withdrawn = min(10000, 20000) = 10000; balance = 0
  assert.strictEqual(row.cashWithdrawn, 10000, 'Withdrawn must be capped at available balance');
  assert.strictEqual(row.cashBalance, 0, 'Balance must not go below zero');
});

// ── Premium Bonds Mode A (prize-to-cash) ────────────────────────────────────

test('PB Mode A: prize paid out to cash — PB balance unchanged, cash increases', () => {
  const config = makeConfig({
    pbBalance:    20000,
    pbRate:       4,          // 4% = £800 prize
    drawdownRate: 0,
    cashEnabled:  true,
    cashBalance:  5000,
  });
  // compoundMode defaults to false (Mode A) in DEFAULT_STATE.
  // The acceptance test config factory doesn't set compoundMode, so we ensure it's false:
  config.premiumBonds.compoundMode = false;

  const rows = runProjection(config);
  const row = rows[0];

  // PB balance should stay at 20000 (prize paid out, not compounded)
  assert.strictEqual(row.premiumBondsBalance, 20000, 'PB balance unchanged in Mode A');
  // Cash should have received the £800 prize
  assert.strictEqual(row.cashBalance, 5800, 'Cash increased by prize amount in Mode A');
});

test('PB Mode B: prize compounds inside PB — balance grows, cash unaffected', () => {
  const config = makeConfig({
    pbBalance:    20000,
    pbRate:       4,          // 4% = £800 prize
    drawdownRate: 0,
    cashEnabled:  true,
    cashBalance:  5000,
  });
  config.premiumBonds.compoundMode = true;

  const rows = runProjection(config);
  const row = rows[0];

  // PB balance should grow by the prize
  assert.strictEqual(row.premiumBondsBalance, 20800, 'PB balance grows in Mode B');
  // Cash should be unchanged (no prize transfer)
  assert.strictEqual(row.cashBalance, 5000, 'Cash unchanged in Mode B');
});

test('PB Mode A: invariants hold when prize transferred to cash', () => {
  const config = makeConfig({
    pbBalance:    30000,
    pbRate:       3,
    drawdownRate: 0,
    cashEnabled:  true,
    cashBalance:  0,
  });
  config.premiumBonds.compoundMode = false;

  // runProjection throws if invariants are violated, so no error = pass
  assert.doesNotThrow(() => runProjection(config));
});

test('PB Mode A: prize not added to cash when cash is disabled', () => {
  const config = makeConfig({
    pbBalance:    20000,
    pbRate:       5,
    drawdownRate: 0,
    cashEnabled:  false,
  });
  config.premiumBonds.compoundMode = false;

  const rows = runProjection(config);
  const row = rows[0];

  // PB balance stays flat; cash is disabled so prize is disbursed outside model
  assert.strictEqual(row.premiumBondsBalance, 20000, 'PB balance unchanged (Mode A, cash disabled)');
  assert.strictEqual(row.cashBalance, 0, 'Cash stays at 0 when disabled');
});
