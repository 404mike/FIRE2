/**
 * projectionUtils.js — Shared per-year account projection formula
 *
 * Both growth and drawdown are calculated from the opening (pre-growth)
 * balance so that the net annual change equals:
 *   openingBalance × (growthRate − drawdownRate)
 *
 * This is the global invariant for all investment accounts:
 *   growth     = openingBalance * growthRate
 *   withdrawal = openingBalance * drawdownRate
 *   closing    = openingBalance + growth − withdrawal + lumpSumIn − extraDrawOut
 */

/**
 * Project a single account balance forward by one year.
 *
 * @param {number} openingBalance    Balance at the start of the year
 * @param {number} growthRate        Annual growth as a decimal (e.g. 0.05 for 5%)
 * @param {number} [drawdownRate=0]  Annual withdrawal rate as a decimal (e.g. 0.02 for 2%)
 * @param {number} [lumpSumIn=0]     One-off addition applied after growth/drawdown
 * @param {number} [extraDrawOut=0]  One-off withdrawal applied after growth/drawdown
 * @returns {number}  Closing balance (floored at zero)
 */
export function projectYear(openingBalance, growthRate, drawdownRate = 0, lumpSumIn = 0, extraDrawOut = 0) {
  const growth     = openingBalance * growthRate;
  const withdrawal = openingBalance * drawdownRate;
  const closing    = openingBalance + growth - withdrawal + lumpSumIn - extraDrawOut;
  return Math.max(0, closing);
}
