/**
 * withdrawalStrategy.js — Withdraw required funds from pots in configured order
 *
 * Pure function: given pot balances, required withdrawal amount,
 * withdrawal order, and access constraints — returns updated balances
 * and a breakdown of how much came from each pot.
 */

/**
 * Attempt to withdraw `amount` from pots in the given priority order.
 *
 * @param {object} balances        Current pot balances { isa, sipp, premiumBonds, cash }
 * @param {number} amount          Total amount to withdraw
 * @param {string[]} order         Withdrawal priority order (pot keys)
 * @param {object} constraints     { sippAccessAllowed: bool, premiumBondsDrawdownAllowed: bool }
 * @returns {{ balances: object, withdrawn: object, shortfall: number }}
 */
export function executeWithdrawal(balances, amount, order, constraints) {
  const newBalances = { ...balances };
  const withdrawn = { isa: 0, sipp: 0, premiumBonds: 0, cash: 0 };
  let remaining = amount;

  for (const pot of order) {
    if (remaining <= 0) break;

    // Check access constraints
    if (pot === 'sipp' && !constraints.sippAccessAllowed) continue;
    if (pot === 'premiumBonds' && !constraints.premiumBondsDrawdownAllowed) continue;

    const available = Math.max(0, newBalances[pot] || 0);
    const take = Math.min(available, remaining);

    newBalances[pot] -= take;
    withdrawn[pot] += take;
    remaining -= take;
  }

  return {
    balances: newBalances,
    withdrawn,
    shortfall: Math.max(0, remaining),
  };
}
