/**
 * invariants.js — Hard invariant checks for the projection engine.
 *
 * Call validateYearInvariants after computing each year's ledger data.
 * If any invariant is violated, an Error is thrown identifying the
 * account and year so the failure is immediately actionable.
 *
 * Invariant 1: Balance conservation per account
 *   closing = opening + growth + inflows − outflows + transfersIn − transfersOut
 *
 * Invariant 2: Reported withdrawn equals sum of outflow events
 *   reportedWithdrawn == outflows
 *
 * Invariant 3: Net worth equals sum of closing balances
 *   netWorth == Σ closingBalances
 *
 * Invariant 4: Spending equation consistency
 *   shortfall == max(0, spendNeed − income − Σ outflows)
 */

/** Rounding tolerance (£1) to absorb floating-point arithmetic errors. */
const TOLERANCE = 1;

/**
 * @typedef {object} AccountLedger
 * @property {number} opening          Balance at start of year
 * @property {number} growth           Return applied (floored at zero when account balance is zero)
 * @property {number} inflows          Contributions + lump sums
 * @property {number} outflows         All withdrawals (planned + override + extra)
 * @property {number} transfersIn      Received from other accounts (e.g. PB cap overflow)
 * @property {number} transfersOut     Sent to other accounts
 * @property {number} closing          Balance at end of year
 * @property {number} reportedWithdrawn Drawn amount reported in the output row
 */

/**
 * Validate all hard invariants for a single projection year.
 * Throws an Error (with invariant number and account/year) if any check fails.
 *
 * @param {object}  data
 * @param {Record<string, AccountLedger>} data.accounts
 * @param {number}  data.netWorth     Reported net worth (sum of non-negative closing balances)
 * @param {number}  data.income       Total pension/non-portfolio income
 * @param {number}  data.spendNeed    Required spending (0 during accumulation)
 * @param {number}  data.shortfall    Reported spending shortfall
 * @param {number}  data.year         Calendar year (for error messages)
 * @param {number}  data.age          Age in this year (for error messages)
 */
export function validateYearInvariants({ accounts, netWorth, income, spendNeed, shortfall, year, age }) {
  // ── Invariant 1: Balance conservation per account ─────────────────────────
  for (const [id, acc] of Object.entries(accounts)) {
    const expected = acc.opening + acc.growth + acc.inflows - acc.outflows
      + (acc.transfersIn || 0) - (acc.transfersOut || 0);
    if (Math.abs(expected - acc.closing) > TOLERANCE) {
      throw new Error(
        `Invariant 1 violated for account "${id}" in year ${year} (age ${age}): ` +
        `expected closing ${expected.toFixed(2)}, got ${acc.closing.toFixed(2)}`,
      );
    }
  }

  // ── Invariant 2: Reported withdrawn equals outflow events ─────────────────
  for (const [id, acc] of Object.entries(accounts)) {
    if (Math.abs(acc.outflows - acc.reportedWithdrawn) > TOLERANCE) {
      throw new Error(
        `Invariant 2 violated for account "${id}" in year ${year} (age ${age}): ` +
        `reportedWithdrawn ${acc.reportedWithdrawn.toFixed(2)} != outflows ${acc.outflows.toFixed(2)}`,
      );
    }
  }

  // ── Invariant 3: Net worth equals sum of closing balances ─────────────────
  const sumBalances = Object.values(accounts).reduce((s, a) => s + a.closing, 0);
  if (Math.abs(sumBalances - netWorth) > TOLERANCE) {
    throw new Error(
      `Invariant 3 violated in year ${year} (age ${age}): ` +
      `netWorth ${netWorth.toFixed(2)} != sum of balances ${sumBalances.toFixed(2)}`,
    );
  }

  // ── Invariant 4: Spending equation consistency ────────────────────────────
  const totalOutflows = Object.values(accounts).reduce((s, a) => s + a.outflows, 0);
  const expectedShortfall = Math.max(0, spendNeed - income - totalOutflows);
  if (Math.abs(expectedShortfall - shortfall) > TOLERANCE) {
    throw new Error(
      `Invariant 4 violated in year ${year} (age ${age}): ` +
      `shortfall ${shortfall.toFixed(2)} != expected ${expectedShortfall.toFixed(2)} ` +
      `(spendNeed ${spendNeed}, income ${income}, totalOutflows ${totalOutflows})`,
    );
  }
}
