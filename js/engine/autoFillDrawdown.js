/**
 * autoFillDrawdown.js — Calculates proportional ISA/SIPP draws to fill the income gap
 *
 * Pure function — no side effects. Calculates how much extra ISA and SIPP
 * drawdown is needed so that total income meets required spending for the year.
 *
 * Algorithm:
 *  1. incomeGap  = max(0, row.requiredSpending − row.totalIncome)
 *  2. Distribute gap proportionally to ISA/SIPP start-of-year balances
 *  3. Clamp each account's draw to its available balance
 *
 * @param {object} row     A projection row (output of runProjection)
 * @param {object} config  Full app state
 * @returns {{ isaExtraDraw: number, sippExtraDraw: number }}
 */
export function calcAutoFillDrawdown(row, config) {
  // Total additional income still needed to meet required spending
  const incomeGap = Math.max(0, row.requiredSpending - row.totalIncome);

  if (incomeGap === 0) {
    return { isaExtraDraw: 0, sippExtraDraw: 0 };
  }

  const isaEnabled  = config.isa.enabled;
  const sippEnabled = config.sipp.enabled;
  const isaBalance  = row.isaBalance;
  const sippBalance = row.sippBalance;

  // Both accounts depleted or disabled — nothing to draw
  if ((!isaEnabled || isaBalance <= 0) && (!sippEnabled || sippBalance <= 0)) {
    return { isaExtraDraw: 0, sippExtraDraw: 0 };
  }

  // ISA disabled (or empty) — draw from SIPP only
  if (!isaEnabled || isaBalance <= 0) {
    return {
      isaExtraDraw:  0,
      sippExtraDraw: Math.min(Math.round(incomeGap), sippBalance),
    };
  }

  // SIPP disabled (or empty) — draw from ISA only
  if (!sippEnabled || sippBalance <= 0) {
    return {
      isaExtraDraw:  Math.min(Math.round(incomeGap), isaBalance),
      sippExtraDraw: 0,
    };
  }

  // Both accounts active — split proportionally to balances
  const portfolioTotal = isaBalance + sippBalance;
  const isaWeight      = isaBalance  / portfolioTotal;
  const sippWeight     = sippBalance / portfolioTotal;

  let isaDraw  = Math.round(incomeGap * isaWeight);
  let sippDraw = Math.round(incomeGap * sippWeight);

  // Clamp to available balance
  isaDraw  = Math.min(isaDraw,  isaBalance);
  sippDraw = Math.min(sippDraw, sippBalance);

  return { isaExtraDraw: isaDraw, sippExtraDraw: sippDraw };
}
