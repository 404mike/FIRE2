/**
 * pensionEngine.js — Determine which pension incomes are active in a given year
 *
 * Pension incomes are fixed annual amounts that begin at a configured age.
 * They are NOT withdrawn from pots — they reduce the spending gap directly.
 */

/**
 * Calculate total pension income active in a given year.
 *
 * The state pension is inflation-adjusted: the configured `annualIncome` is
 * treated as the value in today's money and is scaled by `inflationFactor`
 * (cumulative CPI from the start year) so it rises in line with inflation.
 *
 * @param {object} config          App state / config
 * @param {number} age             Age at start of this modelled year
 * @param {number} [inflationFactor=1]  Cumulative inflation multiplier from base year
 * @returns {object} { total, dbIncome, stateIncome, breakdown }
 */
export function getPensionIncome(config, age, inflationFactor = 1) {
  let dbIncome = 0;
  let stateIncome = 0;

  // Defined Benefit pension
  if (config.dbPension.enabled && age >= config.dbPension.startAge) {
    dbIncome = config.dbPension.annualIncome;
  }

  // State pension — start age = statePensionAge (configurable).
  // Inflated from today's money to nominal value using the cumulative
  // inflation factor so the real purchasing power stays constant.
  if (config.statePension.enabled && age >= config.statePensionAge) {
    stateIncome = config.statePension.annualIncome * inflationFactor;
  }

  const total = dbIncome + stateIncome;

  return {
    total,
    dbIncome,
    stateIncome,
    breakdown: { db: dbIncome, state: stateIncome },
  };
}

/**
 * Return the first year (calendar) in which a pension becomes active.
 *
 * @param {object} config
 * @param {string} pensionKey  'dbPension' | 'statePension'
 * @returns {number|null}
 */
export function getPensionStartYear(config, pensionKey) {
  const currentYear = new Date().getFullYear();
  if (pensionKey === 'dbPension' && config.dbPension.enabled) {
    return currentYear + (config.dbPension.startAge - config.currentAge);
  }
  if (pensionKey === 'statePension' && config.statePension.enabled) {
    return currentYear + (config.statePensionAge - config.currentAge);
  }
  return null;
}
