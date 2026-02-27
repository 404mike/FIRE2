/**
 * withdrawalStrategy.test.js — Unit tests for executeWithdrawal
 *
 * Covers: priority order, access constraints, partial withdrawals,
 * shortfall reporting, and the no-negative-balance guarantee.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { executeWithdrawal } from '../js/engine/withdrawalStrategy.js';

// Helper: all pots accessible
const ALL_ALLOWED = {
  isaDrawdownAllowed:          true,
  sippAccessAllowed:           true,
  premiumBondsDrawdownAllowed: true,
};

// ── Priority order ───────────────────────────────────────────────────────────

test('withdraws entirely from first pot when it has sufficient funds', () => {
  const balances = { isa: 50000, sipp: 50000, premiumBonds: 50000, cash: 50000 };
  const { withdrawn, balances: after } = executeWithdrawal(
    balances, 10000, ['isa', 'sipp', 'premiumBonds', 'cash'], ALL_ALLOWED,
  );
  assert.strictEqual(withdrawn.isa, 10000);
  assert.strictEqual(withdrawn.sipp, 0);
  assert.strictEqual(after.isa, 40000);
  assert.strictEqual(after.sipp, 50000);
});

test('moves to next pot when the first is exhausted', () => {
  const balances = { isa: 3000, sipp: 50000, premiumBonds: 0, cash: 0 };
  const { withdrawn, balances: after } = executeWithdrawal(
    balances, 10000, ['isa', 'sipp', 'premiumBonds', 'cash'], ALL_ALLOWED,
  );
  assert.strictEqual(withdrawn.isa, 3000);
  assert.strictEqual(withdrawn.sipp, 7000);
  assert.strictEqual(after.isa, 0);
  assert.strictEqual(after.sipp, 43000);
});

test('spreads across all pots when needed', () => {
  const balances = { isa: 5000, sipp: 5000, premiumBonds: 5000, cash: 5000 };
  const { withdrawn } = executeWithdrawal(
    balances, 18000, ['isa', 'sipp', 'premiumBonds', 'cash'], ALL_ALLOWED,
  );
  assert.strictEqual(withdrawn.isa, 5000);
  assert.strictEqual(withdrawn.sipp, 5000);
  assert.strictEqual(withdrawn.premiumBonds, 5000);
  assert.strictEqual(withdrawn.cash, 3000);
});

// ── Access constraints ───────────────────────────────────────────────────────

test('skips SIPP when not yet accessible', () => {
  const balances = { isa: 50000, sipp: 50000, premiumBonds: 0, cash: 0 };
  const constraints = { ...ALL_ALLOWED, sippAccessAllowed: false };
  const { withdrawn } = executeWithdrawal(
    balances, 10000, ['sipp', 'isa'], constraints,
  );
  assert.strictEqual(withdrawn.sipp, 0);
  assert.strictEqual(withdrawn.isa, 10000);
});

test('skips ISA when not yet at drawdown age', () => {
  const balances = { isa: 50000, sipp: 50000, premiumBonds: 0, cash: 0 };
  const constraints = { ...ALL_ALLOWED, isaDrawdownAllowed: false };
  const { withdrawn } = executeWithdrawal(
    balances, 10000, ['isa', 'sipp'], constraints,
  );
  assert.strictEqual(withdrawn.isa, 0);
  assert.strictEqual(withdrawn.sipp, 10000);
});

test('skips Premium Bonds when not yet at drawdown age', () => {
  const balances = { isa: 50000, sipp: 50000, premiumBonds: 50000, cash: 0 };
  const constraints = { ...ALL_ALLOWED, premiumBondsDrawdownAllowed: false };
  const { withdrawn } = executeWithdrawal(
    balances, 10000, ['premiumBonds', 'isa'], constraints,
  );
  assert.strictEqual(withdrawn.premiumBonds, 0);
  assert.strictEqual(withdrawn.isa, 10000);
});

// ── Shortfall ────────────────────────────────────────────────────────────────

test('reports shortfall when all accessible pots are exhausted', () => {
  const balances = { isa: 3000, sipp: 0, premiumBonds: 0, cash: 0 };
  const { withdrawn, shortfall } = executeWithdrawal(
    balances, 10000, ['isa', 'sipp', 'premiumBonds', 'cash'], ALL_ALLOWED,
  );
  assert.strictEqual(withdrawn.isa, 3000);
  assert.strictEqual(shortfall, 7000);
});

test('shortfall equals full amount when no constrained pots are accessible and cash is empty', () => {
  const balances = { isa: 50000, sipp: 50000, premiumBonds: 50000, cash: 0 };
  const constraints = {
    isaDrawdownAllowed:          false,
    sippAccessAllowed:           false,
    premiumBondsDrawdownAllowed: false,
  };
  const { shortfall } = executeWithdrawal(
    balances, 10000, ['isa', 'sipp', 'premiumBonds', 'cash'], constraints,
  );
  assert.strictEqual(shortfall, 10000);
});

test('shortfall is zero when withdrawal fully satisfied', () => {
  const balances = { isa: 50000, sipp: 0, premiumBonds: 0, cash: 0 };
  const { shortfall } = executeWithdrawal(
    balances, 10000, ['isa'], ALL_ALLOWED,
  );
  assert.strictEqual(shortfall, 0);
});

// ── No-negative-balance guarantee ───────────────────────────────────────────

test('pot balances never go below zero', () => {
  const balances = { isa: 5000, sipp: 5000, premiumBonds: 5000, cash: 5000 };
  const { balances: after } = executeWithdrawal(
    balances, 1000000, ['isa', 'sipp', 'premiumBonds', 'cash'], ALL_ALLOWED,
  );
  for (const [pot, balance] of Object.entries(after)) {
    assert.ok(balance >= 0, `${pot} went negative: ${balance}`);
  }
});

// ── Edge cases ───────────────────────────────────────────────────────────────

test('zero withdrawal amount changes nothing', () => {
  const balances = { isa: 50000, sipp: 50000, premiumBonds: 50000, cash: 50000 };
  const { withdrawn, balances: after, shortfall } = executeWithdrawal(
    balances, 0, ['isa', 'sipp', 'premiumBonds', 'cash'], ALL_ALLOWED,
  );
  assert.deepStrictEqual(withdrawn, { isa: 0, sipp: 0, premiumBonds: 0, cash: 0 });
  assert.deepStrictEqual(after, balances);
  assert.strictEqual(shortfall, 0);
});

test('does not mutate the original balances object', () => {
  const balances = { isa: 50000, sipp: 50000, premiumBonds: 50000, cash: 50000 };
  executeWithdrawal(balances, 10000, ['isa'], ALL_ALLOWED);
  assert.strictEqual(balances.isa, 50000);
});
